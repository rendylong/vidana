import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearAdminCookie, verifyAdminRequest } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAdminRequest(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  res.setHeader('Set-Cookie', clearAdminCookie())
  return res.json({ authenticated: false })
}
