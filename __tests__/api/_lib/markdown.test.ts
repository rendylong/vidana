import { describe, expect, it } from 'vitest'
import { formatAnalysisMarkdown } from '../../../api/_lib/markdown'
import type { AnalysisReport } from '../../../api/_lib/types'

describe('formatAnalysisMarkdown', () => {
  it('formats an analysis report into stable Chinese Markdown', () => {
    const report: AnalysisReport = {
      score: 72,
      summary: '内容有记忆点，但开场和人群匹配度还需要增强。',
      timelineEdits: [
        {
          timestamp: '00:03',
          severity: 'high',
          category: '人物',
          issue: '开场表演略显叫卖。',
          action: '改成真实用户痛点场景。',
        },
      ],
      globalEdits: [
        {
          severity: 'medium',
          category: '字幕',
          issue: '字幕卖点略散。',
          action: '统一成一条主利益点。',
        },
      ],
      suggestions: ['前 3 秒优先展示痛点。'],
    }

    const markdown = formatAnalysisMarkdown(report, {
      targetAudience: '二三线城市 30-50 岁男性',
      platform: '抖音',
    })

    expect(markdown).toContain('# Vidana 视频分析报告')
    expect(markdown).toContain('- 目标用户：二三线城市 30-50 岁男性')
    expect(markdown).toContain('- 投放平台：抖音')
    expect(markdown).toContain('| 00:03 | high | 人物 | 开场表演略显叫卖。 | 改成真实用户痛点场景。 |')
    expect(markdown).toContain('- 前 3 秒优先展示痛点。')
  })
})
