import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Analysis } from '../../api/_lib/types'

const mocks = vi.hoisted(() => ({
  getBlockingRedis: vi.fn(),
  getAnalysisById: vi.fn(),
  claimAnalysisForProcessing: vi.fn(),
  claimStaleAnalysisForProcessing: vi.fn(),
  updateAnalysis: vi.fn(),
  executeAnalysis: vi.fn(),
  enqueueAnalysisAfter: vi.fn(),
  promoteDueDelayedAnalyses: vi.fn(),
  isRetryableAnalysisError: vi.fn(),
  backoffMsForAttempt: vi.fn(),
}))

vi.mock('../../api/_lib/redis', () => ({
  getBlockingRedis: mocks.getBlockingRedis,
}))

vi.mock('../../api/_lib/supabase', () => ({
  getAnalysisById: mocks.getAnalysisById,
  claimAnalysisForProcessing: mocks.claimAnalysisForProcessing,
  claimStaleAnalysisForProcessing: mocks.claimStaleAnalysisForProcessing,
  updateAnalysis: mocks.updateAnalysis,
}))

vi.mock('../../api/_lib/analysisExecution', () => ({
  executeAnalysis: mocks.executeAnalysis,
}))

vi.mock('../../api/_lib/analysisQueue', () => ({
  queueNames: () => ({
    stream: 'vidana:analysis:queue',
    group: 'vidana-workers',
    delayed: 'vidana:analysis:delayed',
  }),
  enqueueAnalysisAfter: mocks.enqueueAnalysisAfter,
  promoteDueDelayedAnalyses: mocks.promoteDueDelayedAnalyses,
}))

vi.mock('../../api/_lib/retryPolicy', () => ({
  errorMessage: (err: unknown) => err instanceof Error ? err.message : String(err),
  isRetryableAnalysisError: mocks.isRetryableAnalysisError,
  backoffMsForAttempt: mocks.backoffMsForAttempt,
}))

function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    id: 'analysis-1',
    user_id: 'user-1',
    analysis_type: 'analysis',
    video_url: 'user-1/video.mp4',
    video_duration: null,
    target_audience: '30 岁男性',
    platform: '抖音',
    context: '新品首投',
    status: 'queued',
    score: null,
    raw_result: null,
    report: null,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    error_message: null,
    credit_charged_at: null,
    created_at: '2026-05-08T10:00:00.000Z',
    completed_at: null,
    queued_at: '2026-05-08T10:00:00.000Z',
    started_at: null,
    attempt_count: 0,
    max_attempts: 3,
    next_retry_at: null,
    locked_by: null,
    locked_at: null,
    source_mode: null,
    ...overrides,
  }
}

function streamMessage(fields: string[] = ['analysisId', 'analysis-1', 'userId', 'user-1', 'queuedAt', '2026-05-08T10:00:00.000Z']) {
  return [['vidana:analysis:queue', [['1746688800000-0', fields]]]]
}

