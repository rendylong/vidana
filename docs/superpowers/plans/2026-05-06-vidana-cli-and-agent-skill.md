# Vidana CLI and Agent Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hosted-service Vidana CLI, API-key authentication, agent skill template, and Web documentation page for using Vidana from Claude Code/Codex-style agent workflows.

**Architecture:** Add API keys as a first-class auth path alongside the existing Feishu cookie flow. Extract the video-analysis pipeline and Markdown formatter into shared server modules, then expose a public API consumed by a small Node CLI. Add a Web CLI page where signed-in users can create/revoke keys and copy install/use commands.

**Tech Stack:** React 18, Vite, TypeScript, Vercel Serverless Functions, Supabase, native Node CLI, Busboy for multipart parsing, Vitest.

---

## File Structure

Create or modify these files:

- Create `supabase/migrations/002_api_keys.sql`: `api_keys` table and indexes.
- Create `api/_lib/apiKeys.ts`: token generation, hashing, verification, list/create/revoke helpers.
- Create `api/_lib/markdown.ts`: converts normalized analysis reports to Markdown.
- Create `api/_lib/analysisPipeline.ts`: reusable hosted analysis pipeline shared by Web and public API.
- Create `api/api-keys/index.ts`: signed-in Web API to list/create keys.
- Create `api/api-keys/[id].ts`: signed-in Web API to revoke keys.
- Create `api/public/analyze.ts`: API-key authenticated multipart endpoint for CLI.
- Modify `api/analyze.ts`: call `runAnalysisPipeline` instead of duplicating analysis logic.
- Modify `api/_lib/types.ts` and `src/lib/types.ts`: add API key and report-related types.
- Create `bin/vidana.mjs`: Node CLI entrypoint.
- Modify `package.json`: add `bin`, CLI scripts, and `busboy` dependency.
- Create `src/pages/CliPage.tsx`: CLI docs and API key management page.
- Modify `src/App.tsx` and `src/components/Layout.tsx`: route/header link for CLI docs.
- Create `skills/vidana-video-analysis/SKILL.md`: agent skill template.
- Create tests under `__tests__/api/_lib/` and `__tests__/cli/`.

Keep the first release narrow: one CLI command, Markdown output only, API-key auth only.

---

### Task 1: API Key Data Model And Server Helpers

**Files:**
- Create: `supabase/migrations/002_api_keys.sql`
- Create: `api/_lib/apiKeys.ts`
- Modify: `api/_lib/types.ts`
- Test: `__tests__/api/_lib/apiKeys.test.ts`

- [ ] **Step 1: Write failing tests for API key generation and verification**

Create `__tests__/api/_lib/apiKeys.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createApiKeySecret, hashApiKeySecret, verifyApiKeySecret, keyPrefix } from '../../../api/_lib/apiKeys'

describe('api key helpers', () => {
  it('creates recognizable Vidana keys', () => {
    const secret = createApiKeySecret()
    expect(secret.startsWith('vdn_')).toBe(true)
    expect(secret.length).toBeGreaterThan(40)
  })

  it('hashes and verifies keys without storing the raw secret', () => {
    const secret = createApiKeySecret()
    const hash = hashApiKeySecret(secret)

    expect(hash).not.toBe(secret)
    expect(verifyApiKeySecret(secret, hash)).toBe(true)
    expect(verifyApiKeySecret(`${secret}x`, hash)).toBe(false)
  })

  it('derives a short display prefix', () => {
    expect(keyPrefix('vdn_abcdefghijklmnopqrstuvwxyz')).toBe('vdn_abcdefgh')
  })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm test -- __tests__/api/_lib/apiKeys.test.ts
```

