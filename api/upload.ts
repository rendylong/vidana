import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAuth } from './_lib/auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = verifyAuth(req)
  if (!auth) return res.status(401).json({ error: 'Unauthorized' })

  const { fileName, fileBase64 } = req.body as { fileName?: string; fileBase64?: string }
  if (!fileName || !fileBase64) return res.status(400).json({ error: 'fileName and fileBase64 required' })

  try {
    const ext = fileName.split('.').pop() || 'mp4'
    const storagePath = `${auth.userId}/${Date.now()}.${ext}`
    const buffer = Buffer.from(fileBase64, 'base64')

    const { error: uploadError } = await supabase.storage
      .from('videos')
      .upload(storagePath, buffer, { contentType: `video/${ext}`, upsert: false })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return res.status(500).json({ error: 'Upload failed: ' + uploadError.message })
    }

    res.json({ storagePath })
  } catch (err) {
    console.error('Upload error:', err)
    res.status(500).json({ error: 'Upload failed' })
  }
}