describe('analysis worker', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
    mocks.promoteDueDelayedAnalyses.mockResolvedValue(0)
    mocks.claimAnalysisForProcessing.mockResolvedValue(true)
    mocks.claimStaleAnalysisForProcessing.mockResolvedValue(true)
    mocks.updateAnalysis.mockResolvedValue(undefined)
    mocks.executeAnalysis.mockResolvedValue({})
    mocks.enqueueAnalysisAfter.mockResolvedValue(1)
    mocks.isRetryableAnalysisError.mockReturnValue(false)
    mocks.backoffMsForAttempt.mockReturnValue(30_000)
  })

  it('claims a queued task, executes it with lockedBy, and xacks after success', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis())

    const { processOneBatch } = await import('../../worker/analysisWorker')
    const result = await processOneBatch({ consumerName: 'worker-1' })

    expect(result).toEqual({ processed: 1 })
    expect(mocks.promoteDueDelayedAnalyses.mock.invocationCallOrder[0])
      .toBeLessThan(redis.xautoclaim.mock.invocationCallOrder[0])
    expect(redis.xautoclaim.mock.invocationCallOrder[0])
      .toBeLessThan(redis.xreadgroup.mock.invocationCallOrder[0])
    expect(mocks.claimAnalysisForProcessing).toHaveBeenCalledWith('analysis-1', 'worker-1')
    expect(mocks.executeAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      analysisId: 'analysis-1',
      userId: 'user-1',
      storagePath: 'user-1/video.mp4',
      targetAudience: '30 岁男性',
      platform: '抖音',
      context: '新品首投',
      lockedBy: 'worker-1',
    }))
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688800000-0')
  })

  it('increments attempt, queues a delayed retry for retryable errors, then xacks', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    const err = new Error('Mimo API error 500')
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis({ attempt_count: 0, max_attempts: 3 }))
    mocks.executeAnalysis.mockRejectedValue(err)
    mocks.isRetryableAnalysisError.mockReturnValue(true)

    const { processOneBatch } = await import('../../worker/analysisWorker')
    const result = await processOneBatch({ consumerName: 'worker-1' })

    expect(result).toEqual({ processed: 1 })
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'queued',
      attempt_count: 1,
      error_message: 'Mimo API error 500',
      locked_by: null,
      locked_at: null,
      started_at: null,
    }))
    expect(mocks.updateAnalysis.mock.calls[0][1].next_retry_at).toEqual(expect.any(String))
    expect(mocks.enqueueAnalysisAfter).toHaveBeenCalledWith({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T10:00:00.000Z',
    }, 30_000)
    expect(mocks.enqueueAnalysisAfter.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.updateAnalysis.mock.invocationCallOrder[0])
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688800000-0')
  })

  it('marks final failure and xacks when the error is not retryable', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis({ attempt_count: 1, max_attempts: 3 }))
    mocks.executeAnalysis.mockRejectedValue(new Error('invalid video'))
    mocks.isRetryableAnalysisError.mockReturnValue(false)

    const { processOneBatch } = await import('../../worker/analysisWorker')
    await processOneBatch({ consumerName: 'worker-1' })

    expect(mocks.enqueueAnalysisAfter).not.toHaveBeenCalled()
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'failed',
      attempt_count: 2,
      error_message: 'invalid video',
      locked_by: null,
      locked_at: null,
      next_retry_at: null,
    }))
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688800000-0')
  })

  it('xacks terminal analyses without claiming or executing them', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis({ status: 'completed' }))

    const { processOneBatch } = await import('../../worker/analysisWorker')
    await processOneBatch({ consumerName: 'worker-1' })

    expect(mocks.claimAnalysisForProcessing).not.toHaveBeenCalled()
    expect(mocks.executeAnalysis).not.toHaveBeenCalled()
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688800000-0')
  })

  it('xacks missing analyses without claiming or executing them', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(null)

    const { processOneBatch } = await import('../../worker/analysisWorker')
    await processOneBatch({ consumerName: 'worker-1' })

    expect(mocks.claimAnalysisForProcessing).not.toHaveBeenCalled()
    expect(mocks.executeAnalysis).not.toHaveBeenCalled()
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688800000-0')
  })

  it('does not execute or xack a pending processing analysis when the DB lock is fresh', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', [['1746688700000-0', ['analysisId', 'analysis-1']]]]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis({ status: 'processing', locked_by: 'live-worker' }))
    mocks.claimStaleAnalysisForProcessing.mockResolvedValue(false)

    const { processOneBatch } = await import('../../worker/analysisWorker')
    const result = await processOneBatch({ consumerName: 'worker-1' })

    expect(result).toEqual({ processed: 0 })
    expect(mocks.claimStaleAnalysisForProcessing).toHaveBeenCalledWith(
      'analysis-1',
      'worker-1',
      expect.any(String),
    )
    expect(mocks.claimAnalysisForProcessing).not.toHaveBeenCalled()
    expect(mocks.executeAnalysis).not.toHaveBeenCalled()
    expect(redis.xack).not.toHaveBeenCalled()
    expect(redis.xreadgroup).not.toHaveBeenCalled()
  })

  it('recovers one DB-stale pending processing message before reading new messages', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', [['1746688700000-0', ['analysisId', 'analysis-1']]]]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis({ status: 'processing', locked_by: 'old-worker' }))

    const { processOneBatch } = await import('../../worker/analysisWorker')
    const result = await processOneBatch({ consumerName: 'worker-1' })

    expect(result).toEqual({ processed: 1 })
    expect(redis.xautoclaim).toHaveBeenCalledWith(
      'vidana:analysis:queue',
      'vidana-workers',
      'worker-1',
      60_000,
      '0-0',
      'COUNT',
      1,
    )
    expect(redis.xreadgroup).not.toHaveBeenCalled()
    expect(mocks.claimAnalysisForProcessing).not.toHaveBeenCalled()
    expect(mocks.claimStaleAnalysisForProcessing).toHaveBeenCalledWith(
      'analysis-1',
      'worker-1',
      expect.any(String),
    )
    expect(mocks.executeAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      analysisId: 'analysis-1',
      lockedBy: 'worker-1',
    }))
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688700000-0')
  })

  it('marks failed and xacks after DB failure update when retry scheduling fails', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis({ attempt_count: 0, max_attempts: 3 }))
    mocks.executeAnalysis.mockRejectedValue(new Error('Mimo API error 500'))
    mocks.isRetryableAnalysisError.mockReturnValue(true)
    mocks.enqueueAnalysisAfter.mockRejectedValue(new Error('redis unavailable'))

    const { processOneBatch } = await import('../../worker/analysisWorker')
    await processOneBatch({ consumerName: 'worker-1' })

    expect(mocks.updateAnalysis).toHaveBeenCalledTimes(1)
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'failed',
      attempt_count: 1,
      error_message: 'Retry scheduling failed: redis unavailable; original error: Mimo API error 500',
      locked_by: null,
      locked_at: null,
      next_retry_at: null,
    }))
    expect(mocks.updateAnalysis.mock.invocationCallOrder[0])
      .toBeLessThan(redis.xack.mock.invocationCallOrder[0])
  })

  it('passes configured public origin into executeAnalysis', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    vi.stubEnv('VIDANA_PUBLIC_ORIGIN', 'https://vidana.example.com')
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis())

    const { processOneBatch } = await import('../../worker/analysisWorker')
    await processOneBatch({ consumerName: 'worker-1' })

    expect(mocks.executeAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'https://vidana.example.com',
    }))
  })

  it('xacks and skips execution when queued claim loses the race', async () => {
    const redis = {
      xautoclaim: vi.fn().mockResolvedValue(['0-0', []]),
      xreadgroup: vi.fn().mockResolvedValue(streamMessage()),
      xack: vi.fn().mockResolvedValue(1),
    }
    mocks.getBlockingRedis.mockReturnValue(redis)
    mocks.getAnalysisById.mockResolvedValue(analysis())
    mocks.claimAnalysisForProcessing.mockResolvedValue(false)

    const { processOneBatch } = await import('../../worker/analysisWorker')
    await processOneBatch({ consumerName: 'worker-1' })

    expect(mocks.executeAnalysis).not.toHaveBeenCalled()
    expect(redis.xack).toHaveBeenCalledWith('vidana:analysis:queue', 'vidana-workers', '1746688800000-0')
  })
})
