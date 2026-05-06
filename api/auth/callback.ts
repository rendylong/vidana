import type { VercelRequest, VercelResponse } from '@vercel/node'
import { findOrCreateUser } from '../_lib/supabase'
import { signToken } from '../_lib/auth'
import { authCookie, clearAuthCookie } from '../_lib/cookies'

const FEISHU_APP_ID = process.env.FEISHU_APP_ID!
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET!

async function getAppAccessToken(): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu app token error: code=${data.code} msg=${data.msg}`)
  return data.app_access_token
}

async function getUserAccessToken(code: string, appAccessToken: string): Promise<string> {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${appAccessToken}`,
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code }),
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu token error: code=${data.code} msg=${data.msg}`)
  return data.data.access_token
}

async function getFeishuUser(accessToken: string): Promise<{ id: string; name: string; avatar_url: string }> {
  const res = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  const data = await res.json()
  if (data.code !== 0) throw new Error(`Feishu user error: code=${data.code} msg=${data.msg}`)
  return { id: data.data.open_id, name: data.data.name || '飞书用户', avatar_url: data.data.avatar_url || '' }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { code, state } = req.query as { code?: string; state?: string }
  const cookieState = req.cookies?.oauth_state

  if (!code || !state || state !== cookieState) {
    return res.status(400).json({ error: 'Invalid OAuth callback' })
  }

  try {
    const appAccessToken = await getAppAccessToken()
    const accessToken = await getUserAccessToken(code, appAccessToken)
    const feishuUser = await getFeishuUser(accessToken)
    const user = await findOrCreateUser(feishuUser.id, feishuUser.name, feishuUser.avatar_url)
    const token = signToken({ userId: user.id, feishuId: user.feishu_id })

    res.setHeader('Set-Cookie', [
      clearAuthCookie('oauth_state'),
      authCookie('token', token, 7 * 24 * 3600),
    ])

    res.redirect('/')
  } catch (err) {
    console.error('OAuth callback error:', err)
    res.status(500).json({ error: 'Authentication failed' })
  }
}
