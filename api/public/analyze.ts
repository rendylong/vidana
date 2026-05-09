import { randomBytes } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Busboy from 'busboy'
import { verifyBearerApiKey } from '../_lib/apiKeys'
import { ActiveAnalysisLimitError, submitAnalysisJob } from '../_lib/analysisSubmission'
import { assertUserHasCredits, InsufficientCreditsError } from '../_lib/credits'
import { getSupabase } from '../_lib/supabase'

const MAX_VIDEO_BYTES = 50 * 1024 * 1024
const MAX_REQUEST_BYTES = 60 * 1024 * 1024

export const config = {
  api: { bodyParser: false },
  maxDuration: 120,
}

interface MultipartPayload {
  fileName: string
  mimeType: string
  fileBuffer: Buffer
  targetAudience: string
  platform: string
  context?: string
}

class MultipartValidationError extends Error {}
class MultipartParserError extends Error {}

function normalizeHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function isMultipartContentType(contentType: string | undefined): boolean {
  return Boolean(contentType?.toLowerCase().startsWith('multipart/form-data'))
}

function parseContentLength(contentLength: string | undefined): number | null {
  if (!contentLength) return null
  const parsed = Number(contentLength)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return parsed
}

function parseMultipart(req: VercelRequest): Promise<MultipartPayload> {
  const contentType = normalizeHeader(req.headers['content-type'])
  if (!isMultipartContentType(contentType)) {
    return Promise.reject(new MultipartValidationError('multipart/form-data required'))
  }

  const contentLength = parseContentLength(normalizeHeader(req.headers['content-length']))
  if (contentLength !== null && contentLength > MAX_REQUEST_BYTES) {
    return Promise.reject(new MultipartValidationError('video file exceeds 50MB limit'))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const rejectOnce = (err: Error) => {
      if (settled) return
      settled = true
      reject(err)
    }
    const resolveOnce = (payload: MultipartPayload) => {
      if (settled) return
      settled = true
      resolve(payload)
    }

    let busboy: ReturnType<typeof Busboy>
    try {
      busboy = Busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fields: 3,
          fileSize: MAX_VIDEO_BYTES,
          fieldSize: 4000,
          parts: 5,
        },
      })
    } catch (err) {
      rejectOnce(new MultipartParserError(err instanceof Error ? err.message : 'Invalid multipart form data'))
      return
    }

    const fields: Record<string, string> = {}
    const chunks: Buffer[] = []
    let fileName = 'video.mp4'
    let mimeType = 'video/mp4'
    let sawVideo = false
    let totalFileBytes = 0

    busboy.on('field', (name, value, info) => {
      if (info.valueTruncated) {
        rejectOnce(new MultipartValidationError('multipart field exceeds size limit'))
        return
      }
      fields[name] = value
    })

    busboy.on('file', (name, file, info) => {
      if (name !== 'video') {
        file.resume()
        return
      }

      sawVideo = true
      fileName = info.filename || fileName
      mimeType = info.mimeType || mimeType
      file.on('limit', () => {
        rejectOnce(new MultipartValidationError('video file exceeds 50MB limit'))
        file.resume()
      })
      file.on('data', (chunk: Buffer) => {
        totalFileBytes += chunk.length
        if (totalFileBytes > MAX_VIDEO_BYTES) {
          chunks.length = 0
          rejectOnce(new MultipartValidationError('video file exceeds 50MB limit'))
          file.resume()
          return
        }
        chunks.push(Buffer.from(chunk))
      })
      file.on('error', (err) => rejectOnce(new MultipartParserError(err.message)))
    })

    busboy.on('error', (err) => rejectOnce(new MultipartParserError(err.message)))
    busboy.on('filesLimit', () => rejectOnce(new MultipartValidationError('Only one video file is allowed')))
    busboy.on('fieldsLimit', () => rejectOnce(new MultipartValidationError('Too many form fields')))
    busboy.on('partsLimit', () => rejectOnce(new MultipartValidationError('Too many form parts')))
    busboy.on('finish', () => {
      if (!sawVideo || !chunks.length) return rejectOnce(new MultipartValidationError('video file is required'))

      const targetAudience = fields.targetAudience?.trim()
      if (!targetAudience) return rejectOnce(new MultipartValidationError('targetAudience is required'))

      const platform = fields.platform?.trim()
      if (!platform) return rejectOnce(new MultipartValidationError('platform is required'))

      if (!isSupportedVideoFormat(fileName, mimeType)) {
        return rejectOnce(new MultipartValidationError('Unsupported video format'))
      }

      resolveOnce({
        fileName,
        mimeType,
        fileBuffer: Buffer.concat(chunks),
        targetAudience,
        platform,
        context: fields.context?.trim() || undefined,
      })
    })

    req.pipe(busboy)
  })
}

const SUPPORTED_VIDEO_FORMATS: Record<string, readonly string[]> = {
  mp4: ['video/mp4'],
  mov: ['video/quicktime'],
  webm: ['video/webm'],
  avi: ['video/x-msvideo', 'video/avi'],
  wmv: ['video/x-ms-wmv'],
}

function extensionFromFileName(fileName: string): string {
  if (!fileName.includes('.')) return ''
  const ext = fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext || ''
}

function isSupportedVideoFormat(fileName: string, mimeType: string): boolean {
  const ext = extensionFromFileName(fileName)
  const allowedMimeTypes = SUPPORTED_VIDEO_FORMATS[ext]
  if (!allowedMimeTypes) return false

  return !mimeType || allowedMimeTypes.includes(mimeType.toLowerCase())
}

async function uploadVideo(userId: string, payload: MultipartPayload): Promise<string> {
  const ext = extensionFromFileName(payload.fileName)
  const storagePath = `${userId}/${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`
  const { error } = await getSupabase()
    .storage
    .from('videos')
    .upload(storagePath, payload.fileBuffer, {
      contentType: payload.mimeType,
      upsert: false,
    })

  if (error) throw new Error(`Video upload failed: ${error.message}`)
  return storagePath
}

function publicErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'Analysis failed'
  if (err.message.startsWith('Video upload failed:')) return 'Video upload failed'
  return 'Analysis failed'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authorization = normalizeHeader(req.headers.authorization)
  const auth = await verifyBearerApiKey(authorization)
  if (!auth) return res.status(401).json({ error: 'Invalid or missing Vidana API key' })

  try {
    await assertUserHasCredits(auth.userId)
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return res.status(402).json({ error: err.message })
    }
    console.error('Public credit check error:', err)
    return res.status(500).json({ error: 'Analysis credit check failed' })
  }

  let payload: MultipartPayload
  try {
    payload = await parseMultipart(req)
  } catch (err) {
    if (err instanceof MultipartValidationError) {
      return res.status(400).json({ error: err.message })
    }
    console.error('Public multipart parser error:', err)
    return res.status(400).json({ error: 'Invalid multipart form data' })
  }

  try {
    const storagePath = await uploadVideo(auth.userId, payload)
    const { analysisId } = await submitAnalysisJob({
      userId: auth.userId,
      storagePath,
      targetAudience: payload.targetAudience,
      platform: payload.platform,
      context: payload.context,
    })
    return res.status(202).json({ analysisId, status: 'queued' })
  } catch (err) {
    if (err instanceof ActiveAnalysisLimitError) {
      return res.status(429).json({ error: err.message })
    }

    console.error('Public analysis error:', err)
    return res.status(500).json({ error: publicErrorMessage(err) })
  }
}
