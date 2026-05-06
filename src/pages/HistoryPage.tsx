import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { Analysis } from '../lib/types'

const statusLabels: Record<string, { text: string; color: string }> = {
  completed: { text: '已完成', color: 'bg-green-100 text-green-700' },
  analyzing: { text: '分析中', color: 'bg-blue-100 text-blue-700' },
  failed: { text: '失败', color: 'bg-red-100 text-red-700' },
  pending: { text: '等待中', color: 'bg-gray-100 text-gray-700' },
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

export default function HistoryPage() {
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

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>
  if (analyses.length === 0) return (
    <div className="text-center py-20">
      <p className="text-gray-500">还没有分析记录</p>
      <Link to="/" className="text-blue-600 text-sm mt-2 inline-block">去上传视频</Link>
    </div>
  )

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">分析历史</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {analyses.map(analysis => (
          <div key={analysis.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusLabels[analysis.status]?.color}`}>{statusLabels[analysis.status]?.text}</span>
                {analysis.platform && <span className="text-xs text-gray-500">{analysis.platform}</span>}
              </div>
              {analysis.score !== null && <div className={`text-2xl font-bold ${scoreColor(analysis.score)}`}>{analysis.score}<span className="text-sm text-gray-400 font-normal">/100</span></div>}
              <p className="text-xs text-gray-400 mt-2">{new Date(analysis.created_at).toLocaleDateString('zh-CN')}</p>
              <div className="flex gap-2 mt-3">
                <Link to={`/analysis/${analysis.id}`} className="flex-1 text-center text-sm py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">查看详情</Link>
                <button onClick={() => handleDelete(analysis.id)} className="text-sm px-3 py-1.5 text-gray-400 hover:text-red-600">删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
