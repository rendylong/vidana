import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../api/history/[id]'

const { verifyAuthMock, getAnalysisMock, deleteAnalysisMock } = vi.hoisted(() => ({
  verifyAuthMock: vi.fn(),
  getAnalysisMock: vi.fn(),
  deleteAnalysisMock: vi.fn(),
}))

vi.mock('../../api/_lib/auth', () => ({
  verifyAuth: verifyAuthMock,
}))

vi.mock('../../api/_lib/supabase', () => ({
  getAnalysis: getAnalysisMock,
  deleteAnalysis: deleteAnalysisMock,
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

describe('history detail API', () => {
  beforeEach(() => {
    verifyAuthMock.mockReset()
    getAnalysisMock.mockReset()
    deleteAnalysisMock.mockReset()
  })

  it('returns queued analysis fields for polling', async () => {
    verifyAuthMock.mockReturnValue({ userId: 'user-1' })
    const queuedAnalysis = {
      id: 'analysis-1',
      user_id: 'user-1',
      status: 'queued',
      queued_at: '2026-05-08T10:00:00.000Z',
      started_at: null,
      completed_at: null,
      error_message: null,
      retry_count: 0,
      target_audience: '二三线城市 30-50 岁男性',
      platform: '抖音',
      context: '新品首投',
      report: null,
    }
    getAnalysisMock.mockResolvedValue(queuedAnalysis)
    const response = createResponse()

    await handler({ method: 'GET', query: { id: 'analysis-1' } } as never, response.res as never)

    expect(getAnalysisMock).toHaveBeenCalledWith('analysis-1', 'user-1')
    expect(response.statusCode).toBe(200)
    expect(response.jsonBody).toEqual(queuedAnalysis)
  })
})
