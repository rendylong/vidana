import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { runAnalysisPipeline } from './_lib/analysisPipeline'
import { assertUserHasCredits, InsufficientCreditsError } from './_lib/credits'

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const { storagePath, targetAudience, platform, context } = req.body as {
    storagePath: string
    targetAudience?: string
    platform?: string
    context?: string
  }

  if (!storagePath) return res.status(400).json({ error: 'storagePath is required' })

  try {
    await assertUserHasCredits(auth.userId)
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: err.message })
    }
    console.error('Credit check error:', err)
    return res.status(500).json({ error: '分析次数检查失败，请稍后重试' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    sendSSE(res, 'status', { status: 'preparing' })
    const output = await runAnalysisPipeline({
      userId: auth.userId,
      storagePath,
      targetAudience,
      platform,
      context,
      origin: getConfiguredOrigin(),
      onProgress: (progress) => sendSSE(res, 'progress', progress),
      onAnalysisCreated: (analysisId) => sendSSE(res, 'status', { status: 'analyzing', analysisId }),
    })

    sendSSE(res, 'result', { score: output.report.score, report: output.report })
    res.end()
  } catch (err) {
    console.error('Analysis error:', err)
    const message = err instanceof Error ? err.message : '分析过程中出现错误'
    sendSSE(res, 'error', { message })
    res.end()
  }
}
