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

export interface AnalysisReport {
  score: number
  summary: string
  problems: Problem[]
  suggestions: Suggestion[]
  platformAdvice: PlatformAdvice | null
  audienceFit: AudienceFit | null
}

export interface Problem {
  category: string
  severity: 'high' | 'medium' | 'low'
  description: string
  timestamp: string | null
}

export interface Suggestion {
  priority: 'high' | 'medium' | 'low'
  action: string
  detail: string
  timeRange: string | null
}

export interface PlatformAdvice {
  platform: string
  tips: string[]
}

export interface AudienceFit {
  audience: string
  score: number
  reasoning: string
}

export interface AnalyzeRequest {
  storagePath: string
  targetAudience?: string
  platform?: string
  context?: string
}
