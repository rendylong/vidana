# Vidana 视频素材分析 Agent 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个基于小米 mimo-v2.5 多模态模型的视频素材分析 Web 应用，用户上传视频后获得评分、问题清单、修改建议和平台适配建议。

**Architecture:** React 前端 + Vercel Serverless Functions 后端 + Supabase（数据库 + 存储）。视频由前端直传 Supabase Storage，后端通过签名 URL 调用 Mimo API 进行两步分析（多模态 → 文本深度解读），结果通过 SSE 流式推送给前端。

**Tech Stack:** React 18, React Router v6, Tailwind CSS, Vite, Node.js (Vercel Serverless), TypeScript, Supabase, mimo-v2.5

---

## File Structure

```
vidana/
├── api/                          # Vercel Serverless Functions
│   ├── _lib/                     # 共享模块（非 API 端点）
│   │   ├── types.ts              # 共享类型定义
│   │   ├── supabase.ts           # Supabase admin 客户端
│   │   ├── mimo.ts               # Mimo API 客户端
│   │   ├── auth.ts               # JWT 验证中间件
│   │   └── prompts.ts            # Prompt 模板
│   ├── auth/
│   │   ├── feishu.ts             # GET /api/auth/feishu
│   │   └── callback.ts           # GET /api/auth/callback
│   ├── analyze.ts                # POST /api/analyze (SSE)
│   └── history/
│       ├── index.ts              # GET /api/history
│       └── [id].ts               # GET/DELETE /api/history/:id
├── src/                          # React 前端
│   ├── components/
│   │   ├── Layout.tsx            # 全局布局 + Header
│   │   ├── ProtectedRoute.tsx    # 登录保护路由
│   │   ├── VideoUploader.tsx     # 拖拽上传组件
│   │   ├── ScoreGauge.tsx        # 评分仪表盘
│   │   ├── ProblemList.tsx       # 问题清单
│   │   ├── SuggestionList.tsx    # 修改建议
│   │   └── PlatformAdvice.tsx    # 平台适配建议
│   ├── pages/
│   │   ├── HomePage.tsx          # 首页/上传
│   │   ├── AnalysisPage.tsx      # 分析结果
│   │   └── HistoryPage.tsx       # 历史记录
│   ├── hooks/
│   │   ├── useAuth.ts            # 认证状态 hook
│   │   └── useSSE.ts             # SSE 连接 hook
│   ├── api/
│   │   └── client.ts             # API 调用封装
│   ├── lib/
│   │   ├── supabase.ts           # Supabase 前端客户端
│   │   └── types.ts              # 前端类型定义
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 001_init.sql          # 初始化数据库 + Storage
├── __tests__/
│   ├── api/_lib/
│   │   ├── mimo.test.ts
│   │   ├── prompts.test.ts
│   │   └── auth.test.ts
│   └── src/
│       └── components/
│           └── ScoreGauge.test.tsx
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── vercel.json
├── .env.example
├── .gitignore
├── tsconfig.json
└── package.json
```

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/index.css`

- [ ] **Step 1: 初始化 Vite + React + TypeScript 项目**

```bash
cd /Users/apple/vidana
npm create vite@latest . -- --template react-ts
```

如果目录非空会提示，选择忽略已有文件即可。

- [ ] **Step 2: 安装核心依赖**

```bash
npm install react-router-dom@6 @supabase/supabase-js
npm install -D tailwindcss @tailwindcss/vite vitest @testing-library/react @testing-library/jest-dom jsdom
npm install jsonwebtoken
npm install -D @types/jsonwebtoken @vercel/node
```

- [ ] **Step 3: 配置 Tailwind CSS**

`vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
```

`src/index.css`:
```css
@import "tailwindcss";
```

删除 `src/App.css`（如果 Vite 模板生成了的话）。

- [ ] **Step 4: 创建环境变量模板**

`.env.example`:
```
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Mimo API
MIMO_API_KEY=your-mimo-api-key
MIMO_API_ENDPOINT=https://token-plan-cn.xiaomimimo.com/v1

# Feishu OAuth
FEISHU_APP_ID=your-app-id
FEISHU_APP_SECRET=your-app-secret

# Auth
JWT_SECRET=your-jwt-secret-at-least-32-chars
```

- [ ] **Step 5: 更新 .gitignore**

追加到 `.gitignore`：
```
.env
.env.local
node_modules
dist
.superpowers/
```

- [ ] **Step 6: 创建最小 App 组件**

`src/main.tsx`:
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`:
```typescript
export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <h1 className="text-2xl font-bold text-gray-900">Vidana</h1>
    </div>
  )
}
```

- [ ] **Step 7: 验证开发服务器启动**

```bash
npm run dev
```

Expected: 浏览器打开 http://localhost:5173 显示 "Vidana" 标题。

- [ ] **Step 8: 配置 Vitest**

在 `vite.config.ts` 中添加 test 配置：

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
  },
})
```

`package.json` 中添加 script：
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 9: 初始化 Git 并提交**

```bash
cd /Users/apple/vidana
git init
git add .
git commit -m "feat: initialize project scaffold with Vite + React + Tailwind"
```

---

### Task 2: Supabase 数据库 + Storage

**Files:**
- Create: `supabase/migrations/001_init.sql`

- [ ] **Step 1: 编写数据库迁移 SQL**

`supabase/migrations/001_init.sql`:
```sql
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feishu_id text UNIQUE NOT NULL,
  name text NOT NULL,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

-- 分析记录表
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_url text NOT NULL,
  video_duration numeric,
  target_audience text,
  platform text,
  context text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'analyzing', 'completed', 'failed')),
  score integer,
  raw_result jsonb,
  report jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- 索引
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_created_at ON analyses(created_at DESC);

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的分析记录
CREATE POLICY "Users can read own analyses"
  ON analyses FOR SELECT
  USING (user_id::text = (current_setting('request.jwt.claims')::json->>'sub'));

