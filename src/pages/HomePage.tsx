import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import VideoUploader from '../components/VideoUploader'
import { PLATFORMS, type Platform } from '../lib/types'

export default function HomePage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [storagePath, setStoragePath] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [context, setContext] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')

  const handleAnalyze = async () => {
    if (!storagePath) return
    setAnalyzing(true); setError('')
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storagePath,
          targetAudience: targetAudience || undefined,
          platform: platform || undefined,
          context: context || undefined,
        }),
      })
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || '分析请求失败') }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let analysisId = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ')) {
            try { const data = JSON.parse(line.slice(6)); if (data.analysisId) analysisId = data.analysisId } catch {}
          }
        }
        buffer = ''
      }
      if (analysisId) navigate(`/analysis/${analysisId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '分析失败')
      setAnalyzing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">视频素材分析</h1>
          <p className="text-sm text-gray-500 mt-1">上传视频，AI 帮你分析问题并给出优化建议</p>
        </div>
        {!user ? (
          <div className="text-center py-8">
            <button onClick={login} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">登录后开始使用</button>
          </div>
        ) : (
          <>
            <VideoUploader onUploaded={setStoragePath} />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目标受众 <span className="text-gray-400">（可选）</span></label>
                <input type="text" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="如：18-25 岁年轻人"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">发布平台 <span className="text-gray-400">（可选）</span></label>
                <select value={platform} onChange={e => setPlatform(e.target.value as Platform | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  <option value="">请选择</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">补充上下文 <span className="text-gray-400">（可选）</span></label>
              <textarea value={context} onChange={e => setContext(e.target.value)} rows={4}
                placeholder={"提供更多背景信息，帮助 AI 给出更精准的分析和建议：\n\n例如：\n· 这是某款护肤品的产品宣传片\n· 主打卖点：天然成分、抗衰老\n· 客单价 299 元，主要投放华东地区"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={handleAnalyze} disabled={!storagePath || analyzing}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
              {analyzing ? '分析中...' : '开始分析'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
