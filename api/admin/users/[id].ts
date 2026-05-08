import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { getAdminUserDetail } from '../../_lib/adminData'

function queryValue(value: unknown): string {
  return Array.isArray(value) ? value[0] || '' : String(value || '')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  const id = queryValue(req.query.id)
  if (!id.trim()) return res.status(400).json({ error: 'Missing user id' })

  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20))
    const data = await getAdminUserDetail(id, page, pageSize)
    if (!data) return res.status(404).json({ error: '用户不存在' })
    return res.json(data)
  } catch (error) {
    console.error('Failed to load admin user detail', error)
    return res.status(500).json({ error: '用户数据加载失败' })
  }
}
