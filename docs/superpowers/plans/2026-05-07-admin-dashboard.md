# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent Ovidly admin backend for metrics, user credit management, and analysis inspection.

**Architecture:** Add a small admin surface alongside the existing app: `/admin/*` React pages, `/api/admin/*` Vercel-style API handlers, and focused service modules for admin auth, credits, and admin data aggregation. Store credit state on `users.analysis_credits`, write all credit changes to `credit_transactions`, and record usage/error fields on `analyses`.

**Tech Stack:** React 18, React Router, TypeScript, Vercel-style API handlers, Express production adapter, Supabase service-role client, Vitest, JWT cookies.

---

## Current Context

- Main app routes live in `src/App.tsx` under `src/components/Layout.tsx`.
- API handlers live in `api/*.ts` and production routing is manually mapped in `server/index.ts`.
- Existing service-role Supabase helpers live in `api/_lib/supabase.ts`.
- Existing auth cookie helper lives in `api/_lib/cookies.ts`.
- Existing Web analysis routes are `api/analyze.ts` and `api/benchmark.ts`.
- Existing CLI/public analysis route is `api/public/analyze.ts`.
- Existing analysis pipelines are `api/_lib/analysisPipeline.ts` and `api/_lib/benchmarkPipeline.ts`.
- Tests use Vitest and existing API tests use module mocks in `__tests__/api/benchmark.test.ts`.

## File Structure

Create:

- `supabase/migrations/004_admin_credits_usage.sql` - credit and usage schema changes.
- `api/_lib/adminAuth.ts` - admin password check, JWT cookie issue/verify/clear.
- `api/_lib/credits.ts` - credit checks, initial grants, successful-analysis charging, error recording helper.
- `api/_lib/adminData.ts` - dashboard aggregation, user list/detail, analysis detail, credit adjustment.
- `api/admin/login.ts` - admin login route.
- `api/admin/logout.ts` - admin logout route.
- `api/admin/me.ts` - admin session route.
- `api/admin/dashboard.ts` - dashboard route.
- `api/admin/users/index.ts` - user list route.
- `api/admin/users/[id].ts` - user detail route.
- `api/admin/users/[id]/credits.ts` - credit adjustment route.
- `api/admin/analyses/[id].ts` - analysis detail route.
- `src/api/adminClient.ts` - frontend admin API client.
- `src/components/AdminLayout.tsx` - independent admin shell.
- `src/pages/AdminLoginPage.tsx` - password login page.
- `src/pages/AdminDashboardPage.tsx` - metrics dashboard.
- `src/pages/AdminUsersPage.tsx` - user list.
- `src/pages/AdminUserDetailPage.tsx` - user detail, credits, user analyses.
- `src/pages/AdminAnalysisDetailPage.tsx` - single analysis view.
- `__tests__/api/adminAuth.test.ts` - admin auth tests.
- `__tests__/api/credits.test.ts` - credit service tests.
- `__tests__/api/adminData.test.ts` - aggregation and admin data tests.
- `__tests__/api/admin-routes.test.ts` - route authorization and validation tests.

Modify:

- `api/_lib/types.ts` - add credit, token, and admin response types.
- `src/lib/types.ts` - add frontend admin types.
- `api/_lib/supabase.ts` - create new users with initial credit transaction.
- `api/_lib/analysisPipeline.ts` - record usage/error and charge successful analysis.
- `api/_lib/benchmarkPipeline.ts` - record usage/error and charge successful benchmark.
- `api/analyze.ts` - check credits before starting SSE work.
- `api/benchmark.ts` - check credits before starting SSE work.
- `api/public/analyze.ts` - check credits before parsing large upload.
- `server/index.ts` - map `/api/admin/*` routes.
- `src/App.tsx` - add independent admin routes outside the main product layout.

---

## Task 1: Schema And Shared Types

**Files:**
- Create: `supabase/migrations/004_admin_credits_usage.sql`
- Modify: `api/_lib/types.ts`
- Modify: `src/lib/types.ts`
- Test: `npm run build`

- [ ] **Step 1: Create migration**

Create `supabase/migrations/004_admin_credits_usage.sql`:

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS analysis_credits integer NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text NOT NULL,
  source text NOT NULL CHECK (source IN ('initial_grant', 'admin_adjustment', 'analysis_success')),
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id
  ON credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_analysis_id
  ON credit_transactions(analysis_id);

ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS credit_charged_at timestamptz;
```

- [ ] **Step 2: Extend server-side types**

In `api/_lib/types.ts`, extend `User` and `Analysis`, then add admin types:

```ts
export interface User {
  id: string
  feishu_id: string
  name: string
  avatar_url: string | null
  analysis_credits: number
  created_at: string
}

export interface Analysis {
  id: string
  user_id: string
  analysis_type: AnalysisType
  video_url: string
  video_duration: number | null
  target_audience: string | null
  platform: string | null
  context: string | null
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score: number | null
  raw_result: Record<string, unknown> | null
  report: AnalysisReport | BenchmarkReport | null
  input_tokens: number
  output_tokens: number
  total_tokens: number
  error_message: string | null
  credit_charged_at: string | null
  created_at: string
  completed_at: string | null
}

export type CreditTransactionSource = 'initial_grant' | 'admin_adjustment' | 'analysis_success'

export interface CreditTransaction {
  id: string
  user_id: string
  delta: number
  reason: string
  source: CreditTransactionSource
  analysis_id: string | null
  created_at: string
}

export type AdminRange = 'today' | '7d' | '30d'

export interface AdminMetric {
  key: 'new_users' | 'total_users' | 'analyses' | 'successes' | 'failures' | 'tokens'
  label: string
  value: number
  previousValue: number
  trendPercent: number | null
}