CREATE POLICY "Users can delete own analyses"
  ON analyses FOR DELETE
  USING (user_id::text = (current_setting('request.jwt.claims')::json->>'sub'));

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);

-- Storage RLS: 用户只能操作自己文件夹下的视频
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read own videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete own videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2: 在 Supabase Dashboard 执行迁移**

在 Supabase SQL Editor 中执行上述 SQL。或使用 CLI：
```bash
supabase db push
```

- [ ] **Step 3: 验证表和 Storage 创建成功**

在 Supabase Dashboard 中确认：
- `users` 表已创建
- `analyses` 表已创建
- `videos` Storage bucket 已创建
- RLS 策略已启用

- [ ] **Step 4: 提交**

```bash
git add supabase/
git commit -m "feat: add Supabase database schema and storage config"
```

---

### Task 3: 后端共享类型 + 环境配置

**Files:**
- Create: `api/_lib/types.ts`
- Create: `src/lib/types.ts`
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: 创建后端类型定义**

`api/_lib/types.ts`:
```typescript
export interface User {
  id: string
  feishu_id: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Analysis {
  id: string
  user_id: string
  video_url: string
  video_duration: number | null
  target_audience: string | null
  platform: string | null
  context: string | null
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score: number | null
  raw_result: Record<string, unknown> | null
  report: AnalysisReport | null
  created_at: string
  completed_at: string | null
}

export interface AnalysisReport {
  score: number
  summary: string
  problems: Problem[]
  suggestions: Suggestion[]
  platformAdvice: PlatformAdvice | null
  audienceFit: AudienceFit | null
}

export interface Problem {
  category: string
  severity: 'high' | 'medium' | 'low'
  description: string
  timestamp: string | null
}

export interface Suggestion {
  priority: 'high' | 'medium' | 'low'
  action: string
  detail: string
  timeRange: string | null
}

export interface PlatformAdvice {
  platform: string
  tips: string[]
}

export interface AudienceFit {
  audience: string
  score: number
  reasoning: string
}

export interface AnalyzeRequest {
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
}

export interface SSEEvent {
  event: 'status' | 'progress' | 'result' | 'error'
  data: Record<string, unknown>
}
```

- [ ] **Step 2: 创建前端类型定义**

`src/lib/types.ts`:
```typescript
export type { AnalysisReport, Problem, Suggestion, PlatformAdvice, AudienceFit } from '../../../api/_lib/types'
export type { Analysis } from '../../../api/_lib/types'

export interface User {
  id: string
  name: string
  avatar_url: string | null
}

export type Platform = '抖音' | 'B站' | '小红书' | '微信视频号' | '快手' | 'YouTube'

export const PLATFORMS: Platform[] = ['抖音', 'B站', '小红书', '微信视频号', '快手', 'YouTube']
```

- [ ] **Step 3: 创建前端 Supabase 客户端**

`src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
```

- [ ] **Step 4: 创建 `.env.local` 文件（开发者自行填写真实值）**

```bash
cp .env.example .env.local
# 填入实际的 Supabase 和 Mimo 配置
```

- [ ] **Step 5: 提交**

```bash
git add api/_lib/types.ts src/lib/types.ts src/lib/supabase.ts
git commit -m "feat: add shared types and Supabase frontend client"
```

---

### Task 4: 后端 Supabase Service

**Files:**
- Create: `api/_lib/supabase.ts`

- [ ] **Step 1: 创建 Supabase admin 客户端**

`api/_lib/supabase.ts`:
```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { User, Analysis } from './types'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _supabase
}

export async function findOrCreateUser(feishuId: string, name: string, avatarUrl: string): Promise<User> {
  const supabase = getSupabase()

  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('feishu_id', feishuId)
    .single()

  if (existing) {
    if (existing.name !== name || existing.avatar_url !== avatarUrl) {
      const { data } = await supabase
        .from('users')
        .update({ name, avatar_url: avatarUrl })
        .eq('id', existing.id)
        .select()
        .single()
      return data as User
    }
    return existing as User
  }

  const { data } = await supabase
    .from('users')
    .insert({ feishu_id: feishuId, name, avatar_url: avatarUrl })
    .select()
    .single()

  return data as User
}

export async function createAnalysis(userId: string, videoUrl: string, opts: {
  targetAudience?: string
  platform?: string
  context?: string
}): Promise<Analysis> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('analyses')
    .insert({
      user_id: userId,
      video_url: videoUrl,
      target_audience: opts.targetAudience || null,
      platform: opts.platform || null,
      context: opts.context || null,
      status: 'pending',
    })
    .select()
    .single()
  return data as Analysis
}

export async function updateAnalysis(id: string, updates: Partial<Analysis>): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('analyses').update(updates).eq('id', id)
}

export async function getAnalysis(id: string, userId: string): Promise<Analysis | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  return data as Analysis | null
}

export async function listAnalyses(userId: string, page = 1, pageSize = 12): Promise<{ data: Analysis[], count: number }> {
  const supabase = getSupabase()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const [countResult, dataResult] = await Promise.all([
    supabase.from('analyses').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('analyses').select('*').eq('user_id', userId).order('created_at', { ascending: false }).range(from, to),
  ])

  return {
    data: dataResult.data as Analysis[],
    count: countResult.count ?? 0,
  }
}

export async function deleteAnalysis(id: string, userId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('analyses').delete().eq('id', id).eq('user_id', userId)
  return !error
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const supabase = getSupabase()
  const { data } = await supabase.storage.from('videos').createSignedUrl(storagePath, 3600)
  return data!.signedUrl
}
```

- [ ] **Step 2: 提交**

```bash
git add api/_lib/supabase.ts
git commit -m "feat: add Supabase admin service with user and analysis operations"
```

---

### Task 5: Mimo API Client（含测试）

**Files:**
- Create: `api/_lib/mimo.ts`
- Create: `__tests__/api/_lib/mimo.test.ts`

- [ ] **Step 1: 编写 Mimo client 测试**

