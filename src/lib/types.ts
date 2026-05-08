export interface User {
  id: string
  name: string
  avatar_url: string | null
  analysis_credits?: number
}

export type Platform = '抖音' | 'B站' | '小红书' | '微信视频号' | '快手' | 'YouTube'
export const PLATFORMS: Platform[] = ['抖音', 'B站', '小红书', '微信视频号', '快手', 'YouTube']

export type AnalysisType = 'analysis' | 'benchmark'

export interface Analysis {
  id: string
  user_id: string
  analysis_type?: AnalysisType
  video_url: string
  video_duration: number | null
  target_audience: string | null
  platform: string | null
  context: string | null
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score: number | null
  raw_result: Record<string, unknown> | null
  report: Record<string, unknown> | null
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  error_message?: string | null
  credit_charged_at?: string | null
  created_at: string
  completed_at: string | null
}

export type CreditTransactionSource = 'initial_grant' | 'admin_adjustment' | 'analysis_success'

export interface CreditTransaction {
  id: string
  user_id: string
  delta: number
  reason: string
  source: CreditTransactionSource
  analysis_id: string | null
  created_at: string
}

export type AdminRange = 'today' | '7d' | '30d'

export interface AdminMetric {
  key: 'new_users' | 'total_users' | 'analyses' | 'successes' | 'failures' | 'tokens'
  label: string
  value: number
  previousValue: number
  trendPercent: number | null
}

export interface AdminAnalysisSummary {
  id: string
  user_id: string
  user_name: string
  analysis_type: AnalysisType
  status: Analysis['status']
  score: number | null
  platform: string | null
  total_tokens: number
  error_message: string | null
  created_at: string
  completed_at: string | null
}

export interface AdminUserListItem {
  id: string
  name: string
  avatar_url: string | null
  created_at: string
  analysis_credits: number
  total_analyses: number
  completed_analyses: number
  failed_analyses: number
  last_analysis_at: string | null
}

export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface CreatedApiKeyResponse {
  key: ApiKeySummary
  secret: string
}