Expected: fails because `api/_lib/apiKeys.ts` does not exist.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/002_api_keys.sql`:

```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL,
  prefix text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(user_id, revoked_at);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own api keys"
  ON api_keys FOR SELECT
  USING (user_id::text = (current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY "Users can update own api keys"
  ON api_keys FOR UPDATE
  USING (user_id::text = (current_setting('request.jwt.claims', true)::json->>'sub'));
```

- [ ] **Step 4: Add shared types**

Append to `api/_lib/types.ts`:

```ts
export interface ApiKey {
  id: string
  user_id: string
  name: string
  key_hash: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface PublicAuthUser {
  userId: string
  apiKeyId: string
}
```

- [ ] **Step 5: Implement API key helpers**

Create `api/_lib/apiKeys.ts`:

```ts
import crypto from 'node:crypto'
import { getSupabase } from './supabase'
import type { ApiKey, PublicAuthUser } from './types'

const KEY_PREFIX = 'vdn_'

export function createApiKeySecret(): string {
  return `${KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`
}

export function keyPrefix(secret: string): string {
  return secret.slice(0, 12)
}

export function hashApiKeySecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

export function verifyApiKeySecret(secret: string, hash: string): boolean {
  const expected = Buffer.from(hashApiKeySecret(secret), 'hex')
  const actual = Buffer.from(hash, 'hex')
  if (expected.length !== actual.length) return false
  return crypto.timingSafeEqual(expected, actual)
}

export async function createApiKey(userId: string, name: string): Promise<{ secret: string; key: ApiKey }> {
  const secret = createApiKeySecret()
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      name,
      key_hash: hashApiKeySecret(secret),
      prefix: keyPrefix(secret),
    })
    .select('*')
    .single()

  if (error || !data) throw new Error(`Failed to create API key: ${error?.message || 'empty response'}`)
  return { secret, key: data as ApiKey }
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`Failed to list API keys: ${error.message}`)
  return (data || []) as ApiKey[]
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to revoke API key: ${error.message}`)
}

export async function verifyBearerApiKey(authHeader: string | undefined): Promise<PublicAuthUser | null> {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  const secret = match?.[1]?.trim()
  if (!secret || !secret.startsWith(KEY_PREFIX)) return null

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('prefix', keyPrefix(secret))
    .is('revoked_at', null)
    .limit(5)

  if (error || !data) return null
  const key = (data as ApiKey[]).find(candidate => verifyApiKeySecret(secret, candidate.key_hash))
  if (!key) return null

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
  return { userId: key.user_id, apiKeyId: key.id }
}
```

- [ ] **Step 6: Run helper tests**

Run:

```bash
npm test -- __tests__/api/_lib/apiKeys.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/002_api_keys.sql api/_lib/apiKeys.ts api/_lib/types.ts __tests__/api/_lib/apiKeys.test.ts
git commit -m "feat: add Vidana API key model"
```

---

### Task 2: Markdown Formatter And Analysis Pipeline Extraction

**Files:**
- Create: `api/_lib/markdown.ts`
- Create: `api/_lib/analysisPipeline.ts`
- Modify: `api/analyze.ts`
- Test: `__tests__/api/_lib/markdown.test.ts`

- [ ] **Step 1: Write failing Markdown formatter tests**

Create `__tests__/api/_lib/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatAnalysisMarkdown } from '../../../api/_lib/markdown'
import type { AnalysisReport } from '../../../api/_lib/types'

describe('formatAnalysisMarkdown', () => {
  it('formats a stable Chinese Markdown report', () => {
    const report: AnalysisReport = {
      score: 72,
      summary: '视频卖点明确，但开场节奏和人物表达偏硬，需要提升生活感和信任感。',
      timelineEdits: [
        {
          timestamp: '00:03',
          severity: 'high',
          category: '人物',
          issue: '开场表演略显叫卖。',
          action: '改成真实用户痛点场景。',
        },
      ],
      globalEdits: [
        {
          severity: 'medium',
          category: '字幕',
          issue: '字幕风格不统一。',
          action: '统一字体、字号和色块样式。',
        },
      ],
      suggestions: ['前 3 秒优先展示痛点。'],
    }

    const markdown = formatAnalysisMarkdown(report, {
      targetAudience: '二三线城市 30-50 岁男性',
      platform: '抖音',
      context: '集成空调投放素材',
    })

    expect(markdown).toContain('# Vidana 视频分析报告')
    expect(markdown).toContain('- 目标用户：二三线城市 30-50 岁男性')
    expect(markdown).toContain('- 投放平台：抖音')
    expect(markdown).toContain('| 00:03 | high | 人物 | 开场表演略显叫卖。 | 改成真实用户痛点场景。 |')
    expect(markdown).toContain('- 前 3 秒优先展示痛点。')
  })
})
```

- [ ] **Step 2: Run the failing formatter test**

Run:

```bash
npm test -- __tests__/api/_lib/markdown.test.ts
```

Expected: fails because `api/_lib/markdown.ts` does not exist.

- [ ] **Step 3: Implement Markdown formatter**

Create `api/_lib/markdown.ts`:

```ts
import type { AnalysisReport } from './types'

interface MarkdownContext {
  targetAudience?: string
  platform?: string
  context?: string
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function formatAnalysisMarkdown(report: AnalysisReport, context: MarkdownContext): string {
  const timelineRows = report.timelineEdits.length
    ? report.timelineEdits.map(edit =>
        `| ${escapeCell(edit.timestamp)} | ${edit.severity} | ${escapeCell(edit.category)} | ${escapeCell(edit.issue)} | ${escapeCell(edit.action)} |`,
      ).join('\n')
    : '| - | - | - | 未发现需要按时间点处理的问题。 | - |'

  const globalItems = report.globalEdits.length
    ? report.globalEdits.map(edit => `- **${edit.category} / ${edit.severity}**：${edit.issue}\n  - 修改动作：${edit.action}`).join('\n')
    : '- 未发现影响全片的共性问题。'

  const suggestions = report.suggestions.length
    ? report.suggestions.map(item => `- ${item}`).join('\n')
    : '- 暂无额外宏观建议。'

  return `# Vidana 视频分析报告

## 基本信息

- 目标用户：${context.targetAudience || '未填写'}
- 投放平台：${context.platform || '未填写'}
- 补充背景：${context.context || '未填写'}
- 效果评分：${report.score}/100

## 综合判断

${report.summary || '模型没有返回综合判断。'}

## 逐场景修改

| 时间点 | 优先级 | 类型 | 问题 | 修改动作 |
| --- | --- | --- | --- | --- |
${timelineRows}

## 全局修改

${globalItems}

## 宏观建议

${suggestions}
`
}
```

- [ ] **Step 4: Extract the analysis pipeline**

Create `api/_lib/analysisPipeline.ts`:

```ts
import { buildAnalysisRequest, callMimoAPI, parseSSEStream } from './mimo'
import { buildAnalysisPrompt } from './prompts'
import { createAnalysis, getSignedUrl, getVideoDataUrl, updateAnalysis } from './supabase'
import { buildVideoProxyUrl } from './videoAccess'
import type { AnalysisReport } from './types'

export interface AnalysisPipelineInput {
  userId: string
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
  origin?: string | null
  onProgress?: (message: Record<string, unknown>) => void
}

export interface AnalysisPipelineOutput {
  analysisId: string
  report: AnalysisReport
  rawResult: string
  sourceMode: string
  errors: string[]
}

function shouldRetry(err: unknown): boolean {
  return err instanceof Error && (
    err.message.includes('failed to download url data') ||
    err.message.includes('empty response')
  )
}

async function collectAnalysis(videoUrl: string, prompt: string, mode: string): Promise<string> {
  const response = await callMimoAPI(buildAnalysisRequest(videoUrl, prompt), mode === 'data-url' ? 0 : 1)
  let fullResult = ''
  for await (const chunk of parseSSEStream(response)) fullResult += chunk
  if (!fullResult.trim()) throw new Error(`Mimo returned empty response via ${mode}`)
  return fullResult
}

export function parseAnalysisReport(fullResult: string): AnalysisReport {
  try {
    const cleaned = fullResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON object found')
    const parsed = JSON.parse(jsonMatch[0]) as Partial<AnalysisReport>
    return {
      score: typeof parsed.score === 'number' ? parsed.score : 0,
      summary: typeof parsed.summary === 'string' ? parsed.summary : fullResult,
      timelineEdits: Array.isArray(parsed.timelineEdits) ? parsed.timelineEdits : [],
      globalEdits: Array.isArray(parsed.globalEdits) ? parsed.globalEdits : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    }
  } catch {
    return { score: 0, summary: fullResult, timelineEdits: [], globalEdits: [], suggestions: [] }
  }
}

export async function runAnalysisPipeline(input: AnalysisPipelineInput): Promise<AnalysisPipelineOutput> {
  const analysis = await createAnalysis(input.userId, input.storagePath, input)
  await updateAnalysis(analysis.id, { status: 'analyzing' })

  const prompt = buildAnalysisPrompt(input)
  const errors: string[] = []
  let sourceMode = 'signed-url'
  let fullResult = ''

  try {
    input.onProgress?.({ step: 'analysis', message: '正在逐场景分析视频...' })
    fullResult = await collectAnalysis(await getSignedUrl(input.storagePath), prompt, sourceMode)
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    if (!shouldRetry(err)) throw err
  }

  if (!fullResult && input.origin && !input.origin.includes('localhost') && !input.origin.includes('127.0.0.1')) {
    sourceMode = 'proxy-url'
    try {
      input.onProgress?.({ step: 'analysis', message: '云端链接读取失败，正在改用代理链接重试...' })
      fullResult = await collectAnalysis(buildVideoProxyUrl(input.origin, input.storagePath), prompt, sourceMode)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  if (!fullResult) {
    sourceMode = 'data-url'
    try {
      input.onProgress?.({ step: 'analysis', message: '代理链接未返回内容，正在改用直传数据重试...' })
      fullResult = await collectAnalysis(await getVideoDataUrl(input.storagePath), prompt, sourceMode)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  if (!fullResult) {
    await updateAnalysis(analysis.id, { status: 'failed' })
    throw new Error(`Mimo did not return analysis content. Attempts: ${errors.join(' | ')}`)
  }

  const report = parseAnalysisReport(fullResult)
  await updateAnalysis(analysis.id, {
    status: 'completed',
    score: report.score,
    report,
    raw_result: { fullResult, sourceMode, errors },
    completed_at: new Date().toISOString(),
  })

  return { analysisId: analysis.id, report, rawResult: fullResult, sourceMode, errors }
}
```

- [ ] **Step 5: Modify Web analyze endpoint to use the pipeline**

Replace the implementation inside `api/analyze.ts` with:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { runAnalysisPipeline } from './_lib/analysisPipeline'

function sendSSE(res: VercelResponse, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function getRequestOrigin(req: VercelRequest): string | null {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!host) return null
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${Array.isArray(proto) ? proto[0] : proto}://${Array.isArray(host) ? host[0] : host}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const { storagePath, targetAudience, platform, context } = req.body as {
    storagePath: string
    targetAudience?: string
    platform?: string
    context?: string
  }

  if (!storagePath) return res.status(400).json({ error: 'storagePath is required' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    sendSSE(res, 'status', { status: 'preparing' })
    const output = await runAnalysisPipeline({
      userId: auth.userId,
      storagePath,
      targetAudience,
      platform,
      context,
      origin: getRequestOrigin(req),
      onProgress: data => sendSSE(res, 'progress', data),
    })

    sendSSE(res, 'status', { status: 'analyzing', analysisId: output.analysisId })
    sendSSE(res, 'result', { score: output.report.score, report: output.report })
    res.end()
  } catch (err) {
    console.error('Analysis error:', err)
    const message = err instanceof Error ? err.message : '分析过程中出现错误'
    sendSSE(res, 'error', { message })
    res.end()
  }
}
```

- [ ] **Step 6: Run formatter tests and existing tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/markdown.ts api/_lib/analysisPipeline.ts api/analyze.ts __tests__/api/_lib/markdown.test.ts
git commit -m "feat: extract Vidana analysis pipeline"
```

---

### Task 3: Web API Key Management Endpoints

**Files:**
- Create: `api/api-keys/index.ts`
- Create: `api/api-keys/[id].ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add frontend API key types**

Append to `src/lib/types.ts`:

```ts
export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface CreatedApiKeyResponse {
  key: ApiKeySummary
  secret: string
}
```

- [ ] **Step 2: Create list/create endpoint**

Create `api/api-keys/index.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { createApiKey, listApiKeys } from '../_lib/apiKeys'

function publicKeyShape(key: {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    last_used_at: key.last_used_at,
    revoked_at: key.revoked_at,
    created_at: key.created_at,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  if (req.method === 'GET') {
    const keys = await listApiKeys(auth.userId)
    return res.json({ data: keys.map(publicKeyShape) })
  }

  if (req.method === 'POST') {
    const { name } = req.body as { name?: string }
    const trimmed = name?.trim() || 'Agent CLI'
    const { secret, key } = await createApiKey(auth.userId, trimmed)
    return res.status(201).json({ key: publicKeyShape(key), secret })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 3: Create revoke endpoint**

Create `api/api-keys/[id].ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { revokeApiKey } from '../_lib/apiKeys'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: 'id is required' })

  await revokeApiKey(auth.userId, id)
  return res.json({ ok: true })
}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run build
```

Expected: TypeScript build succeeds.

- [ ] **Step 5: Commit**

```bash
git add api/api-keys/index.ts api/api-keys/[id].ts src/lib/types.ts
git commit -m "feat: add API key management endpoints"
```

---

### Task 4: Public Analyze API

**Files:**
- Modify: `package.json`
- Create: `api/public/analyze.ts`
- Test: `__tests__/api/public/analyze.test.ts`

- [ ] **Step 1: Install multipart parser**

Run:

```bash
npm install busboy
npm install -D @types/busboy
```

Expected: `package.json` and `package-lock.json` update with `busboy` and `@types/busboy`.

- [ ] **Step 2: Create public analyze endpoint**

Create `api/public/analyze.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Busboy from 'busboy'
import { verifyBearerApiKey } from '../_lib/apiKeys'
import { runAnalysisPipeline } from '../_lib/analysisPipeline'
import { formatAnalysisMarkdown } from '../_lib/markdown'
import { getSupabase } from '../_lib/supabase'

export const config = {
  api: { bodyParser: false },
  maxDuration: 120,
}

interface MultipartPayload {
  fileName: string
  fileBuffer: Buffer
  targetAudience: string
  platform: string
  context?: string
}

function getRequestOrigin(req: VercelRequest): string | null {
  const host = req.headers['x-forwarded-host'] || req.headers.host
  if (!host) return null
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${Array.isArray(proto) ? proto[0] : proto}://${Array.isArray(host) ? host[0] : host}`
}

function parseMultipart(req: VercelRequest): Promise<MultipartPayload> {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers })
    const fields: Record<string, string> = {}
    const chunks: Buffer[] = []
    let fileName = ''

    busboy.on('field', (name, value) => { fields[name] = value })
    busboy.on('file', (name, file, info) => {
      if (name !== 'video') {
        file.resume()
        return
      }
      fileName = info.filename || 'video.mp4'
      file.on('data', chunk => chunks.push(Buffer.from(chunk)))
    })
    busboy.on('error', reject)
    busboy.on('finish', () => {
      if (!chunks.length) return reject(new Error('video file is required'))
      if (!fields.targetAudience?.trim()) return reject(new Error('targetAudience is required'))
      if (!fields.platform?.trim()) return reject(new Error('platform is required'))
      resolve({
        fileName,
        fileBuffer: Buffer.concat(chunks),
        targetAudience: fields.targetAudience.trim(),
        platform: fields.platform.trim(),
        context: fields.context?.trim() || undefined,
      })
    })
    req.pipe(busboy)
  })
}

function mimeFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'avi') return 'video/x-msvideo'
  if (ext === 'wmv') return 'video/x-ms-wmv'
  if (ext === 'webm') return 'video/webm'
  return 'video/mp4'
}

async function uploadPublicVideo(userId: string, payload: MultipartPayload): Promise<string> {
  const ext = payload.fileName.split('.').pop() || 'mp4'
  const storagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await getSupabase()
    .storage
    .from('videos')
    .upload(storagePath, payload.fileBuffer, {
      contentType: mimeFromFileName(payload.fileName),
      upsert: false,
    })

  if (error) throw new Error(`Video upload failed: ${error.message}`)
  return storagePath
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authorization = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization
  const auth = await verifyBearerApiKey(authorization)
  if (!auth) return res.status(401).json({ error: 'Invalid or missing Vidana API key' })

  try {
    const payload = await parseMultipart(req)
    const storagePath = await uploadPublicVideo(auth.userId, payload)
    const output = await runAnalysisPipeline({
      userId: auth.userId,
      storagePath,
      targetAudience: payload.targetAudience,
      platform: payload.platform,
      context: payload.context,
      origin: getRequestOrigin(req),
    })
    const markdown = formatAnalysisMarkdown(output.report, payload)
    return res.json({ analysisId: output.analysisId, markdown, report: output.report })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed'
    return res.status(400).json({ error: message })
  }
}
```

- [ ] **Step 3: Add a minimal auth rejection test**

Create `__tests__/api/public/analyze.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import handler from '../../../api/public/analyze'

