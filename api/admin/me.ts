import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAdminRequest(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  return res.json({ authenticated: true })
}
