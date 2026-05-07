import crypto from 'node:crypto'

const TOKEN_TTL_SECONDS = 20 * 60

function secret(): string {
  return process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'vidana-dev-secret'
}

export function signVideoPath(path: string, expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS): string {
  const payload = `${path}.${expiresAt}`
  return crypto.createHmac('sha256', secret()).update(payload).digest('hex')
}

export function verifyVideoPath(path: string, expiresAt: number, signature: string): boolean {
  if (!path || !expiresAt || !signature) return false
  if (expiresAt < Math.floor(Date.now() / 1000)) return false

  const expected = signVideoPath(path, expiresAt)
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export function buildVideoProxyUrl(origin: string, path: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const signature = signVideoPath(path, expiresAt)
  const url = new URL('/api/video', origin)
  url.searchParams.set('path', path)
  url.searchParams.set('exp', String(expiresAt))
  url.searchParams.set('sig', signature)
  return url.toString()
}
