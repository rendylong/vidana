interface PromptOptions {
  targetAudience?: string
  platform?: string
  context?: string
}

export function buildAnalysisPrompt(opts: PromptOptions): string {
  let prompt = `你是一位资深视频制作总监，正在审查一段视频素材。

【审查背景】`

  const backgrounds: string[] = []
  if (opts.targetAudience) backgrounds.push(`目标人群：${opts.targetAudience}`)
  if (opts.platform) backgrounds.push(`发布平台：${opts.platform}`)
  if (opts.context) backgrounds.push(`补充信息：${opts.context}`)
  if (backgrounds.length) {
    prompt += '\n' + backgrounds.join('\n')
  } else {
    prompt += '\n无特别指定，请按通用标准审查。'
  }

  prompt += `

【审查要求】
1. 结合上述背景来评判 — 同一个问题面对不同人群和平台，严重程度和修改优先级可能不同
2. 按时间线逐场景/逐镜头分析，每条意见必须标注精确时间戳（MM:SS 格式）
3. 关注以下维度：画面质量、色调统一、转场剪辑、字幕文案、人物表现、音频配音、素材质量
4. 每条给出明确操作指令（去掉/替换/调整/统一等具体动作）
5. 最后给出与背景匹配的宏观建议

输出严格 JSON，不要加 markdown 代码块标记，不要加任何额外文字，只输出纯 JSON：
{"score":<0-100整数>,"summary":"<结合背景，评价视频在目标人群和平台上的预期效果，200字以内>","timelineEdits":[{"timestamp":"<MM:SS>","issue":"<具体问题>","action":"<明确操作指令>","category":"<视觉|剪辑|字幕|音频|人物|素材>","severity":"<high|medium|low>"}],"globalEdits":[{"issue":"<具体问题>","action":"<明确操作指令>","category":"<视觉|剪辑|字幕|音频|人物|素材>","severity":"<high|medium|low>"}],"suggestions":["<宏观建议1>","<宏观建议2>"]}

注意：
- timelineEdits 是带时间戳的逐条修改，globalEdits 是影响整个视频的问题
- suggestions 是与背景匹配的宏观建议，如素材替换方向、风格调整方向等
- 所有 JSON key 必须用双引号包裹，不要省略任何字段`

  return prompt
}

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
4. 输出重点是可执行翻拍方案，不做视频质量评分，不输出 score 或模仿分数。
5. 避免鼓励逐字照抄、盗用素材、侵犯版权或冒充原作者。

输出严格 JSON，不要加 markdown 代码块标记，不要加任何额外文字，只输出纯 JSON：
{"contentType":"<口播种草|投流广告|搞笑段子|科普|vlog|测评|品牌片|其他>","summary":"<这个视频最值得学习的地方>","coreMechanism":"<它为什么有效>","scriptDesign":{"structure":["<开头如何抓人>","<中段如何推进>","<结尾如何收束>"],"copyPatterns":["<可复用的表达方式>"],"emotionalCurve":"<情绪或信息节奏>"},"visualDesign":{"sceneStyle":"<画面风格>","shotList":["<关键镜头和作用>"],"editingRhythm":"<剪辑节奏>","subtitleAndAudio":"<字幕、音频、配乐设计>"},"hookDesign":{"openingHook":"<前3秒钩子>","retentionHooks":["<中途留人点>"],"conversionOrPayoff":"<转化、关注、笑点或知识payoff>"},"imitationPlan":{"adaptedAngle":"<结合用户背景后的翻拍角度>","scriptOutline":["<可执行脚本大纲>"],"shotInstructions":["<镜头翻拍建议>"],"copyExamples":["<示例台词或字幕>"],"avoid":["<不要照搬或不适合模仿的点>"]},"productionChecklist":["<拍摄前检查项>"],"risks":["<版权、风格错配、平台适配等风险>"]}

所有 JSON key 必须用双引号包裹，不要省略任何字段。`
}
