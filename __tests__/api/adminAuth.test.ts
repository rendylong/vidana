import { beforeEach, describe, expect, it } from 'vitest'
import {
  ADMIN_COOKIE_NAME,
  clearAdminCookie,
  issueAdminCookie,
  verifyAdminRequest,
} from '../../api/_lib/adminAuth'

describe('admin auth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret'
    process.env.VITE_APP_URL = 'http://localhost:5174'
  })

  it('issues a localhost HTTP admin cookie', () => {
    const cookie = issueAdminCookie()

    expect(cookie).toContain(`${ADMIN_COOKIE_NAME}=`)
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Max-Age=604800')
    expect(cookie).not.toContain('Secure')
  })

  it('verifies a token extracted from an issued cookie', () => {
    const cookie = issueAdminCookie()
    const token = cookie.match(new RegExp(`${ADMIN_COOKIE_NAME}=([^;]+)`))?.[1]

    expect(token).toBeTruthy()
    expect(verifyAdminRequest({ cookies: { [ADMIN_COOKIE_NAME]: token ?? '' } })).toEqual({ admin: true })
  })

  it('returns null for missing or invalid tokens', () => {
    expect(verifyAdminRequest({ cookies: {} })).toBeNull()
    expect(verifyAdminRequest({ cookies: { [ADMIN_COOKIE_NAME]: 'invalid-token' } })).toBeNull()
  })

  it('clears the admin cookie', () => {
    expect(clearAdminCookie()).toBe('admin_token=; Path=/; HttpOnly; Max-Age=0')
  })
})
