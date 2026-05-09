import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { ActiveAnalysisLimitError, submitAnalysisJob } from './_lib/analysisSubmission'
import { assertUserHasCredits, InsufficientCreditsError } from './_lib/credits'

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

  try {
    const { analysisId } = await submitAnalysisJob({
      userId: auth.userId,
      storagePath,
      targetAudience,
      platform,
      context,
    })

    return res.status(202).json({ analysisId, status: 'queued' })
  } catch (err) {
    if (err instanceof ActiveAnalysisLimitError) {
      return res.status(429).json({ error: err.message })
    }

    console.error('Analysis queue submission error:', err)
    return res.status(500).json({ error: '分析任务提交失败，请稍后重试' })
  }
}
