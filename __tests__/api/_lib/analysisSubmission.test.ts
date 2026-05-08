import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activeTaskLimit: vi.fn(() => 3),
  enqueueAnalysis: vi.fn(async () => 'message-1'),
  createQueuedAnalysisJob: vi.fn(async () => ({
    id: 'analysis-1',
    user_id: 'user-1',
    queued_at: '2026-05-08T10:00:00.000Z',
  })),
  updateAnalysis: vi.fn(async () => {}),
}))

vi.mock('../../../api/_lib/analysisQueue', () => ({
  activeTaskLimit: mocks.activeTaskLimit,
  enqueueAnalysis: mocks.enqueueAnalysis,
}))

vi.mock('../../../api/_lib/supabase', () => ({
  createQueuedAnalysisJob: mocks.createQueuedAnalysisJob,
  updateAnalysis: mocks.updateAnalysis,
}))

function input() {
  return {
    userId: 'user-1',
    storagePath: 'user-1/video.mp4',
    targetAudience: '二三线城市 30-50 岁男性',
    platform: '抖音',
    context: '新品首投',
  }
}

describe('submitAnalysisJob', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useRealTimers()
    mocks.activeTaskLimit.mockReset().mockReturnValue(3)
    mocks.enqueueAnalysis.mockReset().mockResolvedValue('message-1')
    mocks.createQueuedAnalysisJob.mockReset().mockResolvedValue({
      id: 'analysis-1',
      user_id: 'user-1',
      queued_at: '2026-05-08T10:00:00.000Z',
    })
    mocks.updateAnalysis.mockReset().mockResolvedValue(undefined)
  })

  it('creates a queued analysis job, enqueues it, and returns the analysis id', async () => {
    const { submitAnalysisJob } = await import('../../../api/_lib/analysisSubmission')

    const result = await submitAnalysisJob(input())

    expect(result).toEqual({ analysisId: 'analysis-1' })
    expect(mocks.createQueuedAnalysisJob).toHaveBeenCalledWith({
      userId: 'user-1',
      videoUrl: 'user-1/video.mp4',
      targetAudience: '二三线城市 30-50 岁男性',
      platform: '抖音',
      context: '新品首投',
      analysisType: 'analysis',
      activeLimit: 3,
    })
    expect(mocks.updateAnalysis).not.toHaveBeenCalled()
    expect(mocks.enqueueAnalysis).toHaveBeenCalledWith({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T10:00:00.000Z',
    })
  })

  it('maps active limit RPC errors and does not enqueue', async () => {
    mocks.createQueuedAnalysisJob.mockRejectedValue(new Error('ACTIVE_ANALYSIS_LIMIT_EXCEEDED'))
    const { ActiveAnalysisLimitError, submitAnalysisJob } = await import('../../../api/_lib/analysisSubmission')

    await expect(submitAnalysisJob(input())).rejects.toThrow(ActiveAnalysisLimitError)
    await expect(submitAnalysisJob(input())).rejects.toThrow('当前排队或分析中的任务已达到 3 个，请等待已有任务完成后再提交。')

    expect(mocks.updateAnalysis).not.toHaveBeenCalled()
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled()
  })

  it('marks the queued analysis failed and rethrows when enqueue fails', async () => {
    mocks.enqueueAnalysis.mockRejectedValue(new Error('redis unavailable'))
    const { submitAnalysisJob } = await import('../../../api/_lib/analysisSubmission')

    await expect(submitAnalysisJob(input())).rejects.toThrow('redis unavailable')

    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', {
      status: 'failed',
      error_message: 'Failed to enqueue analysis: redis unavailable',
    })
  })
})
