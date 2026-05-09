# Video Analysis Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace synchronous Mimo analysis calls with a Redis Stream queue and a CVM worker so Vidana can handle concurrent users without overwhelming Mimo or long-running API requests.

**Architecture:** API routes create queued `analyses` rows and push minimal messages to Redis Stream. A long-running worker claims queued analyses, runs the existing Mimo analysis logic under global rate limits, writes final state back to Supabase/Postgres, and acknowledges Redis messages only after database updates. Web and CLI clients poll status until `completed` or `failed`.

**Tech Stack:** React, Vercel-style API routes, Supabase/Postgres, self-hosted Redis on Tencent Cloud CVM, Redis Stream via `ioredis`, Node worker via `tsx`, Vitest.

---

## Files To Create Or Modify

- Create `supabase/migrations/005_analysis_queue.sql`: queue statuses, queue metadata columns, and active-task RPC.
- Modify `api/_lib/types.ts`: backend `AnalysisStatus` and queue metadata fields.
- Modify `src/lib/types.ts`: frontend `AnalysisStatus` and queue metadata fields.
- Create `api/_lib/analysisQueue.ts`: Redis client, enqueue, delayed enqueue, and active task helpers.
- Create `api/_lib/retryPolicy.ts`: retry classification and backoff calculation.
- Create `api/_lib/analysisExecution.ts`: run Mimo analysis for an existing analysis row without creating a new row.
- Create `api/_lib/analysisSubmission.ts`: shared Web/CLI queue submission service.
- Create `worker/analysisWorker.ts`: long-running Redis Stream consumer.
- Modify `api/analyze.ts`: submit queued task and return `202`.
- Modify `api/public/analyze.ts`: upload video, submit queued task, optionally wait and return Markdown.
- Modify `api/history/[id].ts`: expose queued/processing/failed status and error details.
- Modify `bin/vidana.mjs`: support polling queued public analysis responses.
- Modify `src/pages/AgentPage.tsx`: replace SSE-only flow with queued submit + polling.
- Modify `src/pages/HistoryPage.tsx`, admin pages if needed: status label mapping.
- Modify `package.json`: add `ioredis`, `tsx`, and worker scripts.
- Add tests under `__tests__/api/_lib/` and update API/CLI tests.
- Update `AGENTS.md` with worker startup command after implementation.

---

### Task 1: Add Queue Schema And Types

**Files:**
- Create: `supabase/migrations/005_analysis_queue.sql`
- Modify: `api/_lib/types.ts`
- Modify: `src/lib/types.ts`
- Test: `npm run build`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/005_analysis_queue.sql` with:

```sql
ALTER TABLE analyses
DROP CONSTRAINT IF EXISTS analyses_status_check;

ALTER TABLE analyses
ADD CONSTRAINT analyses_status_check
CHECK (status IN ('pending', 'analyzing', 'queued', 'processing', 'completed', 'failed', 'canceled'));

ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS queued_at timestamptz,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
ADD COLUMN IF NOT EXISTS locked_by text,
ADD COLUMN IF NOT EXISTS locked_at timestamptz,
ADD COLUMN IF NOT EXISTS source_mode text;

CREATE INDEX IF NOT EXISTS idx_analyses_queue_status
ON analyses(status, next_retry_at, queued_at);

CREATE INDEX IF NOT EXISTS idx_analyses_user_active_queue
ON analyses(user_id, status)
WHERE status IN ('queued', 'processing');

