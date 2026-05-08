const MIMO_ENDPOINT = process.env.MIMO_API_ENDPOINT || 'https://token-plan-cn.xiaomimimo.com/v1'
const MIMO_API_KEY = process.env.MIMO_API_KEY || ''

export function buildAnalysisRequest(videoUrl: string, prompt: string) {
  return {
    model: 'mimo-v2.5',
    stream: true,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: videoUrl }, fps: 4, media_resolution: 'default' },
          { type: 'text', text: prompt },
        ],
      },
    ],
    max_completion_tokens: 8192,
  }
}

export function buildMultimodalRequest(videoUrl: string, prompt: string) {
  return {
    model: 'mimo-v2.5',
    stream: true,
    messages: [
      { role: 'system', content: '你是一位专业的视频内容分析师。' },
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: videoUrl }, fps: 4, media_resolution: 'default' },
          { type: 'text', text: prompt },
        ],
      },
    ],
    max_completion_tokens: 8192,
  }
}

export function buildDeepAnalysisRequest(initialResult: string, opts: {
  targetAudience?: string
  platform?: string
  context?: string
}) {
  const lines = [`基于以下视频初步分析结果，生成结构化报告：\n${initialResult}`]
  if (opts.targetAudience) lines.push(`目标受众：${opts.targetAudience}`)
  if (opts.platform) lines.push(`发布平台：${opts.platform}`)
  if (opts.context) lines.push(`补充上下文：${opts.context}`)

  return {
    model: 'mimo-v2.5',
    stream: true,
    messages: [
      { role: 'system', content: '你是一位资深的视频制作顾问。' },
      { role: 'user', content: lines.join('\n') },
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
        if (parsed.error) throw new Error(`Mimo stream error: ${JSON.stringify(parsed.error)}`)
        const choice = parsed.choices?.[0]
        const content =
          choice?.delta?.content ??
          choice?.message?.content ??
          choice?.text ??
          parsed.output_text ??
          parsed.text
        if (content) yield content
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Mimo stream error:')) throw err
      }
    }
  }
}

export async function callMimoAPI(body: Record<string, unknown>, retries = 2): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000)
  try {
    const response = await fetch(`${MIMO_ENDPOINT}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': MIMO_API_KEY },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Mimo API error: ${response.status} - ${error}`)
    }
    return response
  } catch (err) {
    if (retries > 0 && (err instanceof TypeError || (err as Error).name === 'AbortError')) {
      console.log(`Mimo API timeout/error, retrying... (${retries} left)`)
      return callMimoAPI(body, retries - 1)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}
