import { describe, it, expect } from 'vitest'
import { buildAnalysisPrompt, buildBenchmarkPrompt } from '../../../api/_lib/prompts'

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

describe('buildBenchmarkPrompt', () => {
  it('builds a benchmark prompt with required fields and adaptive content type instruction', () => {
    const prompt = buildBenchmarkPrompt({
      ipPositioning: '城市露营 vlog 博主',
      platform: '小红书',
    })

    expect(prompt).toContain('城市露营 vlog 博主')
    expect(prompt).toContain('小红书')
    expect(prompt).toContain('先判断参考视频类型')
    expect(prompt).toContain('不要把所有视频都套成投流广告')
    expect(prompt).toContain('"contentType"')
    expect(prompt).not.toContain('可模仿程度')
    expect(prompt).not.toContain('"score"')
  })

  it('includes optional benchmark business context only when provided', () => {
    const prompt = buildBenchmarkPrompt({
      ipPositioning: '创始人 IP',
      platform: '抖音',
      productOrService: 'AI 视频分析工具',
      targetCustomer: '本地生活商家',
      benchmarkGoal: '学习前三秒钩子，不能夸大承诺',
    })

    expect(prompt).toContain('AI 视频分析工具')
    expect(prompt).toContain('本地生活商家')
    expect(prompt).toContain('学习前三秒钩子')
  })
})
