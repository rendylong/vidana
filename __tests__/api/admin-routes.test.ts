import { beforeEach, describe, expect, it, vi } from 'vitest'
import dashboardHandler from '../../api/admin/dashboard'

const { verifyAdminRequestMock, getAdminDashboardMock } = vi.hoisted(() => ({
  verifyAdminRequestMock: vi.fn(),
  getAdminDashboardMock: vi.fn(),
}))

vi.mock('../../api/_lib/adminAuth', () => ({
  verifyAdminRequest: verifyAdminRequestMock,
}))

vi.mock('../../api/_lib/adminData', () => ({
  getAdminDashboard: getAdminDashboardMock,
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
    get statusCode() {
      return statusCode
    },
    get jsonBody() {
      return jsonBody
    },
  }
}

describe('admin routes', () => {
  beforeEach(() => {
    verifyAdminRequestMock.mockReset()
    getAdminDashboardMock.mockReset()
  })

  it('rejects unauthenticated dashboard requests', async () => {
    verifyAdminRequestMock.mockReturnValue(null)
    const response = createResponse()

    await dashboardHandler({ method: 'GET', query: {} } as never, response.res as never)

    expect(response.statusCode).toBe(401)
    expect(response.jsonBody).toEqual({ error: 'Unauthorized' })
  })

  it('returns dashboard data for authenticated admins with today default', async () => {
    verifyAdminRequestMock.mockReturnValue({ admin: true })
    getAdminDashboardMock.mockResolvedValue({
      range: 'today',
      metrics: [],
      recentAnalyses: [],
      recentFailures: [],
    })
    const response = createResponse()

    await dashboardHandler({ method: 'GET', query: { range: 'today' } } as never, response.res as never)

    expect(getAdminDashboardMock).toHaveBeenCalledWith('today')
    expect(response.jsonBody).toEqual({
      range: 'today',
      metrics: [],
      recentAnalyses: [],
      recentFailures: [],
    })
  })
})