describe('public analyze API', () => {
  it('rejects missing API key', async () => {
    const req = {
      method: 'POST',
      headers: {},
    } as never

    let statusCode = 200
    let jsonBody: unknown = null
    const res = {
      status(code: number) {
        statusCode = code
        return this
      },
      json(body: unknown) {
        jsonBody = body
        return this
      },
    } as never

    await handler(req, res)
    expect(statusCode).toBe(401)
    expect(jsonBody).toEqual({ error: 'Invalid or missing Vidana API key' })
  })
})
```

- [ ] **Step 4: Run public API test**

Run:

```bash
npm test -- __tests__/api/public/analyze.test.ts
```

Expected: passes.

- [ ] **Step 5: Run full build**

Run:

```bash
npm run build
```

Expected: TypeScript build succeeds.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json api/public/analyze.ts __tests__/api/public/analyze.test.ts
git commit -m "feat: add public Vidana analyze API"
```

---

### Task 5: Node CLI

**Files:**
- Create: `bin/vidana.mjs`
- Modify: `package.json`
- Test: `__tests__/cli/vidana.test.mjs`

- [ ] **Step 1: Add CLI package metadata**

Modify `package.json`:

```json
{
  "bin": {
    "vidana": "./bin/vidana.mjs"
  },
  "scripts": {
    "cli": "node ./bin/vidana.mjs"
  }
}
```

