export interface User {
  id: string
  name: string
  avatar_url: string | null
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
  created_at: string
  completed_at: string | null
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
