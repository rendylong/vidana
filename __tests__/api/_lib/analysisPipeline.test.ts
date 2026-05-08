import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAnalysisReport, runAnalysisPipeline } from '../../../api/_lib/analysisPipeline'

const mocks = vi.hoisted(() => ({
  createAnalysis: vi.fn(async () => ({ id: 'analysis-1' })),
  executeAnalysis: vi.fn(async (input: { analysisId: string; onProgress?: (progress: Record<string, unknown>) => void }) => {
    input.onProgress?.({ step: 'analysis', chunk: 'chunk-1', sourceMode: 'signed-url' })
    return {
      analysisId: input.analysisId,
      report: {
        score: 88,
        summary: '整体节奏清晰。',
        timelineEdits: [],
        globalEdits: [],
        suggestions: ['强化前三秒钩子。'],
      },
      rawResult: {
        fullResult: '{"score":88}',
        sourceMode: 'signed-url',
        errors: [],
      },
      sourceMode: 'signed-url',
      errors: [],
    }
  }),
}))

vi.mock('../../../api/_lib/supabase', () => ({
  createAnalysis: mocks.createAnalysis,
}))

vi.mock('../../../api/_lib/analysisExecution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/_lib/analysisExecution')>()),
  executeAnalysis: mocks.executeAnalysis,
}))

function pipelineInput(overrides: Partial<Parameters<typeof runAnalysisPipeline>[0]> = {}) {
  return {
    userId: 'user-1',
    storagePath: 'videos/demo.mp4',
    origin: 'https://app.example.com',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.createAnalysis.mockClear()
  mocks.executeAnalysis.mockClear()
})

describe('parseAnalysisReport', () => {
  it('normalizes JSON into score, summary, timeline edits, global edits, and suggestions', () => {
    const report = parseAnalysisReport(`
      \`\`\`json
      {
        "score": 101.4,
        "summary": "有清晰卖点。",
        "timelineEdits": [
          {
            "timestamp": "00:05",
            "issue": "转场略硬。",
            "action": "补一个过渡镜头。",
            "category": "剪辑",
            "severity": "urgent"
          }
        ],
        "globalEdits": [
          {
            "issue": "色彩不统一。",
            "action": "统一暖色调。",
            "category": "视觉",
            "severity": "low"
          }
        ],
        "suggestions": ["保留真实口播。", 123]
      }
      \`\`\`
    `)

    expect(report).toEqual({
      score: 100,
      summary: '有清晰卖点。',
      timelineEdits: [
        {
          timestamp: '00:05',
          issue: '转场略硬。',
          action: '补一个过渡镜头。',
          category: '剪辑',
          severity: 'medium',
        },
      ],
      globalEdits: [
        {
          issue: '色彩不统一。',
          action: '统一暖色调。',
          category: '视觉',
          severity: 'low',
        },
      ],
      suggestions: ['保留真实口播。'],
    })
  })
})

describe('runAnalysisPipeline', () => {
  it('creates analysis first, emits creation callback, passes progress through executeAnalysis, and returns output', async () => {
    const events: string[] = []
    const chunkProgress: string[] = []

    const output = await runAnalysisPipeline(pipelineInput({
      onAnalysisCreated: (analysisId) => events.push(`created:${analysisId}`),
      onProgress: (progress) => {
        events.push(`${progress.step}:${progress.sourceMode ?? 'none'}`)
        if (typeof progress.chunk === 'string') chunkProgress.push(progress.chunk)
      },
    }))

    expect(mocks.createAnalysis).toHaveBeenCalledWith('user-1', 'videos/demo.mp4', expect.objectContaining({
      userId: 'user-1',
      storagePath: 'videos/demo.mp4',
    }))
    expect(mocks.executeAnalysis).toHaveBeenCalledWith(expect.objectContaining({
      analysisId: 'analysis-1',
      userId: 'user-1',
      storagePath: 'videos/demo.mp4',
      origin: 'https://app.example.com',
    }))
    expect(events.indexOf('created:analysis-1')).toBeGreaterThan(-1)
    expect(events.indexOf('created:analysis-1')).toBeLessThan(events.indexOf('analysis:signed-url'))
    expect(chunkProgress).toEqual(['chunk-1'])
    expect(output.report).toEqual({
      score: 88,
      summary: '整体节奏清晰。',
      timelineEdits: [],
      globalEdits: [],
      suggestions: ['强化前三秒钩子。'],
    })
  })
})
