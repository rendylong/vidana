import { beforeEach, describe, expect, it, vi } from 'vitest'

const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    rpc: vi.fn(),
  },
}))

vi.mock('../../api/_lib/supabase', () => ({
  getSupabase: () => supabaseMock,
}))

const {
  adjustUserCredits,
  calculateTrendPercent,
  getPaginationWindow,
  getRangeWindow,
} = await import('../../api/_lib/adminData')

describe('admin data service', () => {
  beforeEach(() => {
    supabaseMock.rpc.mockReset()
  })

  it('adjusts user credits through the atomic database RPC', async () => {
    const transaction = {
      id: 'tx-1',
      user_id: 'user-1',
      delta: 3,
      reason: '补充测试额度',
      source: 'admin_adjustment',
      analysis_id: null,
      created_at: '2026-05-07T12:00:00.000Z',
    }
    supabaseMock.rpc.mockResolvedValue({
      data: { analysis_credits: 13, transaction },
      error: null,
    })

    await expect(adjustUserCredits('user-1', 3, ' 补充测试额度 ')).resolves.toEqual({
      analysis_credits: 13,
      transaction,
    })
    expect(supabaseMock.rpc).toHaveBeenCalledWith('adjust_user_credits', {
      p_user_id: 'user-1',
      p_delta: 3,
      p_reason: '补充测试额度',
    })
  })
})

describe('admin data helpers', () => {
  it('builds an Asia/Shanghai day window for today', () => {
    const window = getRangeWindow('today', new Date('2026-05-07T12:00:00+08:00'))

    expect(window.currentStart.toISOString()).toBe('2026-05-06T16:00:00.000Z')
    expect(window.currentEnd.toISOString()).toBe('2026-05-07T16:00:00.000Z')
    expect(window.previousStart.toISOString()).toBe('2026-05-05T16:00:00.000Z')
    expect(window.previousEnd.toISOString()).toBe('2026-05-06T16:00:00.000Z')
  })

  it('builds rolling 7 day windows from the current instant', () => {
    const window = getRangeWindow('7d', new Date('2026-05-07T12:00:00Z'))

    expect(window.currentEnd.toISOString()).toBe('2026-05-07T12:00:00.000Z')
    expect(window.currentStart.toISOString()).toBe('2026-04-30T12:00:00.000Z')
    expect(window.previousStart.toISOString()).toBe('2026-04-23T12:00:00.000Z')
  })

  it.each([
    [120, 100, 20],
    [80, 100, -20],
    [5, 0, null],
    [0, 0, 0],
  ])('calculates trend percent for %s against %s', (current, previous, expected) => {
    expect(calculateTrendPercent(current, previous)).toBe(expected)
  })

  it('normalizes invalid pagination and caps page size', () => {
    expect(getPaginationWindow(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      page: 1,
      pageSize: 20,
      from: 0,
      to: 19,
    })
    expect(getPaginationWindow(2.9, 999)).toEqual({
      page: 2,
      pageSize: 50,
      from: 50,
      to: 99,
    })
  })
})
