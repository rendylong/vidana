import { describe, it, expect } from 'vitest'
import { buildMultimodalRequest, buildDeepAnalysisRequest, parseSSEStream } from '../../../api/_lib/mimo'

describe('buildMultimodalRequest', () => {
  it('构建包含视频 URL 的多模态请求', () => {
    const req = buildMultimodalRequest('https://example.com/video.mp4', '分析这段视频')
    expect(req.model).toBe('mimo-v2.5')
    expect(req.stream).toBe(true)
    expect(req.messages).toHaveLength(2)
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
  it('构建包含所有可选参数的请求', () => {
    const req = buildDeepAnalysisRequest('初步分析结果', { targetAudience: '年轻人', platform: '抖音', context: '护肤品广告' })
    expect(req.model).toBe('mimo-v2.5')
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
    const response = new Response(mockStream, { headers: { 'content-type': 'text/event-stream' } })
    for await (const text of parseSSEStream(response)) { chunks.push(text) }
    expect(chunks).toEqual(['hello'])
  })
})
