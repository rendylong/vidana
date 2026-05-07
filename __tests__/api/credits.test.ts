import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    from: vi.fn(),
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

    await grantInitialCredits('user-1')

    expect(supabaseMock.from).toHaveBeenCalledWith('credit_transactions')
    expect(chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      delta: 10,
      source: 'initial_grant',
      reason: '新用户初始额度',
    })
  })

  it('charges a completed analysis only when not already charged', async () => {
    const analysisChain = tableMock({ data: { user_id: 'user-1', credit_charged_at: null }, error: null })
    const userChain = tableMock({ data: { analysis_credits: 3 }, error: null })
    const updateUserChain = tableMock({ data: null, error: null })
    const transactionChain = tableMock({ data: null, error: null })
    const updateAnalysisChain = tableMock({ data: null, error: null })
    supabaseMock.from
      .mockReturnValueOnce(analysisChain)
      .mockReturnValueOnce(userChain)
      .mockReturnValueOnce(updateUserChain)
      .mockReturnValueOnce(transactionChain)
      .mockReturnValueOnce(updateAnalysisChain)

    await chargeAnalysisCredit('analysis-1')

    expect(updateUserChain.update).toHaveBeenCalledWith({ analysis_credits: 2 })
    expect(transactionChain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      delta: -1,
      source: 'analysis_success',
      analysis_id: 'analysis-1',
      reason: '分析成功扣减',
    })
    expect(updateAnalysisChain.update).toHaveBeenCalledWith(expect.objectContaining({ credit_charged_at: expect.any(String) }))
  })

  it('skips already charged analyses', async () => {
    const analysisChain = tableMock({ data: { user_id: 'user-1', credit_charged_at: '2026-05-07T00:00:00.000Z' }, error: null })
    supabaseMock.from.mockReturnValueOnce(analysisChain)

    await chargeAnalysisCredit('analysis-1')

    expect(supabaseMock.from).toHaveBeenCalledTimes(1)
  })

  it('records failed analysis errors', async () => {
    const chain = tableMock({ data: null, error: null })
    supabaseMock.from.mockReturnValue(chain)

    await recordAnalysisFailure('analysis-1', new Error('Mimo failed'))

    expect(chain.update).toHaveBeenCalledWith({ status: 'failed', error_message: 'Mimo failed' })
  })
})