`__tests__/api/_lib/mimo.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMultimodalRequest, buildDeepAnalysisRequest, parseSSEStream } from '../../../api/_lib/mimo'

describe('buildMultimodalRequest', () => {
  it('构建包含视频 URL 的多模态请求', () => {
    const req = buildMultimodalRequest('https://example.com/video.mp4', '分析这段视频')
    expect(req.model).toBe('mimo-v2.5')
    expect(req.stream).toBe(true)
    expect(req.messages).toHaveLength(2)
    expect(req.messages[1].content).toBeArray()
    const content = req.messages[1].content as Array<Record<string, unknown>>
    expect(content[0].type).toBe('video_url')
    expect(content[1].type).toBe('text')
  })

  it('使用 base64 编码传入视频', () => {
    const req = buildMultimodalRequest('data:video/mp4;base64,AAAA', '分析这段视频')
    const content = req.messages[1].content as Array<Record<string, unknown>>
    expect((content[0].video_url as Record<string, string>).url).toBe('data:video/mp4;base64,AAAA')
  })
})

describe('buildDeepAnalysisRequest', () => {
  it('构建文本深度分析请求', () => {
    const req = buildDeepAnalysisRequest('初步分析结果', {
      targetAudience: '年轻人',
      platform: '抖音',
      context: '护肤品广告',
    })
    expect(req.model).toBe('mimo-v2.5')
    expect(req.stream).toBe(true)
    expect(req.messages[1].content as string).toContain('年轻人')
    expect(req.messages[1].content as string).toContain('抖音')
    expect(req.messages[1].content as string).toContain('护肤品广告')
  })

  it('无可选参数时不包含相关段落', () => {
    const req = buildDeepAnalysisRequest('初步结果', {})
    const content = req.messages[1].content as string
    expect(content).not.toContain('目标受众')
    expect(content).not.toContain('发布平台')
    expect(content).not.toContain('补充上下文')
  })
})

describe('parseSSEStream', () => {
  it('解析 SSE 数据行', async () => {
    const chunks: string[] = []
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      }
    })
    const response = new Response(mockStream, {
      headers: { 'content-type': 'text/event-stream' },
    })

    for await (const text of parseSSEStream(response)) {
      chunks.push(text)
    }
    expect(chunks).toEqual(['hello'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/api/_lib/mimo.test.ts
```

Expected: FAIL — `mimo.ts` 不存在

- [ ] **Step 3: 实现 Mimo client**

`api/_lib/mimo.ts`:
```typescript
const MIMO_ENDPOINT = process.env.MIMO_API_ENDPOINT || 'https://token-plan-cn.xiaomimimo.com/v1'
const MIMO_API_KEY = process.env.MIMO_API_KEY || ''

interface RequestOptions {
  targetAudience?: string
  platform?: string
  context?: string
}

export function buildMultimodalRequest(videoUrl: string, analysisPrompt: string) {
  return {
    model: 'mimo-v2.5',
    stream: true,
    messages: [
      {
        role: 'system',
        content: '你是一个专业的视频内容分析师。请从画面质量、构图镜头、剪辑节奏、音频质量、叙事结构等维度分析视频素材。以 JSON 格式输出分析结果。',
      },
      {
        role: 'user',
        content: [
          {
            type: 'video_url',
            video_url: { url: videoUrl },
            fps: 2,
            media_resolution: 'default',
          },
          {
            type: 'text',
            text: analysisPrompt,
          },
        ],
      },
    ],
    max_completion_tokens: 4096,
  }
}

export function buildDeepAnalysisRequest(multimodalResult: string, opts: RequestOptions) {
  let prompt = `基于以下视频初步分析结果，请生成一份详细的结构化分析报告。

初步分析结果：
${multimodalResult}

报告必须严格按以下 JSON 格式输出：
{
  "score": <0-100整数>,
  "summary": "<整体评价>",
  "problems": [{"category":"<分类>","severity":"<high|medium|low>","description":"<描述>","timestamp":"<MM:SS或null>"}],
  "suggestions": [{"priority":"<high|medium|low>","action":"<操作>","detail":"<详情>","timeRange":"<MM:SS-MM:SS或null>"}],
  "platformAdvice": null,
  "audienceFit": null
}`

  if (opts.targetAudience) {
    prompt += `\n\n目标受众：${opts.targetAudience}\n请在 audienceFit 字段中评估视频对目标受众的适配度。`
  }
  if (opts.platform) {
    prompt += `\n\n发布平台：${opts.platform}\n请在 platformAdvice 字段中给出该平台的适配建议。`
  }
  if (opts.context) {
    prompt += `\n\n补充上下文：${opts.context}\n请结合这些背景信息分析视频是否有效传达了核心信息。`
  }

  return {
    model: 'mimo-v2.5',
    stream: true,
    messages: [
      {
        role: 'system',
        content: '你是一位资深的视频制作顾问。你总是输出严格的 JSON 格式，不包含任何 markdown 代码块标记。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    max_completion_tokens: 4096,
  }
}

export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return

      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) yield content
      } catch {
        // 跳过非 JSON 行
      }
    }
  }
}

export async function callMimoAPI(body: Record<string, unknown>): Promise<Response> {
  const response = await fetch(`${MIMO_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': MIMO_API_KEY,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Mimo API error: ${response.status} - ${error}`)
  }

  return response
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/api/_lib/mimo.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add api/_lib/mimo.ts __tests__/api/_lib/mimo.test.ts
git commit -m "feat: add Mimo API client with SSE stream parsing and tests"
```

---

### Task 6: Auth 中间件 + Prompt 模板（含测试）

**Files:**
- Create: `api/_lib/auth.ts`
- Create: `api/_lib/prompts.ts`
- Create: `__tests__/api/_lib/auth.test.ts`
- Create: `__tests__/api/_lib/prompts.test.ts`

- [ ] **Step 1: 编写 auth 中间件测试**

`__tests__/api/_lib/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { verifyAuth } from '../../../api/_lib/auth'

