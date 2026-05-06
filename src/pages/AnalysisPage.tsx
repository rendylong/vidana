import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import ScoreGauge from '../components/ScoreGauge'
import ProblemList from '../components/ProblemList'
import SuggestionList from '../components/SuggestionList'
import PlatformAdvice from '../components/PlatformAdvice'
import type { Analysis, AnalysisReport } from '../lib/types'

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAnalysis = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      const res = await fetch(`/api/history/${id}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setAnalysis(data)
    } catch { setError('加载失败') }
    finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchAnalysis() }, [fetchAnalysis])

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>
  if (error || !analysis) return <div className="text-center py-20 text-red-600">{error || '未找到分析记录'}</div>
  if (analysis.status === 'analyzing' || analysis.status === 'pending') return (
    <div className="text-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
      <p className="mt-4 text-gray-600">正在分析中...</p>
    </div>
  )
  if (analysis.status === 'failed') return <div className="text-center py-20 text-red-600">分析失败，请重新尝试</div>

  const report = analysis.report as AnalysisReport

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <ScoreGauge score={report.score} />
        <p className="text-center text-gray-600 mt-4">{report.summary}</p>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6"><ProblemList problems={report.problems} /></div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6"><SuggestionList suggestions={report.suggestions} /></div>
      {report.platformAdvice && <PlatformAdvice advice={report.platformAdvice} />}
      {report.audienceFit && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-purple-900">受众适配度：{report.audienceFit.score}/100</h3>
          <p className="text-sm text-purple-800 mt-1">{report.audienceFit.reasoning}</p>
        </div>
      )}
    </div>
  )
}