CREATE OR REPLACE FUNCTION count_active_analysis_tasks(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT count(*)::integer
  FROM analyses
  WHERE user_id = p_user_id
    AND status IN ('queued', 'processing');
$$;

REVOKE EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION count_active_analysis_tasks(uuid) TO service_role;
```

- [ ] **Step 2: Update backend types**

In `api/_lib/types.ts`, replace the inline status union with:

```ts
export type AnalysisStatus = 'pending' | 'analyzing' | 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'
```

Then set:

```ts
status: AnalysisStatus
queued_at: string | null
started_at: string | null
attempt_count: number
max_attempts: number
next_retry_at: string | null
locked_by: string | null
locked_at: string | null
source_mode: string | null
```

- [ ] **Step 3: Update frontend types**

In `src/lib/types.ts`, add the same `AnalysisStatus` export and queue metadata fields to `Analysis`.

- [ ] **Step 4: Verify**

Run:

```bash
npm run build
```

Expected: TypeScript build passes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/005_analysis_queue.sql api/_lib/types.ts src/lib/types.ts
git commit -m "feat: add analysis queue schema"
```

---

### Task 2: Add Retry Policy And Redis Helpers

**Files:**
- Create: `api/_lib/retryPolicy.ts`
- Create: `api/_lib/analysisQueue.ts`
- Modify: `package.json`
- Test: `__tests__/api/_lib/retryPolicy.test.ts`
- Test: `__tests__/api/_lib/analysisQueue.test.ts`

- [ ] **Step 1: Add dependencies**

Update `package.json`:

```json
"dependencies": {
  "ioredis": "^5.4.1"
},
"devDependencies": {
  "tsx": "^4.19.2"
}
```

Keep all existing dependencies and scripts.

Run:

```bash
npm install
```

Expected: lockfile updates and install succeeds.

- [ ] **Step 2: Write retry policy tests**

Create `__tests__/api/_lib/retryPolicy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { backoffMsForAttempt, isRetryableAnalysisError } from '../../../api/_lib/retryPolicy'

describe('analysis retry policy', () => {
  it('classifies transient Mimo and network errors as retryable', () => {
    expect(isRetryableAnalysisError(new Error('Mimo API error: 429 - rate limit'))).toBe(true)
    expect(isRetryableAnalysisError(new Error('Mimo API error: 500 - server error'))).toBe(true)
    expect(isRetryableAnalysisError(new Error('failed to download url data'))).toBe(true)
    expect(isRetryableAnalysisError(new Error('Mimo returned empty response via data-url'))).toBe(true)
    expect(isRetryableAnalysisError(Object.assign(new Error('timeout'), { name: 'AbortError' }))).toBe(true)
  })

  it('classifies permanent validation and configuration errors as non-retryable', () => {
    expect(isRetryableAnalysisError(new Error('Unsupported video format'))).toBe(false)
    expect(isRetryableAnalysisError(new Error('video file is required'))).toBe(false)
    expect(isRetryableAnalysisError(new Error('Missing MIMO_API_KEY'))).toBe(false)
    expect(isRetryableAnalysisError(new Error('可用分析次数不足，请联系管理员增加额度。'))).toBe(false)
  })

  it('returns bounded backoff values by attempt number', () => {
    expect(backoffMsForAttempt(1)).toBe(30_000)
    expect(backoffMsForAttempt(2)).toBe(120_000)
    expect(backoffMsForAttempt(3)).toBe(600_000)
    expect(backoffMsForAttempt(99)).toBe(600_000)
  })
})
```

- [ ] **Step 3: Implement retry policy**

Create `api/_lib/retryPolicy.ts`:

```ts
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function isRetryableAnalysisError(err: unknown): boolean {
  const message = errorMessage(err).toLowerCase()
  const name = err instanceof Error ? err.name : ''
  if (name === 'AbortError') return true
  if (message.includes('mimo api error: 429')) return true
  if (/mimo api error: 5\d\d/.test(message)) return true
  if (message.includes('failed to download url data')) return true
  if (message.includes('empty response')) return true
  if (message.includes('network') || message.includes('timeout')) return true
  return false
}

export function backoffMsForAttempt(attempt: number): number {
  if (attempt <= 1) return 30_000
  if (attempt === 2) return 120_000
  return 600_000
}
```

- [ ] **Step 4: Write queue helper tests**

Create `__tests__/api/_lib/analysisQueue.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activeTaskLimit, enqueueAnalysis, queueNames } from '../../../api/_lib/analysisQueue'

const redisMock = {
  xadd: vi.fn(),
}

vi.mock('../../../api/_lib/redis', () => ({
  getRedis: () => redisMock,
}))

beforeEach(() => {
  redisMock.xadd.mockReset()
  delete process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER
  delete process.env.ANALYSIS_QUEUE_STREAM
  delete process.env.ANALYSIS_QUEUE_GROUP
})

describe('analysis queue helpers', () => {
  it('uses stable default queue names', () => {
    expect(queueNames()).toEqual({
      stream: 'vidana:analysis:queue',
      group: 'vidana-workers',
    })
  })

  it('reads active task limit from env', () => {
    process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER = '5'
    expect(activeTaskLimit()).toBe(5)
  })

  it('enqueues a minimal stream payload', async () => {
    await enqueueAnalysis({ analysisId: 'analysis-1', userId: 'user-1', queuedAt: '2026-05-08T00:00:00.000Z' })
    expect(redisMock.xadd).toHaveBeenCalledWith(
      'vidana:analysis:queue',
      '*',
      'analysisId',
      'analysis-1',
      'userId',
      'user-1',
      'queuedAt',
      '2026-05-08T00:00:00.000Z',
    )
  })
})
```

- [ ] **Step 5: Implement Redis module and queue helpers**

Create `api/_lib/redis.ts`:

```ts
import Redis from 'ioredis'

let redis: Redis | null = null

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    redis = new Redis(url, { maxRetriesPerRequest: null })
  }
  return redis
}
```

Create `api/_lib/analysisQueue.ts`:

```ts
import { getRedis } from './redis'

export interface EnqueueAnalysisInput {
  analysisId: string
  userId: string
  queuedAt: string
}

export function queueNames() {
  return {
    stream: process.env.ANALYSIS_QUEUE_STREAM || 'vidana:analysis:queue',
    group: process.env.ANALYSIS_QUEUE_GROUP || 'vidana-workers',
  }
}

export function activeTaskLimit(): number {
  const value = Number(process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER || 3)
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 3
}

export async function enqueueAnalysis(input: EnqueueAnalysisInput): Promise<string> {
  const { stream } = queueNames()
  return getRedis().xadd(
    stream,
    '*',
    'analysisId',
    input.analysisId,
    'userId',
    input.userId,
    'queuedAt',
    input.queuedAt,
  )
}

export async function enqueueAnalysisAfter(input: EnqueueAnalysisInput, delayMs: number): Promise<void> {
  setTimeout(() => {
    enqueueAnalysis(input).catch((err) => {
      console.error('Failed to requeue analysis', err)
    })
  }, delayMs)
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- __tests__/api/_lib/retryPolicy.test.ts __tests__/api/_lib/analysisQueue.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json api/_lib/redis.ts api/_lib/retryPolicy.ts api/_lib/analysisQueue.ts __tests__/api/_lib/retryPolicy.test.ts __tests__/api/_lib/analysisQueue.test.ts
git commit -m "feat: add analysis queue helpers"
```

---

### Task 3: Split Analysis Execution From Task Creation

**Files:**
- Create: `api/_lib/analysisExecution.ts`
- Modify: `api/_lib/analysisPipeline.ts`
- Test: `__tests__/api/_lib/analysisExecution.test.ts`
- Test: `__tests__/api/_lib/analysisPipeline.test.ts`

- [ ] **Step 1: Write execution tests**

Create `__tests__/api/_lib/analysisExecution.test.ts` by moving the current Mimo execution assertions out of `analysisPipeline.test.ts`. The first test should prove an existing analysis is marked `processing`, completed, and charged:

```ts
it('executes an existing analysis and stores completed report', async () => {
  mocks.sseChunks.push(['{"score":90,"summary":"清晰。","timelineEdits":[],"globalEdits":[],"suggestions":[]}'])

  const output = await executeAnalysis({
    analysisId: 'analysis-1',
    userId: 'user-1',
    storagePath: 'user-1/clip.mp4',
    targetAudience: '用户',
    platform: '抖音',
    context: '',
    origin: 'https://app.example.com',
  })

  expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
    status: 'processing',
    started_at: expect.any(String),
    locked_at: expect.any(String),
  }))
  expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
    status: 'completed',
    score: 90,
    source_mode: 'signed-url',
  }))
  expect(mocks.chargeAnalysisCredit).toHaveBeenCalledWith('analysis-1')
  expect(output.report.summary).toBe('清晰。')
})
```

Also include the existing fallback tests for signed URL -> proxy URL -> data URL and all-attempts-empty failure.

- [ ] **Step 2: Implement execution module**

Create `api/_lib/analysisExecution.ts` with the Mimo execution parts currently inside `runAnalysisPipeline`, but accept an existing `analysisId`:

```ts
export interface ExecuteAnalysisInput {
  analysisId: string
  userId: string
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
  origin?: string | null
  lockedBy?: string
  onProgress?: (progress: AnalysisPipelineProgress) => void
}

export async function executeAnalysis(input: ExecuteAnalysisInput): Promise<AnalysisPipelineOutput> {
  const errors: string[] = []
  await updateAnalysis(input.analysisId, {
    status: 'processing',
    started_at: new Date().toISOString(),
    locked_by: input.lockedBy || null,
    locked_at: new Date().toISOString(),
  })

  const prompt = buildAnalysisPrompt(input)
  // Reuse collectAnalysis, parseAnalysisReport, source fallback, failure handling,
  // completed update, and chargeAnalysisCredit from the current pipeline logic.
}
```

Move shared helpers from `analysisPipeline.ts` into `analysisExecution.ts` or export them from `analysisPipeline.ts`; keep helpers local if possible.

- [ ] **Step 3: Keep compatibility wrapper**

Modify `api/_lib/analysisPipeline.ts` so `runAnalysisPipeline` still:

1. creates the analysis row,
2. emits `onAnalysisCreated`,
3. calls `executeAnalysis`,
4. returns the same output shape.

This preserves existing tests and benchmark-adjacent assumptions while new queue code can call `executeAnalysis` directly.

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/api/_lib/analysisExecution.test.ts __tests__/api/_lib/analysisPipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/analysisExecution.ts api/_lib/analysisPipeline.ts __tests__/api/_lib/analysisExecution.test.ts __tests__/api/_lib/analysisPipeline.test.ts
git commit -m "refactor: split analysis execution from creation"
```

---

### Task 4: Add Analysis Submission Service

**Files:**
- Create: `api/_lib/analysisSubmission.ts`
- Modify: `api/_lib/supabase.ts`
- Test: `__tests__/api/_lib/analysisSubmission.test.ts`

- [ ] **Step 1: Write submission tests**

Create `__tests__/api/_lib/analysisSubmission.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ActiveAnalysisLimitError, submitAnalysisJob } from '../../../api/_lib/analysisSubmission'