export interface AdminAnalysisSummary {
  id: string
  user_id: string
  user_name: string
  analysis_type: AnalysisType
  status: Analysis['status']
  score: number | null
  platform: string | null
  total_tokens: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface AdminUserListItem {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
  analysis_credits: number
  total_analyses: number
  completed_analyses: number
  failed_analyses: number
  last_analysis_at: string | null
}
```

- [ ] **Step 3: Extend frontend types**

In `src/lib/types.ts`, mirror only frontend-needed admin types:

```ts
export interface User {
  id: string
  name: string
  avatar_url: string | null
  analysis_credits?: number
}

export interface Analysis {
  id: string
  user_id: string
  analysis_type?: AnalysisType
  video_url: string
  video_duration: number | null
  target_audience: string | null
  platform: string | null
  context: string | null
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score: number | null
  raw_result: Record<string, unknown> | null
  report: Record<string, unknown> | null
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  error_message?: string | null
  credit_charged_at?: string | null
  created_at: string
  completed_at: string | null
}

export type AdminRange = 'today' | '7d' | '30d'

export interface AdminMetric {
  key: 'new_users' | 'total_users' | 'analyses' | 'successes' | 'failures' | 'tokens'
  label: string
  value: number
  previousValue: number
  trendPercent: number | null
}

export interface AdminAnalysisSummary {
  id: string
  user_id: string
  user_name: string
  analysis_type: AnalysisType
  status: Analysis['status']
  score: number | null
  platform: string | null
  total_tokens: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface AdminUserListItem {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
  analysis_credits: number
  total_analyses: number
  completed_analyses: number
  failed_analyses: number
  last_analysis_at: string | null
}

export interface CreditTransaction {
  id: string
  user_id: string
  delta: number
  reason: string
  source: 'initial_grant' | 'admin_adjustment' | 'analysis_success'
  analysis_id: string | null
  created_at: string
}
```

- [ ] **Step 4: Build check**

Run:

```bash
npm run build
```

Expected: TypeScript compiles. Any failures should be missing fields in mocks or narrow interfaces; update the affected test fixtures with zero/default values.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/004_admin_credits_usage.sql api/_lib/types.ts src/lib/types.ts
git commit -m "feat: add admin credit and usage schema"
```

---

## Task 2: Admin Cookie Authentication

**Files:**
- Create: `api/_lib/adminAuth.ts`
- Create: `api/admin/login.ts`
- Create: `api/admin/logout.ts`
- Create: `api/admin/me.ts`
- Create: `__tests__/api/adminAuth.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write failing admin auth tests**

Create `__tests__/api/adminAuth.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { clearAdminCookie, issueAdminCookie, verifyAdminRequest } from '../../api/_lib/adminAuth'

describe('admin auth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.VITE_APP_URL = 'http://localhost:5174'
  })

  it('issues an HttpOnly admin cookie signed with JWT_SECRET', () => {
    const cookie = issueAdminCookie()
    expect(cookie).toContain('admin_token=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=604800')
    expect(cookie).not.toContain('Secure')
  })

  it('verifies a request containing the issued admin token', () => {
    const cookie = issueAdminCookie()
    const token = cookie.match(/admin_token=([^;]+)/)?.[1]
    const req = { cookies: { admin_token: token } }
    expect(verifyAdminRequest(req as never)).toEqual({ admin: true })
  })

  it('rejects missing and invalid admin tokens', () => {
    expect(verifyAdminRequest({ cookies: {} } as never)).toBeNull()
    expect(verifyAdminRequest({ cookies: { admin_token: 'bad' } } as never)).toBeNull()
  })

  it('clears the admin cookie', () => {
    expect(clearAdminCookie()).toBe('admin_token=; Path=/; HttpOnly; Max-Age=0')
  })
})
```

- [ ] **Step 2: Run auth test to verify it fails**

Run:

```bash
npm test -- __tests__/api/adminAuth.test.ts
```

Expected: FAIL because `api/_lib/adminAuth.ts` does not exist.

- [ ] **Step 3: Implement `adminAuth`**

Create `api/_lib/adminAuth.ts`:

```ts
import jwt from 'jsonwebtoken'
import type { VercelRequest } from '@vercel/node'
import { authCookie, clearAuthCookie } from './cookies'

const ADMIN_COOKIE_NAME = 'admin_token'
const ADMIN_MAX_AGE = 7 * 24 * 3600

export interface AdminPayload {
  admin: true
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('Missing JWT_SECRET.')
  return secret
}

export function issueAdminCookie(): string {
  const token = jwt.sign({ admin: true } satisfies AdminPayload, jwtSecret(), { expiresIn: ADMIN_MAX_AGE })
  return authCookie(ADMIN_COOKIE_NAME, token, ADMIN_MAX_AGE)
}

export function clearAdminCookie(): string {
  return clearAuthCookie(ADMIN_COOKIE_NAME)
}

