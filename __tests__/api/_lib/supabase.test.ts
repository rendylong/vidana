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

describe('countActiveAnalysisTasks', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    supabaseMocks.createClient.mockReset()
  })

  it('counts active queued and processing tasks through the Supabase RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: 2,
      error: null,
    })

    supabaseMocks.createClient.mockReturnValue({ rpc })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { countActiveAnalysisTasks } = await import('../../../api/_lib/supabase')

    await expect(countActiveAnalysisTasks('user-1')).resolves.toBe(2)
    expect(rpc).toHaveBeenCalledWith('count_active_analysis_tasks', { p_user_id: 'user-1' })
  })

  it('throws when the active task count RPC fails', async () => {
    supabaseMocks.createClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'function missing' },
      }),
    })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { countActiveAnalysisTasks } = await import('../../../api/_lib/supabase')

    await expect(countActiveAnalysisTasks('user-1')).rejects.toThrow(
      'Failed to count active analysis tasks: function missing',
    )
  })
})

describe('updateAnalysis', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    supabaseMocks.createClient.mockReset()
  })

  it('throws when the Supabase update fails', async () => {
    supabaseMocks.createClient.mockReturnValue({
      from: vi.fn(() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            error: { message: 'permission denied' },
          }),
        }),
      })),
    })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { updateAnalysis } = await import('../../../api/_lib/supabase')

    await expect(updateAnalysis('analysis-1', { status: 'failed' })).rejects.toThrow(
      'Failed to update analysis: permission denied',
    )
  })
})

describe('createQueuedAnalysisJob', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
    supabaseMocks.createClient.mockReset()
  })

  it('creates a queued analysis row through the atomic Supabase RPC', async () => {
    const row = {
      id: 'analysis-1',
      user_id: 'user-1',
      queued_at: '2026-05-08T10:00:00.000Z',
      status: 'queued',
    }
    const rpc = vi.fn().mockResolvedValue({
      data: row,
      error: null,
    })

    supabaseMocks.createClient.mockReturnValue({ rpc })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { createQueuedAnalysisJob } = await import('../../../api/_lib/supabase')

    await expect(createQueuedAnalysisJob({
      userId: 'user-1',
      videoUrl: 'user-1/video.mp4',
      targetAudience: '用户',
      platform: '抖音',
      context: '',
      analysisType: 'benchmark',
      activeLimit: 5,
    })).resolves.toBe(row)
    expect(rpc).toHaveBeenCalledWith('create_queued_analysis_job', {
      p_user_id: 'user-1',
      p_video_url: 'user-1/video.mp4',
      p_target_audience: '用户',
      p_platform: '抖音',
      p_context: '',
      p_analysis_type: 'benchmark',
      p_active_limit: 5,
    })
  })

  it('throws when the queued analysis RPC fails', async () => {
    supabaseMocks.createClient.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'ACTIVE_ANALYSIS_LIMIT_EXCEEDED' },
      }),
    })

    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', fakeSupabaseJwt('service_role'))

    const { createQueuedAnalysisJob } = await import('../../../api/_lib/supabase')

    await expect(createQueuedAnalysisJob({
      userId: 'user-1',
      videoUrl: 'user-1/video.mp4',
      activeLimit: 3,
    })).rejects.toThrow('Failed to create queued analysis job: ACTIVE_ANALYSIS_LIMIT_EXCEEDED')
  })
})
