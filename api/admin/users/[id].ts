import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { getAdminUserDetail } from '../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  const id = String(req.query.id || '')
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
  const data = await getAdminUserDetail(id, page, pageSize)
  if (!data) return res.status(404).json({ error: '用户不存在' })
  return res.json(data)
}