export function verifyAdminRequest(req: Pick<VercelRequest, 'cookies'>): AdminPayload | null {
  const token = req.cookies?.[ADMIN_COOKIE_NAME]
  if (!token) return null
  try {
    const payload = jwt.verify(token, jwtSecret()) as Partial<AdminPayload>
    return payload.admin === true ? { admin: true } : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Add admin session routes**

Create `api/admin/login.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { issueAdminCookie } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.ADMIN_PASSWORD) {
    console.error('ADMIN_PASSWORD is not configured.')
    return res.status(500).json({ error: 'Admin password is not configured' })
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: '密码错误' })

  res.setHeader('Set-Cookie', issueAdminCookie())
  return res.json({ authenticated: true })
}
```

Create `api/admin/logout.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearAdminCookie, verifyAdminRequest } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  res.setHeader('Set-Cookie', clearAdminCookie())
  return res.json({ authenticated: false })
}
```

Create `api/admin/me.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  return res.json({ authenticated: true })
}
```

- [ ] **Step 5: Map admin session routes in production server**

In `server/index.ts`, add imports to the `Promise.all` list:

```ts
  { default: adminLoginHandler },
  { default: adminLogoutHandler },
  { default: adminMeHandler },
```

Add import calls:

```ts
  import('../api/admin/login'),
  import('../api/admin/logout'),
  import('../api/admin/me'),
```

Add routes before static serving:

```ts
app.post('/api/admin/login', adapt(adminLoginHandler as VercelStyleHandler))
app.post('/api/admin/logout', adapt(adminLogoutHandler as VercelStyleHandler))
app.get('/api/admin/me', adapt(adminMeHandler as VercelStyleHandler))
```

- [ ] **Step 6: Run auth test**

Run:

```bash
npm test -- __tests__/api/adminAuth.test.ts
```

Expected: PASS.

- [ ] **Step 7: Build check**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/_lib/adminAuth.ts api/admin/login.ts api/admin/logout.ts api/admin/me.ts __tests__/api/adminAuth.test.ts server/index.ts
git commit -m "feat: add admin password session"
```

---

## Task 3: Credit Service And Analysis Integration

**Files:**
- Create: `api/_lib/credits.ts`
- Create: `__tests__/api/credits.test.ts`
- Modify: `api/_lib/supabase.ts`
- Modify: `api/_lib/analysisPipeline.ts`
- Modify: `api/_lib/benchmarkPipeline.ts`
- Modify: `api/analyze.ts`
- Modify: `api/benchmark.ts`
- Modify: `api/public/analyze.ts`

- [ ] **Step 1: Write failing credit service tests**

Create `__tests__/api/credits.test.ts` with a chainable Supabase mock:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../../api/_lib/supabase', () => ({
  getSupabase: () => supabaseMock,
}))

const { assertUserHasCredits, chargeAnalysisCredit, grantInitialCredits, recordAnalysisFailure } = await import('../../api/_lib/credits')

function tableMock(result: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = vi.fn((resolve) => Promise.resolve(resolve(result)))
  return chain
}

describe('credits service', () => {
  beforeEach(() => {
    supabaseMock.from.mockReset()
  })

  it('allows users with positive credits', async () => {
    const chain = tableMock({ data: { analysis_credits: 2 }, error: null })
    supabaseMock.from.mockReturnValue(chain)
    await expect(assertUserHasCredits('user-1')).resolves.toBeUndefined()
  })

  it('rejects users without credits', async () => {
    const chain = tableMock({ data: { analysis_credits: 0 }, error: null })
    supabaseMock.from.mockReturnValue(chain)
    await expect(assertUserHasCredits('user-1')).rejects.toThrow('可用分析次数不足')
  })

  it('writes initial grant transaction for a new user', async () => {
    const chain = tableMock({ data: null, error: null })
    supabaseMock.from.mockReturnValue(chain)
    await grantInitialCredits('user-1')
    expect(supabaseMock.from).toHaveBeenCalledWith('credit_transactions')
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      delta: 10,
      source: 'initial_grant',
      reason: '新用户初始额度',
    })
  })

  it('charges a completed analysis only when not already charged', async () => {
    const analysisChain = tableMock({ data: { user_id: 'user-1', credit_charged_at: null }, error: null })
    const userChain = tableMock({ data: { analysis_credits: 3 }, error: null })
    const updateUserChain = tableMock({ data: null, error: null })
    const transactionChain = tableMock({ data: null, error: null })
    const updateAnalysisChain = tableMock({ data: null, error: null })
    supabaseMock.from
      .mockReturnValueOnce(analysisChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(updateUserChain)
      .mockReturnValueOnce(transactionChain)
      .mockReturnValueOnce(updateAnalysisChain)

    await chargeAnalysisCredit('analysis-1')

    expect(updateUserChain.update).toHaveBeenCalledWith({ analysis_credits: 2 })
    expect(transactionChain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      delta: -1,
      source: 'analysis_success',
      analysis_id: 'analysis-1',
      reason: '分析成功扣减',
    })
    expect(updateAnalysisChain.update).toHaveBeenCalledWith(expect.objectContaining({ credit_charged_at: expect.any(String) }))
  })

  it('records failed analysis errors', async () => {
    const chain = tableMock({ data: null, error: null })
    supabaseMock.from.mockReturnValue(chain)
    await recordAnalysisFailure('analysis-1', new Error('Mimo failed'))
    expect(chain.update).toHaveBeenCalledWith({ status: 'failed', error_message: 'Mimo failed' })
  })
})
```

- [ ] **Step 2: Run credit tests to verify failure**

Run:

```bash
npm test -- __tests__/api/credits.test.ts
```

Expected: FAIL because `api/_lib/credits.ts` does not exist.

- [ ] **Step 3: Implement `credits.ts`**

Create `api/_lib/credits.ts`:

```ts
import { getSupabase } from './supabase'

export class InsufficientCreditsError extends Error {
  constructor() {
    super('可用分析次数不足，请联系管理员增加额度。')
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function assertUserHasCredits(userId: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('users').select('analysis_credits').eq('id', userId).single()
  if (error || !data) throw new Error(`Failed to check user credits: ${error?.message || 'empty response'}`)
  if (Number(data.analysis_credits) <= 0) throw new InsufficientCreditsError()
}

export async function grantInitialCredits(userId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    delta: 10,
    source: 'initial_grant',
    reason: '新用户初始额度',
  })
  if (error) throw new Error(`Failed to grant initial credits: ${error.message}`)
}

export async function chargeAnalysisCredit(analysisId: string): Promise<void> {
  const supabase = getSupabase()
  const { data: analysis, error: analysisError } = await supabase
    .from('analyses')
    .select('user_id, credit_charged_at')
    .eq('id', analysisId)
    .single()
  if (analysisError || !analysis) throw new Error(`Failed to load analysis for credit charge: ${analysisError?.message || 'empty response'}`)
  if (analysis.credit_charged_at) return

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('analysis_credits')
    .eq('id', analysis.user_id)
    .single()
  if (userError || !user) throw new Error(`Failed to load user credits: ${userError?.message || 'empty response'}`)
  const nextCredits = Number(user.analysis_credits) - 1
  if (nextCredits < 0) throw new InsufficientCreditsError()

  const { error: updateUserError } = await supabase.from('users').update({ analysis_credits: nextCredits }).eq('id', analysis.user_id)
  if (updateUserError) throw new Error(`Failed to deduct user credit: ${updateUserError.message}`)

  const { error: transactionError } = await supabase.from('credit_transactions').insert({
    user_id: analysis.user_id,
    delta: -1,
    source: 'analysis_success',
    analysis_id: analysisId,
    reason: '分析成功扣减',
  })
  if (transactionError) throw new Error(`Failed to write credit transaction: ${transactionError.message}`)

  const { error: updateAnalysisError } = await supabase
    .from('analyses')
    .update({ credit_charged_at: new Date().toISOString() })
    .eq('id', analysisId)
  if (updateAnalysisError) throw new Error(`Failed to mark analysis credit charged: ${updateAnalysisError.message}`)
}

export async function recordAnalysisFailure(analysisId: string, err: unknown): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('analyses').update({
    status: 'failed',
    error_message: errorMessage(err),
  }).eq('id', analysisId)
}
```

- [ ] **Step 4: Grant initial credits when creating users**

Modify `api/_lib/supabase.ts`:

```ts
import { grantInitialCredits } from './credits'
```

In `findOrCreateUser`, after a successful new user insert:

```ts
  const { data, error } = await supabase.from('users').insert({ feishu_id: feishuId, name, avatar_url: avatarUrl }).select().single()
  if (error || !data) throw new Error(`Failed to create user: ${error?.message || 'empty response'}`)
  await grantInitialCredits(data.id)
  return data as User
```

- [ ] **Step 5: Check credits in authenticated analysis APIs**

Modify `api/analyze.ts`:

```ts
import { assertUserHasCredits } from './_lib/credits'
```

After auth and before creating SSE headers:

```ts
  try {
    await assertUserHasCredits(auth.userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : '额度检查失败'
    return res.status(402).json({ error: message })
  }
```

Modify `api/benchmark.ts`:

```ts
import { assertUserHasCredits } from './_lib/credits'
```

After required field validation and before `sendSSE(res, 'status', ...)`, add:

```ts
  try {
    await assertUserHasCredits(auth.userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : '额度检查失败'
    sendSSE(res, 'error', { message })
    return res.end()
  }
```

- [ ] **Step 6: Check credits in public API**

Modify `api/public/analyze.ts`:

```ts
import { assertUserHasCredits } from '../_lib/credits'
```

After `verifyBearerApiKey` succeeds and before `parseMultipart(req)`:

```ts
  try {
    await assertUserHasCredits(auth.userId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Insufficient credits'
    return res.status(402).json({ error: message })
  }
```

- [ ] **Step 7: Charge success and record failures in pipelines**

Modify `api/_lib/analysisPipeline.ts`:

```ts
import { chargeAnalysisCredit, recordAnalysisFailure } from './credits'
```

When Mimo returns no content, replace:

```ts
await updateAnalysis(analysis.id, { status: 'failed' })
```

with:

```ts
await recordAnalysisFailure(analysis.id, new Error(message))
```

After the completed `updateAnalysis(...)`, add:

```ts
await chargeAnalysisCredit(analysis.id)
```

In the catch block, replace failed update:

```ts
if (analysisId) await recordAnalysisFailure(analysisId, err).catch(() => {})
```

Modify `api/_lib/benchmarkPipeline.ts`:

```ts
import { chargeAnalysisCredit, recordAnalysisFailure } from './credits'
```

When Mimo returns no benchmark content, replace:

```ts
await updateAnalysis(analysis.id, { status: 'failed' })
```

with:

```ts
await recordAnalysisFailure(analysis.id, new Error(message))
```

After the completed benchmark `updateAnalysis(...)`, add:

```ts
await chargeAnalysisCredit(analysis.id)
```

In the benchmark catch block, replace failed update with:

```ts
if (analysisId) await recordAnalysisFailure(analysisId, err).catch(() => {})
```

- [ ] **Step 8: Run targeted tests**

Run:

```bash
npm test -- __tests__/api/credits.test.ts __tests__/api/benchmark.test.ts
```

Expected: PASS. If `benchmark.test.ts` fails because credits were not mocked, add:

```ts
vi.mock('../../api/_lib/credits', () => ({
  assertUserHasCredits: vi.fn().mockResolvedValue(undefined),
}))
```

- [ ] **Step 9: Build check**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add api/_lib/credits.ts api/_lib/supabase.ts api/_lib/analysisPipeline.ts api/_lib/benchmarkPipeline.ts api/analyze.ts api/benchmark.ts api/public/analyze.ts __tests__/api/credits.test.ts __tests__/api/benchmark.test.ts
git commit -m "feat: enforce analysis credits"
```

---

## Task 4: Admin Data Service

**Files:**
- Create: `api/_lib/adminData.ts`
- Create: `__tests__/api/adminData.test.ts`

- [ ] **Step 1: Write date-window and trend tests**

Create `__tests__/api/adminData.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { calculateTrendPercent, getRangeWindow } from '../../api/_lib/adminData'

describe('admin data helpers', () => {
  it('computes today range against previous day', () => {
    const window = getRangeWindow('today', new Date('2026-05-07T12:00:00+08:00'))
    expect(window.currentStart.toISOString()).toBe('2026-05-06T16:00:00.000Z')
    expect(window.currentEnd.toISOString()).toBe('2026-05-07T16:00:00.000Z')
    expect(window.previousStart.toISOString()).toBe('2026-05-05T16:00:00.000Z')
    expect(window.previousEnd.toISOString()).toBe('2026-05-06T16:00:00.000Z')
  })

  it('computes seven day windows', () => {
    const window = getRangeWindow('7d', new Date('2026-05-07T12:00:00Z'))
    expect(window.currentEnd.toISOString()).toBe('2026-05-07T12:00:00.000Z')
    expect(window.currentStart.toISOString()).toBe('2026-04-30T12:00:00.000Z')
    expect(window.previousStart.toISOString()).toBe('2026-04-23T12:00:00.000Z')
  })

  it('calculates trend percentages', () => {
    expect(calculateTrendPercent(120, 100)).toBe(20)
    expect(calculateTrendPercent(80, 100)).toBe(-20)
    expect(calculateTrendPercent(5, 0)).toBeNull()
    expect(calculateTrendPercent(0, 0)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- __tests__/api/adminData.test.ts
```

Expected: FAIL because `api/_lib/adminData.ts` does not exist.

- [ ] **Step 3: Implement admin data helpers and service skeleton**

Create `api/_lib/adminData.ts`:

```ts
import { getSupabase } from './supabase'
import type { AdminAnalysisSummary, AdminMetric, AdminRange, AdminUserListItem, CreditTransaction } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface RangeWindow {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
}

export function getRangeWindow(range: AdminRange, now = new Date()): RangeWindow {
  if (range === 'today') {
    const shanghaiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    const currentStartLocal = new Date(shanghaiNow)
    currentStartLocal.setHours(0, 0, 0, 0)
    const offset = shanghaiNow.getTime() - now.getTime()
    const currentStart = new Date(currentStartLocal.getTime() - offset)
    const currentEnd = new Date(currentStart.getTime() + DAY_MS)
    return {
      currentStart,
      currentEnd,
      previousStart: new Date(currentStart.getTime() - DAY_MS),
      previousEnd: currentStart,
    }
  }

  const days = range === '7d' ? 7 : 30
  const currentEnd = now
  const currentStart = new Date(now.getTime() - days * DAY_MS)
  return {
    currentStart,
    currentEnd,
    previousStart: new Date(currentStart.getTime() - days * DAY_MS),
    previousEnd: currentStart,
  }
}

export function calculateTrendPercent(value: number, previousValue: number): number | null {
  if (previousValue === 0) return value === 0 ? 0 : null
  return Math.round(((value - previousValue) / previousValue) * 100)
}

function metric(key: AdminMetric['key'], label: string, value: number, previousValue: number): AdminMetric {
  return { key, label, value, previousValue, trendPercent: calculateTrendPercent(value, previousValue) }
}

function toIso(date: Date): string {
  return date.toISOString()
}

export async function getAdminDashboard(range: AdminRange) {
  const supabase = getSupabase()
  const window = getRangeWindow(range)
  const [currentUsers, previousUsers, totalUsers, previousTotalUsers, currentAnalyses, previousAnalyses, recentAnalyses, recentFailures] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', toIso(window.currentStart)).lt('created_at', toIso(window.currentEnd)),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', toIso(window.previousStart)).lt('created_at', toIso(window.previousEnd)),
    supabase.from('users').select('id', { count: 'exact', head: true }).lt('created_at', toIso(window.currentEnd)),
    supabase.from('users').select('id', { count: 'exact', head: true }).lt('created_at', toIso(window.previousEnd)),
    supabase.from('analyses').select('id,status,total_tokens', { count: 'exact' }).gte('created_at', toIso(window.currentStart)).lt('created_at', toIso(window.currentEnd)),
    supabase.from('analyses').select('id,status,total_tokens', { count: 'exact' }).gte('created_at', toIso(window.previousStart)).lt('created_at', toIso(window.previousEnd)),
    supabase.from('analyses').select('id,user_id,analysis_type,status,score,platform,total_tokens,error_message,created_at,completed_at,users(name)').order('created_at', { ascending: false }).limit(10),
    supabase.from('analyses').select('id,user_id,analysis_type,status,score,platform,total_tokens,error_message,created_at,completed_at,users(name)').eq('status', 'failed').order('created_at', { ascending: false }).limit(10),
  ])

  const currentRows = (currentAnalyses.data || []) as Array<{ status: string; total_tokens?: number }>
  const previousRows = (previousAnalyses.data || []) as Array<{ status: string; total_tokens?: number }>
  const currentSuccesses = currentRows.filter(row => row.status === 'completed').length
  const previousSuccesses = previousRows.filter(row => row.status === 'completed').length
  const currentFailures = currentRows.filter(row => row.status === 'failed').length
  const previousFailures = previousRows.filter(row => row.status === 'failed').length
  const currentTokens = currentRows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0)
  const previousTokens = previousRows.reduce((sum, row) => sum + Number(row.total_tokens || 0), 0)

  return {
    range,
    metrics: [
      metric('new_users', '新增用户', currentUsers.count ?? 0, previousUsers.count ?? 0),
      metric('total_users', '总用户', totalUsers.count ?? 0, previousTotalUsers.count ?? 0),
      metric('analyses', '分析数量', currentAnalyses.count ?? 0, previousAnalyses.count ?? 0),
      metric('successes', '成功次数', currentSuccesses, previousSuccesses),
      metric('failures', '失败次数', currentFailures, previousFailures),
      metric('tokens', '消耗 token', currentTokens, previousTokens),
    ],
    recentAnalyses: mapAnalysisSummaries(recentAnalyses.data || []),
    recentFailures: mapAnalysisSummaries(recentFailures.data || []),
  }
}

function userName(row: Record<string, unknown>): string {
  const users = row.users as { name?: string } | null
  return users?.name || '未知用户'
}

function mapAnalysisSummaries(rows: unknown[]): AdminAnalysisSummary[] {
  return rows.map((row) => {
    const item = row as Record<string, unknown>
    return {
      id: String(item.id),
      user_id: String(item.user_id),
      user_name: userName(item),
      analysis_type: item.analysis_type === 'benchmark' ? 'benchmark' : 'analysis',
      status: item.status as AdminAnalysisSummary['status'],
      score: typeof item.score === 'number' ? item.score : null,
      platform: typeof item.platform === 'string' ? item.platform : null,
      total_tokens: Number(item.total_tokens || 0),
      error_message: typeof item.error_message === 'string' ? item.error_message : null,
      created_at: String(item.created_at),
      completed_at: typeof item.completed_at === 'string' ? item.completed_at : null,
    }
  })
}
```

- [ ] **Step 4: Add user list/detail and credit adjustment functions**

Append to `api/_lib/adminData.ts`:

```ts
export async function listAdminUsers(page = 1, q = '', pageSize = 20): Promise<{ data: AdminUserListItem[]; count: number }> {
  const supabase = getSupabase()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  let query = supabase.from('users').select('id,name,avatar_url,created_at,analysis_credits', { count: 'exact' })
  if (q.trim()) query = query.ilike('name', `%${q.trim()}%`)
  const { data, count, error } = await query.order('created_at', { ascending: false }).range(from, to)
  if (error) throw new Error(`Failed to list admin users: ${error.message}`)

  const users = (data || []) as Array<{ id: string; name: string; avatar_url: string | null; created_at: string; analysis_credits: number }>
  const enriched = await Promise.all(users.map(async (user) => {
    const { data: analyses } = await supabase.from('analyses').select('status,created_at').eq('user_id', user.id).order('created_at', { ascending: false })
    const rows = analyses || []
    return {
      ...user,
      total_analyses: rows.length,
      completed_analyses: rows.filter(row => row.status === 'completed').length,
      failed_analyses: rows.filter(row => row.status === 'failed').length,
      last_analysis_at: rows[0]?.created_at || null,
    }
  }))

  return { data: enriched, count: count ?? 0 }
}

export async function getAdminUserDetail(userId: string, page = 1, pageSize = 20) {
  const supabase = getSupabase()
  const userList = await listAdminUsers(1, '', 1000)
  const user = userList.data.find(item => item.id === userId)
  if (!user) return null

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const [transactions, analyses] = await Promise.all([
    supabase.from('credit_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    supabase.from('analyses').select('id,user_id,analysis_type,status,score,platform,total_tokens,error_message,created_at,completed_at,users(name)', { count: 'exact' }).eq('user_id', userId).order('created_at', { ascending: false }).range(from, to),
  ])

  return {
    user,
    creditTransactions: (transactions.data || []) as CreditTransaction[],
    analyses: mapAnalysisSummaries(analyses.data || []),
    pagination: { page, pageSize, total: analyses.count ?? 0 },
  }
}

export async function adjustUserCredits(userId: string, delta: number, reason: string) {
  const supabase = getSupabase()
  if (!Number.isInteger(delta) || delta === 0) throw new Error('额度调整数量必须是非零整数')
  if (!reason.trim()) throw new Error('备注不能为空')

  const { data: user, error: userError } = await supabase.from('users').select('analysis_credits').eq('id', userId).single()
  if (userError || !user) throw new Error('用户不存在')
  const nextCredits = Number(user.analysis_credits) + delta
  if (nextCredits < 0) throw new Error('调整后余额不能小于 0')

  const { error: updateError } = await supabase.from('users').update({ analysis_credits: nextCredits }).eq('id', userId)
  if (updateError) throw new Error(`额度更新失败: ${updateError.message}`)

  const { data: transaction, error: transactionError } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    delta,
    reason: reason.trim(),
    source: 'admin_adjustment',
  }).select().single()
  if (transactionError || !transaction) throw new Error(`额度流水写入失败: ${transactionError?.message || 'empty response'}`)

  return { analysis_credits: nextCredits, transaction: transaction as CreditTransaction }
}

export async function getAdminAnalysisDetail(id: string) {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('analyses')
    .select('*,users(id,name,avatar_url)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}
```

- [ ] **Step 5: Run helper tests**

Run:

```bash
npm test -- __tests__/api/adminData.test.ts
```

Expected: PASS.

- [ ] **Step 6: Build check**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/adminData.ts __tests__/api/adminData.test.ts
git commit -m "feat: add admin data service"
```

---

## Task 5: Admin API Routes

**Files:**
- Create: `api/admin/dashboard.ts`
- Create: `api/admin/users/index.ts`
- Create: `api/admin/users/[id].ts`
- Create: `api/admin/users/[id]/credits.ts`
- Create: `api/admin/analyses/[id].ts`
- Create: `__tests__/api/admin-routes.test.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Write route authorization tests**

Create `__tests__/api/admin-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import dashboardHandler from '../../api/admin/dashboard'

const { verifyAdminRequestMock, getAdminDashboardMock } = vi.hoisted(() => ({
  verifyAdminRequestMock: vi.fn(),
  getAdminDashboardMock: vi.fn(),
}))

vi.mock('../../api/_lib/adminAuth', () => ({
  verifyAdminRequest: verifyAdminRequestMock,
}))

vi.mock('../../api/_lib/adminData', () => ({
  getAdminDashboard: getAdminDashboardMock,
}))

function response() {
  let statusCode = 200
  let body: unknown = null
  return {
    res: {
      status(code: number) { statusCode = code; return this },
      json(value: unknown) { body = value; return this },
    },
    get statusCode() { return statusCode },
    get body() { return body },
  }
}

describe('admin routes', () => {
  beforeEach(() => {
    verifyAdminRequestMock.mockReset()
    getAdminDashboardMock.mockReset()
  })

  it('rejects unauthenticated dashboard requests', async () => {
    verifyAdminRequestMock.mockReturnValue(null)
    const r = response()
    await dashboardHandler({ method: 'GET', query: {} } as never, r.res as never)
    expect(r.statusCode).toBe(401)
    expect(r.body).toEqual({ error: 'Unauthorized' })
  })

  it('returns dashboard data for authenticated admins', async () => {
    verifyAdminRequestMock.mockReturnValue({ admin: true })
    getAdminDashboardMock.mockResolvedValue({ range: 'today', metrics: [], recentAnalyses: [], recentFailures: [] })
    const r = response()
    await dashboardHandler({ method: 'GET', query: { range: 'today' } } as never, r.res as never)
    expect(r.body).toEqual({ range: 'today', metrics: [], recentAnalyses: [], recentFailures: [] })
  })
})
```

- [ ] **Step 2: Run route test to verify failure**

Run:

```bash
npm test -- __tests__/api/admin-routes.test.ts
```

Expected: FAIL because `api/admin/dashboard.ts` does not exist.

- [ ] **Step 3: Create admin route auth helper pattern**

Each route should start with:

```ts
const admin = verifyAdminRequest(req)
if (!admin) return res.status(401).json({ error: 'Unauthorized' })
```

Create `api/admin/dashboard.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../_lib/adminAuth'
import { getAdminDashboard } from '../_lib/adminData'
import type { AdminRange } from '../_lib/types'

function rangeValue(value: unknown): AdminRange {
  return value === '7d' || value === '30d' ? value : 'today'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const data = await getAdminDashboard(rangeValue(req.query.range))
    return res.json(data)
  } catch (err) {
    console.error('Failed to load admin dashboard', err)
    return res.status(500).json({ error: '后台数据加载失败' })
  }
}
```

- [ ] **Step 4: Create user and analysis routes**

Create `api/admin/users/index.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { listAdminUsers } from '../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  const page = Math.max(1, Number(req.query.page) || 1)
  const q = typeof req.query.q === 'string' ? req.query.q : ''
  return res.json(await listAdminUsers(page, q))
}
```

Create `api/admin/users/[id].ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { getAdminUserDetail } from '../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  const id = String(req.query.id || '')
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const data = await getAdminUserDetail(id, page, pageSize)
  if (!data) return res.status(404).json({ error: '用户不存在' })
  return res.json(data)
}
```

Create `api/admin/users/[id]/credits.ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../../_lib/adminAuth'
import { adjustUserCredits } from '../../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const id = String(req.query.id || '')
    const delta = Number(req.body?.delta)
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
    return res.json(await adjustUserCredits(id, delta, reason))
  } catch (err) {
    const message = err instanceof Error ? err.message : '额度调整失败'
    return res.status(400).json({ error: message })
  }
}
```

Create `api/admin/analyses/[id].ts`:

```ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { getAdminAnalysisDetail } from '../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
  const data = await getAdminAnalysisDetail(String(req.query.id || ''))
  if (!data) return res.status(404).json({ error: '分析记录不存在' })
  return res.json(data)
}
```

- [ ] **Step 5: Map all admin routes in `server/index.ts`**

Add dynamic imports:

```ts
  { default: adminDashboardHandler },
  { default: adminUsersHandler },
  { default: adminUserByIdHandler },
  { default: adminUserCreditsHandler },
  { default: adminAnalysisByIdHandler },