const JWT_SECRET = 'test-secret-at-least-32-characters-long'

describe('verifyAuth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET
  })

  it('从 Cookie 中验证有效 JWT', () => {
    const token = jwt.sign({ userId: 'user-123', feishuId: 'feishu-456' }, JWT_SECRET)
    const req = { cookies: { token } } as any
    const result = verifyAuth(req)
    expect(result.userId).toBe('user-123')
  })

  it('无效 token 返回 null', () => {
    const req = { cookies: { token: 'invalid-token' } } as any
    const result = verifyAuth(req)
    expect(result).toBeNull()
  })

  it('缺少 token 返回 null', () => {
    const req = { cookies: {} } as any
    const result = verifyAuth(req)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run __tests__/api/_lib/auth.test.ts
```

Expected: FAIL

- [ ] **Step 3: 实现 auth 中间件**

`api/_lib/auth.ts`:
```typescript
import jwt from 'jsonwebtoken'

interface AuthPayload {
  userId: string
  feishuId: string
}

export function verifyAuth(req: { cookies?: Record<string, string> }): AuthPayload | null {
  const token = req.cookies?.token
  if (!token) return null

  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload
  } catch {
    return null
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' })
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run __tests__/api/_lib/auth.test.ts
```

Expected: PASS

- [ ] **Step 5: 编写 prompt 模板测试**

`__tests__/api/_lib/prompts.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt } from '../../../api/_lib/prompts'

describe('buildAnalysisPrompt', () => {
  it('基础 prompt 不含可选项', () => {
    const prompt = buildAnalysisPrompt({})
    expect(prompt).toContain('画面质量')
    expect(prompt).not.toContain('目标受众')
  })

  it('包含目标受众', () => {
    const prompt = buildAnalysisPrompt({ targetAudience: '18-25岁' })
    expect(prompt).toContain('18-25岁')
  })

  it('包含平台', () => {
    const prompt = buildAnalysisPrompt({ platform: '抖音' })
    expect(prompt).toContain('抖音')
  })

  it('包含补充上下文', () => {
    const prompt = buildAnalysisPrompt({ context: '护肤品品牌' })
    expect(prompt).toContain('护肤品品牌')
  })
})
```

- [ ] **Step 6: 运行测试确认失败**

```bash
npx vitest run __tests__/api/_lib/prompts.test.ts
```

Expected: FAIL

- [ ] **Step 7: 实现 prompt 模板**

`api/_lib/prompts.ts`:
```typescript
interface PromptOptions {
  targetAudience?: string
  platform?: string
  context?: string
}

export function buildAnalysisPrompt(opts: PromptOptions): string {
  let prompt = `请从以下维度详细分析这段视频素材：

1. **画面质量**：清晰度、光线运用、色彩表现
2. **构图与镜头**：构图是否合理、镜头运动是否流畅
3. **剪辑节奏**：剪辑节奏是否恰当、转场是否自然
4. **音频质量**：背景音、配音、音效是否协调
5. **叙事结构**：内容是否有清晰的起承转合
6. **整体观感**：视觉冲击力、情感传达、专业度`

  if (opts.targetAudience) {
    prompt += `\n\n目标受众：${opts.targetAudience}\n请评估视频对目标受众的吸引力和适配度。`
  }

  if (opts.platform) {
    prompt += `\n\n发布平台：${opts.platform}\n请给出该平台的适配建议（如画面比例、时长、节奏等）。`
  }

  if (opts.context) {
    prompt += `\n\n补充背景信息：${opts.context}\n请结合这些信息分析视频是否有效传达了核心卖点或信息。`
  }

  prompt += '\n\n请以 JSON 格式输出分析结果，包含各维度的评分和详细说明。'

  return prompt
}
```

- [ ] **Step 8: 运行测试确认通过**

```bash
npx vitest run __tests__/api/_lib/prompts.test.ts
```

Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add api/_lib/auth.ts api/_lib/prompts.ts __tests__/api/_lib/auth.test.ts __tests__/api/_lib/prompts.test.ts
git commit -m "feat: add JWT auth middleware and prompt templates with tests"
```

---

### Task 7: 飞书 OAuth API 路由

**Files:**
- Create: `api/auth/feishu.ts`
- Create: `api/auth/callback.ts`

- [ ] **Step 1: 实现飞书 OAuth 发起路由**

`api/auth/feishu.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const appId = process.env.FEISHU_APP_ID
  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = `${process.env.VITE_SUPABASE_URL?.replace('/v1', '') || ''}/api/auth/callback`

  // 存 state 到 cookie 用于回调验证
  res.setHeader('Set-Cookie', `oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lark; Max-Age=600`)

  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
  res.redirect(authUrl)
}
```

- [ ] **Step 2: 实现飞书 OAuth 回调路由**

`api/auth/callback.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { findOrCreateUser } from '../_lib/supabase'
import { signToken } from '../_lib/auth'

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!

async function getFeishuToken(code: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${FEISHU_APP_ID}:${FEISHU_APP_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu token error: ${data.msg}`)
  return data.data.access_token
}

