export type { AnalysisReport, Problem, Suggestion, PlatformAdvice, AudienceFit, Analysis } from '../../../api/_lib/types'

export interface User {
  id: string
  name: string
  avatar_url: string | null
}

export type Platform = '抖音' | 'B站' | '小红书' | '微信视频号' | '快手' | 'YouTube'

export const PLATFORMS: Platform[] = ['抖音', 'B站', '小红书', '微信视频号', '快手', 'YouTube']
