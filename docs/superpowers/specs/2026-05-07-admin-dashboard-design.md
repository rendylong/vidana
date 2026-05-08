# Ovidly 管理后台设计

## Summary

Ovidly 需要一个轻量独立管理后台，用于查看运营指标、管理用户额度、查看用户分析记录。第一版后台不复用飞书登录，而是通过单个服务器环境变量 `ADMIN_PASSWORD` 登录，签发独立的 HttpOnly admin cookie。

第一版目标是快速上线可用的运营工具，同时让数据模型可以平滑升级到多管理员、审计日志和更完整的计费体系。

## Goals

- 提供 dashboard，查看新增用户、总用户、分析数量、消耗 token、成功次数、失败次数等今日、7 日、30 日指标。
- 每个 dashboard 指标展示当前范围绝对值，并展示相对上一等长周期的趋势。
- 提供用户管理列表，查看用户基础信息、剩余额度、分析统计和最近分析时间。
- 支持给用户增加或减少可用分析次数，并记录额度流水。
- 支持查看用户分析记录和单条分析详情，包括摘要、状态、平台、类型、分数、token、错误信息和报告 JSON。
- 新用户默认获得 10 次分析额度。
- 分析成功完成后扣 1 次额度，失败不扣。
- 额度为 0 时阻止 Web 分析、视频对标和 public API/CLI 分析。

## Non-Goals

- 第一版不支持多个后台管理员账号。
- 第一版不在后台删除或重跑分析记录。
- 第一版不做订单、支付或套餐系统。
- 第一版不做复杂权限分级。
- 第一版不估算 token；只有模型返回 usage/token 时记录真实值，否则记 0。

## Information Architecture

### `/admin/login`

- 独立后台登录页。
- 页面只有一个密码输入框和登录按钮。
- 调用 `POST /api/admin/login`。
- 登录成功后跳转 `/admin`。
- 登录失败显示统一文案：`密码错误`。

### `/admin`

后台 dashboard 首页。

顶部提供范围切换：

- 今日
- 7 日
- 30 日

核心指标：

- 新增用户
- 总用户
- 分析数量
- 成功次数
- 失败次数
- 消耗 token

每个指标返回：

- `value`：当前范围绝对值。
- `previousValue`：上一等长周期值。
- `trendPercent`：相对上一周期变化百分比。

总用户是截至当前范围结束时间的累计用户数。它也展示趋势，对比上一周期结束时间的累计用户数。

下方显示：

- 最近分析列表。
- 失败分析摘要，用于快速发现 Mimo、上传、额度或 pipeline 问题。

### `/admin/users`

用户列表页。

展示字段：

- 头像和名称
- 注册时间
- 剩余额度
- 总分析数
- 成功分析数
- 失败分析数
- 最近分析时间

支持：

- 按用户名搜索。
- 分页。
- 点击进入用户详情。

### `/admin/users/:id`

用户详情页。

包含：

- 用户基础信息。
- 剩余额度。
- 额度调整入口。
- 额度流水。
- 该用户分析记录列表。

额度调整：

- 输入 `delta`，可正可负。
- 输入必填 `reason`。
- 不允许调整后余额小于 0。
- 成功后写入额度流水并刷新余额。

分析记录：

- 列表查看用户的投放分析和视频对标记录。
- 可点开单条分析详情。
- 第一版只查看，不删除、不重跑。

### `/admin/analyses/:id`

单条分析详情页。用户详情页中的分析记录点击后跳转到该页面。

展示：

- 用户
- 分析类型：投放分析或视频对标
- 状态
- 平台
- 分数
- token usage
- 创建时间和完成时间
- 错误信息
- 报告摘要
- 完整 report JSON

## Data Model

新增一个 Supabase migration。

### `users.analysis_credits`

