import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}))

vi.mock('../../api/_lib/supabase', () => ({
  getSupabase: () => supabaseMock,
}))

const { assertUserHasCredits, chargeAnalysisCredit, grantInitialCredits, recordAnalysisFailure } = await import('../../api/_lib/credits')

function tableMock(result: unknown = { data: null, error: null }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'single', 'maybeSingle', 'insert', 'update', 'limit']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = vi.fn((resolve) => Promise.resolve(resolve(result)))
  return chain
}

describe('credits service', () => {
  beforeEach(() => {
    supabaseMock.from.mockReset()
    supabaseMock.rpc.mockReset()
  })

  it('allows users with positive credits', async () => {
    const chain = tableMock({ data: { analysis_credits: 2 }, error: null })
    supabaseMock.from.mockReturnValue(chain)

    await expect(assertUserHasCredits('user-1')).resolves.toBeUndefined()
  })

  it('rejects users without credits', async () => {
    const chain = tableMock({ data: { analysis_credits: 0 }, error: null })
    supabaseMock.from.mockReturnValue(chain)

    await expect(assertUserHasCredits('user-1')).rejects.toThrow('可用分析次数不足')
  })

  it('writes initial grant transaction for a new user', async () => {
    const chain = tableMock({ data: null, error: null })
    supabaseMock.from.mockReturnValue(chain)

    await grantInitialCredits(supabaseMock as never, 'user-1')

    expect(supabaseMock.from).toHaveBeenCalledWith('credit_transactions')
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      delta: 10,
      source: 'initial_grant',
      reason: '新用户初始额度',
    })
  })

  it('charges a completed analysis with the database RPC', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: true, error: null })

    await chargeAnalysisCredit('analysis-1')

    expect(supabaseMock.rpc).toHaveBeenCalledWith('charge_analysis_credit', { p_analysis_id: 'analysis-1' })
  })

  it('maps RPC insufficient credit errors', async () => {
    supabaseMock.rpc.mockResolvedValue({
      data: null,
      error: { message: '可用分析次数不足，请联系管理员增加额度。' },
    })

    await expect(chargeAnalysisCredit('analysis-1')).rejects.toThrow('可用分析次数不足')
  })

  it('records failed analysis errors', async () => {
    const chain = tableMock({ data: null, error: null })
    supabaseMock.from.mockReturnValue(chain)

    await recordAnalysisFailure('analysis-1', new Error('Mimo failed'))

    expect(chain.update).toHaveBeenCalledWith({ status: 'failed', error_message: 'Mimo failed' })
  })
})
