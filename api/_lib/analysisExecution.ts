import { buildAnalysisRequest, callMimoAPI, parseSSEStream } from './mimo'
import { buildAnalysisPrompt } from './prompts'
import { chargeAnalysisCredit, recordAnalysisFailure } from './credits'
import { getSignedUrl, getVideoDataUrl, updateAnalysis } from './supabase'
import type { Analysis, AnalysisReport, GlobalEdit, TimelineEdit } from './types'
import { buildVideoProxyUrl } from './videoAccess'

export type AnalysisSourceMode = 'signed-url' | 'proxy-url' | 'data-url'

export interface AnalysisPipelineProgress extends Record<string, unknown> {
  step: 'prepare' | 'analysis'
  message?: string
  chunk?: string
  sourceMode?: AnalysisSourceMode
}

export interface AnalysisPipelineRawResult extends Record<string, unknown> {
  fullResult: string
  sourceMode: AnalysisSourceMode
  errors: string[]
}

export interface AnalysisPipelineOutput {
  analysisId: string
  report: AnalysisReport
  rawResult: AnalysisPipelineRawResult
  sourceMode: AnalysisSourceMode
  errors: string[]
}

export interface ExecuteAnalysisInput {
  analysisId: string
  userId: string
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
  origin?: string | null
  lockedBy?: string
  onProgress?: (progress: AnalysisPipelineProgress) => void
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isEmptyResponseError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('empty response')
}

function isFailedUrlDownloadError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('failed to download url data')
}

function shouldRetryWithAlternateSource(err: unknown): boolean {
  return isFailedUrlDownloadError(err) || isEmptyResponseError(err)
}

function canUseProxyOrigin(origin: string | null | undefined): origin is string {
  if (!origin) return false
  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    return !['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(hostname)
  } catch {
    return false
  }
}

async function collectAnalysis(
  videoUrl: string,
  prompt: string,
  mode: AnalysisSourceMode,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const requestBody = buildAnalysisRequest(videoUrl, prompt)
  const response = await callMimoAPI(requestBody, mode === 'data-url' ? 0 : 1)
  let fullResult = ''
  for await (const chunk of parseSSEStream(response)) {
    fullResult += chunk
    onChunk?.(chunk)
  }
  if (!fullResult.trim()) throw new Error(`Mimo returned empty response via ${mode}`)
  return fullResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function severityValue(value: unknown): 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'medium'
}

function parseTimelineEdit(value: unknown): TimelineEdit | null {
  if (!isRecord(value)) return null
  return {
    timestamp: stringValue(value.timestamp),
    issue: stringValue(value.issue),
    action: stringValue(value.action),
    category: stringValue(value.category),
    severity: severityValue(value.severity),
  }
}

function parseGlobalEdit(value: unknown): GlobalEdit | null {
  if (!isRecord(value)) return null
  return {
    issue: stringValue(value.issue),
    action: stringValue(value.action),
    category: stringValue(value.category),
    severity: severityValue(value.severity),
  }
}

function scoreValue(value: unknown): number {
  const score = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function parseAnalysisReport(fullResult: string): AnalysisReport {
  try {
    const cleaned = fullResult.replace(/```(?:json)?\s*/gi, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON object found in Mimo response')

    const parsed: unknown = JSON.parse(jsonMatch[0])
    if (!isRecord(parsed)) throw new Error('Mimo response JSON is not an object')

    return {
      score: scoreValue(parsed.score),
      summary: stringValue(parsed.summary, fullResult),
      timelineEdits: Array.isArray(parsed.timelineEdits) ? parsed.timelineEdits.map(parseTimelineEdit).filter((edit): edit is TimelineEdit => Boolean(edit)) : [],
      globalEdits: Array.isArray(parsed.globalEdits) ? parsed.globalEdits.map(parseGlobalEdit).filter((edit): edit is GlobalEdit => Boolean(edit)) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item): item is string => typeof item === 'string') : [],
    }
  } catch {
    return { score: 0, summary: fullResult, timelineEdits: [], globalEdits: [], suggestions: [] }
  }
}

export async function executeAnalysis(input: ExecuteAnalysisInput): Promise<AnalysisPipelineOutput> {
  const errors: string[] = []

  try {
    const processingUpdate: Partial<Analysis> = {
      status: 'processing',
      started_at: new Date().toISOString(),
      locked_at: new Date().toISOString(),
    }
    if (input.lockedBy) processingUpdate.locked_by = input.lockedBy

    await updateAnalysis(input.analysisId, processingUpdate)

    const prompt = buildAnalysisPrompt(input)

    let fullResult = ''
    let sourceMode: AnalysisSourceMode = 'signed-url'

    try {
      input.onProgress?.({ step: 'analysis', message: '正在逐场景分析视频...', sourceMode })
      const videoUrl = await getSignedUrl(input.storagePath)
      fullResult = await collectAnalysis(videoUrl, prompt, sourceMode, (chunk) => {
        input.onProgress?.({ step: 'analysis', chunk, sourceMode })
      })
    } catch (err) {
      errors.push(errorMessage(err))
      if (!shouldRetryWithAlternateSource(err)) throw err
    }

    if (!fullResult && canUseProxyOrigin(input.origin)) {
      sourceMode = 'proxy-url'
      try {
        input.onProgress?.({ step: 'analysis', message: '云端链接读取失败，正在改用代理链接重试...', sourceMode })
        fullResult = await collectAnalysis(buildVideoProxyUrl(input.origin, input.storagePath), prompt, sourceMode, (chunk) => {
          input.onProgress?.({ step: 'analysis', chunk, sourceMode })
        })
      } catch (err) {
        errors.push(errorMessage(err))
      }
    }

    if (!fullResult) {
      sourceMode = 'data-url'
      try {
        input.onProgress?.({ step: 'analysis', message: '代理链接未返回内容，正在改用直传数据重试...', sourceMode })
        fullResult = await collectAnalysis(await getVideoDataUrl(input.storagePath), prompt, sourceMode, (chunk) => {
          input.onProgress?.({ step: 'analysis', chunk, sourceMode })
        })
      } catch (err) {
        errors.push(errorMessage(err))
      }
    }

    if (!fullResult) {
      const message = `Mimo did not return analysis content. Attempts: ${errors.join(' | ')}`
      throw new Error(message)
    }

    const report = parseAnalysisReport(fullResult)
    const rawResult: AnalysisPipelineRawResult = { fullResult, sourceMode, errors }
    await chargeAnalysisCredit(input.analysisId)
    await updateAnalysis(input.analysisId, {
      status: 'completed',
      score: report.score,
      report,
      raw_result: rawResult,
      completed_at: new Date().toISOString(),
      source_mode: sourceMode,
    })

    return { analysisId: input.analysisId, report, rawResult, sourceMode, errors }
  } catch (err) {
    await recordAnalysisFailure(input.analysisId, err).catch(() => {})
    throw err
  }
}