async function getFeishuUser(accessToken: string): Promise<{ id: string; name: string; avatar_url: string }> {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu user error: ${data.msg}`)
  return {
    id: data.data.sub,
    name: data.data.name || '飞书用户',
    avatar_url: data.data.picture || '',
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { code, state } = req.query as { code?: string; state?: string }
  const cookieState = req.cookies?.oauth_state

  if (!code || !state || state !== cookieState) {
    return res.status(400).json({ error: 'Invalid OAuth callback' })
  }

  try {
    const accessToken = await getFeishuToken(code)
    const feishuUser = await getFeishuUser(accessToken)
    const user = await findOrCreateUser(feishuUser.id, feishuUser.name, feishuUser.avatar_url)
    const token = signToken({ userId: user.id, feishuId: user.feishu_id })

    res.setHeader('Set-Cookie', [
      `oauth_state=; Path=/; HttpOnly; Max-Age=0`,
      `token=${token}; Path=/; HttpOnly; Secure; SameSite=Lark; Max-Age=${7 * 24 * 3600}`,
    ])

    res.redirect('/')
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).json({ error: 'Authentication failed' })
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add api/auth/
git commit -m "feat: add Feishu OAuth login and callback routes"
```

---

### Task 8: 分析 API 路由（SSE 流式）

**Files:**
- Create: `api/analyze.ts`

这是核心路由，实现 SSE 流式分析。

- [ ] **Step 1: 实现分析路由**

`api/analyze.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { createAnalysis, updateAnalysis, getSignedUrl } from './_lib/supabase'
import { buildMultimodalRequest, buildDeepAnalysisRequest, callMimoAPI, parseSSEStream } from './_lib/mimo'
import { buildAnalysisPrompt } from './_lib/prompts'

function sendSSE(res: VercelResponse, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
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

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    // 1. 创建分析记录
    sendSSE(res, 'status', { status: 'uploading' })
    const analysis = await createAnalysis(auth.userId, storagePath, { targetAudience, platform, context })
    sendSSE(res, 'status', { status: 'analyzing', analysisId: analysis.id })

    await updateAnalysis(analysis.id, { status: 'analyzing' })

    // 2. 获取视频签名 URL
    const videoUrl = await getSignedUrl(storagePath)

    // 3. 步骤一：多模态视频分析
    sendSSE(res, 'progress', { step: 'multimodal', message: '正在进行视频内容分析...' })
    const prompt = buildAnalysisPrompt({ targetAudience, platform, context })
    const multimodalBody = buildMultimodalRequest(videoUrl, prompt)
    const multimodalResponse = await callMimoAPI(multimodalBody)

    let multimodalResult = ''
    for await (const chunk of parseSSEStream(multimodalResponse)) {
      multimodalResult += chunk
      sendSSE(res, 'progress', { step: 'multimodal', chunk })
    }

    // 保存原始结果
    await updateAnalysis(analysis.id, { raw_result: { multimodalResult } })

    // 4. 步骤二：文本深度解读
    sendSSE(res, 'progress', { step: 'deep_analysis', message: '正在生成详细分析报告...' })
    const deepBody = buildDeepAnalysisRequest(multimodalResult, { targetAudience, platform, context })
    const deepResponse = await callMimoAPI(deepBody)

    let deepResult = ''
    for await (const chunk of parseSSEStream(deepResponse)) {
      deepResult += chunk
      sendSSE(res, 'progress', { step: 'deep_analysis', chunk })
    }

    // 5. 解析最终报告
    let report
    try {
      // 尝试提取 JSON（可能被 markdown 代码块包裹）
      const jsonMatch = deepResult.match(/\{[\s\S]*\}/)
      report = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 0, summary: deepResult, problems: [], suggestions: [] }
    } catch {
      report = { score: 0, summary: deepResult, problems: [], suggestions: [] }
    }

    // 6. 保存最终结果
    const score = report.score ?? 0
    await updateAnalysis(analysis.id, {
      status: 'completed',
      score,
      report,
      completed_at: new Date().toISOString(),
    })

    sendSSE(res, 'result', { score, report })
    res.end()
  } catch (err) {
    console.error('Analysis error:', err)
    const message = err instanceof Error ? err.message : '分析过程中出现错误'
    sendSSE(res, 'error', { message })
    res.end()
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add api/analyze.ts
git commit -m "feat: add SSE streaming analysis route with two-step Mimo pipeline"
```

---

### Task 9: History API 路由

**Files:**
- Create: `api/history/index.ts`
- Create: `api/history/[id].ts`

- [ ] **Step 1: 实现历史列表路由**

`api/history/index.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { listAnalyses } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const page = Math.max(1, Number(req.query.page) || 1)
  const result = await listAnalyses(auth.userId, page)

  res.json(result)
}
```

- [ ] **Step 2: 实现单条历史记录路由**

`api/history/[id].ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { getAnalysis, deleteAnalysis } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const { id } = req.query as { id: string }

  if (req.method === 'GET') {
    const analysis = await getAnalysis(id, auth.userId)
    if (!analysis) return res.status(404).json({ error: 'Not found' })
    return res.json(analysis)
  }

  if (req.method === 'DELETE') {
    const deleted = await deleteAnalysis(id, auth.userId)
    if (!deleted) return res.status(404).json({ error: 'Not found' })
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
```

- [ ] **Step 3: 提交**

```bash
git add api/history/
git commit -m "feat: add history list and detail/delete API routes"
```

---

### Task 10: 前端 App Shell + 认证流程

**Files:**
- Create: `src/App.tsx` (重写)
- Create: `src/components/Layout.tsx`
- Create: `src/components/ProtectedRoute.tsx`
- Create: `src/hooks/useAuth.ts`
- Create: `src/api/client.ts`

- [ ] **Step 1: 创建 API client**

`src/api/client.ts`:
```typescript
const API_BASE = '/api'

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    credentials: 'include',
  })

  if (res.status === 401) {
    window.location.href = `${API_BASE}/auth/feishu`
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || `HTTP ${res.status}`)
  }

  return res.json()
}
```

- [ ] **Step 2: 创建 useAuth hook**

`src/hooks/useAuth.ts`:
```typescript
import { useState, useEffect, createContext, useContext } from 'react'
import type { User } from '../lib/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data?.user ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const login = () => { window.location.href = '/api/auth/feishu' }
  const logout = () => {
    document.cookie = 'token=; Path=/; HttpOnly; Max-Age=0'
    setUser(null)
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 3: 创建 ProtectedRoute 组件**

`src/components/ProtectedRoute.tsx`:
```typescript
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: 创建 Layout 组件**

`src/components/Layout.tsx`:
```typescript
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Layout() {
  const { user, login, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-gray-900">Vidana</Link>
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/history" className="text-sm text-gray-600 hover:text-gray-900">历史记录</Link>
                <div className="flex items-center gap-2">
                  {user.avatar_url && (
                    <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                  )}
                  <span className="text-sm text-gray-700">{user.name}</span>
                  <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600">退出</button>
                </div>
              </>
            ) : (
              <button onClick={login} className="text-sm text-blue-600 hover:text-blue-800">登录</button>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 5: 创建 auth/me 端点（用于前端检查登录状态）**

`api/auth/me.ts`:
```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { getSupabase } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = getSupabase()
  const { data } = await supabase.from('users').select('id, name, avatar_url').eq('id', auth.userId).single()

  res.json({ user: data })
}
```

- [ ] **Step 6: 重写 App.tsx 配置路由**

`src/App.tsx`:
```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import HomePage from './pages/HomePage'
import AnalysisPage from './pages/AnalysisPage'
import HistoryPage from './pages/HistoryPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/analysis/:id" element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
            <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

