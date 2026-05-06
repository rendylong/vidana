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
      { role: 'system', content: '你是一个专业的视频内容分析师。请从画面质量、构图镜头、剪辑节奏、音频质量、叙事结构等维度分析视频素材。以 JSON 格式输出分析结果。' },
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: videoUrl }, fps: 2, media_resolution: 'default' },
          { type: 'text', text: analysisPrompt },
        ],
      },
    ],
    max_completion_tokens: 4096,
  }
}

export function buildDeepAnalysisRequest(multimodalResult: string, opts: RequestOptions) {
  let prompt = `基于以下视频初步分析结果，请生成一份详细的结构化分析报告。\n\n初步分析结果：\n${multimodalResult}\n\n报告必须严格按以下 JSON 格式输出：\n{"score":<0-100>,"summary":"<整体评价>","problems":[{"category":"<分类>","severity":"<high|medium|low>","description":"<描述>","timestamp":"<MM:SS或null>"}],"suggestions":[{"priority":"<high|medium|low>","action":"<操作>","detail":"<详情>","timeRange":"<MM:SS-MM:SS或null>"}],"platformAdvice":null,"audienceFit":null}`
  if (opts.targetAudience) prompt += `\n\n目标受众：${opts.targetAudience}\n请在 audienceFit 字段中评估视频对目标受众的适配度。`
  if (opts.platform) prompt += `\n\n发布平台：${opts.platform}\n请在 platformAdvice 字段中给出该平台的适配建议。`
  if (opts.context) prompt += `\n\n补充上下文：${opts.context}\n请结合这些背景信息分析视频是否有效传达了核心信息。`
  return {
    model: 'mimo-v2.5',
    stream: true,
    messages: [
      { role: 'system', content: '你是一位资深的视频制作顾问。你总是输出严格的 JSON 格式，不包含任何 markdown 代码块标记。' },
      { role: 'user', content: prompt },
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
      } catch { /* skip non-JSON */ }
    }
  }
}

export async function callMimoAPI(body: Record<string, unknown>): Promise<Response> {
  const response = await fetch(`${MIMO_ENDPOINT}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': MIMO_API_KEY },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Mimo API error: ${response.status} - ${error}`)
  }
  return response
}
