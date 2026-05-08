import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getRedisMock } = vi.hoisted(() => ({ getRedisMock: vi.fn() }))

vi.mock('../../../api/_lib/redis', () => ({ getRedis: getRedisMock }))

describe('analysis queue helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    getRedisMock.mockReset()
    delete process.env.ANALYSIS_QUEUE_STREAM
    delete process.env.ANALYSIS_QUEUE_GROUP
    delete process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER
  })

  it('uses the default queue stream and group names', async () => {
    const { queueNames } = await import('../../../api/_lib/analysisQueue')

    expect(queueNames()).toEqual({
      stream: 'vidana:analysis:queue',
      group: 'vidana-workers',
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
})
