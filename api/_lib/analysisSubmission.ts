import { activeTaskLimit, enqueueAnalysis } from './analysisQueue'
import { countActiveAnalysisTasks, createAnalysis, updateAnalysis } from './supabase'
import type { AnalysisType } from './types'

export class ActiveAnalysisLimitError extends Error {
  constructor(limit: number) {
    super(`当前排队或分析中的任务已达到 ${limit} 个，请等待已有任务完成后再提交。`)
    this.name = 'ActiveAnalysisLimitError'
  }
}

export interface SubmitAnalysisJobInput {
  userId: string
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
  analysisType?: AnalysisType
}

export async function submitAnalysisJob(input: SubmitAnalysisJobInput): Promise<{ analysisId: string }> {
  const limit = activeTaskLimit()
  const activeTasks = await countActiveAnalysisTasks(input.userId)
  if (activeTasks >= limit) {
    throw new ActiveAnalysisLimitError(limit)
  }

  const analysisType = input.analysisType || 'analysis'
  const analysis = await createAnalysis(input.userId, input.storagePath, {
    targetAudience: input.targetAudience,
    platform: input.platform,
    context: input.context,
    analysisType,
  })
  const queuedAt = new Date().toISOString()

  await updateAnalysis(analysis.id, {
    status: 'queued',
    queued_at: queuedAt,
    attempt_count: 0,
    max_attempts: 3,
    error_message: null,
  })
  await enqueueAnalysis({
    analysisId: analysis.id,
    userId: input.userId,
    queuedAt,
  })

  return { analysisId: analysis.id }
}
