import { getRedis } from './redis'

const DEFAULT_STREAM = 'vidana:analysis:queue'
const DEFAULT_GROUP = 'vidana-workers'
const DEFAULT_ACTIVE_TASK_LIMIT = 3

export interface EnqueueAnalysisInput {
  analysisId: string
  userId: string
  queuedAt: string
}

export function queueNames() {
  return {
    stream: process.env.ANALYSIS_QUEUE_STREAM || DEFAULT_STREAM,
    group: process.env.ANALYSIS_QUEUE_GROUP || DEFAULT_GROUP,
  }
}

export function activeTaskLimit(): number {
  const parsed = Number.parseInt(process.env.ANALYSIS_ACTIVE_LIMIT_PER_USER || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ACTIVE_TASK_LIMIT
}

export async function enqueueAnalysis(input: EnqueueAnalysisInput): Promise<string | null> {
  const redis = getRedis()
  return redis.xadd(
    queueNames().stream,
    '*',
    'analysisId',
    input.analysisId,
    'userId',
    input.userId,
    'queuedAt',
    input.queuedAt,
  )
}

export function enqueueAnalysisAfter(input: EnqueueAnalysisInput, delayMs: number): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    enqueueAnalysis(input).catch(err => {
      console.error('Failed to enqueue delayed analysis', err)
    })
  }, delayMs)
}