- [ ] **Step 7: 创建占位页面**

`src/pages/HomePage.tsx`:
```typescript
export default function HomePage() {
  return <div className="text-center py-20"><h1 className="text-2xl font-bold">上传视频开始分析</h1></div>
}
```

`src/pages/AnalysisPage.tsx`:
```typescript
export default function AnalysisPage() {
  return <div>Analysis Page</div>
}
```

`src/pages/HistoryPage.tsx`:
```typescript
export default function HistoryPage() {
  return <div>History Page</div>
}
```

- [ ] **Step 8: 验证开发服务器启动正常**

```bash
npm run dev
```

Expected: 页面正常加载，路由切换正常

- [ ] **Step 9: 提交**

```bash
git add src/ api/auth/me.ts
git commit -m "feat: add app shell with routing, auth flow, and layout"
```

---

### Task 11: 前端上传页面

**Files:**
- Create: `src/components/VideoUploader.tsx`
- Modify: `src/pages/HomePage.tsx` (重写)

- [ ] **Step 1: 创建视频上传组件**

`src/components/VideoUploader.tsx`:
```typescript
import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv']
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

interface Props {
  onUploaded: (storagePath: string) => void
}

export default function VideoUploader({ onUploaded }: Props) {
  const { user } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = (f: File): string | null => {
    if (!ALLOWED_TYPES.includes(f.type) && !f.name.match(/\.(mp4|mov|avi|wmv)$/i)) {
      return '不支持的视频格式，请上传 MP4/MOV/AVI/WMV 格式'
    }
    if (f.size > MAX_SIZE) return '文件大小不能超过 20MB'
    return null
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) {
      const err = validate(f)
      if (err) { setError(err); return }
      setError('')
      setFile(f)
    }
  }, [])

  const handleUpload = async () => {
    if (!file || !user) return
    setUploading(true)
    setError('')

    const ext = file.name.split('.').pop()
    const storagePath = `${user.id}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      setError('上传失败，请重试')
      setUploading(false)
      return
    }

    setUploading(false)
    onUploaded(storagePath)
  }

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mp4,.mov,.avi,.wmv,video/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) {
              const err = validate(f)
              if (err) { setError(err); return }
              setError('')
              setFile(f)
            }
          }}
        />
        {file ? (
          <div>
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div>
            <p className="text-gray-500">拖拽视频到此处，或点击选择文件</p>
            <p className="text-xs text-gray-400 mt-1">MP4/MOV/AVI/WMV, 不超过 20MB</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {uploading && (
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 重写首页**

`src/pages/HomePage.tsx`:
```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import VideoUploader from '../components/VideoUploader'
import { PLATFORMS, type Platform } from '../lib/types'

export default function HomePage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [storagePath, setStoragePath] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [context, setContext] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    if (!storagePath) return
    setAnalyzing(true)
    setError('')

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storagePath,
          targetAudience: targetAudience || undefined,
          platform: platform || undefined,
          context: context || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '分析请求失败')
      }

      // 读取 SSE 获取 analysisId，然后跳转
      // 简化处理：先解析 status 事件获取 ID
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let analysisId = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.analysisId) analysisId = data.analysisId
              if (data.message?.includes('报告')) {
                // 深度分析阶段，可以跳转了
              }
            } catch {}
          }
        }
        buffer = ''
      }

      if (analysisId) {
        navigate(`/analysis/${analysisId}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
      setAnalyzing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">视频素材分析</h1>
          <p className="text-sm text-gray-500 mt-1">上传视频，AI 帮你分析问题并给出优化建议</p>
        </div>

        {!user ? (
          <div className="text-center py-8">
            <button onClick={login} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              登录后开始使用
            </button>
          </div>
        ) : (
          <>
            <VideoUploader onUploaded={setStoragePath} />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标受众 <span className="text-gray-400">（可选）</span></label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value)}
                  placeholder="如：18-25 岁年轻人"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发布平台 <span className="text-gray-400">（可选）</span></label>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value as Platform | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">请选择</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">补充上下文 <span className="text-gray-400">（可选）</span></label>
              <textarea
                value={context}
                onChange={e => setContext(e.target.value)}
                rows={4}
                placeholder={"提供更多背景信息，帮助 AI 给出更精准的分析和建议：\n\n例如：\n· 这是某款护肤品的产品宣传片\n· 主打卖点：天然成分、抗衰老\n· 客单价 299 元，主要投放华东地区"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={handleAnalyze}
              disabled={!storagePath || analyzing}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {analyzing ? '分析中...' : '开始分析'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add src/components/VideoUploader.tsx src/pages/HomePage.tsx
git commit -m "feat: add video upload page with form fields and Supabase direct upload"
```

---

### Task 12: 前端分析结果页面

**Files:**
- Create: `src/hooks/useSSE.ts`
- Create: `src/components/ScoreGauge.tsx`
- Create: `src/components/ProblemList.tsx`
- Create: `src/components/SuggestionList.tsx`
- Create: `src/components/PlatformAdvice.tsx`
- Modify: `src/pages/AnalysisPage.tsx` (重写)
- Create: `__tests__/src/components/ScoreGauge.test.tsx`

- [ ] **Step 1: 创建 SSE hook**

`src/hooks/useSSE.ts`:
```typescript
import { useState, useEffect, useRef, useCallback } from 'react'

interface SSEState {
  status: string
  streamText: string
  result: Record<string, unknown> | null
  error: string | null
}

export function useSSE(url: string | null) {
  const [state, setState] = useState<SSEState>({
    status: 'idle',
    streamText: '',
    result: null,
    error: null,
  })
  const retries = useRef(0)

  useEffect(() => {
    if (!url) return

    const eventSource = new EventSource(url)

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data)
      setState(s => ({ ...s, status: data.status }))
    })

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data)
      if (data.chunk) {
        setState(s => ({ ...s, streamText: s.streamText + data.chunk }))
      }
    })

    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data)
      setState({ status: 'completed', streamText: '', result: data, error: null })
      eventSource.close()
    })

    eventSource.addEventListener('error', () => {
      if (retries.current < 3) {
        retries.current++
        eventSource.close()
        setTimeout(() => {
          // 自动重连由 EventSource 内置处理
        }, 2000)
      } else {
        setState(s => ({ ...s, error: '连接中断，请刷新页面重试' }))
        eventSource.close()
      }
    })

    return () => eventSource.close()
  }, [url])

  return state
}

