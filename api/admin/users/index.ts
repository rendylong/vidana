import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../_lib/adminAuth'
import { listAdminUsers } from '../../_lib/adminData'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  const page = Math.max(1, Number(req.query.page) || 1)
  const q = typeof req.query.q === 'string' ? req.query.q : ''

  return res.json(await listAdminUsers(page, q))
}
