import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { getAnalysis, deleteAnalysis } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const { id } = req.query as { id: string }

  if (req.method === 'GET') {
    const analysis = await getAnalysis(id, auth.userId)
    if (!analysis) return res.status(404).json({ error: 'Not found' })
    return res.json(analysis)
  }

  if (req.method === 'DELETE') {
    const deleted = await deleteAnalysis(id, auth.userId)
    if (!deleted) return res.status(404).json({ error: 'Not found' })
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
