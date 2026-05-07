import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { runBenchmarkPipeline } from './_lib/benchmarkPipeline'

function sendSSE(res: VercelResponse, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function getConfiguredOrigin(): string | null {
  const configuredOrigin = process.env.VIDANA_PUBLIC_ORIGIN || process.env.VITE_APP_URL
  if (!configuredOrigin) return null

  try {
    return new URL(configuredOrigin).origin
  } catch {
    return null
  }
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const {
    storagePath,
    ipPositioning,
    platform,
    productOrService,
    targetCustomer,
    benchmarkGoal,
  } = req.body as {
    storagePath?: string
    ipPositioning?: string
    platform?: string
    productOrService?: string
    targetCustomer?: string
    benchmarkGoal?: string
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  const trimmedIpPositioning = optionalText(ipPositioning)
  const trimmedPlatform = optionalText(platform)

  if (!storagePath) {
    sendSSE(res, 'error', { message: '请先上传参考视频' })
    return res.end()
  }

  if (!trimmedIpPositioning) {
    sendSSE(res, 'error', { message: '请填写你的账号/IP定位' })
    return res.end()
  }

  if (!trimmedPlatform) {
    sendSSE(res, 'error', { message: '请选择发布平台' })
    return res.end()
  }

  try {
    sendSSE(res, 'status', { status: 'preparing' })
    const output = await runBenchmarkPipeline({
      userId: auth.userId,
      storagePath,
      ipPositioning: trimmedIpPositioning,
      platform: trimmedPlatform,
      productOrService: optionalText(productOrService),
      targetCustomer: optionalText(targetCustomer),
      benchmarkGoal: optionalText(benchmarkGoal),
      origin: getConfiguredOrigin(),
      onProgress: (progress) => sendSSE(res, 'progress', progress),
      onAnalysisCreated: (analysisId) => sendSSE(res, 'status', { status: 'analyzing', analysisId }),
    })

    sendSSE(res, 'result', { report: output.report })
    res.end()
  } catch (err) {
    console.error('Benchmark error:', err)
    const message = err instanceof Error ? err.message : '对标分析过程中出现错误'
    sendSSE(res, 'error', { message })
    res.end()
  }
}
