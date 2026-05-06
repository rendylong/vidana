import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt } from '../../../api/_lib/prompts'

describe('buildAnalysisPrompt', () => {
  it('基础 prompt 不含可选项', () => {
    const prompt = buildAnalysisPrompt({})
    expect(prompt).toContain('画面质量')
    expect(prompt).not.toContain('目标受众')
  })

  it('包含目标受众', () => {
    expect(buildAnalysisPrompt({ targetAudience: '18-25岁' })).toContain('18-25岁')
  })

  it('包含平台', () => {
    expect(buildAnalysisPrompt({ platform: '抖音' })).toContain('抖音')
  })

  it('包含补充上下文', () => {
    expect(buildAnalysisPrompt({ context: '护肤品品牌' })).toContain('护肤品品牌')
  })
})
