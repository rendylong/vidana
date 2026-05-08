import { createAnalysis } from './supabase'
import {
  executeAnalysis,
  parseAnalysisReport,
  type AnalysisPipelineOutput,
  type AnalysisPipelineProgress,
} from './analysisExecution'

export { parseAnalysisReport }
export type {
  AnalysisPipelineOutput,
  AnalysisPipelineProgress,
  AnalysisPipelineRawResult,
  AnalysisSourceMode,
} from './analysisExecution'

export interface AnalysisPipelineInput {
  userId: string
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
  origin?: string | null
  onProgress?: (progress: AnalysisPipelineProgress) => void
  onAnalysisCreated?: (analysisId: string) => void
}

export async function runAnalysisPipeline(input: AnalysisPipelineInput): Promise<AnalysisPipelineOutput> {
  input.onProgress?.({ step: 'prepare', message: '正在创建分析任务...' })
  const analysis = await createAnalysis(input.userId, input.storagePath, input)
  input.onAnalysisCreated?.(analysis.id)

  return executeAnalysis({
    analysisId: analysis.id,
    userId: input.userId,
    storagePath: input.storagePath,
    targetAudience: input.targetAudience,
    platform: input.platform,
    context: input.context,
    origin: input.origin,
    onProgress: input.onProgress,
  })
}
