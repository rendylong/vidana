import { buildAnalysisRequest, callMimoAPI, parseSSEStream } from './mimo'
import { buildBenchmarkPrompt } from './prompts'
import { chargeAnalysisCredit, recordAnalysisFailure } from './credits'
import { createAnalysis, getSignedUrl, getVideoDataUrl, updateAnalysis } from './supabase'
import type { BenchmarkReport } from './types'
import { buildVideoProxyUrl } from './videoAccess'

export type BenchmarkSourceMode = 'signed-url' | 'proxy-url' | 'data-url'

export interface BenchmarkPipelineProgress extends Record<string, unknown> {
  step: 'prepare' | 'analysis'
  message?: string
  chunk?: string
  sourceMode?: BenchmarkSourceMode
}

export interface BenchmarkPipelineInput {
  userId: string
  storagePath: string
  ipPositioning: string
  platform: string
  productOrService?: string
  targetCustomer?: string
  benchmarkGoal?: string
  origin?: string | null
  onProgress?: (progress: BenchmarkPipelineProgress) => void
  onAnalysisCreated?: (analysisId: string) => void
}

export interface BenchmarkPipelineRawResult extends Record<string, unknown> {
  fullResult: string
  sourceMode: BenchmarkSourceMode
  errors: string[]
}

export interface BenchmarkPipelineOutput {
  analysisId: string
  report: BenchmarkReport
  rawResult: BenchmarkPipelineRawResult
  sourceMode: BenchmarkSourceMode
  errors: string[]
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

function benchmarkContext(input: BenchmarkPipelineInput): string {
  const parts = [`账号/IP定位：${input.ipPositioning}`]
  if (input.productOrService) parts.push(`产品/服务：${input.productOrService}`)
  if (input.targetCustomer) parts.push(`目标客户：${input.targetCustomer}`)
  if (input.benchmarkGoal) parts.push(`模仿目标/限制条件：${input.benchmarkGoal}`)
  return parts.join('\n')
}

async function collectBenchmark(
  videoUrl: string,
  prompt: string,
  mode: BenchmarkSourceMode,
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

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function fallbackBenchmarkReport(fullResult: string): BenchmarkReport {
  return {
    contentType: '',
    summary: fullResult,
    coreMechanism: '',
    scriptDesign: { structure: [], copyPatterns: [], emotionalCurve: '' },
    visualDesign: { sceneStyle: '', shotList: [], editingRhythm: '', subtitleAndAudio: '' },
    hookDesign: { openingHook: '', retentionHooks: [], conversionOrPayoff: '' },
    imitationPlan: { adaptedAngle: '', scriptOutline: [], shotInstructions: [], copyExamples: [], avoid: [] },
    productionChecklist: [],
    risks: [],
  }
}

export function parseBenchmarkReport(fullResult: string): BenchmarkReport {
  try {
    const cleaned = fullResult.replace(/```(?:json)?\s*/gi, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON object found in Mimo response')

    const parsed: unknown = JSON.parse(jsonMatch[0])
    if (!isRecord(parsed)) throw new Error('Mimo response JSON is not an object')

    const scriptDesign = recordValue(parsed.scriptDesign)
    const visualDesign = recordValue(parsed.visualDesign)
    const hookDesign = recordValue(parsed.hookDesign)
    const imitationPlan = recordValue(parsed.imitationPlan)

    return {
      contentType: stringValue(parsed.contentType),
      summary: stringValue(parsed.summary, fullResult),
      coreMechanism: stringValue(parsed.coreMechanism),
      scriptDesign: {
        structure: stringArrayValue(scriptDesign.structure),
        copyPatterns: stringArrayValue(scriptDesign.copyPatterns),
        emotionalCurve: stringValue(scriptDesign.emotionalCurve),
      },
      visualDesign: {
        sceneStyle: stringValue(visualDesign.sceneStyle),
        shotList: stringArrayValue(visualDesign.shotList),
        editingRhythm: stringValue(visualDesign.editingRhythm),
        subtitleAndAudio: stringValue(visualDesign.subtitleAndAudio),
      },
      hookDesign: {
        openingHook: stringValue(hookDesign.openingHook),
        retentionHooks: stringArrayValue(hookDesign.retentionHooks),
        conversionOrPayoff: stringValue(hookDesign.conversionOrPayoff),
      },
      imitationPlan: {
        adaptedAngle: stringValue(imitationPlan.adaptedAngle),
        scriptOutline: stringArrayValue(imitationPlan.scriptOutline),
        shotInstructions: stringArrayValue(imitationPlan.shotInstructions),
        copyExamples: stringArrayValue(imitationPlan.copyExamples),
        avoid: stringArrayValue(imitationPlan.avoid),
      },
      productionChecklist: stringArrayValue(parsed.productionChecklist),
      risks: stringArrayValue(parsed.risks),
    }
  } catch {
    return fallbackBenchmarkReport(fullResult)
  }
}

export async function runBenchmarkPipeline(input: BenchmarkPipelineInput): Promise<BenchmarkPipelineOutput> {
  let analysisId: string | null = null
  const errors: string[] = []

  try {
    input.onProgress?.({ step: 'prepare', message: '正在创建对标分析任务...' })
    const analysis = await createAnalysis(input.userId, input.storagePath, {
      analysisType: 'benchmark',
      targetAudience: input.targetCustomer,
      platform: input.platform,
      context: benchmarkContext(input),
    })
    analysisId = analysis.id
    input.onAnalysisCreated?.(analysis.id)

    await updateAnalysis(analysis.id, { status: 'analyzing' })
    const prompt = buildBenchmarkPrompt(input)

    let fullResult = ''
    let sourceMode: BenchmarkSourceMode = 'signed-url'

    try {
      input.onProgress?.({ step: 'analysis', message: '正在拆解参考视频...', sourceMode })
      const videoUrl = await getSignedUrl(input.storagePath)
      fullResult = await collectBenchmark(videoUrl, prompt, sourceMode, (chunk) => {
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
        fullResult = await collectBenchmark(buildVideoProxyUrl(input.origin, input.storagePath), prompt, sourceMode, (chunk) => {
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
        fullResult = await collectBenchmark(await getVideoDataUrl(input.storagePath), prompt, sourceMode, (chunk) => {
          input.onProgress?.({ step: 'analysis', chunk, sourceMode })
        })
      } catch (err) {
        errors.push(errorMessage(err))
      }
    }

    if (!fullResult) {
      const message = `Mimo did not return benchmark content. Attempts: ${errors.join(' | ')}`
      await recordAnalysisFailure(analysis.id, new Error(message))
      throw new Error(message)
    }

    const report = parseBenchmarkReport(fullResult)
    const rawResult: BenchmarkPipelineRawResult = { fullResult, sourceMode, errors }
    await updateAnalysis(analysis.id, {
      status: 'completed',
      score: null,
      report,
      raw_result: rawResult,
      completed_at: new Date().toISOString(),
    })
    await chargeAnalysisCredit(analysis.id)

    return { analysisId: analysis.id, report, rawResult, sourceMode, errors }
  } catch (err) {
    if (analysisId) await recordAnalysisFailure(analysisId, err).catch(() => {})
    throw err
  }
}
