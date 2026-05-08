import { activeTaskLimit, enqueueAnalysis } from './analysisQueue'
import { createQueuedAnalysisJob, updateAnalysis } from './supabase'
import type { Analysis, AnalysisType } from './types'

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

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export async function submitAnalysisJob(input: SubmitAnalysisJobInput): Promise<{ analysisId: string }> {
  const limit = activeTaskLimit()
  const analysisType = input.analysisType || 'analysis'

  let analysis: Analysis
  try {
    analysis = await createQueuedAnalysisJob({
      userId: input.userId,
      videoUrl: input.storagePath,
      targetAudience: input.targetAudience,
      platform: input.platform,
      context: input.context,
      analysisType,
      activeLimit: limit,
    })
  } catch (error) {
    if (errorMessage(error).includes('ACTIVE_ANALYSIS_LIMIT_EXCEEDED')) {
      throw new ActiveAnalysisLimitError(limit)
    }
    throw error
  }

  const queuedAt = analysis.queued_at || new Date().toISOString()

  try {
    await enqueueAnalysis({
      analysisId: analysis.id,
      userId: input.userId,
      queuedAt,
    })
  } catch (error) {
    await updateAnalysis(analysis.id, {
      status: 'failed',
      error_message: `Failed to enqueue analysis: ${errorMessage(error)}`,
    }).catch(() => undefined)
    throw error
  }

  return { analysisId: analysis.id }
}