Keep existing fields and scripts. Add only the `bin` object and `cli` script.

- [ ] **Step 2: Create CLI entrypoint**

Create `bin/vidana.mjs`:

```js
#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_BASE_URL = 'https://vidana.vercel.app'

function usage() {
  return `Usage:
  vidana analyze <video-path> --audience <target audience> --platform <platform> [--context <background>]

Environment:
  VIDANA_API_KEY       Required API key from Vidana Web
  VIDANA_API_BASE_URL  Optional service URL override for development
`
}

function parseArgs(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') return { help: true }
  const [command, videoPath, ...rest] = argv
  const options = { command, videoPath, audience: '', platform: '', context: '' }
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--audience') options.audience = rest[++i] || ''
    else if (arg === '--platform') options.platform = rest[++i] || ''
    else if (arg === '--context') options.context = rest[++i] || ''
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

function validate(options, env) {
  if (options.help) return
  if (options.command !== 'analyze') throw new Error('Only `vidana analyze` is supported in this version.')
  if (!options.videoPath) throw new Error('Missing video path.')
  if (!fs.existsSync(options.videoPath)) throw new Error(`Video file not found: ${options.videoPath}`)
  if (!options.audience.trim()) throw new Error('Missing required --audience.')
  if (!options.platform.trim()) throw new Error('Missing required --platform.')
  if (!env.VIDANA_API_KEY) throw new Error('Missing VIDANA_API_KEY. Create an API key in Vidana Web and export it first.')
}

async function analyze(options, env) {
  const form = new FormData()
  const buffer = await fs.promises.readFile(options.videoPath)
  const blob = new Blob([buffer], { type: 'video/mp4' })
  form.set('video', blob, path.basename(options.videoPath))
  form.set('targetAudience', options.audience)
  form.set('platform', options.platform)
  if (options.context) form.set('context', options.context)

  const baseUrl = (env.VIDANA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api/public/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.VIDANA_API_KEY}` },
    body: form,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Vidana API returned HTTP ${response.status}`)
  if (!data.markdown) throw new Error('Vidana API did not return Markdown.')
  process.stdout.write(data.markdown)
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(usage())
      return 0
    }
    validate(options, env)
    await analyze(options, env)
    return 0
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${usage()}`)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await main()
  process.exit(code)
}
```

- [ ] **Step 3: Make CLI executable**

Run:

```bash
chmod +x bin/vidana.mjs
```

- [ ] **Step 4: Add CLI validation tests**

Create `__tests__/cli/vidana.test.mjs`:

```js
import { describe, expect, it } from 'vitest'
import { main } from '../../bin/vidana.mjs'

