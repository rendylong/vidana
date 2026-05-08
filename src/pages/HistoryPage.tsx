import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Trash, Spinner, ClockCounterClockwise, Video } from '@phosphor-icons/react'
import type { Analysis } from '../lib/types'

const statusLabels: Record<string, { text: string; color: string }> = {
  completed: { text: '已完成', color: 'bg-emerald-50 text-emerald-600' },
  analyzing: { text: '分析中', color: 'bg-amber-50 text-amber-600' },
  failed: { text: '失败', color: 'bg-red-50 text-red-500' },
  pending: { text: '等待中', color: 'bg-zinc-100 text-zinc-500' },
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-red-500'
}

export default function HistoryPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/history', { credentials: 'include' })
      .then(res => res.json())
      .then(data => { setAnalyses(data.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这条分析记录？')) return
    await fetch(`/api/history/${id}`, { method: 'DELETE', credentials: 'include' })
    setAnalyses(prev => prev.filter(a => a.id !== id))
  }

  if (!user) return <div className="flex items-center justify-center h-full"><p className="text-sm text-zinc-400">请先登录</p></div>

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Spinner size={20} weight="bold" className="text-zinc-400 animate-spin" />
    </div>
  )

  if (analyses.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center">
        <ClockCounterClockwise size={20} weight="regular" className="text-zinc-400" />
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-500">还没有分析记录</p>
        <button onClick={() => navigate('/')} className="text-xs text-zinc-400 hover:text-zinc-600 mt-1 transition-colors">开始第一次分析</button>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h2 className="text-sm font-semibold text-zinc-900 tracking-tight mb-6">分析历史</h2>
      <div className="space-y-2">
        {analyses.map(analysis => (
          <div
            key={analysis.id}
            className="bg-white rounded-xl border border-zinc-200/60 px-4 py-3 flex items-center gap-4 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.02)] cursor-pointer hover:border-zinc-300 transition-colors"
            onClick={() => navigate(`/analysis/${analysis.id}`)}
          >
            <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0">
              <Video size={16} weight="fill" className="text-zinc-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusLabels[analysis.status]?.color}`}>
                  {statusLabels[analysis.status]?.text}
                </span>
                {analysis.platform && <span className="text-[10px] text-zinc-400">{analysis.platform}</span>}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">{new Date(analysis.created_at).toLocaleDateString('zh-CN')}</p>
            </div>
            {analysis.score !== null && (
              <div className={`text-lg font-bold tracking-tight ${scoreColor(analysis.score)}`}>
                {analysis.score}
                <span className="text-[10px] font-normal text-zinc-400">/100</span>
              </div>
            )}
            <button
              onClick={e => { e.stopPropagation(); handleDelete(analysis.id) }}
              className="p-1.5 rounded-md text-zinc-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            >
              <Trash size={14} weight="regular" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
