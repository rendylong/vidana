import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/analyze'

const {
  verifyAuthMock,
  assertUserHasCreditsMock,
  submitAnalysisJobMock,
  runAnalysisPipelineMock,
  InsufficientCreditsErrorMock,
  ActiveAnalysisLimitErrorMock,
} = vi.hoisted(() => ({
  verifyAuthMock: vi.fn(),
  assertUserHasCreditsMock: vi.fn(),
  submitAnalysisJobMock: vi.fn(),
  runAnalysisPipelineMock: vi.fn(),
  InsufficientCreditsErrorMock: class InsufficientCreditsError extends Error {
    constructor() {
      super('可用分析次数不足，请联系管理员增加额度。')
    }
  },
  ActiveAnalysisLimitErrorMock: class ActiveAnalysisLimitError extends Error {
    constructor() {
      super('当前排队或分析中的任务已达到 2 个，请等待已有任务完成后再提交。')
    }
  },
}))

vi.mock('../../api/_lib/auth', () => ({
  verifyAuth: verifyAuthMock,
}))

vi.mock('../../api/_lib/credits', () => ({
  assertUserHasCredits: assertUserHasCreditsMock,
  InsufficientCreditsError: InsufficientCreditsErrorMock,
}))

vi.mock('../../api/_lib/analysisSubmission', () => ({
  submitAnalysisJob: submitAnalysisJobMock,
  ActiveAnalysisLimitError: ActiveAnalysisLimitErrorMock,
}))

vi.mock('../../api/_lib/analysisPipeline', () => ({
  runAnalysisPipeline: runAnalysisPipelineMock,
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
    get ended() { return ended },
  }
}

function createPost(body: Record<string, unknown>) {
  return { method: 'POST', body }
}

describe('web analyze API', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset()
    assertUserHasCreditsMock.mockReset()
    assertUserHasCreditsMock.mockResolvedValue(undefined)
    submitAnalysisJobMock.mockReset()
    submitAnalysisJobMock.mockResolvedValue({ analysisId: 'analysis-1' })
    runAnalysisPipelineMock.mockReset()
  })

  it('returns 405 for non-POST requests', async () => {
    const response = createResponse()

    await handler({ method: 'GET' } as never, response.res as never)

    expect(response.statusCode).toBe(405)
    expect(response.jsonBody).toEqual({ error: 'Method not allowed' })
    expect(verifyAuthMock).not.toHaveBeenCalled()
    expect(submitAnalysisJobMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated requests', async () => {
    verifyAuthMock.mockReturnValue(null)
    const response = createResponse()

    await handler(createPost({ storagePath: 'user-1/video.mp4' }) as never, response.res as never)

    expect(response.statusCode).toBe(401)
    expect(response.jsonBody).toEqual({ error: 'Unauthorized' })
    expect(assertUserHasCreditsMock).not.toHaveBeenCalled()
    expect(submitAnalysisJobMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('returns 400 when storagePath is missing', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    const response = createResponse()

    await handler(createPost({ targetAudience: '用户', platform: '抖音' }) as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'storagePath is required' })
    expect(assertUserHasCreditsMock).not.toHaveBeenCalled()
    expect(submitAnalysisJobMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('returns 402 for insufficient credits before submitting a job', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    assertUserHasCreditsMock.mockRejectedValue(new InsufficientCreditsErrorMock())
    const response = createResponse()

    await handler(createPost({ storagePath: 'user-1/video.mp4' }) as never, response.res as never)

    expect(assertUserHasCreditsMock).toHaveBeenCalledWith('user-1')
    expect(response.statusCode).toBe(402)
    expect(response.jsonBody).toEqual({ error: '可用分析次数不足，请联系管理员增加额度。' })
    expect(submitAnalysisJobMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('submits an analysis job and returns queued status', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    const response = createResponse()

    await handler(createPost({
      storagePath: 'user-1/video.mp4',
      targetAudience: '二三线城市 30-50 岁男性',
      platform: '抖音',
      context: '新品首投',
    }) as never, response.res as never)

    expect(verifyAuthMock).toHaveBeenCalledOnce()
    expect(assertUserHasCreditsMock).toHaveBeenCalledWith('user-1')
    expect(submitAnalysisJobMock).toHaveBeenCalledWith({
      userId: 'user-1',
      storagePath: 'user-1/video.mp4',
      targetAudience: '二三线城市 30-50 岁男性',
      platform: '抖音',
      context: '新品首投',
    })
    expect(response.statusCode).toBe(202)
    expect(response.jsonBody).toEqual({ analysisId: 'analysis-1', status: 'queued' })
    expect(response.headers).not.toHaveProperty('Content-Type', 'text/event-stream')
    expect(response.chunks).toEqual([])
    expect(response.ended).toBe(false)
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('returns 429 when active analysis limit is reached', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    submitAnalysisJobMock.mockRejectedValue(new ActiveAnalysisLimitErrorMock())
    const response = createResponse()

    await handler(createPost({ storagePath: 'user-1/video.mp4' }) as never, response.res as never)

    expect(response.statusCode).toBe(429)
    expect(response.jsonBody).toEqual({
      error: '当前排队或分析中的任务已达到 2 个，请等待已有任务完成后再提交。',
    })
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('returns 500 for generic credit errors', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    assertUserHasCreditsMock.mockRejectedValue(new Error('credits unavailable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = createResponse()

    await handler(createPost({ storagePath: 'user-1/video.mp4' }) as never, response.res as never)

    expect(response.statusCode).toBe(500)
    expect(response.jsonBody).toEqual({ error: '分析次数检查失败，请稍后重试' })
    expect(submitAnalysisJobMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })

  it('returns 500 for generic queue submission errors', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    submitAnalysisJobMock.mockRejectedValue(new Error('queue unavailable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = createResponse()

    await handler(createPost({ storagePath: 'user-1/video.mp4' }) as never, response.res as never)

    expect(response.statusCode).toBe(500)
    expect(response.jsonBody).toEqual({ error: '分析任务提交失败，请稍后重试' })
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
