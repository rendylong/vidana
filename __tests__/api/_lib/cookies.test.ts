import { beforeEach, describe, expect, it } from 'vitest'
import { authCookie, secureCookieAttribute } from '../../../api/_lib/cookies'

describe('auth cookies', () => {
  beforeEach(() => {
    delete process.env.VITE_APP_URL
  })

  it('does not mark localhost HTTP cookies as Secure', () => {
    process.env.VITE_APP_URL = 'http://localhost:5174'

    expect(authCookie('token', 'value', 60)).toBe('token=value; Path=/; HttpOnly; SameSite=Lax; Max-Age=60')
  })

  it('marks HTTPS deployment cookies as Secure', () => {
    process.env.VITE_APP_URL = 'https://vidana.example.com'

    expect(secureCookieAttribute()).toBe('; Secure')
    expect(authCookie('token', 'value', 60)).toContain('HttpOnly; Secure; SameSite=Lax')
  })
})
