import { getRedis } from './redis'

const DEFAULT_STREAM = 'vidana:analysis:queue'
const DEFAULT_GROUP = 'vidana-workers'
const DEFAULT_DELAYED = 'vidana:analysis:delayed'
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
    delayed: process.env.ANALYSIS_QUEUE_DELAYED || DEFAULT_DELAYED,
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

export async function enqueueAnalysisAfter(input: EnqueueAnalysisInput, delayMs: number): Promise<number> {
  const score = Date.now() + delayMs
  return getRedis().zadd(queueNames().delayed, score, JSON.stringify(input))
}

function parseDelayedAnalysisPayload(value: string): EnqueueAnalysisInput | null {
  try {
    const parsed = JSON.parse(value) as Partial<EnqueueAnalysisInput>
    if (
      typeof parsed.analysisId === 'string' &&
      typeof parsed.userId === 'string' &&
      typeof parsed.queuedAt === 'string'
    ) {
      return {
        analysisId: parsed.analysisId,
        userId: parsed.userId,
        queuedAt: parsed.queuedAt,
      }
    }
  } catch {
    return null
  }
  return null
}

export async function promoteDueDelayedAnalyses(nowMs = Date.now(), limit = 20): Promise<number> {
  const redis = getRedis()
  const names = queueNames()
  const items = await redis.zrangebyscore(names.delayed, '-inf', nowMs, 'LIMIT', 0, limit)
  let promoted = 0

  for (const item of items) {
    const input = parseDelayedAnalysisPayload(item)
    if (!input) {
      await redis.zrem(names.delayed, item)
      continue
    }

    await redis.xadd(
      names.stream,
      '*',
      'analysisId',
      input.analysisId,
      'userId',
      input.userId,
      'queuedAt',
      input.queuedAt,
    )
    await redis.zrem(names.delayed, item)
    promoted += 1
  }

  return promoted
}
