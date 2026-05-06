import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getSupabase } from './supabase'
import type { ApiKeyRecord, ApiKeySummary, PublicAuthUser } from './types'

export const KEY_PREFIX = 'vdn_'
export const EXPECTED_KEY_LENGTH = 47
const API_KEY_SECRET_PATTERN = /^vdn_[A-Za-z0-9_-]{43}$/
const API_KEY_PUBLIC_COLUMNS = 'id, name, prefix, last_used_at, revoked_at, created_at'

export class ApiKeyStorageNotInitializedError extends Error {
  constructor() {
    super('API key storage is not initialized. Apply Supabase migration 002_api_keys.sql.')
  }
}

function toApiKeySummary(row: ApiKeySummary): ApiKeySummary {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    created_at: row.created_at,
  }
}

function isMissingApiKeysTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: string, message?: string }
  return candidate.code === 'PGRST205'
    || Boolean(candidate.message?.includes("Could not find the table 'public.api_keys'"))
}

function apiKeyStorageError(action: string, error: { message?: string } | null | undefined): Error {
  if (isMissingApiKeysTableError(error)) return new ApiKeyStorageNotInitializedError()
  return new Error(`Failed to ${action} API key: ${error?.message || 'empty response'}`)
}

export function createApiKeySecret(): string {
  return `${KEY_PREFIX}${randomBytes(32).toString('base64url')}`
}

export function keyPrefix(secret: string): string {
  return secret.slice(0, 12)
}

export function isApiKeySecret(secret: string): boolean {
  return secret.length === EXPECTED_KEY_LENGTH && API_KEY_SECRET_PATTERN.test(secret)
}

export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

export function verifyApiKeySecret(secret: string, hash: string): boolean {
  const actual = Buffer.from(hashApiKeySecret(secret), 'hex')
  const expected = Buffer.from(hash, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

export async function createApiKey(userId: string, name: string): Promise<{ secret: string, key: ApiKeySummary }> {
  const secret = createApiKeySecret()
  const supabase = getSupabase()
  const { data, error } = await supabase.from('api_keys').insert({
    user_id: userId,
    name,
    key_hash: hashApiKeySecret(secret),
    prefix: keyPrefix(secret),
  }).select(API_KEY_PUBLIC_COLUMNS).single()
  if (error || !data) throw apiKeyStorageError('create', error)
  return { secret, key: toApiKeySummary(data as ApiKeySummary) }
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('api_keys')
    .select(API_KEY_PUBLIC_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw apiKeyStorageError('list', error)
  return (data as ApiKeySummary[]).map(toApiKeySummary)
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw apiKeyStorageError('revoke', error)
}

export async function verifyBearerApiKey(authHeader: string | undefined): Promise<PublicAuthUser | null> {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  if (!match) return null

  const secret = match[1].trim()
  if (!isApiKeySecret(secret)) return null

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, user_id, key_hash')
    .eq('prefix', keyPrefix(secret))
    .is('revoked_at', null)

  if (error || !data) return null

  const key = (data as Pick<ApiKeyRecord, 'id' | 'user_id' | 'key_hash'>[])
    .find((candidate) => verifyApiKeySecret(secret, candidate.key_hash))
  if (!key) return null

  await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)
  return { userId: key.user_id, apiKeyId: key.id }
}