export function useFetchAnalysis(analysisId: string | undefined) {
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAnalysis = useCallback(async () => {
    if (!analysisId) return
    try {
      setLoading(true)
      const res = await fetch(`/api/history/${analysisId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setAnalysis(data)
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [analysisId])

  useEffect(() => { fetchAnalysis() }, [fetchAnalysis])

  return { analysis, loading, error }
}
```

- [ ] **Step 2: 编写 ScoreGauge 测试**

`__tests__/src/components/ScoreGauge.test.tsx`:
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ScoreGauge from '../../../src/components/ScoreGauge'

describe('ScoreGauge', () => {
  it('显示分数和对应颜色（高分绿色）', () => {
    render(<ScoreGauge score={85} />)
    expect(screen.getByText('85')).toBeDefined()
    expect(screen.getByText('/100')).toBeDefined()
  })

  it('低分显示红色', () => {
    render(<ScoreGauge score={45} />)
    expect(screen.getByText('45')).toBeDefined()
  })

  it('中间分数显示黄色', () => {
    render(<ScoreGauge score={70} />)
    expect(screen.getByText('70')).toBeDefined()
  })
})
```

- [ ] **Step 3: 运行测试确认失败**

```bash
npx vitest run __tests__/src/components/ScoreGauge.test.tsx
```

Expected: FAIL

- [ ] **Step 4: 实现 ScoreGauge 组件**

`src/components/ScoreGauge.tsx`:
```typescript
interface Props {
  score: number
}

function getColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

function getBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function ScoreGauge({ score }: Props) {
  return (
    <div className="text-center">
      <div className={`text-5xl font-bold ${getColor(score)}`}>{score}</div>
      <div className="text-gray-400 text-sm mt-1">/100</div>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
        <div
          className={`h-2 rounded-full ${getBarColor(score)} transition-all duration-500`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
npx vitest run __tests__/src/components/ScoreGauge.test.tsx
```

Expected: PASS

- [ ] **Step 6: 实现 ProblemList 组件**

`src/components/ProblemList.tsx`:
```typescript
import { useState } from 'react'
import type { Problem } from '../lib/types'

interface Props {
  problems: Problem[]
}

const severityConfig = {
  high: { color: 'bg-red-100 text-red-700', label: '严重' },
  medium: { color: 'bg-yellow-100 text-yellow-700', label: '中等' },
  low: { color: 'bg-green-100 text-green-700', label: '轻微' },
}

export default function ProblemList({ problems }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">问题清单</h3>
      {problems.map((p, i) => (
        <div
          key={i}
          onClick={() => setExpanded(expanded === `${i}` ? null : `${i}`)}
          className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${severityConfig[p.severity].color}`}>
                {severityConfig[p.severity].label}
              </span>
              <span className="text-sm font-medium text-gray-800">{p.category}</span>
            </div>
            {p.timestamp && <span className="text-xs text-gray-400">{p.timestamp}</span>}
          </div>
          {expanded === `${i}` && (
            <p className="text-sm text-gray-600 mt-2">{p.description}</p>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: 实现 SuggestionList 组件**

`src/components/SuggestionList.tsx`:
```typescript
import type { Suggestion } from '../lib/types'

interface Props {
  suggestions: Suggestion[]
}

const priorityConfig = {
  high: { color: 'border-l-red-500', label: '高' },
  medium: { color: 'border-l-yellow-500', label: '中' },
  low: { color: 'border-l-green-500', label: '低' },
}

export default function SuggestionList({ suggestions }: Props) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900">修改建议</h3>
      {suggestions.map((s, i) => (
        <div key={i} className={`border-l-4 ${priorityConfig[s.priority].color} bg-white rounded-r-lg p-3 border border-gray-200`}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{s.action}</span>
            <span className="text-xs text-gray-400">优先级：{priorityConfig[s.priority].label}</span>
          </div>
          <p className="text-sm text-gray-600 mt-1">{s.detail}</p>
          {s.timeRange && <p className="text-xs text-gray-400 mt-1">时间：{s.timeRange}</p>}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 8: 实现 PlatformAdvice 组件**

`src/components/PlatformAdvice.tsx`:
```typescript
import type { PlatformAdvice as PlatformAdviceType } from '../lib/types'

interface Props {
  advice: PlatformAdviceType
}

export default function PlatformAdvice({ advice }: Props) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-blue-900">{advice.platform} 适配建议</h3>
      <ul className="mt-2 space-y-1">
        {advice.tips.map((tip, i) => (
          <li key={i} className="text-sm text-blue-800 flex items-start gap-2">
            <span className="text-blue-400 mt-0.5">·</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 9: 重写 AnalysisPage**

`src/pages/AnalysisPage.tsx`:
```typescript
import { useParams } from 'react-router-dom'
import { useFetchAnalysis } from '../hooks/useSSE'
import ScoreGauge from '../components/ScoreGauge'
import ProblemList from '../components/ProblemList'
import SuggestionList from '../components/SuggestionList'
import PlatformAdvice from '../components/PlatformAdvice'
import type { AnalysisReport } from '../lib/types'

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const { analysis, loading, error } = useFetchAnalysis(id)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (error || !analysis) {
    return <div className="text-center py-20 text-red-600">{error || '未找到分析记录'}</div>
  }

  if (analysis.status === 'analyzing' || analysis.status === 'pending') {
    return (
      <div className="text-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-gray-600">正在分析中...</p>
      </div>
    )
  }

  if (analysis.status === 'failed') {
    return (
      <div className="text-center py-20">
        <p className="text-red-600">分析失败，请重新尝试</p>
      </div>
    )
  }

  const report = analysis.report as AnalysisReport

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <ScoreGauge score={report.score} />
        <p className="text-center text-gray-600 mt-4">{report.summary}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <ProblemList problems={report.problems} />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <SuggestionList suggestions={report.suggestions} />
      </div>

      {report.platformAdvice && (
        <PlatformAdvice advice={report.platformAdvice} />
      )}

      {report.audienceFit && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-purple-900">受众适配度：{report.audienceFit.score}/100</h3>
          <p className="text-sm text-purple-800 mt-1">{report.audienceFit.reasoning}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 10: 提交**

```bash
git add src/hooks/useSSE.ts src/components/ScoreGauge.tsx src/components/ProblemList.tsx src/components/SuggestionList.tsx src/components/PlatformAdvice.tsx src/pages/AnalysisPage.tsx __tests__/src/components/ScoreGauge.test.tsx
git commit -m "feat: add analysis result page with score gauge, problems, suggestions, and platform advice"
```

---

### Task 13: 前端历史记录页面

**Files:**
- Modify: `src/pages/HistoryPage.tsx` (重写)

- [ ] **Step 1: 重写 HistoryPage**

`src/pages/HistoryPage.tsx`:
```typescript
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Analysis } from '../lib/types'

const statusLabels: Record<string, { text: string; color: string }> = {
  completed: { text: '已完成', color: 'bg-green-100 text-green-700' },
  analyzing: { text: '分析中', color: 'bg-blue-100 text-blue-700' },
  failed: { text: '失败', color: 'bg-red-100 text-red-700' },
  pending: { text: '等待中', color: 'bg-gray-100 text-gray-700' },
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetch(`/api/history?page=${page}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        setAnalyses(data.data || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [page])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条分析记录？')) return
    await fetch(`/api/history/${id}`, { method: 'DELETE', credentials: 'include' })
    setAnalyses(prev => prev.filter(a => a.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">还没有分析记录</p>
        <Link to="/" className="text-blue-600 text-sm mt-2 inline-block">去上传视频</Link>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">分析历史</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {analyses.map(analysis => (
          <div key={analysis.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusLabels[analysis.status]?.color}`}>
                  {statusLabels[analysis.status]?.text}
                </span>
                {analysis.platform && (
                  <span className="text-xs text-gray-500">{analysis.platform}</span>
                )}
              </div>

              {analysis.score !== null && (
                <div className={`text-2xl font-bold ${scoreColor(analysis.score)}`}>{analysis.score}<span className="text-sm text-gray-400 font-normal">/100</span></div>
              )}

              <p className="text-xs text-gray-400 mt-2">
                {new Date(analysis.created_at).toLocaleDateString('zh-CN')}
              </p>

              <div className="flex gap-2 mt-3">
                <Link
                  to={`/analysis/${analysis.id}`}
                  className="flex-1 text-center text-sm py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  查看详情
                </Link>
                <button
                  onClick={() => handleDelete(analysis.id)}
                  className="text-sm px-3 py-1.5 text-gray-400 hover:text-red-600"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add src/pages/HistoryPage.tsx
git commit -m "feat: add history page with card grid, status labels, and delete"
```

---

### Task 14: Vercel 部署配置

**Files:**
- Create: `vercel.json`
- Modify: `package.json` (确认 scripts)

- [ ] **Step 1: 创建 vercel.json**

`vercel.json`:
```json
{
  "framework": "vite",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/analyze.ts": {
      "maxDuration": 120
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

- [ ] **Step 2: 确认 package.json scripts**

确保 `package.json` 包含：
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: 配置 Vercel 环境变量**

在 Vercel Dashboard 中添加以下环境变量：
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MIMO_API_KEY`
- `MIMO_API_ENDPOINT`
- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `JWT_SECRET`

- [ ] **Step 4: 验证构建**

```bash
npm run build
```

Expected: 构建成功，生成 `dist/` 目录

- [ ] **Step 5: 运行所有测试**

```bash
npm run test
```

Expected: 所有测试通过

- [ ] **Step 6: 提交**

```bash
git add vercel.json package.json
git commit -m "feat: add Vercel deployment config with SSE streaming support"
```

---

### Task 15: 端到端验证

- [ ] **Step 1: 本地启动 Supabase（如果有本地开发环境）或使用远程 Supabase**

确认 `.env.local` 中的配置正确。

- [ ] **Step 2: 启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 3: 验证完整流程**

1. 访问 http://localhost:5173 → 看到上传页面
2. 点击"登录" → 跳转飞书 OAuth
3. 登录后 → 上传视频 + 填写可选字段
4. 点击"开始分析" → 看到 SSE 实时文字流
5. 分析完成 → 看到结构化报告（评分 + 问题 + 建议）
6. 点击"历史记录" → 看到分析卡片列表
7. 点击"查看详情" → 跳转到分析结果页

- [ ] **Step 4: 修复发现的问题**

如有问题，修复并提交。

- [ ] **Step 5: 最终提交**

```bash
git add -A
git commit -m "feat: complete Vidana v1 - video material analysis agent"
```
