import { getSupabase } from './supabase'
import type {
  AdminAnalysisSummary,
  AdminMetric,
  AdminRange,
  AdminUserListItem,
  Analysis,
  CreditTransaction,
  User,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

interface RangeWindow {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
}

interface AnalysisWithUser extends Analysis {
  users?: { name?: string | null } | { name?: string | null }[] | null
}

interface AnalysisAggregateRow {
  user_id: string
  status: Analysis['status']
  created_at: string
}

interface AdminDashboard {
  range: AdminRange
  metrics: AdminMetric[]
  recentAnalyses: AdminAnalysisSummary[]
  recentFailures: AdminAnalysisSummary[]
}

interface AdminUserDetail {
  user: AdminUserListItem
  creditTransactions: CreditTransaction[]
  analyses: AdminAnalysisSummary[]
  pagination: {
    page: number
    pageSize: number
    count: number
    totalPages: number
  }
}

function ensureRange(range: AdminRange): AdminRange {
  return range === 'today' || range === '7d' || range === '30d' ? range : '7d'
}

function dateDaysAgo(date: Date, days: number): Date {
  return new Date(date.getTime() - days * DAY_MS)
}

function getShanghaiDayStart(date: Date): Date {
  const shanghaiTime = new Date(date.getTime() + SHANGHAI_OFFSET_MS)
  return new Date(Date.UTC(
    shanghaiTime.getUTCFullYear(),
    shanghaiTime.getUTCMonth(),
    shanghaiTime.getUTCDate(),
  ) - SHANGHAI_OFFSET_MS)
}

function getUserName(row: AnalysisWithUser): string {
  const user = Array.isArray(row.users) ? row.users[0] : row.users
  return user?.name || '未知用户'
}

function mapAnalysisSummary(row: AnalysisWithUser): AdminAnalysisSummary {
  return {
    id: row.id,
    user_id: row.user_id,
    user_name: getUserName(row),
    analysis_type: row.analysis_type,
    status: row.status,
    score: row.score,
    platform: row.platform,
    total_tokens: Number(row.total_tokens || 0),
    error_message: row.error_message,
    created_at: row.created_at,
    completed_at: row.completed_at,
  }
}

function metric(
  key: AdminMetric['key'],
  label: string,
  value: number,
  previousValue: number,
): AdminMetric {
  return {
    key,
    label,
    value,
    previousValue,
    trendPercent: calculateTrendPercent(value, previousValue),
  }
}

function throwIfError(action: string, error: { message?: string } | null | undefined): void {
  if (error) throw new Error(`${action}: ${error.message || 'unknown error'}`)
}

export function getRangeWindow(range: AdminRange, now = new Date()): RangeWindow {
  if (range === 'today') {
    const currentStart = getShanghaiDayStart(now)
    const currentEnd = new Date(currentStart.getTime() + DAY_MS)
    return {
      currentStart,
      currentEnd,
      previousStart: new Date(currentStart.getTime() - DAY_MS),
      previousEnd: currentStart,
    }
  }

  const days = range === '30d' ? 30 : 7
  const currentEnd = new Date(now)
  const currentStart = dateDaysAgo(currentEnd, days)
  return {
    currentStart,
    currentEnd,
    previousStart: dateDaysAgo(currentStart, days),
    previousEnd: currentStart,
  }
}

export function calculateTrendPercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

async function countRows(
  table: 'users' | 'analyses',
  filter: (query: ReturnType<ReturnType<typeof getSupabase>['from']>['select']) => unknown,
): Promise<number> {
  const supabase = getSupabase()
  const query = supabase.from(table).select('id', { count: 'exact', head: true })
  const { count, error } = await filter(query) as { count: number | null; error: { message?: string } | null }
  throwIfError(`Failed to count ${table}`, error)
  return count ?? 0
}

async function sumAnalysisTokens(start: Date, end: Date): Promise<number> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('analyses')
    .select('total_tokens')
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
  throwIfError('Failed to sum analysis tokens', error)
  return ((data || []) as Pick<Analysis, 'total_tokens'>[]).reduce((sum, row) => sum + Number(row.total_tokens || 0), 0)
}

async function analysisSummaries(query: unknown): Promise<AdminAnalysisSummary[]> {
  const { data, error } = await query as { data: AnalysisWithUser[] | null; error: { message?: string } | null }
  throwIfError('Failed to list analyses', error)
  return (data || []).map(mapAnalysisSummary)
}