给 `users` 表新增字段：

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS analysis_credits integer NOT NULL DEFAULT 10;
```

含义：

- 用户当前可用分析次数。
- 新用户默认 10 次。
- 后台额度调整直接更新该字段。
- 成功分析扣减该字段。

### `credit_transactions`

新增额度流水表：

```sql
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
```

流水来源：

- `initial_grant`：新用户默认额度，`delta = 10`。
- `admin_adjustment`：后台人工调整。
- `analysis_success`：分析成功扣费，`delta = -1`。

新用户插入后需要写一条 `initial_grant` 流水。

### `analyses` usage 字段

给 `analyses` 表新增字段：

```sql
ALTER TABLE analyses
ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tokens integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS credit_charged_at timestamptz;
```

含义：

- `input_tokens`：模型返回的输入 token。没有真实 usage 时为 0。
- `output_tokens`：模型返回的输出 token。没有真实 usage 时为 0。
- `total_tokens`：模型返回的总 token。没有真实 usage 时为 0。
- `error_message`：分析失败时记录后台可读错误原因。
- `credit_charged_at`：成功扣费时间，用于防止重复扣费。

## Credit Rules

### 新用户初始额度

`findOrCreateUser` 创建新用户时：

1. 插入 `users`，`analysis_credits` 默认为 10。
2. 插入 `credit_transactions`：
   - `delta = 10`
   - `source = initial_grant`
   - `reason = 新用户初始额度`

### 发起分析前检查额度

Web 投放分析、Web 视频对标、public API/CLI 都使用同一套额度检查。

规则：

- 如果 `analysis_credits <= 0`，接口返回额度不足错误，不创建分析任务。
- 如果 `analysis_credits > 0`，允许创建任务。

### 成功完成后扣费

只在分析状态从非 `completed` 变为 `completed` 时扣 1 次。

扣费过程：

1. 检查 `analyses.credit_charged_at IS NULL`。
2. 检查用户当前 `analysis_credits > 0`。
3. `users.analysis_credits -= 1`。
4. 插入 `credit_transactions`：
   - `delta = -1`
   - `source = analysis_success`
   - `analysis_id = 当前分析 id`
   - `reason = 分析成功扣减`
5. 写入 `analyses.credit_charged_at = now()`。

如果完成结果被重复保存，因为 `credit_charged_at` 已存在，不再重复扣费。

### 失败不扣费

分析失败时：

- 设置 `status = failed`。
- 写入 `error_message`。
- 不扣减 `analysis_credits`。
- 不写 `analysis_success` 流水。

## API Design

所有 `/api/admin/*` 除 login 外都必须校验 admin cookie。

### `POST /api/admin/login`

Request:

```json
{ "password": "..." }
```

Behavior:

- 校验 `process.env.ADMIN_PASSWORD`。
- 成功后签发 `admin_token` HttpOnly cookie。
- 失败返回 `401` 和统一错误。

### `POST /api/admin/logout`

清除 `admin_token` cookie。

### `GET /api/admin/me`

返回后台登录状态：

```json
{ "authenticated": true }
```

未登录返回 `401`。

### `GET /api/admin/dashboard?range=today|7d|30d`

返回：

```ts
interface AdminDashboardResponse {
  range: 'today' | '7d' | '30d'
  metrics: Array<{
    key: 'new_users' | 'total_users' | 'analyses' | 'successes' | 'failures' | 'tokens'
    label: string
    value: number
    previousValue: number
    trendPercent: number | null
  }>
  recentAnalyses: AdminAnalysisSummary[]
  recentFailures: AdminAnalysisSummary[]
}
```

趋势计算：

- `today`：当前自然日对比前一自然日。
- `7d`：最近 7 天对比前 7 天。
- `30d`：最近 30 天对比前 30 天。

### `GET /api/admin/users?page=&q=`

返回分页用户列表：

```ts
interface AdminUserListItem {
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

### `GET /api/admin/users/:id`

返回用户详情：

```ts
interface AdminUserDetail {
  user: AdminUserListItem
  creditTransactions: CreditTransaction[]
  analyses: AdminAnalysisSummary[]
  pagination: {
    page: number
    pageSize: number
    total: number
  }
}
```

用户详情接口支持 `page` 和 `pageSize` 查询参数，用于分页返回该用户的分析记录。额度流水第一版返回最近 50 条。

### `POST /api/admin/users/:id/credits`

Request:

```json
{
  "delta": 5,
  "reason": "人工补偿"
}
```

Rules:

- `delta` 不能为 0。
- `reason` 必填。
- 调整后余额不能小于 0。

成功后：

- 更新 `users.analysis_credits`。
- 插入 `credit_transactions`，`source = admin_adjustment`。
- 返回最新余额和流水。

### `GET /api/admin/analyses/:id`

返回单条分析完整详情，包括 report JSON 和 raw_result 摘要。

## Code Boundaries

新增后端模块：

- `api/_lib/adminAuth.ts`
  - admin cookie 签发。
  - admin cookie 校验。
  - admin cookie 清除。

- `api/_lib/adminData.ts`
  - dashboard 聚合。
  - 用户列表聚合。
  - 用户详情查询。
  - 分析详情查询。
  - 后台额度调整。

- `api/_lib/credits.ts`
  - 发起前额度检查。
  - 新用户初始额度流水。
  - 分析成功扣费。
  - 防重复扣费。

新增 API routes：

- `api/admin/login.ts`
- `api/admin/logout.ts`
- `api/admin/me.ts`
- `api/admin/dashboard.ts`
- `api/admin/users/index.ts`
- `api/admin/users/[id].ts`
- `api/admin/users/[id]/credits.ts`
- `api/admin/analyses/[id].ts`

生产 Express server 需要映射这些 `/api/admin/*` 路由。

前端新增：

- `src/api/adminClient.ts`
- `src/pages/AdminLoginPage.tsx`
- `src/pages/AdminDashboardPage.tsx`
- `src/pages/AdminUsersPage.tsx`
- `src/pages/AdminUserDetailPage.tsx`
- `src/pages/AdminAnalysisDetailPage.tsx`
- `src/components/AdminLayout.tsx`

后台页面使用独立布局，不显示主产品导航。

## Error Handling

- 后台密码错误统一返回和展示 `密码错误`。
- `ADMIN_PASSWORD` 未配置时，login API 返回 500，并在 server log 记录明确配置错误。
- dashboard 聚合失败时，页面显示 `后台数据加载失败`。
- 额度调整失败要区分：
  - 用户不存在。
  - 调整后余额不能小于 0。
  - 备注不能为空。
  - 数据库错误。
- 分析失败时写入 `analyses.error_message`。后台显示内部原因，前台继续使用现有友好错误。

## Security

- `ADMIN_PASSWORD` 只存在服务器环境变量，不使用 `VITE_` 前缀。
- `admin_token` 使用 `JWT_SECRET` 签名。
- `admin_token` 设置为 HttpOnly、Path `/`、SameSite=Lax。
- 当前公网 HTTP 阶段不加 `Secure`，未来启用 HTTPS 后自动加 `Secure`。
- 所有 admin API 都使用 service-role 查询，但必须先通过 admin cookie 校验。
- 后台不显示 Supabase service key、Mimo key、完整 API Key。
- 后台额度调整必须写流水，备注必填。

## Testing

自动化测试：

- admin cookie 签发和校验。
- dashboard range 窗口和趋势计算。
- 新用户默认 10 次额度和初始流水。
- 成功分析只扣 1 次。
- 重复 completed 不重复扣费。
- 失败分析不扣额度，并写入 `error_message`。
- 余额不足阻止 Web 分析、视频对标和 public API/CLI。
- 后台额度调整不能让余额小于 0。

构建验证：

```bash
npm test
npm run lint
npm run build
```

手动验证：

- 访问 `/admin/login`，输入后台密码登录。
- 切换 dashboard 今日、7 日、30 日。
- 用户列表搜索和分页。
- 给用户增加额度。
- 给用户减少额度，确认不能减为负数。
- 查看用户分析记录和单条报告 JSON。
- 把测试用户额度调为 0，确认 Web 分析、视频对标和 CLI/public API 都无法新建分析。

## Deployment Notes

生产环境需要新增：

```bash
ADMIN_PASSWORD=...
```

部署到腾讯云时保留现有 `.env.production`，补充该变量后重启 PM2。
