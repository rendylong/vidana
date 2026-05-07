import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/benchmark'

const {
  verifyAuthMock,
  runBenchmarkPipelineMock,
} = vi.hoisted(() => ({
  verifyAuthMock: vi.fn(),
  runBenchmarkPipelineMock: vi.fn(),
}))

vi.mock('../../api/_lib/auth', () => ({
  verifyAuth: verifyAuthMock,
}))

vi.mock('../../api/_lib/benchmarkPipeline', () => ({
  runBenchmarkPipeline: runBenchmarkPipelineMock,
}))

function createResponse() {
  let statusCode = 200
  let jsonBody: unknown = null
  let ended = false
  const headers: Record<string, string> = {}
  const chunks: string[] = []
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    setHeader(name: string, value: string) {
      headers[name] = value
      return this
    },
    json(body: unknown) {
      jsonBody = body
      return this
    },
    write(chunk: string) {
      chunks.push(chunk)
      return true
    },
    end() {
      ended = true
      return this
    },
  }

  return {
    res,
    get statusCode() { return statusCode },
    get jsonBody() { return jsonBody },
    get headers() { return headers },
    get chunks() { return chunks },
    get body() { return chunks.join('') },
    get ended() { return ended },
  }
}

function sseData(body: string, event: string): Record<string, unknown>[] {
  const pattern = new RegExp(`event: ${event}\\ndata: (.*)\\n\\n`, 'g')
  return [...body.matchAll(pattern)].map((match) => JSON.parse(match[1]))
}

function createPost(body: Record<string, unknown>) {
  return { method: 'POST', body }
}

describe('benchmark API', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset()
    runBenchmarkPipelineMock.mockReset()
    delete process.env.VIDANA_PUBLIC_ORIGIN
    delete process.env.VITE_APP_URL
  })

  it('rejects non-POST requests with JSON 405', async () => {
    const response = createResponse()

    await handler({ method: 'GET' } as never, response.res as never)

    expect(response.statusCode).toBe(405)
    expect(response.jsonBody).toEqual({ error: 'Method not allowed' })
    expect(verifyAuthMock).not.toHaveBeenCalled()
    expect(response.ended).toBe(false)
  })

  it('rejects unauthenticated POST requests with JSON 401', async () => {
    verifyAuthMock.mockReturnValue(null)
    const response = createResponse()

    await handler(createPost({ storagePath: 'videos/ref.mp4' }) as never, response.res as never)

    expect(response.statusCode).toBe(401)
    expect(response.jsonBody).toEqual({ error: 'Unauthorized' })
    expect(runBenchmarkPipelineMock).not.toHaveBeenCalled()
    expect(response.ended).toBe(false)
  })

  it.each([
    [{ ipPositioning: '创始人 IP', platform: '抖音' }, '请先上传参考视频'],
    [{ storagePath: 'videos/ref.mp4', ipPositioning: ' ', platform: '抖音' }, '请填写你的账号/IP定位'],
    [{ storagePath: 'videos/ref.mp4', platform: '抖音' }, '请填写你的账号/IP定位'],
    [{ storagePath: 'videos/ref.mp4', ipPositioning: '创始人 IP', platform: ' ' }, '请选择发布平台'],
    [{ storagePath: 'videos/ref.mp4', ipPositioning: '创始人 IP' }, '请选择发布平台'],
  ])('validates required fields via SSE error events', async (body, message) => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    const response = createResponse()

    await handler(createPost(body) as never, response.res as never)

    expect(response.headers).toMatchObject({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    expect(sseData(response.body, 'error')).toEqual([{ message }])
    expect(runBenchmarkPipelineMock).not.toHaveBeenCalled()
    expect(response.ended).toBe(true)
  })

  it('runs benchmark pipeline with trimmed fields and emits result SSE', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    process.env.VITE_APP_URL = 'https://vidana.example/path'
    runBenchmarkPipelineMock.mockImplementation(async ({ onProgress, onAnalysisCreated }) => {
      onProgress({ step: 'prepare', message: '准备中' })
      onAnalysisCreated('analysis-1')
      return {
        analysisId: 'analysis-1',
        report: { contentType: '种草短视频', summary: '值得学习' },
      }
    })
    const response = createResponse()

    await handler(createPost({
      storagePath: 'videos/ref.mp4',
      ipPositioning: ' 创始人 IP ',
      platform: ' 抖音 ',
      productOrService: ' AI 视频工具 ',
      targetCustomer: '  ',
      benchmarkGoal: '',
    }) as never, response.res as never)

    expect(runBenchmarkPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      storagePath: 'videos/ref.mp4',
      ipPositioning: '创始人 IP',
      platform: '抖音',
      productOrService: 'AI 视频工具',
      targetCustomer: undefined,
      benchmarkGoal: undefined,
      origin: 'https://vidana.example',
      onProgress: expect.any(Function),
      onAnalysisCreated: expect.any(Function),
    }))
    expect(sseData(response.body, 'status')).toEqual([
      { status: 'preparing' },
      { status: 'analyzing', analysisId: 'analysis-1' },
    ])
    expect(sseData(response.body, 'progress')).toEqual([
      { step: 'prepare', message: '准备中' },
    ])
    expect(sseData(response.body, 'result')).toEqual([
      { report: { contentType: '种草短视频', summary: '值得学习' } },
    ])
    expect(response.ended).toBe(true)
  })

  it('emits error SSE and ends when benchmark pipeline fails', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    runBenchmarkPipelineMock.mockRejectedValue(new Error('Mimo failed'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = createResponse()

    await handler(createPost({
      storagePath: 'videos/ref.mp4',
      ipPositioning: '创始人 IP',
      platform: '抖音',
    }) as never, response.res as never)

    expect(consoleErrorSpy).toHaveBeenCalledWith('Benchmark error:', expect.any(Error))
    expect(sseData(response.body, 'status')).toEqual([{ status: 'preparing' }])
    expect(sseData(response.body, 'error')).toEqual([{ message: 'Mimo failed' }])
    expect(response.ended).toBe(true)

    consoleErrorSpy.mockRestore()
  })
})
