# Vidana - 视频素材分析 Agent 设计文档

## 概述

Vidana 是一个基于多模态 AI 模型的视频素材分析 Web 应用。用户上传视频后，系统自动分析画面质量、构图、剪辑节奏、音频、叙事结构等维度，结合用户提供的上下文信息（目标受众、发布平台、商品/品牌背景），输出结构化的分析报告和修改建议。

## 技术栈

| 层级 | 选型 |
|------|------|
| 前端 | React + React Router v6 + Tailwind CSS |
| 后端 | Node.js (Vercel Serverless Functions) |
| AI 模型 | 小米 mimo-v2.5 (endpoint: `https://token-plan-cn.xiaomimimo.com/v1`) |
| 数据库 | Supabase PostgreSQL |
| 存储 | Supabase Storage (视频文件) |
| 认证 | 飞书 OAuth + JWT (HTTP-only Cookie) |
| 部署 | Vercel (Serverless) |

## 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    React 前端 (SPA)                       │
│  上传页面  |  分析结果页面 (SSE实时)  |  历史记录页面       │
└──────────────────────┬──────────────────────────────────┘
                       │ SSE / REST
┌──────────────────────▼──────────────────────────────────┐
│              Node.js 后端 (Vercel Serverless)             │
│  Auth 路由  |  Analyze 路由  |  History 路由              │
│                  Mimo API Client                         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                     Supabase                              │
│  Auth (飞书OAuth)  |  Database (用户/记录)  |  Storage     │
└─────────────────────────────────────────────────────────┘
```

## 核心流程

1. 用户通过飞书 OAuth 登录
2. 上传视频（≤20MB，MP4/MOV/AVI/WMV）+ 可选填：目标受众、发布平台、补充上下文
3. 视频存入 Supabase Storage
4. 后端生成 Storage 签名 URL，调用 mimo-v2.5 多模态视频分析（SSE 流式）
5. 初步分析结果传入 mimo-v2.5 文本模型做深度解读（SSE 流式）
6. 结构化报告存入 Supabase Database
7. 前端展示：评分 + 问题清单 + 修改建议 + 平台适配建议

## 数据库模型

### users 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (PK) | 主键 |
| feishu_id | text (unique) | 飞书用户 ID |
| name | text | 用户名 |
| avatar_url | text | 头像 URL |
| created_at | timestamptz | 创建时间 |

### analyses 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (PK) | 主键 |
| user_id | uuid (FK → users) | 所属用户 |
| video_url | text | Supabase Storage URL |
| video_duration | numeric | 视频时长（秒） |
| target_audience | text (nullable) | 目标受众 |
| platform | text (nullable) | 发布平台 |
| context | text (nullable) | 用户补充上下文 |
| status | text | pending / analyzing / completed / failed |
| score | integer | 总评分 0-100 |
| raw_result | jsonb | Mimo 原始返回 |
| report | jsonb | 结构化分析报告 |
| created_at | timestamptz | 创建时间 |
| completed_at | timestamptz | 完成时间 |

### report jsonb 结构

```json
{
  "score": 78,
  "summary": "整体评价",
  "problems": [
    {
      "category": "画面构图",
      "severity": "high",
      "description": "主体偏左，视觉重心不稳",
      "timestamp": "00:12"
    }
  ],
  "suggestions": [
    {
      "priority": "high",
      "action": "调整构图",
      "detail": "将主体移至画面中心或三分线交点处",
      "timeRange": "00:10-00:15"
    }
  ],
  "platformAdvice": {
    "platform": "抖音",
    "tips": ["建议使用 9:16 竖屏格式", "前 3 秒需有强吸引力的画面"]
  },
  "audienceFit": {
    "audience": "18-25 岁年轻人",
    "score": 65,
    "reasoning": "节奏偏慢，建议加快剪辑节奏"
  }
}
```

## API 设计

### Auth

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/auth/feishu | 发起飞书 OAuth 授权 |
| GET | /api/auth/feishu/callback | OAuth 回调，创建/更新用户，返回 JWT |

### Analysis

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/analyze | SSE 流式分析（核心接口） |

POST /api/analyze 请求体：
```json
{
  "videoFile": "<file>",
  "targetAudience": "18-25岁年轻人 (可选)",
  "platform": "抖音 (可选)",
  "context": "某护肤品品牌宣传片... (可选)"
}
```

SSE 响应事件：
```
event: status    data: {"status": "uploading"}
event: status    data: {"status": "analyzing"}
event: progress  data: {"step": "multimodal", "chunk": "..."}
event: progress  data: {"step": "deep_analysis", "chunk": "..."}
event: result    data: {"score": 78, "report": {...}}
event: error     data: {"message": "分析超时"}
```

### History

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/history | 获取分析历史列表（分页） |
| GET | /api/history/:id | 获取单条分析详情 |
| DELETE | /api/history/:id | 删除某条记录 |

## Mimo API 集成

模型名称：`mimo-v2.5`
认证方式：`api-key` header
API 格式：OpenAI 兼容

### 步骤 1：多模态视频分析

```
POST {MIMO_ENDPOINT}/chat/completions
Header: api-key: {MIMO_API_KEY}

