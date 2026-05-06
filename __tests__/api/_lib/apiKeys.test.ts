import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createApiKey,
  createApiKeySecret,
  hashApiKeySecret,
  isApiKeySecret,
  keyPrefix,
  listApiKeys,
  verifyApiKeySecret,
  verifyBearerApiKey,
} from '../../../api/_lib/apiKeys'

const { getSupabaseMock } = vi.hoisted(() => ({ getSupabaseMock: vi.fn() }))

vi.mock('../../../api/_lib/supabase', () => ({ getSupabase: getSupabaseMock }))

interface MockApiKeyRow {
  id: string
  user_id?: string
  name?: string
  key_hash?: string
  prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

function publicRow(overrides: Partial<MockApiKeyRow> = {}) {
  return {
    id: 'key-1',
    name: 'Default key',
    prefix: 'vdn_abcdefgh',
    last_used_at: null,
    revoked_at: null,
    created_at: '2026-05-06T00:00:00.000Z',
    ...overrides,
  }
}

function createSupabaseMock(options: {
  createData?: MockApiKeyRow
  listData?: MockApiKeyRow[]
  verifyData?: MockApiKeyRow[]
} = {}) {
  const state = {
    fromCalls: [] as string[],
    selectColumns: [] as Array<string | undefined>,
    insertPayloads: [] as unknown[],
    updatePayloads: [] as unknown[],
    eqCalls: [] as Array<[string, unknown]>,
    isCalls: [] as Array<[string, unknown]>,
  }

  const supabase = {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table)
      let mode: 'select' | 'insert' | 'update' = 'select'
      const chain = {
        insert: vi.fn((payload: unknown) => {
          mode = 'insert'
          state.insertPayloads.push(payload)
          return chain
        }),
        update: vi.fn((payload: unknown) => {
          mode = 'update'
          state.updatePayloads.push(payload)
          return chain
        }),
        select: vi.fn((columns?: string) => {
          state.selectColumns.push(columns)
          return chain
        }),
        single: vi.fn(async () => ({ data: options.createData ?? publicRow(), error: null })),
        eq: vi.fn((column: string, value: unknown) => {
          state.eqCalls.push([column, value])
          if (mode === 'update') return Promise.resolve({ error: null })
          return chain
        }),
        is: vi.fn(async (column: string, value: unknown) => {
          state.isCalls.push([column, value])
          return { data: options.verifyData ?? [], error: null }
        }),
        order: vi.fn(async () => ({ data: options.listData ?? [], error: null })),
      }
      return chain
    }),
  }

  return { supabase, state }
}

describe('api key helpers', () => {
  beforeEach(() => {
    getSupabaseMock.mockReset()
  })

  it('creates recognizable Vidana keys', () => {
    const secret = createApiKeySecret()
    expect(secret.startsWith('vdn_')).toBe(true)
    expect(secret.length).toBe(47)
  })

  it('hashes and verifies keys without storing the raw secret', () => {
    const secret = createApiKeySecret()
    const hash = hashApiKeySecret(secret)

    expect(hash).not.toBe(secret)
    expect(verifyApiKeySecret(secret, hash)).toBe(true)
    expect(verifyApiKeySecret(`${secret}x`, hash)).toBe(false)
  })

  it('derives a short display prefix', () => {
    expect(keyPrefix('vdn_abcdefghijklmnopqrstuvwxyz')).toBe('vdn_abcdefgh')
  })

  it('validates exact generated key shape', () => {
    expect(isApiKeySecret(createApiKeySecret())).toBe(true)
    expect(isApiKeySecret('vdn_short')).toBe(false)
    expect(isApiKeySecret(`vdn_${'a'.repeat(44)}`)).toBe(false)
    expect(isApiKeySecret(`vdn_${'a'.repeat(2000)}`)).toBe(false)
    expect(isApiKeySecret(`bad_${'a'.repeat(43)}`)).toBe(false)
  })

  it('creates and lists public key summaries without key_hash', async () => {
    const createdRow = publicRow({ id: 'created-key', name: 'CLI key', prefix: 'vdn_created' })
    const listedRow = publicRow({ id: 'listed-key', name: 'Listed key', prefix: 'vdn_listed1' })
    const { supabase, state } = createSupabaseMock({
      createData: { ...createdRow, key_hash: 'should-not-leak' },
      listData: [{ ...listedRow, key_hash: 'should-not-leak' }],
    })
    getSupabaseMock.mockReturnValue(supabase)

    const created = await createApiKey('user-1', 'CLI key')
    const listed = await listApiKeys('user-1')

    expect(state.selectColumns).toEqual([
      'id, name, prefix, last_used_at, revoked_at, created_at',
      'id, name, prefix, last_used_at, revoked_at, created_at',
    ])
    expect(created.key).toEqual(createdRow)
    expect(listed).toEqual([listedRow])
    expect(created.key).not.toHaveProperty('key_hash')
    expect(listed[0]).not.toHaveProperty('key_hash')
  })

  it('returns null for malformed Bearer values without calling Supabase', async () => {
    expect(await verifyBearerApiKey(`Bearer vdn_${'a'.repeat(2000)}`)).toBeNull()
    expect(await verifyBearerApiKey('Bearer not-a-vidana-key')).toBeNull()
    expect(await verifyBearerApiKey(undefined)).toBeNull()
    expect(getSupabaseMock).not.toHaveBeenCalled()
  })

  it('verifies a matching same-prefix candidate and updates last_used_at', async () => {
    const secret = createApiKeySecret()
    const { supabase, state } = createSupabaseMock({
      verifyData: [
        {
          id: 'wrong-key',
          user_id: 'user-2',
          key_hash: hashApiKeySecret(`${secret.slice(0, -1)}x`),
          prefix: keyPrefix(secret),
          last_used_at: null,
          revoked_at: null,
          created_at: '2026-05-06T00:00:00.000Z',
        },
        {
          id: 'right-key',
          user_id: 'user-1',
          key_hash: hashApiKeySecret(secret),
          prefix: keyPrefix(secret),
          last_used_at: null,
          revoked_at: null,
          created_at: '2026-05-06T00:00:00.000Z',
        },
      ],
    })
    getSupabaseMock.mockReturnValue(supabase)

    await expect(verifyBearerApiKey(`Bearer ${secret}`)).resolves.toEqual({
      userId: 'user-1',
      apiKeyId: 'right-key',
    })
    expect(state.selectColumns).toContain('id, user_id, key_hash')
    expect(state.eqCalls).toContainEqual(['prefix', keyPrefix(secret)])
    expect(state.isCalls).toContainEqual(['revoked_at', null])
    expect(state.updatePayloads[0]).toHaveProperty('last_used_at')
    expect(state.eqCalls).toContainEqual(['id', 'right-key'])
  })
})
