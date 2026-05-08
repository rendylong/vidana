import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSupabase } from './_lib/supabase'
import { verifyVideoPath } from './_lib/videoAccess'

function mimeFromPath(storagePath: string): string {
  const ext = storagePath.split('.').pop()?.toLowerCase()
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'avi') return 'video/x-msvideo'
  if (ext === 'wmv') return 'video/x-ms-wmv'
  if (ext === 'webm') return 'video/webm'
  return 'video/mp4'
}

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const path = typeof req.query.path === 'string' ? req.query.path : ''
  const expiresAt = typeof req.query.exp === 'string' ? Number(req.query.exp) : 0
  const signature = typeof req.query.sig === 'string' ? req.query.sig : ''

  if (!verifyVideoPath(path, expiresAt, signature)) {
    return res.status(403).json({ error: 'Invalid or expired video URL' })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase.storage.from('videos').download(path)
  if (error || !data) {
    return res.status(404).json({ error: error?.message || 'Video not found' })
  }

  const buffer = Buffer.from(await data.arrayBuffer())
  const range = req.headers.range
  const contentType = data.type || mimeFromPath(path)

  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Content-Type', contentType)
  res.setHeader('Cache-Control', 'private, max-age=600')

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/)
    const start = match?.[1] ? Number(match[1]) : 0
    const end = match?.[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1
    if (start >= buffer.length || end < start) {
      res.setHeader('Content-Range', `bytes */${buffer.length}`)
      return res.status(416).end()
    }

    const chunk = buffer.subarray(start, end + 1)
    res.status(206)
    res.setHeader('Content-Range', `bytes ${start}-${end}/${buffer.length}`)
    res.setHeader('Content-Length', String(chunk.length))
    return req.method === 'HEAD' ? res.end() : res.end(chunk)
  }

  res.setHeader('Content-Length', String(buffer.length))
  return req.method === 'HEAD' ? res.end() : res.end(buffer)
}
