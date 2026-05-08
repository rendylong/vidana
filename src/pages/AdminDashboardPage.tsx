import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'
import type { AdminAnalysisSummary, AdminMetric, AdminRange } from '../lib/types'

interface DashboardResponse {
  range: AdminRange
  metrics: AdminMetric[]
  recentAnalyses: AdminAnalysisSummary[]
  recentFailures: AdminAnalysisSummary[]
}

const ranges: Array<{ value: AdminRange; label: string }> = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '7 日' },
  { value: '30d', label: '30 日' },
]

function trendText(value: number | null) {
  if (value === null) return '新增'
  if (value === 0) return '持平'
  return `${value > 0 ? '+' : ''}${value}%`
}

export default function AdminDashboardPage() {
  const [range, setRange] = useState<AdminRange>('today')
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setError('')
    setLoading(true)
    adminFetch<DashboardResponse>(`/dashboard?range=${range}`)
      .then(setData)
      .catch(err => {
        setData(null)
        setError(err instanceof Error ? err.message : '后台数据加载失败')
      })
      .finally(() => setLoading(false))
  }, [range])

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Dashboard</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">运营概览</h1>
        </div>
        <div className="inline-flex w-fit rounded-lg bg-zinc-100 p-1">
          {ranges.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => setRange(item.value)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition ${
                range === item.value ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && !data
          ? ranges.map(item => (
              <div key={item.value} className="h-[106px] rounded-lg border border-zinc-200 bg-white p-4">
                <div className="h-3 w-20 rounded bg-zinc-100" />
                <div className="mt-5 h-7 w-24 rounded bg-zinc-100" />
              </div>
            ))
          : (data?.metrics || []).map(metric => (
          <div key={metric.key} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-xs text-zinc-500">{metric.label}</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="break-all font-mono text-2xl font-semibold">{metric.value}</p>
              <span className="shrink-0 text-xs text-zinc-400">{trendText(metric.trendPercent)}</span>
            </div>
          </div>
            ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <AnalysisList title="最近分析" items={data?.recentAnalyses || []} loading={loading && !data} />
        <AnalysisList title="失败分析" items={data?.recentFailures || []} loading={loading && !data} />
      </div>
    </div>
  )
}

function AnalysisList({ title, items, loading }: { title: string; items: AdminAnalysisSummary[]; loading: boolean }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 divide-y divide-zinc-100">
        {loading ? (
          <div className="space-y-3 py-3">
            <div className="h-4 w-3/4 rounded bg-zinc-100" />
            <div className="h-4 w-1/2 rounded bg-zinc-100" />
            <div className="h-4 w-2/3 rounded bg-zinc-100" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">暂无记录</p>
        ) : (
          items.map(item => (
            <Link key={item.id} to={`/admin/analyses/${item.id}`} className="block py-3 text-sm hover:bg-zinc-50">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {item.user_name} · {item.platform || '-'}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{item.status}</span>
              </div>
              {item.error_message && <p className="mt-1 truncate text-xs text-red-500">{item.error_message}</p>}
            </Link>
          ))
        )}
      </div>
    </section>
  )
}