const mocks = vi.hoisted(() => ({
  createAnalysis: vi.fn(),
  updateAnalysis: vi.fn(),
  countActiveAnalysisTasks: vi.fn(),
  enqueueAnalysis: vi.fn(),
  activeTaskLimit: vi.fn(() => 3),
}))

vi.mock('../../../api/_lib/supabase', () => ({
  createAnalysis: mocks.createAnalysis,
  updateAnalysis: mocks.updateAnalysis,
  countActiveAnalysisTasks: mocks.countActiveAnalysisTasks,
}))

vi.mock('../../../api/_lib/analysisQueue', () => ({
  enqueueAnalysis: mocks.enqueueAnalysis,
  activeTaskLimit: mocks.activeTaskLimit,
}))

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset?.())
  mocks.activeTaskLimit.mockReturnValue(3)
})

describe('submitAnalysisJob', () => {
  it('creates a queued analysis and enqueues the job', async () => {
    mocks.countActiveAnalysisTasks.mockResolvedValue(0)
    mocks.createAnalysis.mockResolvedValue({ id: 'analysis-1' })
    mocks.enqueueAnalysis.mockResolvedValue('redis-id')

    const result = await submitAnalysisJob({
      userId: 'user-1',
      storagePath: 'user-1/clip.mp4',
      targetAudience: '用户',
      platform: '抖音',
      context: '背景',
    })

    expect(mocks.createAnalysis).toHaveBeenCalledWith('user-1', 'user-1/clip.mp4', expect.objectContaining({
      targetAudience: '用户',
      platform: '抖音',
    }))
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'queued',
      queued_at: expect.any(String),
    }))
    expect(mocks.enqueueAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      analysisId: 'analysis-1',
      userId: 'user-1',
    }))
    expect(result.analysisId).toBe('analysis-1')
  })

  it('rejects users over active task limit', async () => {
    mocks.countActiveAnalysisTasks.mockResolvedValue(3)
    await expect(submitAnalysisJob({ userId: 'user-1', storagePath: 'clip.mp4' })).rejects.toBeInstanceOf(ActiveAnalysisLimitError)
    expect(mocks.createAnalysis).not.toHaveBeenCalled()
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Add active count helper**

In `api/_lib/supabase.ts`, add:

```ts
export async function countActiveAnalysisTasks(userId: string): Promise<number> {
  const supabase = getSupabase()
  const { data, error } = await supabase.rpc('count_active_analysis_tasks', { p_user_id: userId })
  if (error) throw new Error(`Failed to count active analysis tasks: ${error.message}`)
  return Number(data || 0)
}
```

- [ ] **Step 3: Implement submission service**

Create `api/_lib/analysisSubmission.ts`:

```ts
import { activeTaskLimit, enqueueAnalysis } from './analysisQueue'
import { countActiveAnalysisTasks, createAnalysis, updateAnalysis } from './supabase'
import type { AnalysisType } from './types'

export class ActiveAnalysisLimitError extends Error {
  constructor(limit: number) {
    super(`当前排队或分析中的任务已达到 ${limit} 个，请等待已有任务完成后再提交。`)
  }
}

export interface SubmitAnalysisJobInput {
  userId: string
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
  analysisType?: AnalysisType
}

export async function submitAnalysisJob(input: SubmitAnalysisJobInput): Promise<{ analysisId: string }> {
  const limit = activeTaskLimit()
  const activeCount = await countActiveAnalysisTasks(input.userId)
  if (activeCount >= limit) throw new ActiveAnalysisLimitError(limit)

  const analysis = await createAnalysis(input.userId, input.storagePath, {
    targetAudience: input.targetAudience,
    platform: input.platform,
    context: input.context,
    analysisType: input.analysisType || 'analysis',
  })
  const queuedAt = new Date().toISOString()
  await updateAnalysis(analysis.id, {
    status: 'queued',
    queued_at: queuedAt,
    attempt_count: 0,
    max_attempts: 3,
    error_message: null,
  })
  await enqueueAnalysis({ analysisId: analysis.id, userId: input.userId, queuedAt })
  return { analysisId: analysis.id }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/api/_lib/analysisSubmission.test.ts __tests__/api/_lib/supabase.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/analysisSubmission.ts api/_lib/supabase.ts __tests__/api/_lib/analysisSubmission.test.ts __tests__/api/_lib/supabase.test.ts
git commit -m "feat: add queued analysis submission"
```

---

### Task 5: Add Worker

**Files:**
- Create: `worker/analysisWorker.ts`
- Modify: `package.json`
- Test: `__tests__/worker/analysisWorker.test.ts`

- [ ] **Step 1: Write worker behavior tests**

Create `__tests__/worker/analysisWorker.test.ts` with mocked Redis, Supabase helpers, and execution:

```ts
it('claims a queued task, executes it, and acknowledges the stream message', async () => {
  redis.xreadgroup.mockResolvedValue([
    ['vidana:analysis:queue', [['redis-msg-1', ['analysisId', 'analysis-1', 'userId', 'user-1', 'queuedAt', '2026-05-08T00:00:00.000Z']]]],
  ])
  getAnalysisById.mockResolvedValue({
    id: 'analysis-1',
    user_id: 'user-1',
    video_url: 'user-1/clip.mp4',
    status: 'queued',
    attempt_count: 0,
    max_attempts: 3,
  })
  claimAnalysisForProcessing.mockResolvedValue(true)
  executeAnalysis.mockResolvedValue({ analysisId: 'analysis-1', report: {}, rawResult: {}, sourceMode: 'signed-url', errors: [] })

  await processOneBatch({ consumerName: 'worker-test' })

  expect(claimAnalysisForProcessing).toHaveBeenCalledWith('analysis-1', 'worker-test')
  expect(executeAnalysis).toHaveBeenCalledWith(expect.objectContaining({ analysisId: 'analysis-1', lockedBy: 'worker-test' }))
  expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', 'redis-msg-1')
})
```

Add a second test for retryable error requeueing and a third for final failure after max attempts.

- [ ] **Step 2: Add DB helper signatures used by worker**

In `api/_lib/supabase.ts`, add:

```ts
export async function getAnalysisById(id: string): Promise<Analysis | null> {
  const { data, error } = await getSupabase().from('analyses').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`Failed to get analysis: ${error.message}`)
  return data as Analysis | null
}

export async function claimAnalysisForProcessing(id: string, workerId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { data, error } = await getSupabase()
    .from('analyses')
    .update({ status: 'processing', locked_by: workerId, locked_at: now, started_at: now })
    .eq('id', id)
    .in('status', ['queued'])
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Failed to claim analysis: ${error.message}`)
  return Boolean(data)
}
```

- [ ] **Step 3: Implement worker**

Create `worker/analysisWorker.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { getRedis } from '../api/_lib/redis'
import { queueNames, enqueueAnalysisAfter } from '../api/_lib/analysisQueue'
import { executeAnalysis } from '../api/_lib/analysisExecution'
import { backoffMsForAttempt, isRetryableAnalysisError } from '../api/_lib/retryPolicy'
import { getAnalysisById, claimAnalysisForProcessing, updateAnalysis } from '../api/_lib/supabase'

