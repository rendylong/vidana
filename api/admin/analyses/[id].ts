import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { getAdminAnalysisDetail } from '../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  const data = await getAdminAnalysisDetail(String(req.query.id || ''))
  if (!data) return res.status(404).json({ error: '分析记录不存在' })
  return res.json(data)
}
