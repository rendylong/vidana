import { describe, expect, it } from 'vitest'
import { backoffMsForAttempt, isRetryableAnalysisError } from '../../../api/_lib/retryPolicy'

describe('analysis retry policy', () => {
  it.each([
    ['Mimo API error 429'],
    ['Mimo API error 500'],
    ['failed to download url data'],
    ['empty response'],
    [new DOMException('The operation timed out.', 'AbortError')],
  ])('retries transient analysis errors: %s', err => {
    expect(isRetryableAnalysisError(err)).toBe(true)
  })

  it.each([
    ['Unsupported video format'],
    ['video file is required'],
    ['Missing MIMO_API_KEY'],
    ['可用分析次数不足，请联系管理员增加额度。'],
  ])('does not retry permanent analysis errors: %s', err => {
    expect(isRetryableAnalysisError(err)).toBe(false)
  })

  it('uses planned backoff windows by attempt number', () => {
    expect(backoffMsForAttempt(1)).toBe(30_000)
    expect(backoffMsForAttempt(2)).toBe(120_000)
    expect(backoffMsForAttempt(3)).toBe(600_000)
    expect(backoffMsForAttempt(4)).toBe(600_000)
  })
})
