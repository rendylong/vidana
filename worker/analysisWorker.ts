import { pathToFileURL } from 'node:url'
import { enqueueAnalysisAfter, promoteDueDelayedAnalyses, queueNames } from '../api/_lib/analysisQueue'
import { executeAnalysis } from '../api/_lib/analysisExecution'
import { getBlockingRedis } from '../api/_lib/redis'
import { backoffMsForAttempt, errorMessage, isRetryableAnalysisError } from '../api/_lib/retryPolicy'
import { claimAnalysisForProcessing, getAnalysisById, updateAnalysis } from '../api/_lib/supabase'
import type { Analysis } from '../api/_lib/types'

const DEFAULT_BLOCK_MS = 5_000
const DEFAULT_PENDING_IDLE_MS = 60_000
const DEFAULT_CONSUMER_PREFIX = 'analysis-worker'

type StreamFields = string[]
type StreamMessage = [string, StreamFields]
type StreamResponse = Array<[string, StreamMessage[]]> | null

export interface ProcessOneBatchOptions {
  consumerName?: string
  blockMs?: number
  pendingIdleMs?: number
}

export interface ProcessOneBatchResult {
  processed: number
}

function consumerName(): string {
  return `${DEFAULT_CONSUMER_PREFIX}-${process.pid}`
}

function publicOrigin(): string | null {
  return process.env.VIDANA_PUBLIC_ORIGIN || process.env.VITE_APP_URL || null
}

function pendingIdleMs(): number {
  const parsed = Number.parseInt(process.env.ANALYSIS_PENDING_IDLE_MS || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PENDING_IDLE_MS
}

export function parseFields(fields: StreamFields): Record<string, string> {
  const parsed: Record<string, string> = {}
  for (let i = 0; i < fields.length; i += 2) {
    const key = fields[i]
    const value = fields[i + 1]
    if (typeof key === 'string' && typeof value === 'string') parsed[key] = value
  }
  return parsed
}

function isTerminalAnalysis(analysis: Analysis): boolean {
  return ['completed', 'failed', 'canceled'].includes(analysis.status)
}

function queuedAtFor(analysis: Analysis): string {
  return analysis.queued_at || analysis.created_at || new Date().toISOString()
}

async function ack(messageId: string): Promise<void> {
  const redis = getBlockingRedis()
  const names = queueNames()
  await redis.xack(names.stream, names.group, messageId)
}

async function retryAnalysis(analysis: Analysis, err: unknown, nextAttempt: number): Promise<void> {
  const delayMs = backoffMsForAttempt(nextAttempt)
  const nextRetryAt = new Date(Date.now() + delayMs).toISOString()
  const message = errorMessage(err)

  try {
    await enqueueAnalysisAfter({
      analysisId: analysis.id,
      userId: analysis.user_id,
      queuedAt: queuedAtFor(analysis),
    }, delayMs)
  } catch (scheduleError) {
    await failAnalysis(
      analysis,
      new Error(`Retry scheduling failed: ${errorMessage(scheduleError)}; original error: ${message}`),
      nextAttempt,
    )
    return
  }

  await updateAnalysis(analysis.id, {
    status: 'queued',
    attempt_count: nextAttempt,
    next_retry_at: nextRetryAt,
    error_message: message,
    locked_by: null,
    locked_at: null,
    started_at: null,
  })
}

async function failAnalysis(analysis: Analysis, err: unknown, nextAttempt: number): Promise<void> {
  await updateAnalysis(analysis.id, {
    status: 'failed',
    attempt_count: nextAttempt,
    error_message: errorMessage(err),
    next_retry_at: null,
    locked_by: null,
    locked_at: null,
  })
}

async function handleMessage(messageId: string, fields: StreamFields, workerId: string, fromPending = false): Promise<void> {
  const payload = parseFields(fields)
  const analysisId = payload.analysisId
  if (!analysisId) {
    await ack(messageId)
    return
  }

  const analysis = await getAnalysisById(analysisId)
  if (!analysis || isTerminalAnalysis(analysis)) {
    await ack(messageId)
    return
  }

  if (fromPending && analysis.status === 'processing') {
    await updateAnalysis(analysis.id, {
      status: 'processing',
      locked_by: workerId,
      locked_at: new Date().toISOString(),
    })
  } else if (analysis.status === 'queued') {
    const claimed = await claimAnalysisForProcessing(analysis.id, workerId)
    if (!claimed) {
      await ack(messageId)
      return
    }
  } else {
    await ack(messageId)
    return
  }

  try {
    await executeAnalysis({
      analysisId: analysis.id,
      userId: analysis.user_id,
      storagePath: analysis.video_url,
      targetAudience: analysis.target_audience || undefined,
      platform: analysis.platform || undefined,
      context: analysis.context || undefined,
      origin: publicOrigin(),
      lockedBy: workerId,
    })
  } catch (err) {
    const nextAttempt = analysis.attempt_count + 1
    if (isRetryableAnalysisError(err) && nextAttempt < analysis.max_attempts) {
      await retryAnalysis(analysis, err, nextAttempt)
    } else {
      await failAnalysis(analysis, err, nextAttempt)
    }
  }

  await ack(messageId)
}

async function processPendingBatch(workerId: string, minIdleMs: number): Promise<boolean> {
  const redis = getBlockingRedis()
  const names = queueNames()
  const response = await redis.xautoclaim(
    names.stream,
    names.group,
    workerId,
    minIdleMs,
    '0-0',
    'COUNT',
    1,
  ) as [string, StreamMessage[]]

  const message = response?.[1]?.[0]
  if (!message) return false

  await handleMessage(message[0], message[1], workerId, true)
  return true
}

export async function ensureGroup(): Promise<void> {
  const redis = getBlockingRedis()
  const names = queueNames()
  try {
    await redis.xgroup('CREATE', names.stream, names.group, '0', 'MKSTREAM')
  } catch (err) {
    if (!errorMessage(err).includes('BUSYGROUP')) throw err
  }
}

export async function processOneBatch(options: ProcessOneBatchOptions = {}): Promise<ProcessOneBatchResult> {
  await promoteDueDelayedAnalyses()

  const redis = getBlockingRedis()
  const names = queueNames()
  const workerId = options.consumerName || consumerName()

  if (await processPendingBatch(workerId, options.pendingIdleMs ?? pendingIdleMs())) {
    return { processed: 1 }
  }

  const response = await redis.xreadgroup(
    'GROUP',
    names.group,
    workerId,
    'COUNT',
    1,
    'BLOCK',
    options.blockMs ?? DEFAULT_BLOCK_MS,
    'STREAMS',
    names.stream,
    '>',
  ) as StreamResponse

  const message = response?.[0]?.[1]?.[0]
  if (!message) return { processed: 0 }

  await handleMessage(message[0], message[1], workerId)
  return { processed: 1 }
}

export async function main(): Promise<void> {
  await ensureGroup()
  const workerId = consumerName()
  for (;;) {
    await processOneBatch({ consumerName: workerId })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[analysis-worker] fatal error', err)
    process.exit(1)
  })
}
