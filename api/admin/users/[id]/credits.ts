import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyAdminRequest } from '../../../_lib/adminAuth'
import { adjustUserCredits } from '../../../_lib/adminData'

const clientErrorMessages = new Set([
  '用户不存在',
  '额度调整数量必须是非零整数',
  'Credit delta must be a nonzero integer.',
  '备注不能为空',
  'Credit adjustment reason is required.',
  '调整后余额不能小于 0',
  'User credits cannot be negative',
])

function queryValue(value: unknown): string {
  return Array.isArray(value) ? value[0] || '' : String(value || '')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!verifyAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })

  const id = queryValue(req.query.id)
  if (!id.trim()) return res.status(400).json({ error: 'Missing user id' })

  try {
    const delta = Number(req.body?.delta)
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : ''
    return res.json(await adjustUserCredits(id, delta, reason))
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (clientErrorMessages.has(message)) {
      return res.status(400).json({ error: message })
    }
    console.error('Failed to adjust admin user credits', error)
    return res.status(500).json({ error: '后台操作失败' })
  }
}
