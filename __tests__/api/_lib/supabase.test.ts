import { describe, expect, it } from 'vitest'
import { getSupabaseServerConfig, SupabaseServiceRoleKeyError } from '../../../api/_lib/supabase'

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
