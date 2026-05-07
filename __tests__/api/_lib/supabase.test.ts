import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSupabaseServerConfig, SupabaseServiceRoleKeyError } from '../../../api/_lib/supabase'

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient,
}))

function fakeSupabaseJwt(role: string): string {
  const payload = Buffer.from(JSON.stringify({ role, ref: 'project-ref' })).toString('base64url')
  return `header.${payload}.signature`
}

describe('Supabase server config', () => {
  it('rejects anon keys passed as SUPABASE_SERVICE_ROLE_KEY', () => {
    expect(() => getSupabaseServerConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: fakeSupabaseJwt('anon'),
    } as NodeJS.ProcessEnv)).toThrow(SupabaseServiceRoleKeyError)
  })

  it('accepts service_role keys', () => {
    expect(getSupabaseServerConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: fakeSupabaseJwt('service_role'),
    } as NodeJS.ProcessEnv)).toEqual({
      url: 'https://project.supabase.co',
      serviceRoleKey: fakeSupabaseJwt('service_role'),
    })
  })

  it('accepts new Supabase secret keys', () => {
    expect(getSupabaseServerConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_123456789',
    } as NodeJS.ProcessEnv)).toEqual({
      url: 'https://project.supabase.co',
      serviceRoleKey: 'sb_secret_123456789',
    })
  })

  it('rejects new Supabase publishable keys', () => {
    expect(() => getSupabaseServerConfig({
      VITE_SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_123456789',
    } as NodeJS.ProcessEnv)).toThrow('publishable key')
  })
})

describe('createAnalysis', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    supabaseMocks.createClient.mockReset()
  })

  it('inserts the default analysis type', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'analysis-1' },
          error: null,
        }),
      }),
    })

    supabaseMocks.createClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
    })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { createAnalysis } = await import('../../../api/_lib/supabase')
    await createAnalysis('user-1', 'https://example.com/video.mp4', {})

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      video_url: 'https://example.com/video.mp4',
      target_audience: null,
      platform: null,
      context: null,
      analysis_type: 'analysis',
      status: 'pending',
    })
  })

  it('throws when analysis creation fails', async () => {
    supabaseMocks.createClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'column analysis_type does not exist' },
            }),
          }),
        }),
      })),
    })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { createAnalysis } = await import('../../../api/_lib/supabase')

    await expect(createAnalysis('user-1', 'https://example.com/video.mp4', {})).rejects.toThrow(
      'Failed to create analysis: column analysis_type does not exist',
    )
  })
})
