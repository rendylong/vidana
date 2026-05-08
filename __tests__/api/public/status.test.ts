import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../api/public/analyses/[id]'

const {
  verifyBearerApiKeyMock,
  getAnalysisMock,
  formatAnalysisMarkdownMock,
} = vi.hoisted(() => ({
  verifyBearerApiKeyMock: vi.fn(),
  getAnalysisMock: vi.fn(),
  formatAnalysisMarkdownMock: vi.fn(),
}))

vi.mock('../../../api/_lib/apiKeys', () => ({
  verifyBearerApiKey: verifyBearerApiKeyMock,
}))

vi.mock('../../../api/_lib/supabase', () => ({
  getAnalysis: getAnalysisMock,
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

function createRequest(method = 'GET', id: unknown = 'analysis-1', authorization: unknown = 'Bearer valid-key') {
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
    getAnalysisMock.mockReset()
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

    await handler(createRequest('GET', 'analysis-1', ['Bearer first-key', 'Bearer second-key']) as never, response.res as never)

    expect(verifyBearerApiKeyMock).toHaveBeenCalledWith('Bearer first-key')
    expect(response.statusCode).toBe(401)
    expect(response.jsonBody).toEqual({ error: 'Invalid or missing Vidana API key' })
  })

  it('rejects missing or array id params', async () => {
    const response = createResponse()

    await handler(createRequest('GET', ['analysis-1']) as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'analysis id is required' })
    expect(getAnalysisMock).not.toHaveBeenCalled()
  })

  it('returns 404 when the analysis is not found for the API key owner', async () => {
    getAnalysisMock.mockResolvedValue(null)
    const response = createResponse()

    await handler(createRequest() as never, response.res as never)

    expect(getAnalysisMock).toHaveBeenCalledWith('analysis-1', 'user-1')
    expect(response.statusCode).toBe(404)
    expect(response.jsonBody).toEqual({ error: 'Analysis not found' })
  })

  it('returns queued status without markdown while analysis is pending', async () => {
    getAnalysisMock.mockResolvedValue({
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
    getAnalysisMock.mockResolvedValue({
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
