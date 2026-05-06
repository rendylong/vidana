#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_BASE_URL = 'https://vidana.vercel.app'

const VIDEO_MIME_TYPES = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
}

function usage() {
  return `Usage:
  vidana analyze <video-path> --audience <target audience> --platform <platform> [--context <background>]

Environment:
  VIDANA_API_KEY       Required API key from Vidana Web
  VIDANA_API_BASE_URL  Optional service URL override for development
`
}

function parseArgs(argv) {
  if (argv[0] === '--help' || argv[0] === '-h') return { help: true }

  const [command, videoPath, ...rest] = argv
  const options = { command, videoPath, audience: '', platform: '', context: '' }

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]
    if (arg === '--audience') options.audience = rest[++i] || ''
    else if (arg === '--platform') options.platform = rest[++i] || ''
    else if (arg === '--context') options.context = rest[++i] || ''
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown option: ${arg}`)
  }

  return options
}

function videoMimeType(videoPath) {
  const ext = path.extname(videoPath).slice(1).toLowerCase()
  return VIDEO_MIME_TYPES[ext] || 'application/octet-stream'
}

function validate(options, env) {
  if (options.help) return
  if (options.command !== 'analyze') throw new Error('Only `vidana analyze` is supported in this version.')
  if (!options.videoPath) throw new Error('Missing video path.')
  if (!options.audience.trim()) throw new Error('Missing required --audience.')
  if (!options.platform.trim()) throw new Error('Missing required --platform.')
  if (!env.VIDANA_API_KEY) throw new Error('Missing VIDANA_API_KEY. Create an API key in Vidana Web and export it first.')
  if (!fs.existsSync(options.videoPath)) throw new Error(`Video file not found: ${options.videoPath}`)
}

async function analyze(options, env, io) {
  const form = new FormData()
  const buffer = await fs.promises.readFile(options.videoPath)
  const blob = new Blob([buffer], { type: videoMimeType(options.videoPath) })
  form.set('video', blob, path.basename(options.videoPath))
  form.set('targetAudience', options.audience)
  form.set('platform', options.platform)
  if (options.context) form.set('context', options.context)

  const baseUrl = (env.VIDANA_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '')
  const response = await fetch(`${baseUrl}/api/public/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.VIDANA_API_KEY}` },
    body: form,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Vidana API returned HTTP ${response.status}`)
  if (!data.markdown) throw new Error('Vidana API did not return Markdown.')
  io.stdout.write(data.markdown)
}

export async function main(argv = process.argv.slice(2), env = process.env, io = process) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      io.stdout.write(usage())
      return 0
    }
    validate(options, env)
    await analyze(options, env, io)
    return 0
  } catch (err) {
    io.stderr.write(`${err instanceof Error ? err.message : String(err)}\n\n${usage()}`)
    return 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await main()
  process.exit(code)
}
