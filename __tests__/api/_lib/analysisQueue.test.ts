import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }))

vi.mock('../../../api/_lib/redis', () => ({ getRedis: getRedisMock }))

describe('analysis queue helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    getRedisMock.mockReset()
    vi.restoreAllMocks()
    delete process.env.ANALYSIS_QUEUE_STREAM
    delete process.env.ANALYSIS_QUEUE_GROUP
    delete process.env.ANALYSIS_QUEUE_DELAYED
    delete process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER
  })

  it('uses the default queue stream, group, and delayed queue names', async () => {
    const { queueNames } = await import('../../../api/_lib/analysisQueue')

    expect(queueNames()).toEqual({
      stream: 'vidana:analysis:queue',
      group: 'vidana-workers',
      delayed: 'vidana:analysis:delayed',
    })
  })

  it('reads the per-user active task limit from env', async () => {
    process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER = '5'
    const { activeTaskLimit } = await import('../../../api/_lib/analysisQueue')

    expect(activeTaskLimit()).toBe(5)
  })

  it('enqueues an analysis with the minimal stream payload', async () => {
    const xadd = vi.fn().mockResolvedValue('message-1')
    getRedisMock.mockReturnValue({ xadd })
    const { enqueueAnalysis } = await import('../../../api/_lib/analysisQueue')

    const messageId = await enqueueAnalysis({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T00:00:00.000Z',
    })

    expect(messageId).toBe('message-1')
    expect(xadd).toHaveBeenCalledWith(
      'vidana:analysis:queue',
      '*',
      'analysisId',
      'analysis-1',
      'userId',
      'user-1',
      'queuedAt',
      '2026-05-08T00:00:00.000Z',
    )
  })

  it('enqueues delayed analyses into a Redis sorted set', async () => {
    const zadd = vi.fn().mockResolvedValue(1)
    getRedisMock.mockReturnValue({ zadd })
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-05-08T00:00:00.000Z'))
    const { enqueueAnalysisAfter } = await import('../../../api/_lib/analysisQueue')

    const result = await enqueueAnalysisAfter({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T00:00:00.000Z',
    }, 120_000)

    expect(result).toBe(1)
    expect(zadd).toHaveBeenCalledWith(
      'vidana:analysis:delayed',
      Date.parse('2026-05-08T00:02:00.000Z'),
      JSON.stringify({
        analysisId: 'analysis-1',
        userId: 'user-1',
        queuedAt: '2026-05-08T00:00:00.000Z',
      }),
    )
  })

  it('promotes due delayed analyses to the main stream and removes them', async () => {
    const payload = JSON.stringify({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T00:00:00.000Z',
    })
    const xadd = vi.fn().mockResolvedValue('message-1')
    const zrem = vi.fn().mockResolvedValue(1)
    const zrangebyscore = vi.fn().mockResolvedValue([payload])
    getRedisMock.mockReturnValue({ xadd, zrem, zrangebyscore })
    const { promoteDueDelayedAnalyses } = await import('../../../api/_lib/analysisQueue')

    const promoted = await promoteDueDelayedAnalyses(Date.parse('2026-05-08T00:02:00.000Z'), 20)

    expect(promoted).toBe(1)
    expect(zrangebyscore).toHaveBeenCalledWith(
      'vidana:analysis:delayed',
      '-inf',
      Date.parse('2026-05-08T00:02:00.000Z'),
      'LIMIT',
      0,
      20,
    )
    expect(xadd).toHaveBeenCalledWith(
      'vidana:analysis:queue',
      '*',
      'analysisId',
      'analysis-1',
      'userId',
      'user-1',
      'queuedAt',
      '2026-05-08T00:00:00.000Z',
    )
    expect(zrem).toHaveBeenCalledWith('vidana:analysis:delayed', payload)
  })

  it('removes malformed delayed payloads without enqueueing them', async () => {
    const xadd = vi.fn()
    const zrem = vi.fn().mockResolvedValue(1)
    const zrangebyscore = vi.fn().mockResolvedValue(['not-json'])
    getRedisMock.mockReturnValue({ xadd, zrem, zrangebyscore })
    const { promoteDueDelayedAnalyses } = await import('../../../api/_lib/analysisQueue')

    const promoted = await promoteDueDelayedAnalyses(Date.parse('2026-05-08T00:02:00.000Z'), 20)

    expect(promoted).toBe(0)
    expect(xadd).not.toHaveBeenCalled()
    expect(zrem).toHaveBeenCalledWith('vidana:analysis:delayed', 'not-json')
  })

  it('leaves delayed payloads in place and surfaces enqueue failures', async () => {
    const payload = JSON.stringify({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T00:00:00.000Z',
    })
    const xadd = vi.fn().mockRejectedValue(new Error('redis unavailable'))
    const zrem = vi.fn()
    const zrangebyscore = vi.fn().mockResolvedValue([payload])
    getRedisMock.mockReturnValue({ xadd, zrem, zrangebyscore })
    const { promoteDueDelayedAnalyses } = await import('../../../api/_lib/analysisQueue')

    await expect(promoteDueDelayedAnalyses(Date.parse('2026-05-08T00:02:00.000Z'), 20))
      .rejects
      .toThrow('redis unavailable')

    expect(zrem).not.toHaveBeenCalled()
  })
})