async function userAnalysisAggregates(userIds: string[]): Promise<Map<string, Omit<AdminUserListItem, 'id' | 'name' | 'avatar_url' | 'created_at' | 'analysis_credits'>>> {
  const aggregates = new Map<string, {
    total_analyses: number
    completed_analyses: number
    failed_analyses: number
    last_analysis_at: string | null
  }>()
  userIds.forEach((id) => {
    aggregates.set(id, {
      total_analyses: 0,
      completed_analyses: 0,
      failed_analyses: 0,
      last_analysis_at: null,
    })
  })
  if (userIds.length === 0) return aggregates

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('analyses')
    .select('user_id, status, created_at')
    .in('user_id', userIds)
  throwIfError('Failed to aggregate user analyses', error)

  for (const row of (data || []) as AnalysisAggregateRow[]) {
    const aggregate = aggregates.get(row.user_id)
    if (!aggregate) continue
    aggregate.total_analyses += 1
    if (row.status === 'completed') aggregate.completed_analyses += 1
    if (row.status === 'failed') aggregate.failed_analyses += 1
    if (!aggregate.last_analysis_at || row.created_at > aggregate.last_analysis_at) {
      aggregate.last_analysis_at = row.created_at
    }
  }

  return aggregates
}

async function toAdminUserListItem(user: User): Promise<AdminUserListItem> {
  const aggregates = await userAnalysisAggregates([user.id])
  const aggregate = aggregates.get(user.id)
  return {
    id: user.id,
    name: user.name,
    avatar_url: user.avatar_url,
    created_at: user.created_at,
    analysis_credits: Number(user.analysis_credits || 0),
    total_analyses: aggregate?.total_analyses ?? 0,
    completed_analyses: aggregate?.completed_analyses ?? 0,
    failed_analyses: aggregate?.failed_analyses ?? 0,
    last_analysis_at: aggregate?.last_analysis_at ?? null,
  }
}

export async function getAdminDashboard(range: AdminRange): Promise<AdminDashboard> {
  const selectedRange = ensureRange(range)
  const window = getRangeWindow(selectedRange)
  const supabase = getSupabase()
  const currentStart = window.currentStart.toISOString()
  const currentEnd = window.currentEnd.toISOString()
  const previousStart = window.previousStart.toISOString()
  const previousEnd = window.previousEnd.toISOString()

  const [
    currentNewUsers,
    previousNewUsers,
    totalUsers,
    previousTotalUsers,
    currentAnalyses,
    previousAnalyses,
    currentSuccesses,
    previousSuccesses,
    currentFailures,
    previousFailures,
    currentTokens,
    previousTokens,
    recentAnalyses,
    recentFailures,
  ] = await Promise.all([
    countRows('users', (query) => query.gte('created_at', currentStart).lt('created_at', currentEnd)),
    countRows('users', (query) => query.gte('created_at', previousStart).lt('created_at', previousEnd)),
    countRows('users', (query) => query.lte('created_at', currentEnd)),
    countRows('users', (query) => query.lte('created_at', previousEnd)),
    countRows('analyses', (query) => query.gte('created_at', currentStart).lt('created_at', currentEnd)),
    countRows('analyses', (query) => query.gte('created_at', previousStart).lt('created_at', previousEnd)),
    countRows('analyses', (query) => query.eq('status', 'completed').gte('created_at', currentStart).lt('created_at', currentEnd)),
    countRows('analyses', (query) => query.eq('status', 'completed').gte('created_at', previousStart).lt('created_at', previousEnd)),
    countRows('analyses', (query) => query.eq('status', 'failed').gte('created_at', currentStart).lt('created_at', currentEnd)),
    countRows('analyses', (query) => query.eq('status', 'failed').gte('created_at', previousStart).lt('created_at', previousEnd)),
    sumAnalysisTokens(window.currentStart, window.currentEnd),
    sumAnalysisTokens(window.previousStart, window.previousEnd),
    analysisSummaries(supabase
      .from('analyses')
      .select('id, user_id, analysis_type, status, score, platform, total_tokens, error_message, created_at, completed_at, users(name)')
      .order('created_at', { ascending: false })
      .limit(10)),
    analysisSummaries(supabase
      .from('analyses')
      .select('id, user_id, analysis_type, status, score, platform, total_tokens, error_message, created_at, completed_at, users(name)')
      .eq('status', 'failed')
      .order('created_at', { ascending: false })
      .limit(10)),
  ])

  return {
    range: selectedRange,
    metrics: [
      metric('new_users', '新增用户', currentNewUsers, previousNewUsers),
      metric('total_users', '总用户', totalUsers, previousTotalUsers),
      metric('analyses', '分析次数', currentAnalyses, previousAnalyses),
      metric('successes', '成功分析', currentSuccesses, previousSuccesses),
      metric('failures', '失败分析', currentFailures, previousFailures),
      metric('tokens', 'Token 消耗', currentTokens, previousTokens),
    ],
    recentAnalyses,
    recentFailures,
  }
}

