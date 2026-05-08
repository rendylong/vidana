import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseAnalysisReport, runAnalysisPipeline } from '../../../api/_lib/analysisPipeline'

const mocks = vi.hoisted(() => ({
  sseChunks: [] as string[][],
  buildAnalysisRequest: vi.fn((videoUrl: string, prompt: string) => ({ videoUrl, prompt })),
  callMimoAPI: vi.fn(async (body: Record<string, unknown>, retries: number) => ({ body, retries })),
  parseSSEStream: vi.fn(async function* () {
    const chunks = mocks.sseChunks.shift() ?? []
    for (const chunk of chunks) yield chunk
  }),
  buildAnalysisPrompt: vi.fn(() => 'analysis prompt'),
  createAnalysis: vi.fn(async () => ({ id: 'analysis-1' })),
  getSignedUrl: vi.fn(async () => 'https://signed.example/video.mp4'),
  getVideoDataUrl: vi.fn(async () => 'data:video/mp4;base64,abc'),
  updateAnalysis: vi.fn(async () => {}),
  chargeAnalysisCredit: vi.fn(async () => {}),
  recordAnalysisFailure: vi.fn(async () => {}),
  buildVideoProxyUrl: vi.fn((origin: string, path: string) => {
    const url = new URL('/api/video', origin)
    url.searchParams.set('path', path)
    return url.toString()
  }),
}))

vi.mock('../../../api/_lib/mimo', () => ({
  buildAnalysisRequest: mocks.buildAnalysisRequest,
  callMimoAPI: mocks.callMimoAPI,
  parseSSEStream: mocks.parseSSEStream,
}))

vi.mock('../../../api/_lib/prompts', () => ({
  buildAnalysisPrompt: mocks.buildAnalysisPrompt,
}))

vi.mock('../../../api/_lib/supabase', () => ({
  createAnalysis: mocks.createAnalysis,
  getSignedUrl: mocks.getSignedUrl,
  getVideoDataUrl: mocks.getVideoDataUrl,
  updateAnalysis: mocks.updateAnalysis,
}))

vi.mock('../../../api/_lib/videoAccess', () => ({
  buildVideoProxyUrl: mocks.buildVideoProxyUrl,
}))

vi.mock('../../../api/_lib/credits', () => ({
  chargeAnalysisCredit: mocks.chargeAnalysisCredit,
  recordAnalysisFailure: mocks.recordAnalysisFailure,
}))

const validReport = {
  score: 88,
  summary: '整体节奏清晰。',
  timelineEdits: [
    {
      timestamp: '00:03',
      issue: '开场利益点不够明确。',
      action: '先呈现用户痛点。',
      category: '剪辑',
      severity: 'high',
    },
  ],
  globalEdits: [
    {
      issue: '字幕风格不统一。',
      action: '统一字幕样式。',
      category: '字幕',
      severity: 'medium',
    },
  ],
  suggestions: ['强化前三秒钩子。'],
}

function pipelineInput(overrides: Partial<Parameters<typeof runAnalysisPipeline>[0]> = {}) {
  return {
    userId: 'user-1',
    storagePath: 'videos/demo.mp4',
    origin: 'https://app.example.com',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.sseChunks.length = 0
  mocks.buildAnalysisRequest.mockClear()
  mocks.callMimoAPI.mockClear()
  mocks.parseSSEStream.mockClear()
  mocks.buildAnalysisPrompt.mockClear()
  mocks.createAnalysis.mockClear()
  mocks.getSignedUrl.mockClear()
  mocks.getVideoDataUrl.mockClear()
  mocks.updateAnalysis.mockClear()
  mocks.chargeAnalysisCredit.mockClear()
  mocks.recordAnalysisFailure.mockClear()
  mocks.buildVideoProxyUrl.mockClear()
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
  it('emits creation early, streams chunk progress, updates completed raw result, and returns report', async () => {
    const events: string[] = []
    const chunkProgress: string[] = []
    const chunks = ['{"score":88,"summary":"整体节奏清晰。",', '"timelineEdits":[],"globalEdits":[],"suggestions":["强化前三秒钩子。"]}']
    mocks.sseChunks.push(chunks)

    const output = await runAnalysisPipeline(pipelineInput({
      onAnalysisCreated: (analysisId) => events.push(`created:${analysisId}`),
      onProgress: (progress) => {
        events.push(`${progress.step}:${progress.sourceMode ?? 'none'}`)
        if (typeof progress.chunk === 'string') chunkProgress.push(progress.chunk)
      },
    }))

    expect(events.indexOf('created:analysis-1')).toBeGreaterThan(-1)
    expect(events.indexOf('created:analysis-1')).toBeLessThan(events.indexOf('analysis:signed-url'))
    expect(chunkProgress).toEqual(chunks)
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'completed',
      raw_result: expect.objectContaining({
        fullResult: chunks.join(''),
        sourceMode: 'signed-url',
      }),
    }))
    expect(mocks.chargeAnalysisCredit).toHaveBeenCalledWith('analysis-1')
    expect(output.report).toEqual({
      score: 88,
      summary: '整体节奏清晰。',
      timelineEdits: [],
      globalEdits: [],
      suggestions: ['强化前三秒钩子。'],
    })
  })

  it('retries proxy URL for trusted non-local origin before data URL when signed URL returns empty content', async () => {
    mocks.sseChunks.push([], [JSON.stringify(validReport)])

    const output = await runAnalysisPipeline(pipelineInput({ origin: 'https://app.example.com' }))

    expect(mocks.buildVideoProxyUrl).toHaveBeenCalledWith('https://app.example.com', 'videos/demo.mp4')
    expect(mocks.getVideoDataUrl).not.toHaveBeenCalled()
    expect(mocks.buildAnalysisRequest.mock.calls.map(([videoUrl]) => videoUrl)).toEqual([
      'https://signed.example/video.mp4',
      'https://app.example.com/api/video?path=videos%2Fdemo.mp4',
    ])
    expect(output.sourceMode).toBe('proxy-url')
  })

  it('skips proxy URL for local origin and falls back to data URL', async () => {
    mocks.sseChunks.push([], [JSON.stringify(validReport)])

    const output = await runAnalysisPipeline(pipelineInput({ origin: 'http://[::1]:5173' }))

    expect(mocks.buildVideoProxyUrl).not.toHaveBeenCalled()
    expect(mocks.getVideoDataUrl).toHaveBeenCalledWith('videos/demo.mp4')
    expect(mocks.buildAnalysisRequest.mock.calls.map(([videoUrl]) => videoUrl)).toEqual([
      'https://signed.example/video.mp4',
      'data:video/mp4;base64,abc',
    ])
    expect(output.sourceMode).toBe('data-url')
  })

  it('marks analysis failed and throws a clear error when all attempts are empty', async () => {
    mocks.sseChunks.push([], [], [])

    await expect(runAnalysisPipeline(pipelineInput())).rejects.toThrow('Mimo did not return analysis content')

    expect(mocks.recordAnalysisFailure).toHaveBeenCalledWith('analysis-1', expect.any(Error))
  })
})