{
  "model": "mimo-v2.5",
  "stream": true,
  "messages": [
    {
      "role": "system",
      "content": "你是一个专业的视频内容分析师..."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "video_url",
          "video_url": {
            "url": "<Supabase Storage 签名 URL>"
          },
          "fps": 2,
          "media_resolution": "default"
        },
        {
          "type": "text",
          "text": "<分析 prompt>"
        }
      ]
    }
  ],
  "max_completion_tokens": 4096
}
```

视频传入方式：优先使用 Supabase Storage 签名 URL（支持最大 300MB），URL 不可达时降级为 base64（需带 `data:{MIME_TYPE};base64,` 前缀，最大 50MB）。

### 步骤 2：文本深度解读

```
POST {MIMO_ENDPOINT}/chat/completions
Header: api-key: {MIMO_API_KEY}

{
  "model": "mimo-v2.5",
  "stream": true,
  "messages": [
    {
      "role": "system",
      "content": "你是一位资深的视频制作顾问..."
    },
    {
      "role": "user",
      "content": "基于以下视频初步分析结果，生成结构化报告：\n{step1_result}\n目标受众: {target_audience}\n发布平台: {platform}\n补充上下文: {context}"
    }
  ],
  "max_completion_tokens": 4096
}
```

## 前端页面

### 路由结构

- `/` — 首页/上传页面
- `/analysis/:id` — 分析结果页面（SSE 实时流 → 结构化报告）
- `/history` — 历史记录页面

### 上传页面

- 拖拽/点击上传区域（前端校验格式和大小）
- 目标受众输入框（可选）
- 发布平台下拉选择（抖音/B站/小红书/微信视频号/快手/YouTube，可选）
- 补充上下文 textarea（可选，placeholder 引导输入商品/品牌/投放信息等）
- 开始分析按钮

### 分析结果页面

- SSE 实时流展示分析过程
- 完成后展示结构化报告：
  - 综合评分仪表盘（红 < 60，黄 60-80，绿 > 80）
  - 问题清单（按严重程度排序，点击展开详情）
  - 修改建议（按优先级排序）
  - 平台适配建议（仅当选择了平台时展示）

### 历史记录页面

- 卡片网格布局：缩略图、评分、平台、日期
- 点击进入详情页
- 支持删除

## 飞书 OAuth 流程

1. 前端点击登录 → 后端 `/api/auth/feishu` 生成 state 参数
2. 302 重定向到飞书授权页
3. 用户同意授权 → 飞书回调带 code + state
4. 后端 `/api/auth/feishu/callback` 用 code 换取 user_info
5. 创建/更新 users 表记录
6. 生成 JWT，设置 HTTP-only Cookie
7. 重定向到首页

认证要点：
- HTTP-only Cookie 存储 JWT，防 XSS
- state 参数防 CSRF
- 已登录用户直接进入上传页

## 错误处理

### 前端校验（上传前拦截）

- 文件格式不支持 → 提示支持格式列表
- 文件超过 20MB → 提示大小限制
- 未登录 → 重定向到登录页

### 上传阶段

- Supabase Storage 上传失败 → 提示重试
- 网络中断 → 重新上传

### 分析阶段（通过 SSE 推送）

- Mimo API 超时 → `event: error` → 提示稍后重试
- Mimo API 返回错误 → `event: error` → 显示具体错误
- SSE 连接断开 → 前端自动重连（3 次）→ 失败则提示刷新
- 视频无法解析 → `event: error` → 提示文件可能损坏

### 通用

- 401 未授权 → 清除 Cookie，重定向登录
- 500 服务端错误 → 通用错误页 + 重试按钮

### 分析状态机

```
idle → uploading → uploaded → analyzing → completed
                                       ↘ failed
```

`failed` 状态记录保留在历史中，用户可查看失败原因并重新分析。

## 项目结构

```
vidana/
├── client/                # React 前端
│   ├── src/
│   │   ├── components/    # UI 组件
│   │   ├── pages/         # 页面
│   │   ├── hooks/         # 自定义 hooks
│   │   ├── api/           # API 调用封装
│   │   └── lib/           # 工具函数
│   └── package.json
├── server/                # Node.js 后端
│   ├── api/               # Vercel Serverless Functions
│   │   ├── auth/          # 飞书 OAuth
│   │   ├── analyze/       # 视频分析 SSE
│   │   └── history/       # 历史记录 CRUD
│   ├── services/          # 业务逻辑
│   │   ├── mimo.ts        # Mimo API 客户端
│   │   └── supabase.ts    # Supabase 客户端
│   └── package.json
├── supabase/              # Supabase 配置
│   └── migrations/        # 数据库迁移
├── docs/                  # 文档
└── vercel.json            # Vercel 部署配置
```