export async function listAdminUsers(page = 1, q = '', pageSize = 20): Promise<{ data: AdminUserListItem[]; count: number }> {
  const supabase = getSupabase()
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1
  const search = q.trim()

  let countQuery = supabase.from('users').select('id', { count: 'exact', head: true })
  let dataQuery = supabase
    .from('users')
    .select('id, feishu_id, name, avatar_url, analysis_credits, created_at')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (search) {
    countQuery = countQuery.ilike('name', `%${search}%`)
    dataQuery = dataQuery.ilike('name', `%${search}%`)
  }

  const [{ count, error: countError }, { data, error: dataError }] = await Promise.all([countQuery, dataQuery])
  throwIfError('Failed to count admin users', countError)
  throwIfError('Failed to list admin users', dataError)

  const users = (data || []) as User[]
  const aggregates = await userAnalysisAggregates(users.map((user) => user.id))
  return {
    count: count ?? 0,
    data: users.map((user) => {
      const aggregate = aggregates.get(user.id)
      return {
        id: user.id,
        name: user.name,
        avatar_url: user.avatar_url,
        created_at: user.created_at,
        analysis_credits: Number(user.analysis_credits || 0),
        total_analyses: aggregate?.total_analyses ?? 0,
        completed_analyses: aggregate?.completed_analyses ?? 0,
        failed_analyses: aggregate?.failed_analyses ?? 0,
        last_analysis_at: aggregate?.last_analysis_at ?? null,
      }
    }),
  }
}

export async function getAdminUserDetail(userId: string, page = 1, pageSize = 20): Promise<AdminUserDetail | null> {
  const supabase = getSupabase()
  const safePage = Math.max(1, Math.floor(page))
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const from = (safePage - 1) * safePageSize
  const to = from + safePageSize - 1

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, feishu_id, name, avatar_url, analysis_credits, created_at')
    .eq('id', userId)
    .maybeSingle()
  throwIfError('Failed to get admin user', userError)
  if (!user) return null

  const [
    userSummary,
    transactionsResult,
    analysesCountResult,
    analysesResult,
  ] = await Promise.all([
    toAdminUserListItem(user as User),
    supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('analyses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('analyses')
      .select('id, user_id, analysis_type, status, score, platform, total_tokens, error_message, created_at, completed_at, users(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to),
  ])

  throwIfError('Failed to list credit transactions', transactionsResult.error)
  throwIfError('Failed to count user analyses', analysesCountResult.error)
  throwIfError('Failed to list user analyses', analysesResult.error)

  const count = analysesCountResult.count ?? 0
  return {
    user: userSummary,
    creditTransactions: (transactionsResult.data || []) as CreditTransaction[],
    analyses: ((analysesResult.data || []) as AnalysisWithUser[]).map(mapAnalysisSummary),
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      count,
      totalPages: Math.ceil(count / safePageSize),
    },
  }
}

export async function adjustUserCredits(
  userId: string,
  delta: number,
  reason: string,
): Promise<{ analysis_credits: number; transaction: CreditTransaction }> {
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Credit delta must be a nonzero integer.')
  const trimmedReason = reason.trim()
  if (!trimmedReason) throw new Error('Credit adjustment reason is required.')

  const supabase = getSupabase()
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, analysis_credits')
    .eq('id', userId)
    .maybeSingle()
  throwIfError('Failed to get user credits', userError)
  if (!user) throw new Error('User not found.')

  const nextCredits = Number((user as Pick<User, 'analysis_credits'>).analysis_credits || 0) + delta
  if (nextCredits < 0) throw new Error('User credits cannot be negative.')

  const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update({ analysis_credits: nextCredits })
    .eq('id', userId)
    .select('analysis_credits')
    .single()
  throwIfError('Failed to update user credits', updateError)
  if (!updatedUser) throw new Error('Failed to update user credits: empty response')

  const { data: transaction, error: transactionError } = await supabase
    .from('credit_transactions')
    .insert({
      user_id: userId,
      delta,
      reason: trimmedReason,
      source: 'admin_adjustment',
    })
    .select()
    .single()
  throwIfError('Failed to insert credit transaction', transactionError)
  if (!transaction) throw new Error('Failed to insert credit transaction: empty response')

  return {
    analysis_credits: Number((updatedUser as Pick<User, 'analysis_credits'>).analysis_credits || 0),
    transaction: transaction as CreditTransaction,
  }
}

export async function getAdminAnalysisDetail(id: string): Promise<(Analysis & { users?: unknown }) | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('analyses')
    .select('*, users(id, name, avatar_url, analysis_credits, created_at)')
    .eq('id', id)
    .maybeSingle()
  throwIfError('Failed to get admin analysis', error)
  return data as (Analysis & { users?: unknown }) | null
}
