import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { createAnalysis, updateAnalysis, getSignedUrl } from './_lib/supabase'
import { buildMultimodalRequest, buildDeepAnalysisRequest, callMimoAPI, parseSSEStream } from './_lib/mimo'
import { buildAnalysisPrompt } from './_lib/prompts'

function sendSSE(res: VercelResponse, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
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

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    sendSSE(res, 'status', { status: 'uploading' })
    const analysis = await createAnalysis(auth.userId, storagePath, { targetAudience, platform, context })
    sendSSE(res, 'status', { status: 'analyzing', analysisId: analysis.id })

    await updateAnalysis(analysis.id, { status: 'analyzing' })

    const videoUrl = await getSignedUrl(storagePath)

    sendSSE(res, 'progress', { step: 'multimodal', message: '正在进行视频内容分析...' })
    const prompt = buildAnalysisPrompt({ targetAudience, platform, context })
    const multimodalBody = buildMultimodalRequest(videoUrl, prompt)
    const multimodalResponse = await callMimoAPI(multimodalBody)

    let multimodalResult = ''
    for await (const chunk of parseSSEStream(multimodalResponse)) {
      multimodalResult += chunk
      sendSSE(res, 'progress', { step: 'multimodal', chunk })
    }

    await updateAnalysis(analysis.id, { raw_result: { multimodalResult } })

    sendSSE(res, 'progress', { step: 'deep_analysis', message: '正在生成详细分析报告...' })
    const deepBody = buildDeepAnalysisRequest(multimodalResult, { targetAudience, platform, context })
    const deepResponse = await callMimoAPI(deepBody)

    let deepResult = ''
    for await (const chunk of parseSSEStream(deepResponse)) {
      deepResult += chunk
      sendSSE(res, 'progress', { step: 'deep_analysis', chunk })
    }

    let report
    try {
      const jsonMatch = deepResult.match(/\{[\s\S]*\}/)
      report = jsonMatch ? JSON.parse(jsonMatch[0]) : { score: 0, summary: deepResult, problems: [], suggestions: [] }
    } catch {
      report = { score: 0, summary: deepResult, problems: [], suggestions: [] }
    }

    const score = report.score ?? 0
    await updateAnalysis(analysis.id, {
      status: 'completed', score, report, completed_at: new Date().toISOString(),
    })

    sendSSE(res, 'result', { score, report })
    res.end()
  } catch (err) {
    console.error('Analysis error:', err)
    const message = err instanceof Error ? err.message : '分析过程中出现错误'
    sendSSE(res, 'error', { message })
    res.end()
  }
}