const consumerName = process.env.ANALYSIS_WORKER_ID || `worker-${randomUUID()}`
const redis = getRedis()

function parseFields(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let index = 0; index < fields.length; index += 2) result[fields[index]] = fields[index + 1]
  return result
}

export async function ensureGroup(): Promise<void> {
  const { stream, group } = queueNames()
  try {
    await redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM')
  } catch (err) {
    if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err
  }
}

export async function processOneBatch(opts: { consumerName?: string } = {}): Promise<void> {
  const workerId = opts.consumerName || consumerName
  const { stream, group } = queueNames()
  const response = await redis.xreadgroup('GROUP', group, workerId, 'COUNT', 1, 'BLOCK', 5000, 'STREAMS', stream, '>')
  if (!response) return

  for (const [, messages] of response as [string, [string, string[]][]][]) {
    for (const [messageId, fields] of messages) {
      const payload = parseFields(fields)
      const analysis = await getAnalysisById(payload.analysisId)
      if (!analysis || ['completed', 'failed', 'canceled'].includes(analysis.status)) {
        await redis.xack(stream, group, messageId)
        continue
      }

      const claimed = await claimAnalysisForProcessing(analysis.id, workerId)
      if (!claimed) {
        await redis.xack(stream, group, messageId)
        continue
      }

      try {
        await executeAnalysis({
          analysisId: analysis.id,
          userId: analysis.user_id,
          storagePath: analysis.video_url,
          targetAudience: analysis.target_audience || undefined,
          platform: analysis.platform || undefined,
          context: analysis.context || undefined,
          origin: process.env.VIDANA_PUBLIC_ORIGIN || process.env.VITE_APP_URL || null,
          lockedBy: workerId,
        })
      } catch (err) {
        const nextAttempt = Number(analysis.attempt_count || 0) + 1
        if (isRetryableAnalysisError(err) && nextAttempt < Number(analysis.max_attempts || 3)) {
          const delayMs = backoffMsForAttempt(nextAttempt)
          const nextRetryAt = new Date(Date.now() + delayMs).toISOString()
          await updateAnalysis(analysis.id, {
            status: 'queued',
            attempt_count: nextAttempt,
            next_retry_at: nextRetryAt,
            error_message: err instanceof Error ? err.message : String(err),
          })
          await enqueueAnalysisAfter({ analysisId: analysis.id, userId: analysis.user_id, queuedAt: nextRetryAt }, delayMs)
        } else {
          await updateAnalysis(analysis.id, {
            status: 'failed',
            attempt_count: nextAttempt,
            error_message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      await redis.xack(stream, group, messageId)
    }
  }
}

export async function main(): Promise<void> {
  await ensureGroup()
  while (true) await processOneBatch()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Add worker scripts**

In `package.json` scripts:

```json
"worker:analysis": "tsx worker/analysisWorker.ts"
```

- [ ] **Step 5: Run tests**

```bash
npm test -- __tests__/worker/analysisWorker.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/analysisWorker.ts api/_lib/supabase.ts package.json __tests__/worker/analysisWorker.test.ts
git commit -m "feat: add analysis worker"
```

---

### Task 6: Convert Web API To Queue Submission

**Files:**
- Modify: `api/analyze.ts`
- Modify: `api/history/[id].ts`
- Test: `__tests__/api/analyze.test.ts`
- Test: `__tests__/api/history.test.ts`

- [ ] **Step 1: Write API tests**

Add or update `__tests__/api/analyze.test.ts` so POST returns `202` and does not call `runAnalysisPipeline`:

```ts
it('submits an authenticated analysis job and returns 202', async () => {
  verifyAuthMock.mockReturnValue({ userId: 'user-1' })
  assertUserHasCreditsMock.mockResolvedValue(undefined)
  submitAnalysisJobMock.mockResolvedValue({ analysisId: 'analysis-1' })
  const response = createResponse()

  await handler({
    method: 'POST',
    body: { storagePath: 'user-1/clip.mp4', targetAudience: '用户', platform: '抖音', context: '背景' },
  } as never, response.res as never)

  expect(response.statusCode).toBe(202)
  expect(response.jsonBody).toEqual({ analysisId: 'analysis-1', status: 'queued' })
})
```

- [ ] **Step 2: Implement API route change**

Replace SSE behavior in `api/analyze.ts` with JSON queue submission:

```ts
try {
  await assertUserHasCredits(auth.userId)
  const job = await submitAnalysisJob({
    userId: auth.userId,
    storagePath,
    targetAudience,
    platform,
    context,
  })
  return res.status(202).json({ analysisId: job.analysisId, status: 'queued' })
} catch (err) {
  if (err instanceof InsufficientCreditsError) return res.status(402).json({ error: err.message })
  if (err instanceof ActiveAnalysisLimitError) return res.status(429).json({ error: err.message })
  console.error('Analysis queue error:', err)
  return res.status(500).json({ error: '分析任务提交失败，请稍后重试' })
}
```

- [ ] **Step 3: Ensure history detail exposes status**

Update `api/history/[id].ts` only if needed so GET returns `error_message`, `queued_at`, `started_at`, `attempt_count`, and `source_mode`.

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/api/analyze.test.ts __tests__/api/history.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/analyze.ts api/history/[id].ts __tests__/api/analyze.test.ts __tests__/api/history.test.ts
git commit -m "feat: queue web analysis requests"
```

---

### Task 7: Convert Public API And CLI To Queued Results

**Files:**
- Modify: `api/public/analyze.ts`
- Add: `api/public/analyses/[id].ts`
- Modify: `bin/vidana.mjs`
- Test: `__tests__/api/public/analyze.test.ts`
- Test: `__tests__/cli/vidana.test.mjs`

- [ ] **Step 1: Update public analyze tests**

Change the success test to expect queued submission and polling-compatible response:

```ts
expect(response.statusCode).toBe(202)
expect(response.jsonBody).toEqual({
  analysisId: 'analysis-1',
  status: 'queued',
})
```

Mock `submitAnalysisJob` instead of `runAnalysisPipeline`.

- [ ] **Step 2: Add public status endpoint**

Create `api/public/analyses/[id].ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerApiKey } from '../../_lib/apiKeys'
import { formatAnalysisMarkdown } from '../../_lib/markdown'
import { getAnalysis } from '../../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await verifyBearerApiKey(Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization)
  if (!auth) return res.status(401).json({ error: 'Invalid or missing Vidana API key' })
  const id = typeof req.query.id === 'string' ? req.query.id : ''
  if (!id) return res.status(400).json({ error: 'Missing analysis id' })
  const analysis = await getAnalysis(id, auth.userId)
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' })
  if (analysis.status === 'completed' && analysis.report) {
    return res.json({
      analysisId: analysis.id,
      status: analysis.status,
      markdown: formatAnalysisMarkdown(analysis.report as never, {
        fileName: analysis.video_url,
        targetAudience: analysis.target_audience || '',
        platform: analysis.platform || '',
        context: analysis.context || undefined,
      }),
      report: analysis.report,
    })
  }
  return res.json({
    analysisId: analysis.id,
    status: analysis.status,
    error: analysis.error_message,
  })
}
```

- [ ] **Step 3: Update CLI polling**

In `bin/vidana.mjs`, after upload response:

```js
async function pollAnalysis(baseUrl, apiKey, analysisId) {
  const deadline = Date.now() + 10 * 60 * 1000
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const response = await fetch(`${baseUrl}/api/public/analyses/${analysisId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || `Vidana API returned HTTP ${response.status}`)
    if (data.status === 'completed') return data
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(data.error || `Analysis ${data.status}`)
  }
  throw new Error('Timed out waiting for Vidana analysis.')
}
```

If upload returns `markdown`, keep backward compatibility and print immediately. If upload returns `analysisId`, poll until Markdown is available.

- [ ] **Step 4: Run tests**

```bash
npm test -- __tests__/api/public/analyze.test.ts __tests__/cli/vidana.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/public/analyze.ts api/public/analyses/[id].ts bin/vidana.mjs __tests__/api/public/analyze.test.ts __tests__/cli/vidana.test.mjs
git commit -m "feat: queue public analysis API"
```

---

### Task 8: Update Frontend Polling UX

**Files:**
- Modify: `src/pages/AgentPage.tsx`
- Modify: `src/pages/HistoryPage.tsx`
- Modify: `src/pages/AdminAnalysisDetailPage.tsx`
- Test: `npm run build`

- [ ] **Step 1: Update status labels**

Add labels for:

```ts
queued: { text: '排队中', color: 'bg-amber-50 text-amber-700' }
processing: { text: '分析中', color: 'bg-blue-50 text-blue-700' }
canceled: { text: '已取消', color: 'bg-zinc-100 text-zinc-500' }
```

Keep existing `pending` and `analyzing` labels for old data.

- [ ] **Step 2: Replace SSE parsing in submit handler**

In `AgentPage.tsx`, change analysis submission to:

1. POST `/api/analyze`.
2. Expect `{ analysisId, status: 'queued' }`.
3. Set selected/current analysis ID.
4. Set progress to queued.
5. Start polling history detail every 2500ms.

Use a helper:

```ts
async function waitForAnalysisResult(analysisId: string) {
  while (true) {
    const analysis = await apiFetch<Analysis>(`/history/${analysisId}`)
    if (analysis.status === 'completed' && analysis.report) return analysis
    if (analysis.status === 'failed' || analysis.status === 'canceled') {
      throw new Error(analysis.error_message || '分析任务失败')
    }
    await new Promise((resolve) => setTimeout(resolve, 2500))
  }
}
```

- [ ] **Step 3: Show queued/processing copy**

Map progress states:

```ts
queued -> '任务已进入队列，等待分析资源...'
processing -> '正在分析视频内容...'
```

Use the polled analysis status to update UI.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AgentPage.tsx src/pages/HistoryPage.tsx src/pages/AdminAnalysisDetailPage.tsx src/lib/types.ts
git commit -m "feat: show queued analysis progress"
```

---

### Task 9: Document Operations And Final Verification

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/tencent-cloud-redis-worker.md`
- Test: full verification commands

- [ ] **Step 1: Add Redis/worker operations doc**

Create `docs/tencent-cloud-redis-worker.md` with this content:

```md
# Tencent Cloud Redis Worker

Vidana uses Redis Stream on the CVM to queue video analysis jobs.

## Local/CVM Redis

Run Redis bound to localhost or VPC private IP only. Do not expose Redis publicly.

Recommended env:

    REDIS_URL=redis://127.0.0.1:6379
    ANALYSIS_QUEUE_STREAM=vidana:analysis:queue
    ANALYSIS_QUEUE_GROUP=vidana-workers
    MIMO_MAX_CONCURRENCY=1
    MIMO_MIN_INTERVAL_MS=3000
    ANALYSIS_ACTIVE_LIMIT_PER_USER=3

## Start Worker

    npm run worker:analysis

Run the API/web process separately. The API submits jobs; the worker executes them.
```

- [ ] **Step 2: Update AGENTS.md**

Add this section:

```md
Full queue development also requires Redis and the worker:

    npm run dev:full
    npm run worker:analysis

Use `REDIS_URL=redis://127.0.0.1:6379` for local or same-CVM Redis.
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
npm run lint
npm run build
node ./bin/vidana.mjs --help
```

Expected:

- `npm test`: PASS
- `npm run lint`: PASS, allowing the existing Fast Refresh warning if still present
- `npm run build`: PASS
- CLI help prints usage

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/tencent-cloud-redis-worker.md
git commit -m "docs: document analysis worker operations"
```

---

## Execution Notes

- Keep the existing dirty user changes in `src/components/Layout.tsx` and `src/pages/AgentPage.tsx` unless the active task explicitly modifies `AgentPage.tsx`; read the file first and preserve those edits.
- Do not make the Supabase `videos` bucket public.
- Do not log full API keys, Supabase service keys, Feishu secrets, or Mimo API keys.
- If Redis is unavailable, API submission should fail clearly with “分析队列暂不可用，请稍后重试”; it should not silently fall back to synchronous Mimo calls.
- Keep benchmark mode out of this MVP unless the user explicitly asks to queue benchmark analysis too.

## Self-Review Checklist

- Spec coverage: schema, Redis queue, Worker, rate limiting, retry policy, credits, Web polling, CLI polling, and operations docs are each mapped to tasks above.
- Scope check: benchmark mode is intentionally excluded from MVP to keep this plan focused.
- Type consistency: queue statuses are `queued`, `processing`, `completed`, `failed`, `canceled`, with legacy `pending` and `analyzing` retained for compatibility.
- Verification: each code task has targeted tests and the final task has full test/lint/build commands.
