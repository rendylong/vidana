import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { authCookie } from '../_lib/cookies'

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const appId = process.env.FEISHU_APP_ID
  const state = crypto.randomBytes(16).toString('hex')
  const redirectUri = `${process.env.VITE_APP_URL || ''}/api/auth/callback`

  res.setHeader('Set-Cookie', authCookie('oauth_state', state, 600))

  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`
  res.redirect(authUrl)
}