```

Add import calls:

```ts
  import('../api/admin/dashboard'),
  import('../api/admin/users'),
  import('../api/admin/users/[id]'),
  import('../api/admin/users/[id]/credits'),
  import('../api/admin/analyses/[id]'),
```

Add route mappings:

```ts
app.get('/api/admin/dashboard', adapt(adminDashboardHandler as VercelStyleHandler))
app.get('/api/admin/users', adapt(adminUsersHandler as VercelStyleHandler))
app.get('/api/admin/users/:id', withQueryParam('id'), adapt(adminUserByIdHandler as VercelStyleHandler))
app.post('/api/admin/users/:id/credits', withQueryParam('id'), adapt(adminUserCreditsHandler as VercelStyleHandler))
app.get('/api/admin/analyses/:id', withQueryParam('id'), adapt(adminAnalysisByIdHandler as VercelStyleHandler))
```

- [ ] **Step 6: Run route tests**

Run:

```bash
npm test -- __tests__/api/admin-routes.test.ts
```

Expected: PASS.

- [ ] **Step 7: Build check**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/admin __tests__/api/admin-routes.test.ts server/index.ts
git commit -m "feat: add admin API routes"
```

---

## Task 6: Admin Frontend Client, Layout, Login, Dashboard

**Files:**
- Create: `src/api/adminClient.ts`
- Create: `src/components/AdminLayout.tsx`
- Create: `src/pages/AdminLoginPage.tsx`
- Create: `src/pages/AdminDashboardPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add admin API client**

Create `src/api/adminClient.ts`:

```ts
const ADMIN_API_BASE = '/api/admin'

