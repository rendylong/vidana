import type { VercelRequest, VercelResponse } from '@vercel/node'
import { findOrCreateUser } from '../_lib/supabase'
import { signToken } from '../_lib/auth'

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!

async function getFeishuToken(code: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${FEISHU_APP_ID}:${FEISHU_APP_SECRET}`).toString('base64')}`,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu token error: ${data.msg}`)
  return data.data.access_token
}

async function getFeishuUser(accessToken: string): Promise<{ id: string; name: string; avatar_url: string }> {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu user error: ${data.msg}`)
  return { id: data.data.sub, name: data.data.name || '飞书用户', avatar_url: data.data.picture || '' }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { code, state } = req.query as { code?: string; state?: string }
  const cookieState = req.cookies?.oauth_state

  if (!code || !state || state !== cookieState) {
    return res.status(400).json({ error: 'Invalid OAuth callback' })
  }

  try {
    const accessToken = await getFeishuToken(code)
    const feishuUser = await getFeishuUser(accessToken)
    const user = await findOrCreateUser(feishuUser.id, feishuUser.name, feishuUser.avatar_url)
    const token = signToken({ userId: user.id, feishuId: user.feishu_id })

    res.setHeader('Set-Cookie', [
      `oauth_state=; Path=/; HttpOnly; Max-Age=0`,
      `token=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 3600}`,
    ])

    res.redirect('/')
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).json({ error: 'Authentication failed' })
  }
}
