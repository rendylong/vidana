import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { ApiKeyStorageNotInitializedError, revokeApiKey } from '../_lib/apiKeys'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
  if (!id) return res.status(400).json({ error: 'Missing API key id' })

  try {
    await revokeApiKey(auth.userId, id)
    res.setHeader('Cache-Control', 'no-store')
    return res.json({ ok: true })
  } catch (error) {
    console.error('Failed to revoke API key', error)
    if (error instanceof ApiKeyStorageNotInitializedError) {
      return res.status(503).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Failed to revoke API key' })
  }
}
