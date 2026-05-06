import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { User, Analysis } from './types'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _supabase
}

export async function findOrCreateUser(feishuId: string, name: string, avatarUrl: string): Promise<User> {
  const supabase = getSupabase()
  const { data: existing } = await supabase.from('users').select('*').eq('feishu_id', feishuId).single()
  if (existing) {
    if (existing.name !== name || existing.avatar_url !== avatarUrl) {
      const { data } = await supabase.from('users').update({ name, avatar_url: avatarUrl }).eq('id', existing.id).select().single()
      return data as User
    }
    return existing as User
  }
  const { data } = await supabase.from('users').insert({ feishu_id: feishuId, name, avatar_url: avatarUrl }).select().single()
  return data as User
}

export async function createAnalysis(userId: string, videoUrl: string, opts: {
  targetAudience?: string; platform?: string; context?: string
}): Promise<Analysis> {
  const supabase = getSupabase()
  const { data } = await supabase.from('analyses').insert({
    user_id: userId, video_url: videoUrl,
    target_audience: opts.targetAudience || null, platform: opts.platform || null, context: opts.context || null,
    status: 'pending',
  }).select().single()
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
  const { data } = await supabase.storage.from('videos').createSignedUrl(storagePath, 3600)
  return data!.signedUrl
}