describe('vidana CLI', () => {
  it('returns non-zero when API key is missing', async () => {
    const code = await main(['analyze', 'missing.mp4', '--audience', '用户', '--platform', '抖音'], {})
    expect(code).toBe(1)
  })

  it('prints help successfully', async () => {
    const code = await main(['--help'], {})
    expect(code).toBe(0)
  })
})
```

- [ ] **Step 5: Run CLI tests**

Run:

```bash
npm test -- __tests__/cli/vidana.test.mjs
```

Expected: tests pass.

- [ ] **Step 6: Run local help command**

Run:

```bash
node ./bin/vidana.mjs --help
```

Expected: prints usage and exits `0`.

- [ ] **Step 7: Commit**

```bash
git add package.json bin/vidana.mjs __tests__/cli/vidana.test.mjs
git commit -m "feat: add Vidana CLI"
```

---

### Task 6: CLI Documentation Page And API Key UI

**Files:**
- Create: `src/pages/CliPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

- [ ] **Step 1: Create CLI page**

Create `src/pages/CliPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Key, Terminal, Trash } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'
import type { ApiKeySummary, CreatedApiKeyResponse } from '../lib/types'

export default function CliPage() {
  const { user, login } = useAuth()
  const [keys, setKeys] = useState<ApiKeySummary[]>([])
  const [createdSecret, setCreatedSecret] = useState('')
  const [name, setName] = useState('Claude Code')
  const [error, setError] = useState('')

  const refreshKeys = () => {
    if (!user) return
    fetch('/api/api-keys', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setKeys(data.data || []))
      .catch(() => setError('API Key 列表加载失败'))
  }

  useEffect(() => { refreshKeys() }, [user])

  const createKey = async () => {
    setError('')
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data: CreatedApiKeyResponse | { error: string } = await res.json()
    if (!res.ok || 'error' in data) {
      setError('error' in data ? data.error : 'API Key 创建失败')
      return
    }
    setCreatedSecret(data.secret)
    refreshKeys()
  }

  const revokeKey = async (id: string) => {
    await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
    refreshKeys()
  }

  return (
    <div className="h-full overflow-y-auto bg-[#f7f8f5]">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <p className="text-sm font-medium text-zinc-500">Vidana CLI</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-950">把视频分析接进你的 Agent 工作流</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
              CLI 版 Vidana 适合在 Claude Code、Codex 或自动化脚本中使用。它调用线上 Vidana 服务，默认输出 Markdown 报告。
            </p>

            <div className="mt-8 space-y-6">
              <DocBlock title="1. 安装 CLI" code="npm install -g vidana" />
              <DocBlock title="2. 设置 API Key" code={'export VIDANA_API_KEY=\"vdn_your_key_here\"'} />
              <DocBlock
                title="3. 分析视频"
                code={'vidana analyze ./demo.mp4 \\\\\n  --audience \"二三线城市 30-50 岁男性\" \\\\\n  --platform \"抖音\" \\\\\n  --context \"集成空调投放素材\" > report.md'}
              />
              <DocBlock
                title="4. 在 Agent 中使用"
                code={'请使用 vidana analyze 分析 ./demo.mp4，目标用户是二三线城市 30-50 岁男性，平台是抖音。'}
              />
            </div>
          </section>

          <aside className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-60px_rgba(24,24,27,0.5)]">
            <div className="flex items-center gap-2">
              <Key size={18} />
              <h2 className="text-sm font-semibold text-zinc-950">API Key</h2>
            </div>
            {!user ? (
              <div className="mt-5">
                <p className="text-sm leading-6 text-zinc-500">登录后可以创建用于 CLI 的 API Key。</p>
                <button onClick={login} className="mt-4 rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">登录</button>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400"
                />
                <button onClick={createKey} className="w-full rounded-xl bg-zinc-950 px-4 py-2 text-sm font-medium text-white">
                  创建 API Key
                </button>
                {createdSecret && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-xs text-amber-700">只显示一次，请立即复制。</p>
                    <code className="mt-2 block break-all text-xs text-zinc-900">{createdSecret}</code>
                  </div>
                )}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="space-y-2">
                  {keys.map(key => (
                    <div key={key.id} className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-800">{key.name}</p>
                        <p className="text-xs text-zinc-400">{key.prefix}</p>
                      </div>
                      {!key.revoked_at && (
                        <button onClick={() => revokeKey(key.id)} className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-500">
                          <Trash size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}

function DocBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Terminal size={16} className="text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-4 text-sm leading-6 text-zinc-50"><code>{code}</code></pre>
    </div>
  )
}
```

