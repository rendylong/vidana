# Vidana 视频对标功能设计

## 背景

Vidana 当前主流程是上传视频、填写目标用户和投放平台、生成投放分析报告。新增的视频对标功能要保持这个上传分析式产品形态，不把主界面改回聊天界面。

视频对标的目标不是评价用户自己的素材，而是让用户上传一个想学习的参考视频，由 Mimo v2.5 以专业视频分析人员的角度拆解参考视频，并结合用户自己的 IP、定位和可选业务背景，输出可执行的模仿和翻拍方案。

第一版只支持 Web 登录用户，不扩展 CLI 或 public API。

## 产品入口

在 `src/pages/AgentPage.tsx` 的分析条件区域顶部增加分段模式：

- `投放分析`
- `视频对标`

默认模式仍为 `投放分析`。原有投放分析字段、按钮、结果展示和历史行为保持不变。

切换到 `视频对标` 后，页面仍保持左右两栏的上传分析体验：

- 左侧是参考视频上传和对标条件表单。
- 右侧是对标报告结果。
- 历史侧边栏继续复用，但条目需要能区分 `投放分析` 和 `视频对标`。

## 对标表单

对标模式使用专门字段，不复用投放分析文案。

必填字段：

- `参考视频`：用户上传需要对标的视频。
- `你的账号/IP定位`：例如创始人号、门店老板、母婴博主、专业测评号。
- `发布平台`：沿用当前平台枚举。

选填字段：

- `产品/服务`：用户希望推广或承载内容的对象。vlog、段子、个人表达类视频可以不填。
- `目标客户`：目标观看人群和购买/关注对象。没有明确商业目标时可以不填。
- `模仿目标/限制条件`：例如想学习开头、要改成同城获客、不能露脸、预算有限、需要保留品牌调性。

按钮文案为 `生成对标报告`。

## 报告原则

报告以可执行翻拍方案为主，而不是单纯赏析。Mimo 必须先判断参考视频类型，再按该类型组织拆解。

不能把报告写死成投流广告结构。参考视频可能是投流广告、口播种草、搞笑段子、科普、vlog、测评、品牌片或其他类型。外层 JSON 字段保持稳定，字段内容根据识别到的视频类型自适应。

对标报告不提供评分，也不提供可模仿程度分数。它只回答两件事：

- 这个参考视频是怎么成立的。
- 用户应该如何结合自己的需求去模仿、改编和翻拍。

## 报告 JSON

`report` 存入 `analyses.report`，结构如下：

```json
{
  "contentType": "口播种草 / 投流广告 / 搞笑段子 / 科普 / vlog / 测评 / 其他",
  "summary": "这个视频最值得学习的地方",
  "coreMechanism": "它为什么有效",
  "scriptDesign": {
    "structure": ["开头如何抓人", "中段如何推进", "结尾如何收束"],
    "copyPatterns": ["可复用的表达方式"],
    "emotionalCurve": "情绪或信息节奏"
  },
  "visualDesign": {
    "sceneStyle": "画面风格",
    "shotList": ["关键镜头和作用"],
    "editingRhythm": "剪辑节奏",
    "subtitleAndAudio": "字幕、音频、配乐设计"
  },
  "hookDesign": {
    "openingHook": "前 3 秒钩子",
    "retentionHooks": ["中途留人点"],
    "conversionOrPayoff": "转化、关注、笑点或知识 payoff"
  },
  "imitationPlan": {
    "adaptedAngle": "结合用户 IP、产品、客户后的翻拍角度",
    "scriptOutline": ["可执行脚本大纲"],
    "shotInstructions": ["镜头翻拍建议"],
    "copyExamples": ["示例台词或字幕"],
    "avoid": ["不要照搬或不适合模仿的点"]
  },
  "productionChecklist": ["拍摄前检查项"],
  "risks": ["版权、风格错配、平台适配等风险"]
}
```

前端展示时按以下章节组织：

- 视频类型与核心学习点
- 脚本设计
- 画面与剪辑设计
- 钩子与留人机制
- 结合自身需求的翻拍方案
- 拍摄检查清单
- 风险与避坑

## 后端设计

新增 Web 登录用户接口：

```text
POST /api/benchmark
```

请求体：

```json
{
  "storagePath": "videos bucket path",
  "ipPositioning": "账号/IP定位",
  "platform": "发布平台",
  "productOrService": "产品/服务，可选",
  "targetCustomer": "目标客户，可选",
  "benchmarkGoal": "模仿目标/限制条件，可选"
}
```

接口行为：

1. 校验登录态和必填字段。
2. 创建一条 `analyses` 记录，类型为 `benchmark`。
3. 构造视频对标 prompt。
4. 调用 Mimo v2.5 多模态接口。
5. 复用现有 signed-url、proxy-url、data-url fallback。
6. 解析稳定 JSON。
7. 将 report、raw_result、completed_at 写回数据库。
8. 通过 SSE 返回 `status / progress / result / error`。

保持 `/api/analyze` 专注于投放分析，避免在现有接口里堆叠过多模式分支。

## 数据模型

复用 `analyses` 表，新增字段：

```sql
ALTER TABLE analyses
ADD COLUMN analysis_type text NOT NULL DEFAULT 'analysis'
CHECK (analysis_type IN ('analysis', 'benchmark'));
```

旧记录默认视为 `analysis`。

`benchmark` 记录字段映射：

- `video_url`：参考视频 storage path。
- `target_audience`：目标客户；用户未填写时为 null。
- `platform`：发布平台。
- `context`：保存账号/IP定位、产品/服务、模仿目标/限制条件的摘要文本。
- `score`：保持 null。
- `report`：保存对标报告 JSON。
- `raw_result`：保存 Mimo 原文、sourceMode 和 fallback errors。

后续如果对标字段需要独立查询或统计，再迁移为专门列。第一版优先降低 schema 改动范围。

## 前端解析

新增 `BenchmarkReport` 类型和 `parseBenchmarkReport`：

- 外层字段缺失时给出空字符串或空数组兜底。
- 不伪造 Mimo 没有返回的章节。
- 历史详情根据 `analysis_type` 决定使用投放分析解析器还是对标报告解析器。

历史列表标题规则：

- `analysis`：沿用当前 `平台 / 目标用户`。
- `benchmark`：优先显示 `对标 / 平台 / 目标客户`；没有目标客户时显示 `对标 / 平台 / IP定位`；无平台时显示 `视频对标`。

## 错误处理

对标模式使用场景化错误文案：

- 未上传视频：`请先上传参考视频`
- 缺少账号/IP定位：`请填写你的账号/IP定位`
- 缺少平台：`请选择发布平台`
- Mimo 空响应或视频读取失败：前端提示 `对标报告生成失败`，服务端保留真实错误和 fallback 尝试。

当历史记录中的对标 report 结构不完整时，结果区展示已有 summary 或兜底提示，不生成虚假的章节内容。

## 测试与验证

实现阶段的最小验证：

- `npm run build`
- 对新增 prompt 和 report parser 写单元测试。
- 按现有分析 pipeline 的 fallback 测试方式覆盖 benchmark pipeline 的关键分支。
- 使用 `npm run dev:full` 在 `http://localhost:5174/` 手动验证：
  - 双模式切换。
  - 对标表单必填校验。
  - 上传参考视频并生成报告。
  - 历史列表能区分对标记录。
  - 打开历史对标记录后字段和报告展示正确。

## 不在第一版范围

- CLI `vidana analyze` 或新命令。
- `/api/public/analyze` 的对标能力。
- 多参考视频对比。
- 报告导出。
- 流式逐章节展示。
