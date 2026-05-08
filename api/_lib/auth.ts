import jwt from 'jsonwebtoken'

interface AuthPayload {
  userId: string
  feishuId: string
}

export function verifyAuth(req: { cookies?: Record<string, string> }): AuthPayload | null {
  const token = req.cookies?.token
  if (!token) return null
  try { return jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload }
  catch { return null }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '7d' })
}
