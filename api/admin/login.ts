import type { VercelRequest, VercelResponse } from '@vercel/node'
import { issueAdminCookie } from '../_lib/adminAuth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    console.error('Admin password is not configured')
    return res.status(500).json({ error: 'Admin password is not configured' })
  }

  if (typeof req.body?.password !== 'string' || req.body.password !== adminPassword) {
    return res.status(401).json({ error: '密码错误' })
  }

  res.setHeader('Set-Cookie', issueAdminCookie())
  return res.json({ authenticated: true })
}