- [ ] **Step 2: Add route**

Modify `src/App.tsx`:

```tsx
import CliPage from './pages/CliPage'
```

Add route:

```tsx
<Route path="/cli" element={<CliPage />} />
```

- [ ] **Step 3: Add header link**

Modify `src/components/Layout.tsx` to import `NavLink`:

```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
```

Add a link near the brand:

```tsx
<NavLink
  to="/cli"
  className={({ isActive }) =>
    `text-xs font-medium transition ${isActive ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-900'}`
  }
>
  CLI
</NavLink>
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CliPage.tsx src/App.tsx src/components/Layout.tsx
git commit -m "feat: add Vidana CLI documentation page"
```

---

### Task 7: Agent Skill Template

**Files:**
- Create: `skills/vidana-video-analysis/SKILL.md`

- [ ] **Step 1: Create skill template**

Create `skills/vidana-video-analysis/SKILL.md`:

```md
---
name: vidana-video-analysis
description: Use Vidana CLI to analyze uploaded or local video files for a target audience and platform, returning a Markdown report for editing, ad optimization, or creative review.
---

# Vidana Video Analysis

Use this skill when the user asks to review, diagnose, improve, or prepare a video for a specific audience or platform.

## Requirements

- `vidana` CLI must be installed.
- `VIDANA_API_KEY` must be set in the environment.
- The user must provide:
  - local video path
  - target audience
  - platform

