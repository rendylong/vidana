import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { createApiKey, listApiKeys } from '../_lib/apiKeys'

interface ApiKeyPublicShape {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

function publicKeyShape(key: ApiKeyPublicShape): ApiKeyPublicShape {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    last_used_at: key.last_used_at,
    revoked_at: key.revoked_at,
    created_at: key.created_at,
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  try {
    if (req.method === 'GET') {
      const keys = await listApiKeys(auth.userId)
      res.setHeader('Cache-Control', 'no-store')
      return res.json({ data: keys.map(publicKeyShape) })
    }

    const name = typeof req.body?.name === 'string' && req.body.name.trim()
      ? req.body.name.trim()
      : 'Agent CLI'
    const { key, secret } = await createApiKey(auth.userId, name)
    res.setHeader('Cache-Control', 'no-store')
    return res.status(201).json({ key: publicKeyShape(key), secret })
  } catch (error) {
    console.error('Failed to manage API keys', error)
    return res.status(500).json({ error: 'Failed to manage API keys' })
  }
}
