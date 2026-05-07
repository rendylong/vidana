import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBenchmarkReport, runBenchmarkPipeline } from '../../../api/_lib/benchmarkPipeline'

const mocks = vi.hoisted(() => ({
  sseChunks: [] as string[][],
  buildAnalysisRequest: vi.fn((videoUrl: string, prompt: string) => ({ videoUrl, prompt })),
  callMimoAPI: vi.fn(async (body: Record<string, unknown>, retries: number) => ({ body, retries })),
  parseSSEStream: vi.fn(async function* () {
    const chunks = mocks.sseChunks.shift() ?? []
    for (const chunk of chunks) yield chunk
  }),
  buildBenchmarkPrompt: vi.fn(() => 'benchmark prompt'),
  createAnalysis: vi.fn(async () => ({ id: 'benchmark-1' })),
  getSignedUrl: vi.fn(async () => 'https://signed.example/video.mp4'),
  getVideoDataUrl: vi.fn(async () => 'data:video/mp4;base64,abc'),
  updateAnalysis: vi.fn(async () => {}),
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
  buildBenchmarkPrompt: mocks.buildBenchmarkPrompt,
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

const validBenchmarkReport = {
  contentType: 'vlog',
  summary: '真实日常感强',
  coreMechanism: '低门槛代入',
  scriptDesign: {
    structure: ['生活开场'],
    copyPatterns: ['第一人称'],
    emotionalCurve: '轻松',
  },
  visualDesign: {
    sceneStyle: '手持日常',
    shotList: ['出门镜头'],
    editingRhythm: '慢节奏',
    subtitleAndAudio: '自然声',
  },
  hookDesign: {
    openingHook: '今天带你看',
    retentionHooks: ['路线悬念'],
    conversionOrPayoff: '生活方式认同',
  },
  imitationPlan: {
    adaptedAngle: '用自己的周末场景翻拍',
    scriptOutline: ['出门', '体验', '总结'],
    shotInstructions: ['拍路上环境'],
    copyExamples: ['今天不赶路'],
    avoid: ['不要照搬原片地点'],
  },
  productionChecklist: ['确认路线'],
  risks: ['避免使用原片音乐'],
}

function pipelineInput(overrides: Partial<Parameters<typeof runBenchmarkPipeline>[0]> = {}) {
  return {
    userId: 'user-1',
    storagePath: 'videos/demo.mp4',
    ipPositioning: '露营 vlog 博主',
    platform: '小红书',
    origin: 'https://app.example.com',
    ...overrides,
  }
}

beforeEach(() => {
  mocks.sseChunks.length = 0
  mocks.buildAnalysisRequest.mockClear()
  mocks.callMimoAPI.mockClear()
  mocks.parseSSEStream.mockClear()
  mocks.buildBenchmarkPrompt.mockClear()
  mocks.createAnalysis.mockClear()
  mocks.getSignedUrl.mockClear()
  mocks.getVideoDataUrl.mockClear()
  mocks.updateAnalysis.mockClear()
  mocks.buildVideoProxyUrl.mockClear()
})

describe('parseBenchmarkReport', () => {
  it('normalizes complete JSON and does not add a score', () => {
    const report = parseBenchmarkReport(`
      \`\`\`json
      {
        "contentType": "vlog",
        "summary": "真实日常感强",
        "score": 99,
        "coreMechanism": "低门槛代入",
        "scriptDesign": {
          "structure": ["生活开场", 123],
          "copyPatterns": ["第一人称"],
          "emotionalCurve": "轻松"
        },
        "visualDesign": {
          "sceneStyle": "手持日常",
          "shotList": ["出门镜头"],
          "editingRhythm": "慢节奏",
          "subtitleAndAudio": "自然声"
        },
        "hookDesign": {
          "openingHook": "今天带你看",
          "retentionHooks": ["路线悬念"],
          "conversionOrPayoff": "生活方式认同"
        },
        "imitationPlan": {
          "adaptedAngle": "用自己的周末场景翻拍",
          "scriptOutline": ["出门", "体验", "总结"],
          "shotInstructions": ["拍路上环境"],
          "copyExamples": ["今天不赶路"],
          "avoid": ["不要照搬原片地点"]
        },
        "productionChecklist": ["确认路线"],
        "risks": ["避免使用原片音乐"]
      }
      \`\`\`
    `)

    expect(report.contentType).toBe('vlog')
    expect(report.summary).toBe('真实日常感强')
    expect(report.scriptDesign.structure).toEqual(['生活开场'])
    expect(report.imitationPlan.avoid).toEqual(['不要照搬原片地点'])
    expect('score' in report).toBe(false)
  })

  it('falls back to summary text when JSON cannot be parsed', () => {
    expect(parseBenchmarkReport('模型只返回了一段文字')).toEqual({
      contentType: '',
      summary: '模型只返回了一段文字',
      coreMechanism: '',
      scriptDesign: { structure: [], copyPatterns: [], emotionalCurve: '' },
      visualDesign: { sceneStyle: '', shotList: [], editingRhythm: '', subtitleAndAudio: '' },
      hookDesign: { openingHook: '', retentionHooks: [], conversionOrPayoff: '' },
      imitationPlan: { adaptedAngle: '', scriptOutline: [], shotInstructions: [], copyExamples: [], avoid: [] },
      productionChecklist: [],
      risks: [],
    })
  })
})

describe('runBenchmarkPipeline', () => {
  it('creates benchmark analysis, streams chunks, and stores completed report without score', async () => {
    const chunkProgress: string[] = []
    const chunks = [
      '{"contentType":"vlog","summary":"真实",',
      '"coreMechanism":"代入","scriptDesign":{"structure":[],"copyPatterns":[],"emotionalCurve":""},"visualDesign":{"sceneStyle":"","shotList":[],"editingRhythm":"","subtitleAndAudio":""},"hookDesign":{"openingHook":"","retentionHooks":[],"conversionOrPayoff":""},"imitationPlan":{"adaptedAngle":"","scriptOutline":[],"shotInstructions":[],"copyExamples":[],"avoid":[]},"productionChecklist":[],"risks":[]}',
    ]
    mocks.sseChunks.push(chunks)

    const output = await runBenchmarkPipeline(pipelineInput({
      onProgress: (progress) => {
        if (typeof progress.chunk === 'string') chunkProgress.push(progress.chunk)
      },
    }))

    expect(chunkProgress).toEqual(chunks)
    expect(mocks.createAnalysis).toHaveBeenCalledWith('user-1', 'videos/demo.mp4', expect.objectContaining({
      analysisType: 'benchmark',
      targetAudience: undefined,
      platform: '小红书',
      context: '账号/IP定位：露营 vlog 博主',
    }))
    expect(mocks.buildBenchmarkPrompt).toHaveBeenCalledWith(expect.objectContaining({
      ipPositioning: '露营 vlog 博主',
      platform: '小红书',
    }))
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('benchmark-1', expect.objectContaining({
      status: 'completed',
      score: null,
      report: expect.objectContaining({ contentType: 'vlog' }),
      raw_result: expect.objectContaining({
        fullResult: chunks.join(''),
        sourceMode: 'signed-url',
      }),
    }))
    expect(output.report).not.toHaveProperty('score')
    expect(output.sourceMode).toBe('signed-url')
  })

  it('sets targetAudience from targetCustomer and includes optional fields in context', async () => {
    mocks.sseChunks.push([JSON.stringify(validBenchmarkReport)])

    await runBenchmarkPipeline(pipelineInput({
      productOrService: 'AI 视频分析工具',
      targetCustomer: '本地生活商家',
      benchmarkGoal: '学习前三秒钩子',
    }))

    expect(mocks.createAnalysis).toHaveBeenCalledWith('user-1', 'videos/demo.mp4', expect.objectContaining({
      analysisType: 'benchmark',
      targetAudience: '本地生活商家',
      context: [
        '账号/IP定位：露营 vlog 博主',
        '产品/服务：AI 视频分析工具',
        '目标客户：本地生活商家',
        '模仿目标/限制条件：学习前三秒钩子',
      ].join('\n'),
    }))
  })

  it('falls back from signed URL to proxy URL for non-local origin when Mimo returns empty content', async () => {
    mocks.sseChunks.push([], [JSON.stringify(validBenchmarkReport)])

    const output = await runBenchmarkPipeline(pipelineInput({ origin: 'https://app.example.com' }))

    expect(mocks.buildVideoProxyUrl).toHaveBeenCalledWith('https://app.example.com', 'videos/demo.mp4')
    expect(mocks.getVideoDataUrl).not.toHaveBeenCalled()
    expect(mocks.buildAnalysisRequest.mock.calls.map(([videoUrl]) => videoUrl)).toEqual([
      'https://signed.example/video.mp4',
      'https://app.example.com/api/video?path=videos%2Fdemo.mp4',
    ])
    expect(output.sourceMode).toBe('proxy-url')
  })

  it('skips proxy URL for local origin and falls back to data URL', async () => {
    mocks.sseChunks.push([], [JSON.stringify(validBenchmarkReport)])

    const output = await runBenchmarkPipeline(pipelineInput({ origin: 'http://localhost:5174' }))

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

    await expect(runBenchmarkPipeline(pipelineInput())).rejects.toThrow('Mimo did not return benchmark content')

    expect(mocks.updateAnalysis).toHaveBeenCalledWith('benchmark-1', { status: 'failed' })
  })
})
