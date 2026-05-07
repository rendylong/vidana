# Video Benchmark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Web-only video benchmark mode to Vidana so logged-in users can upload a reference video and receive a type-adaptive teardown plus actionable remake guidance.

**Architecture:** Keep the existing upload-analysis UI shape and add a mode switch inside `AgentPage`. Add a separate `/api/benchmark` SSE endpoint backed by a focused benchmark pipeline that reuses Mimo request streaming and Supabase video URL fallback behavior. Reuse `analyses` for history with an `analysis_type` discriminator and keep CLI/public API unchanged.

**Tech Stack:** React 18, React Router, Tailwind CSS, Vercel Node API routes, Supabase PostgreSQL/Storage, Mimo v2.5, Vitest.

---

## File Structure

- Create `supabase/migrations/003_analysis_type.sql`: add `analysis_type` to `analyses`.
- Modify `api/_lib/types.ts`: add `analysis_type` and benchmark report/input types.
- Modify `src/lib/types.ts`: expose `analysis_type` to the frontend.
- Modify `api/_lib/supabase.ts`: let `createAnalysis` accept `analysisType`.
- Modify `api/_lib/prompts.ts`: add `buildBenchmarkPrompt`.
- Create `api/_lib/benchmarkPipeline.ts`: benchmark report parsing and Mimo pipeline.
- Create `api/benchmark.ts`: authenticated Web SSE endpoint.
- Modify `src/pages/AgentPage.tsx`: add mode switch, benchmark fields, request handling, history/title parsing, and benchmark report rendering.
- Test `__tests__/api/_lib/prompts.test.ts`: prompt coverage.
- Create `__tests__/api/_lib/benchmarkPipeline.test.ts`: parser and fallback behavior.
- Create `__tests__/api/benchmark.test.ts`: endpoint validation and SSE behavior.

Before editing any currently dirty file (`api/_lib/prompts.ts`, `api/_lib/mimo.ts`, `vercel.json`, etc.), read its current content and preserve unrelated changes.

---

### Task 1: Database and Shared Types

**Files:**
- Create: `supabase/migrations/003_analysis_type.sql`
- Modify: `api/_lib/types.ts`
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add the database migration**

Create `supabase/migrations/003_analysis_type.sql`:

```sql
ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS analysis_type text NOT NULL DEFAULT 'analysis'
CHECK (analysis_type IN ('analysis', 'benchmark'));

CREATE INDEX IF NOT EXISTS idx_analyses_analysis_type ON analyses(analysis_type);
```

- [ ] **Step 2: Update backend types**

In `api/_lib/types.ts`, add:

```ts
export type AnalysisType = 'analysis' | 'benchmark'
```

Update `Analysis`:

```ts
analysis_type: AnalysisType
```

Add benchmark types:

```ts
export interface BenchmarkPromptOptions {
  ipPositioning: string
  platform: string
  productOrService?: string
  targetCustomer?: string
  benchmarkGoal?: string
}

export interface BenchmarkReport {
  contentType: string
  summary: string
  coreMechanism: string
  scriptDesign: {
    structure: string[]
    copyPatterns: string[]
    emotionalCurve: string
  }
  visualDesign: {
    sceneStyle: string
    shotList: string[]
    editingRhythm: string
    subtitleAndAudio: string
  }
  hookDesign: {
    openingHook: string
    retentionHooks: string[]
    conversionOrPayoff: string
  }
  imitationPlan: {
    adaptedAngle: string
    scriptOutline: string[]
    shotInstructions: string[]
    copyExamples: string[]
    avoid: string[]
  }
  productionChecklist: string[]
  risks: string[]
}
```

- [ ] **Step 3: Update frontend analysis type**

In `src/lib/types.ts`, add:

```ts
export type AnalysisType = 'analysis' | 'benchmark'
```

Update `Analysis`:

```ts
analysis_type?: AnalysisType
```

Use optional here so old local fixtures or stale API responses still parse as analysis.

