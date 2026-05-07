import { beforeEach, describe, expect, it, vi } from 'vitest'
import dashboardHandler from '../../api/admin/dashboard'
import userByIdHandler from '../../api/admin/users/[id]'
import userCreditsHandler from '../../api/admin/users/[id]/credits'
import analysisByIdHandler from '../../api/admin/analyses/[id]'

const {
  verifyAdminRequestMock,
  getAdminDashboardMock,
  getAdminUserDetailMock,
  adjustUserCreditsMock,
  getAdminAnalysisDetailMock,
} = vi.hoisted(() => ({
  verifyAdminRequestMock: vi.fn(),
  getAdminDashboardMock: vi.fn(),
  getAdminUserDetailMock: vi.fn(),
  adjustUserCreditsMock: vi.fn(),
  getAdminAnalysisDetailMock: vi.fn(),
}))

vi.mock('../../api/_lib/adminAuth', () => ({
  verifyAdminRequest: verifyAdminRequestMock,
}))

vi.mock('../../api/_lib/adminData', () => ({
  getAdminDashboard: getAdminDashboardMock,
  getAdminUserDetail: getAdminUserDetailMock,
  adjustUserCredits: adjustUserCreditsMock,
  getAdminAnalysisDetail: getAdminAnalysisDetailMock,
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
    getAdminUserDetailMock.mockReset()
    adjustUserCreditsMock.mockReset()
    getAdminAnalysisDetailMock.mockReset()
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

  it('rejects missing user id before data access', async () => {
    verifyAdminRequestMock.mockReturnValue({ admin: true })
    const response = createResponse()

    await userByIdHandler({ method: 'GET', query: { id: '' } } as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'Missing user id' })
    expect(getAdminUserDetailMock).not.toHaveBeenCalled()
  })

  it('maps known credit validation errors to 400', async () => {
    verifyAdminRequestMock.mockReturnValue({ admin: true })
    adjustUserCreditsMock.mockRejectedValue(new Error('用户额度不能小于 0。'))
    const response = createResponse()

    await userCreditsHandler({
      method: 'POST',
      query: { id: 'user-1' },
      body: { delta: 0, reason: 'bad' },
    } as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: '用户额度不能小于 0。' })
  })

  it('maps unexpected credit errors to 500', async () => {
    verifyAdminRequestMock.mockReturnValue({ admin: true })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    adjustUserCreditsMock.mockRejectedValue(new Error('database unavailable'))
    const response = createResponse()

    await userCreditsHandler({
      method: 'POST',
      query: { id: 'user-1' },
      body: { delta: 1, reason: 'manual fix' },
    } as never, response.res as never)

    expect(response.statusCode).toBe(500)
    expect(response.jsonBody).toEqual({ error: '后台操作失败' })
    expect(consoleErrorSpy).toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
  })
})
