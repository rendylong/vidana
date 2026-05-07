import { describe, expect, it } from 'vitest'

import { calculateTrendPercent, getRangeWindow } from '../../api/_lib/adminData'

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
})
