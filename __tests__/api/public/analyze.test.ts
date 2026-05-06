import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../api/public/analyze'

const {
  verifyBearerApiKeyMock,
  getSupabaseMock,
  supabaseFromMock,
  supabaseUploadMock,
  runAnalysisPipelineMock,
  formatAnalysisMarkdownMock,
} = vi.hoisted(() => {
  const supabaseUploadMock = vi.fn()
  const supabaseFromMock = vi.fn(() => ({ upload: supabaseUploadMock }))
  return {
    verifyBearerApiKeyMock: vi.fn(),
    getSupabaseMock: vi.fn(() => ({
      storage: {
        from: supabaseFromMock,
      },
    })),
    supabaseFromMock,
    supabaseUploadMock,
    runAnalysisPipelineMock: vi.fn(),
    formatAnalysisMarkdownMock: vi.fn(),
  }
})

vi.mock('../../../api/_lib/apiKeys', () => ({
  verifyBearerApiKey: verifyBearerApiKeyMock,
}))

vi.mock('../../../api/_lib/supabase', () => ({
  getSupabase: getSupabaseMock,
}))

vi.mock('../../../api/_lib/analysisPipeline', () => ({
  runAnalysisPipeline: runAnalysisPipelineMock,
}))

vi.mock('../../../api/_lib/markdown', () => ({
  formatAnalysisMarkdown: formatAnalysisMarkdownMock,
}))

function createResponse() {
  let statusCode = 200
  let jsonBody: unknown = null
  const headers: Record<string, string> = {}
  const res = {
    status(code: number) {
      statusCode = code
      return this
    },
    setHeader(name: string, value: string) {
      headers[name] = value
      return this
    },
    json(body: unknown) {
      jsonBody = body
      return this
    },
  }

  return {
    res,
    get statusCode() { return statusCode },
    get jsonBody() { return jsonBody },
    get headers() { return headers },
  }
}

function multipartField(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\n`
    + `Content-Disposition: form-data; name="${name}"\r\n\r\n`
    + `${value}\r\n`,
  )
}

function createMultipartRequest({
  filename = 'clip.mp4',
  mime = 'video/mp4',
  fileContent = Buffer.from('video-data'),
  targetAudience = 'Product marketers',
  platform = 'LinkedIn',
  context = 'Launch teaser',
}: {
  filename?: string
  mime?: string
  fileContent?: Buffer
  targetAudience?: string
  platform?: string
  context?: string
} = {}) {
  const boundary = '----vidana-test-boundary'
  const body = Buffer.concat([
    multipartField(boundary, 'targetAudience', targetAudience),
    multipartField(boundary, 'platform', platform),
    multipartField(boundary, 'context', context),
    Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="video"; filename="${filename}"\r\n`
      + `Content-Type: ${mime}\r\n\r\n`,
    ),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const req = Readable.from([body]) as never
  return Object.assign(req, {
    method: 'POST',
    headers: {
      authorization: 'Bearer valid-key',
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  })
}

