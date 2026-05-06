import { describe, it, expect, beforeEach } from 'vitest'
import jwt from 'jsonwebtoken'
import { verifyAuth } from '../../../api/_lib/auth'

const JWT_SECRET = 'test-secret-at-least-32-characters-long'

describe('verifyAuth', () => {
  beforeEach(() => { process.env.JWT_SECRET = JWT_SECRET })

  it('从 Cookie 中验证有效 JWT', () => {
    const token = jwt.sign({ userId: 'user-123', feishuId: 'feishu-456' }, JWT_SECRET)
    const req = { cookies: { token } } as any
    const result = verifyAuth(req)
    expect(result?.userId).toBe('user-123')
  })

  it('无效 token 返回 null', () => {
    const req = { cookies: { token: 'invalid-token' } } as any
    expect(verifyAuth(req)).toBeNull()
  })

  it('缺少 token 返回 null', () => {
    const req = { cookies: {} } as any
    expect(verifyAuth(req)).toBeNull()
  })
})
