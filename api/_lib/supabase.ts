import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { User, Analysis, AnalysisType } from './types'

let _supabase: SupabaseClient | null = null

export class SupabaseServiceRoleKeyError extends Error {}

function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { role?: string }
  } catch {
    return null
  }
}

export function getSupabaseServerConfig(env = process.env): { url: string; serviceRoleKey: string } {
  const url = env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new SupabaseServiceRoleKeyError('Missing VITE_SUPABASE_URL.')
  if (!serviceRoleKey) throw new SupabaseServiceRoleKeyError('Missing SUPABASE_SERVICE_ROLE_KEY.')

  if (serviceRoleKey.startsWith('sb_secret_')) return { url, serviceRoleKey }

  const role = decodeJwtPayload(serviceRoleKey)?.role
  if (role !== 'service_role') {
    if (serviceRoleKey.startsWith('sb_publishable_')) {
      throw new SupabaseServiceRoleKeyError(
        'SUPABASE_SERVICE_ROLE_KEY must be a Supabase secret key (sb_secret_...) or legacy service_role key, but current key is a publishable key.',
      )
    }

    throw new SupabaseServiceRoleKeyError(
      `SUPABASE_SERVICE_ROLE_KEY must be a Supabase secret key (sb_secret_...) or legacy service_role key, but current key role is ${role || 'unknown'}.`,
    )
  }

  return { url, serviceRoleKey }
}

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const { url, serviceRoleKey } = getSupabaseServerConfig()
    _supabase = createClient(url, serviceRoleKey)
  }
  return _supabase
}

async function grantInitialCredits(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    delta: 10,
    source: 'initial_grant',
    reason: '新用户初始额度',
  })
  if (error) throw new Error(`Failed to grant initial credits: ${error.message}`)
}

export async function findOrCreateUser(feishuId: string, name: string, avatarUrl: string): Promise<User> {
  const supabase = getSupabase()
  const { data: existing, error: existingError } = await supabase.from('users').select('*').eq('feishu_id', feishuId).maybeSingle()
  if (existingError) throw new Error(`Failed to find user: ${existingError.message}`)
  if (existing) {
    if (existing.name !== name || existing.avatar_url !== avatarUrl) {
      const { data, error } = await supabase.from('users').update({ name, avatar_url: avatarUrl }).eq('id', existing.id).select().single()
      if (error || !data) throw new Error(`Failed to update user: ${error?.message || 'empty response'}`)
      return data as User
    }
    return existing as User
  }
  const { data, error } = await supabase.from('users').insert({ feishu_id: feishuId, name, avatar_url: avatarUrl }).select().single()
  if (error || !data) throw new Error(`Failed to create user: ${error?.message || 'empty response'}`)
  await grantInitialCredits(supabase, data.id)
  return data as User
}

export async function createAnalysis(userId: string, videoUrl: string, opts: {
  targetAudience?: string; platform?: string; context?: string; analysisType?: AnalysisType
}): Promise<Analysis> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('analyses').insert({
    user_id: userId, video_url: videoUrl,
    target_audience: opts.targetAudience || null, platform: opts.platform || null, context: opts.context || null,
    analysis_type: opts.analysisType || 'analysis',
    status: 'pending',
  }).select().single()
  if (error || !data) throw new Error(`Failed to create analysis: ${error?.message || 'empty response'}`)
  return data as Analysis
}

export async function updateAnalysis(id: string, updates: Partial<Analysis>): Promise<void> {
  const supabase = getSupabase()
  await supabase.from('analyses').update(updates).eq('id', id)
}

export async function getAnalysis(id: string, userId: string): Promise<Analysis | null> {
  const supabase = getSupabase()
  const { data } = await supabase.from('analyses').select('*').eq('id', id).eq('user_id', userId).single()
  return data as Analysis | null
}

export async function listAnalyses(userId: string, page = 1, pageSize = 12): Promise<{ data: Analysis[], count: number }> {
  const supabase = getSupabase()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  const [countResult, dataResult] = await Promise.all([
    supabase.from('analyses').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('analyses').select('*').eq('user_id', userId).order('created_at', { ascending: false }).range(from, to),
  ])
  return { data: dataResult.data as Analysis[], count: countResult.count ?? 0 }
}

export async function deleteAnalysis(id: string, userId: string): Promise<boolean> {
  const supabase = getSupabase()
  const { error } = await supabase.from('analyses').delete().eq('id', id).eq('user_id', userId)
  return !error
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage.from('videos').createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) throw new Error(`Failed to create signed URL: ${error?.message || 'empty response'}`)
  return data.signedUrl
}

function mimeFromPath(storagePath: string): string {
  const ext = storagePath.split('.').pop()?.toLowerCase()
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'avi') return 'video/x-msvideo'
  if (ext === 'wmv') return 'video/x-ms-wmv'
  if (ext === 'webm') return 'video/webm'
  return 'video/mp4'
}

export async function getVideoDataUrl(storagePath: string): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase.storage.from('videos').download(storagePath)
  if (error || !data) throw new Error(`Failed to download video from storage: ${error?.message || 'empty response'}`)

  const base64 = Buffer.from(await data.arrayBuffer()).toString('base64')
  const mimeType = data.type || mimeFromPath(storagePath)
  return `data:${mimeType};base64,${base64}`
}