- [ ] **Step 4: Run type check**

Run:

```bash
npm run build
```

Expected: the build may fail because `analysis_type` is not yet supplied everywhere. That is acceptable in this task; note the exact errors for Task 2.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/003_analysis_type.sql api/_lib/types.ts src/lib/types.ts
git commit -m "feat: add analysis type metadata"
```

---

### Task 2: Supabase Create Helper

**Files:**
- Modify: `api/_lib/supabase.ts`

- [ ] **Step 1: Update `createAnalysis` options**

Change the option type to include `analysisType`:

```ts
export async function createAnalysis(userId: string, videoUrl: string, opts: {
  targetAudience?: string
  platform?: string
  context?: string
  analysisType?: AnalysisType
}): Promise<Analysis> {
```

Import `AnalysisType`:

```ts
import type { User, Analysis, AnalysisType } from './types'
```

Add `analysis_type` to the inserted row:

```ts
analysis_type: opts.analysisType || 'analysis',
```

Keep existing `target_audience`, `platform`, `context`, and `status` behavior unchanged.

- [ ] **Step 2: Run focused tests**

Run:

```bash
npm test -- __tests__/api/_lib/analysisPipeline.test.ts __tests__/api/_lib/supabase.test.ts
```

Expected: pass after mocks are updated if necessary. If a test expects an exact insert payload, add `analysis_type: 'analysis'`.

- [ ] **Step 3: Commit**

```bash
git add api/_lib/supabase.ts __tests__/api/_lib/supabase.test.ts
git commit -m "feat: persist analysis type"
```

---

### Task 3: Benchmark Prompt

**Files:**
- Modify: `api/_lib/prompts.ts`
- Modify: `__tests__/api/_lib/prompts.test.ts`

- [ ] **Step 1: Write failing prompt tests**

Add tests:

```ts
import { buildAnalysisPrompt, buildBenchmarkPrompt } from '../../../api/_lib/prompts'

it('builds a benchmark prompt with required fields and adaptive content type instruction', () => {
  const prompt = buildBenchmarkPrompt({
    ipPositioning: '城市露营 vlog 博主',
    platform: '小红书',
  })

  expect(prompt).toContain('城市露营 vlog 博主')
  expect(prompt).toContain('小红书')
  expect(prompt).toContain('先判断参考视频类型')
  expect(prompt).toContain('不要把所有视频都套成投流广告')
  expect(prompt).toContain('"contentType"')
  expect(prompt).not.toContain('可模仿程度')
  expect(prompt).not.toContain('"score"')
})

it('includes optional benchmark business context only when provided', () => {
  const prompt = buildBenchmarkPrompt({
    ipPositioning: '创始人 IP',
    platform: '抖音',
    productOrService: 'AI 视频分析工具',
    targetCustomer: '本地生活商家',
    benchmarkGoal: '学习前三秒钩子，不能夸大承诺',
  })

  expect(prompt).toContain('AI 视频分析工具')
  expect(prompt).toContain('本地生活商家')
  expect(prompt).toContain('学习前三秒钩子')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- __tests__/api/_lib/prompts.test.ts
```

Expected: fail with `buildBenchmarkPrompt` not exported.

- [ ] **Step 3: Implement `buildBenchmarkPrompt`**

Add to `api/_lib/prompts.ts`:

```ts
interface BenchmarkPromptOptions {
  ipPositioning: string
  platform: string
  productOrService?: string
  targetCustomer?: string
  benchmarkGoal?: string
}

export function buildBenchmarkPrompt(opts: BenchmarkPromptOptions): string {
  const backgrounds = [
    `账号/IP定位：${opts.ipPositioning}`,
    `发布平台：${opts.platform}`,
  ]
  if (opts.productOrService) backgrounds.push(`产品/服务：${opts.productOrService}`)
  if (opts.targetCustomer) backgrounds.push(`目标客户：${opts.targetCustomer}`)
  if (opts.benchmarkGoal) backgrounds.push(`模仿目标/限制条件：${opts.benchmarkGoal}`)

  return `你是一位资深视频内容分析师和短视频翻拍策划。

【用户背景】
${backgrounds.join('\n')}

【任务】
请分析用户上传的参考视频。先判断参考视频类型，再按该类型拆解它为什么有效，并给出适合用户自身账号/IP定位和发布平台的翻拍方案。

注意：
1. 视频类型可能是投流广告、口播种草、搞笑段子、科普、vlog、测评、品牌片或其他类型。
2. 不要把所有视频都套成投流广告，也不要强行加入产品转化逻辑。
3. 产品/服务和目标客户没有提供时，按账号/IP定位和平台给出内容模仿建议。
4. 输出重点是可执行翻拍方案，不做视频质量评分，不输出 score 或可模仿程度分数。
5. 避免鼓励逐字照抄、盗用素材、侵犯版权或冒充原作者。

输出严格 JSON，不要加 markdown 代码块标记，不要加任何额外文字，只输出纯 JSON：
{"contentType":"<口播种草|投流广告|搞笑段子|科普|vlog|测评|品牌片|其他>","summary":"<这个视频最值得学习的地方>","coreMechanism":"<它为什么有效>","scriptDesign":{"structure":["<开头如何抓人>","<中段如何推进>","<结尾如何收束>"],"copyPatterns":["<可复用的表达方式>"],"emotionalCurve":"<情绪或信息节奏>"},"visualDesign":{"sceneStyle":"<画面风格>","shotList":["<关键镜头和作用>"],"editingRhythm":"<剪辑节奏>","subtitleAndAudio":"<字幕、音频、配乐设计>"},"hookDesign":{"openingHook":"<前3秒钩子>","retentionHooks":["<中途留人点>"],"conversionOrPayoff":"<转化、关注、笑点或知识payoff>"},"imitationPlan":{"adaptedAngle":"<结合用户背景后的翻拍角度>","scriptOutline":["<可执行脚本大纲>"],"shotInstructions":["<镜头翻拍建议>"],"copyExamples":["<示例台词或字幕>"],"avoid":["<不要照搬或不适合模仿的点>"]},"productionChecklist":["<拍摄前检查项>"],"risks":["<版权、风格错配、平台适配等风险>"]}

所有 JSON key 必须用双引号包裹，不要省略任何字段。`
}
```

- [ ] **Step 4: Run prompt tests**

Run:

```bash
npm test -- __tests__/api/_lib/prompts.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/prompts.ts __tests__/api/_lib/prompts.test.ts
git commit -m "feat: add benchmark prompt"
```

---

### Task 4: Benchmark Pipeline

**Files:**
- Create: `api/_lib/benchmarkPipeline.ts`
- Create: `__tests__/api/_lib/benchmarkPipeline.test.ts`

- [ ] **Step 1: Write parser tests**

Create `__tests__/api/_lib/benchmarkPipeline.test.ts` with the existing `analysisPipeline.test.ts` mocking style. Include:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBenchmarkReport, runBenchmarkPipeline } from '../../../api/_lib/benchmarkPipeline'

const mocks = vi.hoisted(() => ({
  sseChunks: [] as string[][],
  buildAnalysisRequest: vi.fn((videoUrl: string, prompt: string) => ({ videoUrl, prompt })),
  callMimoAPI: vi.fn(async (body: Record<string, unknown>, retries: number) => ({ body, retries })),
  parseSSEStream: vi.fn(async function* () {
    const chunks = mocks.sseChunks.shift() ?? []
    for (const chunk of chunks) yield chunk
  }),
  buildBenchmarkPrompt: vi.fn(() => 'benchmark prompt'),
  createAnalysis: vi.fn(async () => ({ id: 'benchmark-1' })),
  getSignedUrl: vi.fn(async () => 'https://signed.example/video.mp4'),
  getVideoDataUrl: vi.fn(async () => 'data:video/mp4;base64,abc'),
  updateAnalysis: vi.fn(async () => {}),
  buildVideoProxyUrl: vi.fn((origin: string, path: string) => `${origin}/api/video?path=${encodeURIComponent(path)}`),
}))
```

Add module mocks for `mimo`, `prompts`, `supabase`, and `videoAccess`, mirroring `analysisPipeline.test.ts`.

Add tests:

```ts
describe('parseBenchmarkReport', () => {
  it('normalizes complete JSON and does not add a score', () => {
    const report = parseBenchmarkReport(`{"contentType":"vlog","summary":"真实日常感强","coreMechanism":"低门槛代入","scriptDesign":{"structure":["生活开场"],"copyPatterns":["第一人称"],"emotionalCurve":"轻松"},"visualDesign":{"sceneStyle":"手持日常","shotList":["出门镜头"],"editingRhythm":"慢节奏","subtitleAndAudio":"自然声"},"hookDesign":{"openingHook":"今天带你看","retentionHooks":["路线悬念"],"conversionOrPayoff":"生活方式认同"},"imitationPlan":{"adaptedAngle":"用自己的周末场景翻拍","scriptOutline":["出门","体验","总结"],"shotInstructions":["拍路上环境"],"copyExamples":["今天不赶路"],"avoid":["不要照搬原片地点"]},"productionChecklist":["确认路线"],"risks":["避免使用原片音乐"]}`)

    expect(report.contentType).toBe('vlog')
    expect(report.summary).toBe('真实日常感强')
    expect('score' in report).toBe(false)
    expect(report.imitationPlan.avoid).toEqual(['不要照搬原片地点'])
  })

  it('falls back to summary text when JSON cannot be parsed', () => {
    expect(parseBenchmarkReport('模型只返回了一段文字')).toMatchObject({
      contentType: '',
      summary: '模型只返回了一段文字',
      productionChecklist: [],
      risks: [],
    })
  })
})
```

- [ ] **Step 2: Write pipeline tests**

Add:

```ts
function pipelineInput(overrides: Partial<Parameters<typeof runBenchmarkPipeline>[0]> = {}) {
  return {
    userId: 'user-1',
    storagePath: 'videos/demo.mp4',
    ipPositioning: '露营 vlog 博主',
    platform: '小红书',
    origin: 'https://app.example.com',
    ...overrides,
  }
}

it('creates benchmark analysis, streams chunks, and stores completed report without score', async () => {
  const chunks = ['{"contentType":"vlog","summary":"真实",', '"coreMechanism":"代入","scriptDesign":{"structure":[],"copyPatterns":[],"emotionalCurve":""},"visualDesign":{"sceneStyle":"","shotList":[],"editingRhythm":"","subtitleAndAudio":""},"hookDesign":{"openingHook":"","retentionHooks":[],"conversionOrPayoff":""},"imitationPlan":{"adaptedAngle":"","scriptOutline":[],"shotInstructions":[],"copyExamples":[],"avoid":[]},"productionChecklist":[],"risks":[]}']
  mocks.sseChunks.push(chunks)

  const output = await runBenchmarkPipeline(pipelineInput())

  expect(mocks.createAnalysis).toHaveBeenCalledWith('user-1', 'videos/demo.mp4', expect.objectContaining({
    analysisType: 'benchmark',
    targetAudience: undefined,
    platform: '小红书',
  }))
  expect(mocks.updateAnalysis).toHaveBeenCalledWith('benchmark-1', expect.objectContaining({
    status: 'completed',
    score: null,
    report: expect.objectContaining({ contentType: 'vlog' }),
  }))
  expect(output.report).not.toHaveProperty('score')
})

it('falls back from signed URL to proxy URL when Mimo returns empty content', async () => {
  mocks.sseChunks.push([], ['{"contentType":"科普","summary":"清楚","coreMechanism":"","scriptDesign":{"structure":[],"copyPatterns":[],"emotionalCurve":""},"visualDesign":{"sceneStyle":"","shotList":[],"editingRhythm":"","subtitleAndAudio":""},"hookDesign":{"openingHook":"","retentionHooks":[],"conversionOrPayoff":""},"imitationPlan":{"adaptedAngle":"","scriptOutline":[],"shotInstructions":[],"copyExamples":[],"avoid":[]},"productionChecklist":[],"risks":[]}'])

  const output = await runBenchmarkPipeline(pipelineInput())

  expect(output.sourceMode).toBe('proxy-url')
  expect(mocks.getVideoDataUrl).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test -- __tests__/api/_lib/benchmarkPipeline.test.ts
```

Expected: fail because `api/_lib/benchmarkPipeline.ts` does not exist.

- [ ] **Step 4: Implement `benchmarkPipeline.ts`**

Use `api/_lib/analysisPipeline.ts` as the template, but import `buildBenchmarkPrompt`, return `BenchmarkReport`, pass `analysisType: 'benchmark'`, set `score: null`, and build context from optional fields:

```ts
function benchmarkContext(input: BenchmarkPipelineInput): string {
  return [
    `账号/IP定位：${input.ipPositioning}`,
    input.productOrService ? `产品/服务：${input.productOrService}` : '',
    input.targetCustomer ? `目标客户：${input.targetCustomer}` : '',
    input.benchmarkGoal ? `模仿目标/限制条件：${input.benchmarkGoal}` : '',
  ].filter(Boolean).join('\n')
}
```

Define `parseBenchmarkReport` with `stringValue`, `stringArrayValue`, and nested object helpers. If parsing fails, return:

```ts
{
  contentType: '',
  summary: fullResult,
  coreMechanism: '',
  scriptDesign: { structure: [], copyPatterns: [], emotionalCurve: '' },
  visualDesign: { sceneStyle: '', shotList: [], editingRhythm: '', subtitleAndAudio: '' },
  hookDesign: { openingHook: '', retentionHooks: [], conversionOrPayoff: '' },
  imitationPlan: { adaptedAngle: '', scriptOutline: [], shotInstructions: [], copyExamples: [], avoid: [] },
  productionChecklist: [],
  risks: [],
}
```

- [ ] **Step 5: Run benchmark pipeline tests**

Run:

```bash
npm test -- __tests__/api/_lib/benchmarkPipeline.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/benchmarkPipeline.ts __tests__/api/_lib/benchmarkPipeline.test.ts
git commit -m "feat: add benchmark pipeline"
```

---

### Task 5: Web Benchmark API Route

**Files:**
- Create: `api/benchmark.ts`
- Create: `__tests__/api/benchmark.test.ts`

- [ ] **Step 1: Write endpoint tests**

Create tests with a lightweight response mock like `public/analyze.test.ts`. Mock `verifyAuth` and `runBenchmarkPipeline`.

Test cases:

```ts
it('rejects unauthenticated requests with 401', async () => {
  verifyAuthMock.mockReturnValue(null)
  const response = createResponse()
  await handler({ method: 'POST', body: {}, headers: {} } as never, response.res as never)
  expect(response.statusCode).toBe(401)
})

it('requires storagePath, ipPositioning, and platform', async () => {
  verifyAuthMock.mockReturnValue({ userId: 'user-1' })
  const response = createResponse()
  await handler({ method: 'POST', body: { storagePath: 'v.mp4', ipPositioning: '', platform: '' } } as never, response.res as never)
  expect(response.writes.join('')).toContain('请填写你的账号/IP定位')
})

it('runs benchmark pipeline and emits result SSE', async () => {
  verifyAuthMock.mockReturnValue({ userId: 'user-1' })
  runBenchmarkPipelineMock.mockResolvedValue({
    analysisId: 'benchmark-1',
    report: { contentType: 'vlog', summary: '真实' },
  })
  const response = createResponse()

  await handler({ method: 'POST', body: { storagePath: 'videos/demo.mp4', ipPositioning: 'vlog 博主', platform: '小红书' } } as never, response.res as never)

  expect(runBenchmarkPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'user-1',
    storagePath: 'videos/demo.mp4',
    ipPositioning: 'vlog 博主',
    platform: '小红书',
  }))
  expect(response.writes.join('')).toContain('event: result')
  expect(response.ended).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- __tests__/api/benchmark.test.ts
```

Expected: fail because route does not exist.

- [ ] **Step 3: Implement `api/benchmark.ts`**

Mirror `api/analyze.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { runBenchmarkPipeline } from './_lib/benchmarkPipeline'

function sendSSE(res: VercelResponse, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
```

Validate:

```ts
if (!storagePath) return sendSSE(res, 'error', { message: '请先上传参考视频' })
if (!ipPositioning?.trim()) return sendSSE(res, 'error', { message: '请填写你的账号/IP定位' })
if (!platform?.trim()) return sendSSE(res, 'error', { message: '请选择发布平台' })
```

Then call `runBenchmarkPipeline` with optional trimmed fields and emit `result`.

- [ ] **Step 4: Run endpoint tests**

Run:

```bash
npm test -- __tests__/api/benchmark.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add api/benchmark.ts __tests__/api/benchmark.test.ts
git commit -m "feat: add benchmark API route"
```

---

### Task 6: Frontend Mode Switch and Benchmark Form

**Files:**
- Modify: `src/pages/AgentPage.tsx`

- [ ] **Step 1: Add frontend benchmark types and parser**

Near existing `AnalysisResult`, add `BenchmarkResult` matching the spec. Add `parseBenchmarkReport(report: unknown): BenchmarkResult | null` using the same defensive style as `parseReport`.

Helpers:

```ts
function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}
```

- [ ] **Step 2: Add mode and field state**

Add:

```ts
type AgentMode = 'analysis' | 'benchmark'
const [mode, setMode] = useState<AgentMode>('analysis')
const [ipPositioning, setIpPositioning] = useState('')
const [productOrService, setProductOrService] = useState('')
const [targetCustomer, setTargetCustomer] = useState('')
const [benchmarkGoal, setBenchmarkGoal] = useState('')
const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null)
```

When switching modes, clear `result`, `benchmarkResult`, `error`, and progress back to idle.

- [ ] **Step 3: Add validation**

Keep existing `canAnalyze` for analysis. Add:

```ts
const canBenchmark = Boolean((file || storagePath) && ipPositioning.trim() && platform && !isWorking)
const canSubmit = mode === 'analysis' ? canAnalyze : canBenchmark
```

In benchmark submit path, show:

```ts
请先上传参考视频
请填写你的账号/IP定位
请选择发布平台
```

- [ ] **Step 4: Add `handleBenchmark`**

Reuse `handleUpload` and SSE reading from `handleAnalyze`, but request `/api/benchmark` and parse `data.report` with `parseBenchmarkReport`.

Payload:

```ts
{
  storagePath: path,
  ipPositioning: ipPositioning.trim(),
  platform,
  productOrService: productOrService.trim() || undefined,
  targetCustomer: targetCustomer.trim() || undefined,
  benchmarkGoal: benchmarkGoal.trim() || undefined,
}
```

- [ ] **Step 5: Update the form rendering**

Add a segmented control above upload:

```tsx
{(['analysis', 'benchmark'] as AgentMode[]).map(item => (
  <button type="button" onClick={() => setMode(item)}>
    {item === 'analysis' ? '投放分析' : '视频对标'}
  </button>
))}
```

For benchmark mode render labels:

- `参考视频`
- `你的账号/IP定位`
- `产品/服务（选填）`
- `目标客户（选填）`
- `发布平台`
- `模仿目标/限制条件（选填）`

Button text:

```tsx
{mode === 'analysis' ? '点击分析' : '生成对标报告'}
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/AgentPage.tsx
git commit -m "feat: add benchmark form mode"
```

---

### Task 7: Frontend Benchmark Results and History

**Files:**
- Modify: `src/pages/AgentPage.tsx`
- Modify: `src/lib/types.ts` if missing fields from Task 1

- [ ] **Step 1: Load historical benchmark records**

In the history detail `useEffect`, detect:

```ts
const loadedMode: AgentMode = analysis.analysis_type === 'benchmark' ? 'benchmark' : 'analysis'
setMode(loadedMode)
```

For benchmark records:

- set `targetCustomer` from `analysis.target_audience || ''`.
- set `platform` as today.
- parse `analysis.context` only if it contains obvious lines like `账号/IP定位：`; otherwise leave optional fields blank.
- parse `analysis.report` with `parseBenchmarkReport`.

- [ ] **Step 2: Update `resultTitle`**

Use:

```ts
if (analysis.analysis_type === 'benchmark') {
  if (analysis.platform && analysis.target_audience) return `对标 / ${analysis.platform} / ${analysis.target_audience}`
  if (analysis.platform && analysis.context) return `对标 / ${analysis.platform}`
  return '视频对标'
}
```

- [ ] **Step 3: Render benchmark report**

Add `BenchmarkResultView` with sections:

- 视频类型与核心学习点
- 脚本设计
- 画面与剪辑设计
- 钩子与留人机制
- 结合自身需求的翻拍方案
- 拍摄检查清单
- 风险与避坑

Use compact sections and list rows, not nested cards inside cards. Do not show a score badge for benchmark reports.

- [ ] **Step 4: Update empty and loading copy**

For benchmark mode:

- Empty title: `等待对标条件`
- Empty body: `上传参考视频，填写账号/IP定位和发布平台。补充业务背景后，报告会更贴近你的翻拍场景。`
- Loading copy: `AI 正在拆解参考视频`

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AgentPage.tsx src/lib/types.ts
git commit -m "feat: render benchmark reports"
```

---

### Task 8: Full Verification

**Files:**
- Any tests touched by prior tasks

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npm test -- __tests__/api/_lib/prompts.test.ts __tests__/api/_lib/benchmarkPipeline.test.ts __tests__/api/benchmark.test.ts __tests__/api/_lib/analysisPipeline.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: pass.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: pass, or only the known Fast Refresh warning in `src/hooks/useAuth.tsx`. Do not fix unrelated lint issues unless caused by this work.

- [ ] **Step 4: Manual Web verification**

Run:

```bash
npm run dev:full
```

Open `http://localhost:5174/` and verify:

- Default mode is `投放分析`.
- Switching to `视频对标` changes upload, fields, button, empty state, and result title.
- Missing benchmark required fields show the correct Chinese messages.
- Uploading a small reference video calls `/api/benchmark`.
- Result has no score and includes the seven benchmark sections.
- History sidebar distinguishes benchmark records and reloads benchmark details.

- [ ] **Step 5: Commit any verification fixes**

If Step 1-4 exposed issues caused by this feature, run `git status --short` and stage only the files changed by those fixes. For example, if the fixes touched the benchmark route and the frontend page:

```bash
git add api/benchmark.ts src/pages/AgentPage.tsx
git commit -m "fix: polish benchmark verification issues"
```

Skip this commit if no fixes were needed.

---

## Self-Review Notes

- Spec coverage: This plan covers Web-only mode switching, dedicated benchmark fields, type-adaptive report prompt, no score, separate `/api/benchmark`, `analysis_type`, history distinction, error messages, parser tests, pipeline tests, build/lint/manual verification.
- Scope check: CLI/public API, multi-reference comparison, export, and streaming-by-section are explicitly excluded.
- Type consistency: `analysis_type`, `BenchmarkReport`, `BenchmarkPromptOptions`, `runBenchmarkPipeline`, and `buildBenchmarkPrompt` are named consistently across tasks.