describe('public analyze API', () => {
  beforeEach(() => {
    verifyBearerApiKeyMock.mockReset()
    getSupabaseMock.mockClear()
    supabaseFromMock.mockClear()
    supabaseUploadMock.mockReset()
    runAnalysisPipelineMock.mockReset()
    formatAnalysisMarkdownMock.mockReset()
  })

  it('rejects missing API key', async () => {
    verifyBearerApiKeyMock.mockResolvedValue(null)
    const response = createResponse()

    await handler({ method: 'POST', headers: {} } as never, response.res as never)

    expect(response.statusCode).toBe(401)
    expect(response.jsonBody).toEqual({ error: 'Invalid or missing Vidana API key' })
  })

  it('returns 405 for unsupported methods', async () => {
    const response = createResponse()

    await handler({ method: 'GET', headers: {} } as never, response.res as never)

    expect(response.statusCode).toBe(405)
    expect(response.jsonBody).toEqual({ error: 'Method not allowed' })
    expect(verifyBearerApiKeyMock).not.toHaveBeenCalled()
  })

  it('normalizes authorization header arrays before API key verification', async () => {
    verifyBearerApiKeyMock.mockResolvedValue(null)
    const response = createResponse()

    await handler({
      method: 'POST',
      headers: { authorization: ['Bearer first-key', 'Bearer second-key'] },
    } as never, response.res as never)

    expect(verifyBearerApiKeyMock).toHaveBeenCalledWith('Bearer first-key')
  })

  it('rejects non multipart content types after valid auth', async () => {
    verifyBearerApiKeyMock.mockResolvedValue({ userId: 'user-1' })
    const response = createResponse()

    await handler({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-key',
        'content-type': 'application/json',
        'content-length': '2',
      },
      pipe: vi.fn(),
    } as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'multipart/form-data required' })
  })

  it('rejects unsupported extension and mime multipart uploads', async () => {
    verifyBearerApiKeyMock.mockResolvedValue({ userId: 'user-1' })
    const response = createResponse()

    await handler(createMultipartRequest({
      filename: 'clip.mkv',
      mime: 'video/x-matroska',
    }), response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'Unsupported video format' })
    expect(supabaseUploadMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('uploads multipart video, runs analysis, formats markdown, and returns markdown', async () => {
    verifyBearerApiKeyMock.mockResolvedValue({ userId: 'user-1' })
    supabaseUploadMock.mockResolvedValue({ error: null })
    runAnalysisPipelineMock.mockResolvedValue({
      analysisId: 'analysis-1',
      report: { overallScore: 8, summary: 'Strong video' },
    })
    formatAnalysisMarkdownMock.mockReturnValue('# Analysis\n\nStrong video')
    const response = createResponse()

    await handler(createMultipartRequest(), response.res as never)

    expect(supabaseFromMock).toHaveBeenCalledWith('videos')
    expect(supabaseUploadMock).toHaveBeenCalledOnce()
    expect(supabaseUploadMock.mock.calls[0][2]).toMatchObject({ contentType: 'video/mp4', upsert: false })
    expect(runAnalysisPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      storagePath: expect.stringMatching(/^user-1\/\d+-[a-f0-9]+\.mp4$/),
      targetAudience: 'Product marketers',
      platform: 'LinkedIn',
      context: 'Launch teaser',
    }))
    expect(formatAnalysisMarkdownMock).toHaveBeenCalledWith(
      { overallScore: 8, summary: 'Strong video' },
      expect.objectContaining({
        fileName: 'clip.mp4',
        targetAudience: 'Product marketers',
        platform: 'LinkedIn',
      }),
    )
    expect(response.statusCode).toBe(200)
    expect(response.jsonBody).toEqual({
      analysisId: 'analysis-1',
      markdown: '# Analysis\n\nStrong video',
      report: { overallScore: 8, summary: 'Strong video' },
    })
  })

  it('rejects oversized content length before parsing or upload', async () => {
    verifyBearerApiKeyMock.mockResolvedValue({ userId: 'user-1' })
    const response = createResponse()
    const pipeMock = vi.fn()

    await handler({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-key',
        'content-type': 'multipart/form-data; boundary=----vidana-test-boundary',
        'content-length': String(60 * 1024 * 1024 + 1),
      },
      pipe: pipeMock,
    } as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'video file exceeds 50MB limit' })
    expect(pipeMock).not.toHaveBeenCalled()
    expect(supabaseUploadMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })

  it('rejects multipart requests with too many fields', async () => {
    verifyBearerApiKeyMock.mockResolvedValue({ userId: 'user-1' })
    const boundary = '----vidana-too-many-fields'
    const body = Buffer.concat([
      multipartField(boundary, 'targetAudience', 'Product marketers'),
      multipartField(boundary, 'platform', 'LinkedIn'),
      multipartField(boundary, 'context', 'Launch teaser'),
      multipartField(boundary, 'extra', 'not allowed'),
      Buffer.from(
        `--${boundary}\r\n`
        + 'Content-Disposition: form-data; name="video"; filename="clip.mp4"\r\n'
        + 'Content-Type: video/mp4\r\n\r\n'
        + 'video-data'
        + `\r\n--${boundary}--\r\n`,
      ),
    ])
    const req = Object.assign(Readable.from([body]), {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-key',
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': String(body.length),
      },
    })
    const response = createResponse()

    await handler(req as never, response.res as never)

    expect(response.statusCode).toBe(400)
    expect(response.jsonBody).toEqual({ error: 'Too many form fields' })
    expect(supabaseUploadMock).not.toHaveBeenCalled()
    expect(runAnalysisPipelineMock).not.toHaveBeenCalled()
  })
})
