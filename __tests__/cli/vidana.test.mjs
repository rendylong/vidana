import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from '../../bin/vidana.mjs'

function createIo() {
  return {
    stdout: { write: vi.fn() },
    stderr: { write: vi.fn() },
  }
}

describe('vidana CLI', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns non-zero when API key is missing', async () => {
    const io = createIo()
    const code = await main(['analyze', 'missing.mp4', '--audience', '用户', '--platform', '抖音'], {}, io)

    expect(code).toBe(1)
    expect(io.stderr.write).toHaveBeenCalledWith(expect.stringContaining('Missing VIDANA_API_KEY'))
  })

  it('prints help successfully', async () => {
    const io = createIo()
    const code = await main(['--help'], {}, io)

    expect(code).toBe(0)
    expect(io.stdout.write).toHaveBeenCalledWith(expect.stringContaining('vidana analyze <video-path>'))
  })

  it('uploads a video and prints returned markdown', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vidana-cli-'))
    const videoPath = path.join(dir, 'clip.mp4')
    fs.writeFileSync(videoPath, 'video-data')
    const io = createIo()
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ markdown: '# Vidana\n\n分析完成' }),
    })

    const code = await main([
      'analyze',
      videoPath,
      '--audience',
      '创业者',
      '--platform',
      '小红书',
      '--context',
      '新品发布',
    ], {
      VIDANA_API_KEY: 'vdn_test',
      VIDANA_API_BASE_URL: 'http://localhost:3000/',
    }, io)

    expect(code).toBe(0)
    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/public/analyze', expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer vdn_test' },
      body: expect.any(FormData),
    }))
    expect(io.stdout.write).toHaveBeenCalledWith('# Vidana\n\n分析完成')
  })
})
