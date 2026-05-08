import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from './supabase'

export class InsufficientCreditsError extends Error {
  constructor() {
    super('可用分析次数不足，请联系管理员增加额度。')
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function assertUserHasCredits(userId: string): Promise<void> {
  const supabase = getSupabase()
  const { data, error } = await supabase.from('users').select('analysis_credits').eq('id', userId).single()
  if (error || !data) throw new Error(`Failed to check user credits: ${error?.message || 'empty response'}`)
  if (Number(data.analysis_credits) <= 0) throw new InsufficientCreditsError()
}

export async function grantInitialCredits(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from('credit_transactions').insert({
    user_id: userId,
    delta: 10,
    source: 'initial_grant',
    reason: '新用户初始额度',
  })
  if (error) throw new Error(`Failed to grant initial credits: ${error.message}`)
}

export async function chargeAnalysisCredit(analysisId: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.rpc('charge_analysis_credit', { p_analysis_id: analysisId })
  if (!error) return
  if (error.message.includes('可用分析次数不足')) throw new InsufficientCreditsError()
  throw new Error(`Failed to charge analysis credit: ${error.message}`)
}

export async function recordAnalysisFailure(analysisId: string, err: unknown): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('analyses').update({
    status: 'failed',
    error_message: errorMessage(err),
  }).eq('id', analysisId)
  if (error) throw new Error(`Failed to record analysis failure: ${error.message}`)
}
