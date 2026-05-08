import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyBearerApiKey } from '../../_lib/apiKeys'
import { formatAnalysisMarkdown } from '../../_lib/markdown'
import { getAnalysis } from '../../_lib/supabase'
import type { AnalysisReport } from '../../_lib/types'

function normalizeHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function normalizeId(value: string | string[] | undefined): string | null {
  if (!value || Array.isArray(value)) return null
  const id = value.trim()
  return id || null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authorization = normalizeHeader(req.headers.authorization)
  const auth = await verifyBearerApiKey(authorization)
  if (!auth) return res.status(401).json({ error: 'Invalid or missing Vidana API key' })

  const id = normalizeId(req.query.id)
  if (!id) return res.status(400).json({ error: 'analysis id is required' })

  const analysis = await getAnalysis(id, auth.userId)
  if (!analysis) return res.status(404).json({ error: 'Analysis not found' })

  if (analysis.status === 'completed' && analysis.report) {
    const markdownContext = {
      fileName: analysis.video_url,
      targetAudience: analysis.target_audience || undefined,
      platform: analysis.platform || undefined,
      context: analysis.context || undefined,
    }
    const markdown = formatAnalysisMarkdown(analysis.report as AnalysisReport, markdownContext)

    return res.json({
      analysisId: analysis.id,
      status: analysis.status,
      markdown,
      report: analysis.report,
    })
  }

  return res.json({
    analysisId: analysis.id,
    status: analysis.status,
    error: analysis.error_message,
  })
}