## Workflow

1. Check CLI availability:

```bash
vidana --help
```

2. Check API key:

```bash
test -n "$VIDANA_API_KEY"
```

If missing, tell the user to create an API key in Vidana Web and set:

```bash
export VIDANA_API_KEY="vdn_your_key_here"
```

3. Run analysis:

```bash
vidana analyze "<video-path>" \
  --audience "<target audience>" \
  --platform "<platform>" \
  --context "<optional background>"
```

4. Treat the Markdown report as source material. Do not invent analysis if the CLI fails.

## Output Guidance

After Vidana returns a report, help the user transform it into the requested artifact:

- editing checklist
- reshoot plan
- ad optimization notes
- platform-specific revision brief
- script rewrite direction

Always preserve concrete timestamps and modification actions from the Vidana report.
```

- [ ] **Step 2: Check no placeholder text**

Run:

```bash
rg -n "TBD|TODO|placeholder" skills/vidana-video-analysis/SKILL.md
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add skills/vidana-video-analysis/SKILL.md
git commit -m "docs: add Vidana video analysis agent skill"
```

---

### Task 8: Final Verification

**Files:**
- Verify all files touched by earlier tasks.

- [ ] **Step 1: Run all tests**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exits `0`. Existing Fast Refresh warnings are acceptable only if there are no errors.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Run CLI help**

Run:

```bash
node ./bin/vidana.mjs --help
```

Expected: usage text prints.

- [ ] **Step 5: Manual local CLI smoke test**

With a real local API key and a small video:

```bash
VIDANA_API_BASE_URL=http://localhost:5173 \
VIDANA_API_KEY=vdn_real_key \
node ./bin/vidana.mjs analyze ./sample.mp4 \
  --audience "二三线城市 30-50 岁男性" \
  --platform "抖音" \
  --context "集成空调投放素材" > /tmp/vidana-report.md
```

Expected:

- Exit code is `0`.
- `/tmp/vidana-report.md` starts with `# Vidana 视频分析报告`.
- The report contains `## 逐场景修改`.

- [ ] **Step 6: Manual Web smoke test**

Start dev server:

```bash
npm run dev -- --host 127.0.0.1
```

Open:

```text
http://127.0.0.1:5173/cli
```

Expected:

- CLI docs page loads.
- Signed-in user can create a key.
- Raw key is shown once.
- Existing `/` video analysis page still loads.

- [ ] **Step 7: Final commit if verification changed docs or tests**

If any verification fix was needed:

```bash
git add <changed-files>
git commit -m "fix: complete Vidana CLI verification"
```

Otherwise no commit is needed.
