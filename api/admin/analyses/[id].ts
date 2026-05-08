import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { getAdminAnalysisDetail } from '../../_lib/adminData'

function queryValue(value: unknown): string {
  return Array.isArray(value) ? value[0] || '' : String(value || '')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  const id = queryValue(req.query.id)
  if (!id.trim()) return res.status(400).json({ error: 'Missing analysis id' })

  try {
    const data = await getAdminAnalysisDetail(id)
    if (!data) return res.status(404).json({ error: '分析记录不存在' })
    return res.json(data)
  } catch (error) {
    console.error('Failed to load admin analysis detail', error)
    return res.status(500).json({ error: '分析记录加载失败' })
  }
}
