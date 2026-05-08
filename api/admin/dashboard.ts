import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../_lib/adminAuth'
import { getAdminDashboard } from '../_lib/adminData'
import type { AdminRange } from '../_lib/types'

function rangeValue(value: unknown): AdminRange {
  return value === '7d' || value === '30d' ? value : 'today'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  try {
    return res.json(await getAdminDashboard(rangeValue(req.query.range)))
  } catch (error) {
    console.error('Failed to load admin dashboard', error)
    return res.status(500).json({ error: '后台数据加载失败' })
  }
}
