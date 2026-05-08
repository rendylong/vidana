# AGENTS.md

Vidana 是视频投放分析工具。主流程是上传视频、填写目标用户、选择投放平台、补充背景、点击分析，然后返回评分、摘要、时间线问题、全局建议和改法。不要把主界面改回聊天界面。

## Project Map

- `src/pages/AgentPage.tsx`: 主分析页，包含上传、表单、结果和历史侧边栏。
- `src/pages/CliPage.tsx`: CLI 介绍页。
- `src/pages/ApiKeysPage.tsx`: API Key 管理页，支持创建、查看元数据和删除。
- `src/components/Layout.tsx`: 全局布局和导航。
- `src/api/client.ts`: 前端请求封装。
- `api/analyze.ts`: Web 登录用户的分析接口。
- `api/public/analyze.ts`: CLI/agent 使用的公开分析接口。
- `api/upload.ts`: 视频上传接口，当前仍是活跃改动文件。
- `api/video.ts`: 视频访问/代理接口，当前仍是活跃改动文件。
- `api/auth/*`: 飞书 OAuth 登录。
- `api/api-keys/*`: API Key CRUD。
- `api/history/*`: 分析历史。
- `api/_lib/analysisPipeline.ts`: Mimo 分析主流程和视频源 fallback。
- `api/_lib/mimo.ts`: Mimo 请求和 SSE 解析。
- `api/_lib/prompts.ts`: 分析提示词。
- `api/_lib/supabase.ts`: Supabase service-role 客户端和数据访问。
- `api/_lib/videoAccess.ts`: 视频代理 URL 工具，当前仍是活跃改动文件。
- `bin/vidana.mjs`: Node CLI。
- `skills/vidana-video-analysis/SKILL.md`: 给其他 agent 使用的 Vidana skill。
- `supabase/migrations/001_init.sql`: `users`、`analyses`、私有 `videos` bucket。
- `supabase/migrations/002_api_keys.sql`: `api_keys` 表。

## Current State

- 前端已从对话式重构为上传分析式体验。
- 历史侧边栏默认收起，可点击展开。
- 多余标题卡片已移除。
- 已支持飞书登录、分析历史、API Key 创建/列表/删除。
- 已支持 CLI 和 agent 集成：`vidana analyze` 调用 `POST /api/public/analyze`。
- 最近新增 `npm run dev:full`，用于本地完整 Vercel API 调试。

当前工作区可能已有用户或前序 agent 的未提交改动。接手前运行：

```bash
git status --short --branch
```

不要回滚不属于本任务的脏文件。写本文档时已存在这些改动：`.gitignore`、`api/_lib/mimo.ts`、`api/_lib/prompts.ts`、`vercel.json`，以及未跟踪的 `.codex/`、`.env.vercel`、`api/_lib/videoAccess.ts`、`api/upload.ts`、`api/video.ts`、`supabase/.temp/`。

## Dev Environment

安装依赖：

```bash
npm install
```

仅前端开发：

```bash
npm run dev
```

这通常运行在 `http://localhost:5173`。只适合纯前端，不支持 Vercel API routes。

完整本地开发：

```bash
npm run dev:full
```

这会加载 `.env.local` 并运行 `vercel dev --listen 5174`。登录、上传、API Key、分析都应在 `http://localhost:5174/` 测试。

排队分析还需要 Redis 和 worker：

```bash
npm run worker:analysis
```

本地或同一台 CVM 自建 Redis 时，通常使用 `REDIS_URL=redis://127.0.0.1:6379`。先启动 Redis，再分别运行 `npm run dev:full` 和 `npm run worker:analysis`。

不要把 `dev` 脚本改成 `vercel dev`，Vercel 会递归调用项目 dev 脚本。完整模式保持使用 `dev:full`。

## Required Env

`.env.local` 至少需要：

```bash
VITE_APP_URL=http://localhost:5174
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
FEISHU_APP_ID=...
FEISHU_APP_SECRET=...
MIMO_API_KEY=...
```

