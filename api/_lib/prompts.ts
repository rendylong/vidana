interface PromptOptions {
  targetAudience?: string
  platform?: string
  context?: string
}

export function buildAnalysisPrompt(opts: PromptOptions): string {
  let prompt = `请从以下维度详细分析这段视频素材：\n\n1. **画面质量**：清晰度、光线运用、色彩表现\n2. **构图与镜头**：构图是否合理、镜头运动是否流畅\n3. **剪辑节奏**：剪辑节奏是否恰当、转场是否自然\n4. **音频质量**：背景音、配音、音效是否协调\n5. **叙事结构**：内容是否有清晰的起承转合\n6. **整体观感**：视觉冲击力、情感传达、专业度`
  if (opts.targetAudience) prompt += `\n\n目标受众：${opts.targetAudience}\n请评估视频对目标受众的吸引力和适配度。`
  if (opts.platform) prompt += `\n\n发布平台：${opts.platform}\n请给出该平台的适配建议（如画面比例、时长、节奏等）。`
  if (opts.context) prompt += `\n\n补充背景信息：${opts.context}\n请结合这些信息分析视频是否有效传达了核心卖点或信息。`
  prompt += '\n\n请以 JSON 格式输出分析结果，包含各维度的评分和详细说明。'
  return prompt
}
