import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../api/public/analyses/[id]'

const {
  verifyBearerApiKeyMock,
  getAnalysisForUserStrictMock,
  formatAnalysisMarkdownMock,
} = vi.hoisted(() => ({
  verifyBearerApiKeyMock: vi.fn(),
  getAnalysisForUserStrictMock: vi.fn(),
  formatAnalysisMarkdownMock: vi.fn(),
}))

vi.mock('../../../api/_lib/apiKeys', () => ({
  verifyBearerApiKey: verifyBearerApiKeyMock,
}))

vi.mock('../../../api/_lib/supabase', () => ({
  getAnalysisForUserStrict: getAnalysisForUserStrictMock,
}))

vi.mock('../../../api/_lib/markdown', () => ({
  formatAnalysisMarkdown: formatAnalysisMarkdownMock,
}))

function createResponse() {
  let statusCode = 200
  let jsonBody: unknown = null
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    json(body: unknown) {
      jsonBody = body
      return this
    },
  }

  return {
    res,
    get statusCode() { return statusCode },
    get jsonBody() { return jsonBody },
  }
}

const VALID_ANALYSIS_ID = '550e8400-e29b-41d4-a716-446655440000'

function createRequest(method = 'GET', id: unknown = VALID_ANALYSIS_ID, authorization: unknown = 'Bearer valid-key') {
  return {
    method,
    query: { id },
    headers: { authorization },
  }
}

describe('public analysis status API', () => {
  beforeEach(() => {
    verifyBearerApiKeyMock.mockReset()
    verifyBearerApiKeyMock.mockResolvedValue({ userId: 'user-1', apiKeyId: 'key-1' })
    getAnalysisForUserStrictMock.mockReset()
    formatAnalysisMarkdownMock.mockReset()
  })

  it('returns 405 for non-GET requests', async () => {
    const response = createResponse()

    await handler(createRequest('POST') as never, response.res as never)

    expect(response.statusCode).toBe(405)
    expect(response.jsonBody).toEqual({ error: 'Method not allowed' })
    expect(verifyBearerApiKeyMock).not.toHaveBeenCalled()
  })

  it('normalizes authorization header arrays and rejects missing API keys', async () => {
    verifyBearerApiKeyMock.mockResolvedValue(null)
    const response = createResponse()

    await handler(createRequest('GET', VALID_ANALYSIS_ID, ['Bearer first-key', 'Bearer second-key']) as never, response.res as never)

    expect(verifyBearerApiKeyMock).toHaveBeenCalledWith('Bearer first-key')
    expect(response.statusCode).toBe(401)
    expect(response.jsonBody).toEqual({ error: 'Invalid or missing Vidana API key' })
  })

  it('rejects missing or array id params', async () => {
    const response = createResponse()

    await handler(createRequest('GET', ['analysis-1']) as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'analysis id is required' })
    expect(getAnalysisForUserStrictMock).not.toHaveBeenCalled()
  })

  it('rejects malformed analysis ids before loading analysis data', async () => {
    const response = createResponse()

    await handler(createRequest('GET', 'not-a-uuid') as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'Invalid analysis id' })
    expect(getAnalysisForUserStrictMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the analysis is not found for the API key owner', async () => {
    getAnalysisForUserStrictMock.mockResolvedValue(null)
    const response = createResponse()

    await handler(createRequest() as never, response.res as never)

    expect(getAnalysisForUserStrictMock).toHaveBeenCalledWith(VALID_ANALYSIS_ID, 'user-1')
    expect(response.statusCode).toBe(404)
    expect(response.jsonBody).toEqual({ error: 'Analysis not found' })
  })

  it('returns 500 when loading analysis status fails', async () => {
    getAnalysisForUserStrictMock.mockRejectedValue(new Error('database unavailable'))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = createResponse()

    await handler(createRequest() as never, response.res as never)

    expect(response.statusCode).toBe(500)
    expect(response.jsonBody).toEqual({ error: 'Failed to load analysis status' })

    consoleErrorSpy.mockRestore()
  })

  it('returns queued status without markdown while analysis is pending', async () => {
    getAnalysisForUserStrictMock.mockResolvedValue({
      id: 'analysis-1',
      user_id: 'user-1',
      status: 'queued',
      report: null,
      error_message: null,
    })
    const response = createResponse()

    await handler(createRequest() as never, response.res as never)

    expect(response.statusCode).toBe(200)
    expect(response.jsonBody).toEqual({
      analysisId: 'analysis-1',
      status: 'queued',
      error: null,
    })
    expect(formatAnalysisMarkdownMock).not.toHaveBeenCalled()
  })

  it('returns completed markdown and report', async () => {
    const report = {
      score: 8,
      summary: '分析完成',
      timelineEdits: [],
      globalEdits: [],
      suggestions: [],
    }
    getAnalysisForUserStrictMock.mockResolvedValue({
      id: 'analysis-1',
      user_id: 'user-1',
      status: 'completed',
      video_url: 'user-1/clip.mp4',
      target_audience: '创业者',
      platform: '小红书',
      context: '新品发布',
      report,
      error_message: null,
    })
    formatAnalysisMarkdownMock.mockReturnValue('# Vidana\n\n分析完成')
    const response = createResponse()

    await handler(createRequest() as never, response.res as never)

    expect(formatAnalysisMarkdownMock).toHaveBeenCalledWith(report, {
      fileName: 'user-1/clip.mp4',
      targetAudience: '创业者',
      platform: '小红书',
      context: '新品发布',
    })
    expect(response.statusCode).toBe(200)
    expect(response.jsonBody).toEqual({
      analysisId: 'analysis-1',
      status: 'completed',
      markdown: '# Vidana\n\n分析完成',
      report,
    })
  })
})