可选：

```bash
MIMO_API_ENDPOINT=https://token-plan-cn.xiaomimimo.com/v1
VIDANA_PUBLIC_ORIGIN=...
VIDANA_API_BASE_URL=...
VIDANA_API_KEY=...
REDIS_URL=redis://127.0.0.1:6379
ANALYSIS_QUEUE_STREAM=vidana:analysis:queue
ANALYSIS_QUEUE_DELAYED=vidana:analysis:delayed
ANALYSIS_QUEUE_GROUP=vidana-workers
ANALYSIS_ACTIVE_LIMIT_PER_USER=3
ANALYSIS_STALE_LOCK_MS=900000
```

`SUPABASE_SERVICE_ROLE_KEY` 必须是 `sb_secret_...` 或 legacy `service_role` JWT，不能是 anon/publishable key。用户曾在聊天里贴过 secret key，如仍在使用，应轮换。

## Testing

按改动范围选择验证命令：

```bash
npm test
npm run lint
npm run build
node ./bin/vidana.mjs --help
```

已知情况：`npm run lint` 之前通过，但 `src/hooks/useAuth.tsx` 可能有 Fast Refresh only-export-components warning。

前端行为验证优先用：

```bash
npm run dev:full
```

然后打开：

```text
http://localhost:5174/
http://localhost:5174/cli
http://localhost:5174/api-keys
```

## CLI

本地帮助：

```bash
node ./bin/vidana.mjs --help
```

本地服务调用示例：

```bash
export VIDANA_API_BASE_URL=http://localhost:5174
export VIDANA_API_KEY=vdn_...
node ./bin/vidana.mjs analyze ./sample.mp4 \
  --audience "二三线城市 30-50 岁男性" \
  --platform "抖音" \
  --context "新品首投，目标是提高表单转化"
```

CLI 返回 Markdown。API Key 只在创建时展示完整值，后续页面只能管理元数据和删除。

## Known Pitfalls

- `http://localhost:5173` 点击登录后空白，通常是因为只启动了 Vite。改用 `npm run dev:full` 和 `http://localhost:5174/`。
- `VITE_APP_URL` 必须匹配当前访问 origin，否则飞书 callback 会错。
- Vercel dev 没加载 `.env.local` 时，飞书登录可能出现 `app_id=undefined`。
- 本地 cookie 不能带 `Secure`；相关逻辑在 `api/_lib/cookies.ts`。
- API Key 表不存在时，先确认已运行 `supabase/migrations/002_api_keys.sql`。
- Supabase `videos` bucket 是私有的，不要为了让 Mimo 访问视频而改成 public。
- Mimo 对私有 URL、localhost URL 可能报 `failed to download url data`；保留 signed-url、proxy-url、data-url fallback。
- 前端提示“本次分析没有返回摘要”时，先查 server log、`raw_result` 和 pipeline errors，不要只改前端文案。
- `POST /api/public/analyze` 当前限制约 50MB 视频、60MB 请求。
- Redis 不可用时不要回退同步调用 Mimo，应让提交失败并暴露队列不可用。

## Roadmap

- 稳定本地、预览、生产环境的视频上传和视频访问。
- 完善 Mimo 空响应、URL 下载失败等错误展示。
- 继续打磨 `/api-keys` 和 `/cli` 页面。
- 为 analysis fallback 和 public API 参数校验补测试。
- 后续考虑分析进度流式展示、历史详情、CLI 发布、报告导出和团队账号。

## Coding Instructions

- 优先沿用现有 React/Vercel/Supabase 写法。
- UI 文案保持直接、实用、中文友好。
- 不记录完整 API Key、Supabase service key、飞书 secret。
- 修改已有脏文件前先读当前内容，并保护用户改动。
- 用 `rg` 搜索；手工编辑用 `apply_patch`。
- 完成前运行与改动相关的最小验证命令。