export async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })
  if (res.status === 401) {
    window.location.href = '/admin/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: '后台数据加载失败' }))
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function adminLogin(password: string) {
  return adminFetch<{ authenticated: true }>('/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function adminLogout() {
  return adminFetch<{ authenticated: false }>('/logout', { method: 'POST' })
}
```

- [ ] **Step 2: Add admin layout**

Create `src/components/AdminLayout.tsx`:

```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ChartLine, SignOut, UsersThree } from '@phosphor-icons/react'
import { adminLogout } from '../api/adminClient'

export default function AdminLayout() {
  const navigate = useNavigate()

  const logout = async () => {
    await adminLogout().catch(() => undefined)
    navigate('/admin/login')
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">Ovidly Admin</span>
          <span className="text-[11px] text-zinc-400">运营后台</span>
        </div>
        <nav className="flex items-center gap-2">
          <NavLink to="/admin" end className={({ isActive }) => `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${isActive ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            <ChartLine size={14} />
            Dashboard
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs ${isActive ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>
            <UsersThree size={14} />
            用户
          </NavLink>
          <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100">
            <SignOut size={14} />
            退出
          </button>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-5 py-6">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Add login page**

Create `src/pages/AdminLoginPage.tsx`:

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../api/adminClient'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await adminLogin(password)
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : '密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Ovidly Admin</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">后台登录</h1>
        <label className="mt-6 block">
          <span className="text-xs font-medium text-zinc-500">后台密码</span>
          <input value={password} onChange={event => setPassword(event.target.value)} type="password" className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400" />
        </label>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="mt-5 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 4: Add dashboard page**

Create `src/pages/AdminDashboardPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { adminFetch } from '../api/adminClient'
import type { AdminAnalysisSummary, AdminMetric, AdminRange } from '../lib/types'

interface DashboardResponse {
  range: AdminRange
  metrics: AdminMetric[]
  recentAnalyses: AdminAnalysisSummary[]
  recentFailures: AdminAnalysisSummary[]
}

const ranges: Array<{ value: AdminRange; label: string }> = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '7 日' },
  { value: '30d', label: '30 日' },
]

function trendText(value: number | null) {
  if (value === null) return '新增'
  if (value === 0) return '持平'
  return `${value > 0 ? '+' : ''}${value}%`
}

export default function AdminDashboardPage() {
  const [range, setRange] = useState<AdminRange>('today')
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch<DashboardResponse>(`/dashboard?range=${range}`)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : '后台数据加载失败'))
  }, [range])

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">运营概览</h1>
        </div>
        <div className="rounded-lg bg-zinc-100 p-1">
          {ranges.map(item => (
            <button key={item.value} onClick={() => setRange(item.value)} className={`rounded-md px-3 py-1.5 text-xs ${range === item.value ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {(data?.metrics || []).map(metric => (
          <div key={metric.key} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between">
              <p className="font-mono text-2xl font-semibold">{metric.value}</p>
              <span className="text-xs text-zinc-400">{trendText(metric.trendPercent)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AnalysisList title="最近分析" items={data?.recentAnalyses || []} />
        <AnalysisList title="失败分析" items={data?.recentFailures || []} />
      </div>
    </div>
  )
}

function AnalysisList({ title, items }: { title: string; items: AdminAnalysisSummary[] }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 divide-y divide-zinc-100">
        {items.length === 0 ? <p className="py-6 text-center text-sm text-zinc-400">暂无记录</p> : items.map(item => (
          <a key={item.id} href={`/admin/analyses/${item.id}`} className="block py-3 text-sm hover:bg-zinc-50">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate">{item.user_name} · {item.platform || '-'}</span>
              <span className="text-xs text-zinc-400">{item.status}</span>
            </div>
            {item.error_message && <p className="mt-1 truncate text-xs text-red-500">{item.error_message}</p>}
          </a>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Add admin routes to `src/App.tsx`**

Modify `src/App.tsx` imports:

```tsx
import AdminLayout from './components/AdminLayout'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminDashboardPage from './pages/AdminDashboardPage'
```

Add routes before the product layout route:

```tsx
<Route path="/admin/login" element={<AdminLoginPage />} />
<Route element={<AdminLayout />}>
  <Route path="/admin" element={<AdminDashboardPage />} />
</Route>
```

- [ ] **Step 6: Build check**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/adminClient.ts src/components/AdminLayout.tsx src/pages/AdminLoginPage.tsx src/pages/AdminDashboardPage.tsx src/App.tsx
git commit -m "feat: add admin dashboard UI"
```

---

## Task 7: Admin Users And Analysis Detail UI

**Files:**
- Create: `src/pages/AdminUsersPage.tsx`
- Create: `src/pages/AdminUserDetailPage.tsx`
- Create: `src/pages/AdminAnalysisDetailPage.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create users list page**

Create `src/pages/AdminUsersPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'
import type { AdminUserListItem } from '../lib/types'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch<{ data: AdminUserListItem[]; count: number }>(`/users?q=${encodeURIComponent(q)}`)
      .then(result => setUsers(result.data))
      .catch(err => setError(err instanceof Error ? err.message : '用户列表加载失败'))
  }, [q])

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Users</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">用户管理</h1>
        </div>
        <input value={q} onChange={event => setQ(event.target.value)} placeholder="搜索用户" className="w-64 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400" />
      </div>
      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3">用户</th>
              <th className="px-4 py-3">额度</th>
              <th className="px-4 py-3">分析</th>
              <th className="px-4 py-3">成功/失败</th>
              <th className="px-4 py-3">最近分析</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3"><Link className="font-medium text-zinc-950" to={`/admin/users/${user.id}`}>{user.name}</Link></td>
                <td className="px-4 py-3 font-mono">{user.analysis_credits}</td>
                <td className="px-4 py-3 font-mono">{user.total_analyses}</td>
                <td className="px-4 py-3">{user.completed_analyses}/{user.failed_analyses}</td>
                <td className="px-4 py-3 text-zinc-500">{user.last_analysis_at ? new Date(user.last_analysis_at).toLocaleString() : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create user detail page**

Create `src/pages/AdminUserDetailPage.tsx`:

```tsx
import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'
import type { AdminAnalysisSummary, AdminUserListItem, CreditTransaction } from '../lib/types'

interface UserDetail {
  user: AdminUserListItem
  creditTransactions: CreditTransaction[]
  analyses: AdminAnalysisSummary[]
  pagination: { page: number; pageSize: number; total: number }
}

export default function AdminUserDetailPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<UserDetail | null>(null)
  const [delta, setDelta] = useState('1')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const load = () => adminFetch<UserDetail>(`/users/${id}`).then(setData).catch(err => setError(err instanceof Error ? err.message : '用户详情加载失败'))

  useEffect(() => { load() }, [id])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      await adminFetch(`/users/${id}/credits`, { method: 'POST', body: JSON.stringify({ delta: Number(delta), reason }) })
      setReason('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '额度调整失败')
    }
  }

  if (!data) return <p className="text-sm text-zinc-400">加载中...</p>

  return (
    <div>
      <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-900">返回用户列表</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{data.user.name}</h1>
      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">剩余额度</p>
          <p className="mt-2 font-mono text-3xl font-semibold">{data.user.analysis_credits}</p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <input value={delta} onChange={event => setDelta(event.target.value)} className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            <input value={reason} onChange={event => setReason(event.target.value)} placeholder="调整备注" className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            <button className="w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white">调整额度</button>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-6">
            <h2 className="text-sm font-semibold">额度流水</h2>
            <div className="mt-2 divide-y divide-zinc-100">
              {data.creditTransactions.map(item => (
                <div key={item.id} className="py-2 text-xs">
                  <div className="flex justify-between"><span>{item.reason}</span><span className="font-mono">{item.delta > 0 ? '+' : ''}{item.delta}</span></div>
                  <p className="text-zinc-400">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">分析记录</h2>
          <div className="mt-3 divide-y divide-zinc-100">
            {data.analyses.map(item => (
              <Link key={item.id} to={`/admin/analyses/${item.id}`} className="block py-3 text-sm hover:bg-zinc-50">
                <div className="flex justify-between gap-3">
                  <span>{item.analysis_type === 'benchmark' ? '视频对标' : '投放分析'} · {item.platform || '-'}</span>
                  <span className="text-zinc-400">{item.status}</span>
                </div>
                {item.error_message && <p className="mt-1 text-xs text-red-500">{item.error_message}</p>}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create analysis detail page**

Create `src/pages/AdminAnalysisDetailPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'

export default function AdminAnalysisDetailPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch<Record<string, unknown>>(`/analyses/${id}`)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : '分析详情加载失败'))
  }, [id])

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
  if (!data) return <p className="text-sm text-zinc-400">加载中...</p>

  return (
    <div>
      <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-900">返回用户管理</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">分析详情</h1>
      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <Info label="状态" value={String(data.status || '-')} />
          <Info label="类型" value={data.analysis_type === 'benchmark' ? '视频对标' : '投放分析'} />
          <Info label="平台" value={String(data.platform || '-')} />
          <Info label="分数" value={data.score == null ? '-' : String(data.score)} />
          <Info label="Token" value={String(data.total_tokens || 0)} />
          <Info label="错误" value={String(data.error_message || '-')} />
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">报告 JSON</h2>
          <pre className="mt-3 max-h-[70vh] overflow-auto rounded-md bg-zinc-950 p-4 text-xs leading-6 text-zinc-50">
            {JSON.stringify(data.report || data.raw_result || data, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-zinc-100 py-3 first:pt-0 last:border-b-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-zinc-900">{value}</p>
    </div>
  )
}
```

- [ ] **Step 4: Add routes**

Modify `src/App.tsx` imports:

```tsx
import AdminUsersPage from './pages/AdminUsersPage'
import AdminUserDetailPage from './pages/AdminUserDetailPage'
import AdminAnalysisDetailPage from './pages/AdminAnalysisDetailPage'
```

Add routes under `AdminLayout`:

```tsx
<Route path="/admin/users" element={<AdminUsersPage />} />
<Route path="/admin/users/:id" element={<AdminUserDetailPage />} />
<Route path="/admin/analyses/:id" element={<AdminAnalysisDetailPage />} />
```

- [ ] **Step 5: Build check**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminUsersPage.tsx src/pages/AdminUserDetailPage.tsx src/pages/AdminAnalysisDetailPage.tsx src/App.tsx
git commit -m "feat: add admin user management UI"
```

---

## Task 8: Final Verification And Deployment Notes

**Files:**
- Modify: `docs/tencent-cloud-deploy.md`

- [ ] **Step 1: Document production environment variable**

Add `ADMIN_PASSWORD` to `docs/tencent-cloud-deploy.md` in the environment variable section:

```bash
ADMIN_PASSWORD=your-admin-password
```

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- `npm test`: PASS.
- `npm run lint`: PASS with only the known `src/hooks/useAuth.tsx` Fast Refresh warning if it still exists.
- `npm run build`: PASS.

- [ ] **Step 3: Local manual verification**

Run:

```bash
npm run dev:full
```

Open:

```text
http://localhost:5174/admin/login
```

Verify:

- Wrong password shows `密码错误`.
- Correct `ADMIN_PASSWORD` logs in.
- `/admin` loads metrics.
- `/admin/users` loads users.
- User detail can add credits with a required reason.
- User detail refuses a negative adjustment that would make balance below 0.
- Analysis detail displays JSON.
- A user with 0 credits cannot start Web analysis, benchmark analysis, or CLI/public API analysis.

- [ ] **Step 4: Commit docs**

```bash
git add docs/tencent-cloud-deploy.md
git commit -m "docs: document admin password env"
```

- [ ] **Step 5: Tencent Cloud deployment checklist**

On the server:

```bash
cd /opt/vidana
printf '\nADMIN_PASSWORD=%s\n' 'your-admin-password' >> .env.production
npm ci --ignore-scripts
npm rebuild esbuild
npm run build
pm2 restart vidana
pm2 save
```

Apply Supabase migration `supabase/migrations/004_admin_credits_usage.sql` in Supabase SQL Editor before verifying the live app.

Verify live:

```bash
curl http://119.45.39.96/ -I
curl http://119.45.39.96/api/admin/me -I
```

Expected:

- Home returns `200`.
- `/api/admin/me` returns `401` before login.
- Browser login at `http://119.45.39.96/admin/login` succeeds with `ADMIN_PASSWORD`.

---

## Self-Review

- Spec coverage: The plan covers admin login, dashboard metrics and trends, user list, credit adjustment with transactions, analysis detail, default 10 credits, success-only charging, failed-analysis error recording, usage fields, production route mapping, and deployment env.
- Scope: This is one coherent subsystem: admin backend and the credit model required by it. It is large but can be implemented in eight independently committable tasks.
- Type consistency: `AdminRange`, `AdminMetric`, `AdminAnalysisSummary`, `AdminUserListItem`, `CreditTransaction`, `analysis_credits`, `credit_charged_at`, `input_tokens`, `output_tokens`, `total_tokens`, and `error_message` are named consistently across schema, backend, and frontend.
- Known implementation risk: `adjustUserCredits` and `chargeAnalysisCredit` perform multi-step updates through Supabase client calls. For strict concurrency safety, a future migration can move these into SQL RPC functions; first version keeps the service-level implementation because the product currently has low write concurrency and no RPC pattern.
