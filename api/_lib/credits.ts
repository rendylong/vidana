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

export async function grantInitialCredits(userId: string): Promise<void> {
  const supabase = getSupabase()
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
  const { data: analysis, error: analysisError } = await supabase
    .from('analyses')
    .select('user_id, credit_charged_at')
    .eq('id', analysisId)
    .single()
  if (analysisError || !analysis) throw new Error(`Failed to load analysis for credit charge: ${analysisError?.message || 'empty response'}`)
  if (analysis.credit_charged_at) return

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('analysis_credits')
    .eq('id', analysis.user_id)
    .single()
  if (userError || !user) throw new Error(`Failed to load user credits: ${userError?.message || 'empty response'}`)

  const nextCredits = Number(user.analysis_credits) - 1
  if (nextCredits < 0) throw new InsufficientCreditsError()

  const { error: updateUserError } = await supabase.from('users').update({ analysis_credits: nextCredits }).eq('id', analysis.user_id)
  if (updateUserError) throw new Error(`Failed to deduct user credit: ${updateUserError.message}`)

  const { error: transactionError } = await supabase.from('credit_transactions').insert({
    user_id: analysis.user_id,
    delta: -1,
    source: 'analysis_success',
    analysis_id: analysisId,
    reason: '分析成功扣减',
  })
  if (transactionError) throw new Error(`Failed to write credit transaction: ${transactionError.message}`)

  const { error: updateAnalysisError } = await supabase
    .from('analyses')
    .update({ credit_charged_at: new Date().toISOString() })
    .eq('id', analysisId)
  if (updateAnalysisError) throw new Error(`Failed to mark analysis credit charged: ${updateAnalysisError.message}`)
}

export async function recordAnalysisFailure(analysisId: string, err: unknown): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.from('analyses').update({
    status: 'failed',
    error_message: errorMessage(err),
  }).eq('id', analysisId)
  if (error) throw new Error(`Failed to record analysis failure: ${error.message}`)
}
