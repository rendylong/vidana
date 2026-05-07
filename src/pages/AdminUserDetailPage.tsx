import { FormEvent, useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'
import type { AdminAnalysisSummary, AdminUserListItem, CreditTransaction } from '../lib/types'

interface UserDetail {
  user: AdminUserListItem
  creditTransactions: CreditTransaction[]
  analyses: AdminAnalysisSummary[]
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

function analysisLabel(type: AdminAnalysisSummary['analysis_type']) {
  return type === 'benchmark' ? '视频对标' : '投放分析'
}

export default function AdminUserDetailPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<UserDetail | null>(null)
  const [delta, setDelta] = useState('1')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [adjustError, setAdjustError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setError('')
    setLoading(true)
    try {
      setData(await adminFetch<UserDetail>(`/users/${id}`))
    } catch (err) {
      setData(null)
      setError(err instanceof Error ? err.message : '用户详情加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setAdjustError('')
    setSaving(true)

    try {
      await adminFetch(`/users/${id}/credits`, {
        method: 'POST',
        body: JSON.stringify({ delta: Number(delta), reason }),
      })
      setReason('')
      await load()
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : '额度调整失败')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) return <p className="text-sm text-zinc-400">加载中...</p>

  if (error) {
    return (
      <div>
        <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-900">
          返回用户列表
        </Link>
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!data) return <p className="text-sm text-zinc-400">暂无用户数据</p>

  return (
    <div>
      <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-900">
        返回用户列表
      </Link>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{data.user.name || '未命名用户'}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            分析 {data.user.total_analyses} 次 · 成功 {data.user.completed_analyses} · 失败 {data.user.failed_analyses}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 sm:min-w-36">
          <p className="text-xs text-zinc-500">剩余额度</p>
          <p className="mt-1 break-all font-mono text-3xl font-semibold">{data.user.analysis_credits}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">额度调整</h2>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-zinc-500">调整数量</span>
              <input
                value={delta}
                onChange={event => setDelta(event.target.value)}
                inputMode="numeric"
                className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none transition focus:border-zinc-400"
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">原因</span>
              <input
                value={reason}
                onChange={event => setReason(event.target.value)}
                placeholder="例如：补偿测试额度"
                className="mt-1 h-10 w-full rounded-md border border-zinc-200 px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400"
              />
            </label>
            <button
              type="submit"
              disabled={saving}
              className="h-10 w-full rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {saving ? '调整中...' : '调整额度'}
            </button>
          </form>
          {adjustError && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{adjustError}</p>}

          <div className="mt-6">
            <h2 className="text-sm font-semibold">额度流水</h2>
            <div className="mt-3 divide-y divide-zinc-100">
              {data.creditTransactions.length === 0 ? (
                <p className="py-5 text-center text-sm text-zinc-400">暂无流水</p>
              ) : (
                data.creditTransactions.map(item => (
                  <div key={item.id} className="py-3 text-xs">
                    <div className="flex min-w-0 justify-between gap-3">
                      <span className="min-w-0 break-words text-zinc-900">{item.reason}</span>
                      <span className="shrink-0 font-mono text-zinc-950">
                        {item.delta > 0 ? '+' : ''}
                        {item.delta}
                      </span>
                    </div>
                    <p className="mt-1 text-zinc-400">{formatDate(item.created_at)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">分析记录</h2>
          <div className="mt-3 divide-y divide-zinc-100">
            {data.analyses.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-400">暂无分析记录</p>
            ) : (
              data.analyses.map(item => (
                <Link key={item.id} to={`/admin/analyses/${item.id}`} className="block py-3 text-sm hover:bg-zinc-50">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {analysisLabel(item.analysis_type)} · {item.platform || '-'}
                    </span>
                    <span className="shrink-0 text-xs text-zinc-400">{item.status}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                    <span>分数 {item.score ?? '-'}</span>
                    <span>Token {item.total_tokens}</span>
                    <span>{formatDate(item.created_at)}</span>
                  </div>
                  {item.error_message && <p className="mt-1 break-words text-xs text-red-500">{item.error_message}</p>}
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
