import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeAnalysis } from '../../../api/_lib/analysisExecution'

const mocks = vi.hoisted(() => ({
  sseChunks: [] as string[][],
  buildAnalysisRequest: vi.fn((videoUrl: string, prompt: string) => ({ videoUrl, prompt })),
  callMimoAPI: vi.fn(async (body: Record<string, unknown>, retries: number) => ({ body, retries })),
  parseSSEStream: vi.fn(async function* () {
    const chunks = mocks.sseChunks.shift() ?? []
    for (const chunk of chunks) yield chunk
  }),
  buildAnalysisPrompt: vi.fn(() => 'analysis prompt'),
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
  score: 90,
  summary: '整体节奏清晰。',
  timelineEdits: [],
  globalEdits: [],
  suggestions: ['强化前三秒钩子。'],
}

function executionInput(overrides: Partial<Parameters<typeof executeAnalysis>[0]> = {}) {
  return {
    analysisId: 'analysis-1',
    userId: 'user-1',
    storagePath: 'user-1/clip.mp4',
    targetAudience: '用户',
    platform: '抖音',
    context: '',
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
  mocks.getSignedUrl.mockClear()
  mocks.getVideoDataUrl.mockClear()
  mocks.updateAnalysis.mockClear()
  mocks.chargeAnalysisCredit.mockClear()
  mocks.recordAnalysisFailure.mockClear()
  mocks.buildVideoProxyUrl.mockClear()
})

describe('executeAnalysis', () => {
  it('marks an existing analysis processing, stores completed report, and charges credit', async () => {
    mocks.sseChunks.push([JSON.stringify(validReport)])

    const output = await executeAnalysis(executionInput())

    const processingUpdate = mocks.updateAnalysis.mock.calls[0][1]
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'processing',
      started_at: expect.any(String),
      locked_at: expect.any(String),
    }))
    expect(processingUpdate).not.toHaveProperty('locked_by')
    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'completed',
      score: 90,
      source_mode: 'signed-url',
      raw_result: expect.objectContaining({
        fullResult: JSON.stringify(validReport),
        sourceMode: 'signed-url',
      }),
    }))
    expect(mocks.chargeAnalysisCredit).toHaveBeenCalledWith('analysis-1')
    expect(output).toEqual(expect.objectContaining({
      analysisId: 'analysis-1',
      sourceMode: 'signed-url',
      report: validReport,
    }))
  })

  it('includes lock owner in processing update only when provided', async () => {
    mocks.sseChunks.push([JSON.stringify(validReport)])

    await executeAnalysis(executionInput({ lockedBy: 'worker-1' }))

    expect(mocks.updateAnalysis).toHaveBeenCalledWith('analysis-1', expect.objectContaining({
      status: 'processing',
      locked_by: 'worker-1',
    }))
  })

  it('retries proxy URL for trusted non-local origin before data URL when signed URL returns empty content', async () => {
    mocks.sseChunks.push([], [JSON.stringify(validReport)])

    const output = await executeAnalysis(executionInput({ origin: 'https://app.example.com' }))

    expect(mocks.buildVideoProxyUrl).toHaveBeenCalledWith('https://app.example.com', 'user-1/clip.mp4')
    expect(mocks.getVideoDataUrl).not.toHaveBeenCalled()
    expect(mocks.buildAnalysisRequest.mock.calls.map(([videoUrl]) => videoUrl)).toEqual([
      'https://signed.example/video.mp4',
      'https://app.example.com/api/video?path=user-1%2Fclip.mp4',
    ])
    expect(output.sourceMode).toBe('proxy-url')
  })

  it('falls back from signed URL to proxy URL to data URL when proxy also returns empty content', async () => {
    mocks.sseChunks.push([], [], [JSON.stringify(validReport)])

    const output = await executeAnalysis(executionInput({ origin: 'https://app.example.com' }))

    expect(mocks.buildVideoProxyUrl).toHaveBeenCalledWith('https://app.example.com', 'user-1/clip.mp4')
    expect(mocks.getVideoDataUrl).toHaveBeenCalledWith('user-1/clip.mp4')
    expect(mocks.buildAnalysisRequest.mock.calls.map(([videoUrl]) => videoUrl)).toEqual([
      'https://signed.example/video.mp4',
      'https://app.example.com/api/video?path=user-1%2Fclip.mp4',
      'data:video/mp4;base64,abc',
    ])
    expect(output.sourceMode).toBe('data-url')
  })

  it('skips proxy URL for local origin and falls back to data URL', async () => {
    mocks.sseChunks.push([], [JSON.stringify(validReport)])

    const output = await executeAnalysis(executionInput({ origin: 'http://[::1]:5173' }))

    expect(mocks.buildVideoProxyUrl).not.toHaveBeenCalled()
    expect(mocks.getVideoDataUrl).toHaveBeenCalledWith('user-1/clip.mp4')
    expect(mocks.buildAnalysisRequest.mock.calls.map(([videoUrl]) => videoUrl)).toEqual([
      'https://signed.example/video.mp4',
      'data:video/mp4;base64,abc',
    ])
    expect(output.sourceMode).toBe('data-url')
  })

  it('marks analysis failed and throws a clear error when all attempts are empty', async () => {
    mocks.sseChunks.push([], [], [])

    await expect(executeAnalysis(executionInput())).rejects.toThrow('Mimo did not return analysis content')

    expect(mocks.recordAnalysisFailure).toHaveBeenCalledWith('analysis-1', expect.any(Error))
    expect(mocks.recordAnalysisFailure).toHaveBeenCalledTimes(1)
    expect(mocks.chargeAnalysisCredit).not.toHaveBeenCalled()
  })
})
