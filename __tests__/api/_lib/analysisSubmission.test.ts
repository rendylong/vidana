import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  activeTaskLimit: vi.fn(() => 3),
  enqueueAnalysis: vi.fn(async () => 'message-1'),
  countActiveAnalysisTasks: vi.fn(async () => 0),
  createAnalysis: vi.fn(async () => ({ id: 'analysis-1' })),
  updateAnalysis: vi.fn(async () => {}),
}))

vi.mock('../../../api/_lib/analysisQueue', () => ({
  activeTaskLimit: mocks.activeTaskLimit,
  enqueueAnalysis: mocks.enqueueAnalysis,
}))

vi.mock('../../../api/_lib/supabase', () => ({
  countActiveAnalysisTasks: mocks.countActiveAnalysisTasks,
  createAnalysis: mocks.createAnalysis,
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
    mocks.countActiveAnalysisTasks.mockReset().mockResolvedValue(0)
    mocks.createAnalysis.mockReset().mockResolvedValue({ id: 'analysis-1' })
    mocks.updateAnalysis.mockReset().mockResolvedValue(undefined)
  })

  it('creates a pending analysis, marks it queued, enqueues it, and returns the analysis id', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T10:00:00.000Z'))
    const { submitAnalysisJob } = await import('../../../api/_lib/analysisSubmission')

    const result = await submitAnalysisJob(input())

    expect(result).toEqual({ analysisId: 'analysis-1' })
    expect(mocks.countActiveAnalysisTasks).toHaveBeenCalledWith('user-1')
    expect(mocks.createAnalysis).toHaveBeenCalledWith('user-1', 'user-1/video.mp4', {
      targetAudience: '二三线城市 30-50 岁男性',
      platform: '抖音',
      context: '新品首投',
      analysisType: 'analysis',
    })
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', {
      status: 'queued',
      queued_at: '2026-05-08T10:00:00.000Z',
      attempt_count: 0,
      max_attempts: 3,
      error_message: null,
    })
    expect(mocks.enqueueAnalysis).toHaveBeenCalledWith({
      analysisId: 'analysis-1',
      userId: 'user-1',
      queuedAt: '2026-05-08T10:00:00.000Z',
    })
  })

  it('rejects when the user has reached the active task limit without creating or enqueueing', async () => {
    mocks.countActiveAnalysisTasks.mockResolvedValue(3)
    const { ActiveAnalysisLimitError, submitAnalysisJob } = await import('../../../api/_lib/analysisSubmission')

    await expect(submitAnalysisJob(input())).rejects.toThrow(ActiveAnalysisLimitError)
    await expect(submitAnalysisJob(input())).rejects.toThrow('当前排队或分析中的任务已达到 3 个，请等待已有任务完成后再提交。')

    expect(mocks.createAnalysis).not.toHaveBeenCalled()
    expect(mocks.updateAnalysis).not.toHaveBeenCalled()
    expect(mocks.enqueueAnalysis).not.toHaveBeenCalled()
  })

  it('surfaces enqueue errors after the analysis has been marked queued', async () => {
    mocks.enqueueAnalysis.mockRejectedValue(new Error('redis unavailable'))
    const { submitAnalysisJob } = await import('../../../api/_lib/analysisSubmission')

    await expect(submitAnalysisJob(input())).rejects.toThrow('redis unavailable')

    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'queued',
      attempt_count: 0,
      max_attempts: 3,
      error_message: null,
    }))
  })
})
