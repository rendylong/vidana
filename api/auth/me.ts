import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from '../_lib/auth'
import { getSupabase, SupabaseServiceRoleKeyError } from '../_lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase.from('users').select('id, name, avatar_url').eq('id', auth.userId).single()
    if (error || !data) return res.status(401).json({ error: 'Unauthorized' })

    return res.json({ user: data })
  } catch (error) {
    console.error('Failed to load authenticated user', error)
    if (error instanceof SupabaseServiceRoleKeyError) {
      return res.status(500).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Failed to load authenticated user' })
  }
}
