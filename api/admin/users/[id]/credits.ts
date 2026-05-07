import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../../_lib/adminAuth'
import { adjustUserCredits } from '../../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const id = String(req.query.id || '')
    const delta = Number(req.body?.delta)
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
    return res.json(await adjustUserCredits(id, delta, reason))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return res.status(400).json({ error: message || '额度调整失败' })
  }
}
