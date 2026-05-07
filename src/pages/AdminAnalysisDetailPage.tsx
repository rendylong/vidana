import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'

interface AdminAnalysisDetail {
  id: string
  analysis_type?: string
  status?: string
  platform?: string | null
  score?: number | null
  total_tokens?: number | null
  error_message?: string | null
  report?: unknown
  raw_result?: unknown
  data?: unknown
}

function fieldValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function analysisTypeLabel(value: unknown) {
  return value === 'benchmark' ? '视频对标' : '投放分析'
}

export default function AdminAnalysisDetailPage() {
  const { id = '' } = useParams()
  const [data, setData] = useState<AdminAnalysisDetail | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setError('')
    setLoading(true)
    adminFetch<AdminAnalysisDetail>(`/analyses/${id}`)
      .then(setData)
      .catch(err => {
        setData(null)
        setError(err instanceof Error ? err.message : '分析详情加载失败')
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading && !data) return <p className="text-sm text-zinc-400">加载中...</p>

  if (error) {
    return (
      <div>
        <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-900">
          返回用户管理
        </Link>
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (!data) return <p className="text-sm text-zinc-400">暂无分析数据</p>

  const reportData = data.report ?? data.raw_result ?? data.data ?? data

  return (
    <div>
      <Link to="/admin/users" className="text-xs text-zinc-500 hover:text-zinc-900">
        返回用户管理
      </Link>
      <div className="mt-3 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Analysis</p>
        <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight">分析详情</h1>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <Info label="状态" value={fieldValue(data.status)} />
          <Info label="类型" value={analysisTypeLabel(data.analysis_type)} />
          <Info label="平台" value={fieldValue(data.platform)} />
          <Info label="分数" value={fieldValue(data.score)} />
          <Info label="Token" value={fieldValue(data.total_tokens ?? 0)} />
          <Info label="错误" value={fieldValue(data.error_message)} />
        </section>

        <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold">报告 JSON</h2>
          <pre className="mt-3 max-h-[70vh] overflow-auto rounded-md bg-zinc-950 p-4 text-xs leading-6 text-zinc-50">
            {JSON.stringify(reportData, null, 2)}
          </pre>
        </section>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-zinc-100 py-3 first:pt-0 last:border-b-0">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-zinc-900">{value}</p>
    </div>
  )
}
