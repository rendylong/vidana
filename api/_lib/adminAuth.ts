import jwt from 'jsonwebtoken'
import { authCookie, clearAuthCookie } from './cookies'

export const ADMIN_COOKIE_NAME = 'admin_token'
const ADMIN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60

interface AdminJwtPayload {
  admin?: unknown
}

export interface AdminAuthPayload {
  admin: true
}

export function issueAdminCookie(): string {
  const token = jwt.sign({ admin: true }, process.env.JWT_SECRET!, { expiresIn: '7d' })
  return authCookie(ADMIN_COOKIE_NAME, token, ADMIN_COOKIE_MAX_AGE)
}

export function clearAdminCookie(): string {
  return clearAuthCookie(ADMIN_COOKIE_NAME)
}

export function verifyAdminRequest(req: { cookies?: Record<string, string> }): AdminAuthPayload | null {
  const token = req.cookies?.[ADMIN_COOKIE_NAME]
  if (!token) return null

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AdminJwtPayload
    return payload.admin === true ? { admin: true } : null
  } catch {
    return null
  }
}
