export interface User {
  id: string
  feishu_id: string
  name: string
  avatar_url: string | null
  created_at: string
}

export interface Analysis {
  id: string
  user_id: string
  video_url: string
  video_duration: number | null
  target_audience: string | null
  platform: string | null
  context: string | null
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score: number | null
  raw_result: Record<string, unknown> | null
  report: AnalysisReport | null
  created_at: string
  completed_at: string | null
}

export interface TimelineEdit {
  timestamp: string
  issue: string
  action: string
  category: string
  severity: 'high' | 'medium' | 'low'
}

export interface GlobalEdit {
  issue: string
  action: string
  category: string
  severity: 'high' | 'medium' | 'low'
}

export interface AnalysisReport {
  score: number
  summary: string
  timelineEdits: TimelineEdit[]
  globalEdits: GlobalEdit[]
  suggestions: string[]
}

export interface AnalyzeRequest {
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
}

export interface ApiKeyRecord {
  id: string
  user_id: string
  name: string
  key_hash: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface ApiKeySummary {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export interface PublicAuthUser {
  userId: string
  apiKeyId: string
}
