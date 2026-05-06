import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowClockwise,
  ArrowRight,
  CheckCircle,
  Clock,
  ClockCounterClockwise,
  FileVideo,
  FilmSlate,
  Globe,
  Info,
  MusicNote,
  SealCheck,
  Sidebar,
  SidebarSimple,
  Spinner,
  Target,
  TextAa,
  Trash,
  UploadSimple,
  UserFocus,
  Video,
  Warning,
  X,
  Eye,
} from '@phosphor-icons/react'
import { PLATFORMS, type Analysis, type Platform } from '../lib/types'
import { useAuth } from '../hooks/useAuth'

interface AnalysisResult {
  score: number
  summary: string
  timelineEdits: TimelineEdit[]
  globalEdits: GlobalEdit[]
  suggestions: string[]
}

interface TimelineEdit {
  timestamp: string
  issue: string
  action: string
  category: string
  severity: string
}

interface GlobalEdit {
  issue: string
  action: string
  category: string
  severity: string
}

type ProgressState = 'idle' | 'uploading' | 'preparing' | 'analyzing' | 'finalizing' | 'done' | 'error'

const categoryConfig: Record<string, { icon: typeof Eye; color: string; label: string }> = {
  '视觉': { icon: Eye, color: 'text-sky-700 bg-sky-50 border-sky-100', label: '视觉' },
  '剪辑': { icon: FilmSlate, color: 'text-zinc-700 bg-zinc-100 border-zinc-200', label: '剪辑' },
  '字幕': { icon: TextAa, color: 'text-indigo-700 bg-indigo-50 border-indigo-100', label: '字幕' },
  '音频': { icon: MusicNote, color: 'text-amber-700 bg-amber-50 border-amber-100', label: '音频' },
  '人物': { icon: UserFocus, color: 'text-rose-700 bg-rose-50 border-rose-100', label: '人物' },
  '素材': { icon: Globe, color: 'text-teal-700 bg-teal-50 border-teal-100', label: '素材' },
}

const severityConfig: Record<string, { dot: string; label: string; text: string }> = {
  high: { dot: 'bg-red-500', label: '高', text: 'text-red-600' },
  medium: { dot: 'bg-amber-400', label: '中', text: 'text-amber-600' },
  low: { dot: 'bg-zinc-300', label: '低', text: 'text-zinc-500' },
}

const progressCopy: Record<ProgressState, string> = {
  idle: '等待视频和分析条件',
  uploading: '正在上传视频',
  preparing: '正在准备分析任务',
  analyzing: 'AI 正在逐场景检查视频',
  finalizing: '正在整理结构化报告',
  done: '分析完成',
  error: '分析失败',
}

function parseReport(report: unknown): AnalysisResult | null {
  if (!report || typeof report !== 'object') return null
  const r = report as Record<string, unknown>

  const timelineEdits: TimelineEdit[] = Array.isArray(r.timelineEdits)
    ? r.timelineEdits.filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object')).map(e => ({
        timestamp: String(e.timestamp || ''),
        issue: String(e.issue || ''),
        action: String(e.action || ''),
        category: String(e.category || '视觉'),
        severity: ['high', 'medium', 'low'].includes(String(e.severity)) ? String(e.severity) : 'medium',
      }))
    : []

  const globalEdits: GlobalEdit[] = Array.isArray(r.globalEdits)
    ? r.globalEdits.filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object')).map(e => ({
        issue: String(e.issue || ''),
        action: String(e.action || ''),
        category: String(e.category || '视觉'),
        severity: ['high', 'medium', 'low'].includes(String(e.severity)) ? String(e.severity) : 'medium',
      }))
    : []

  const suggestions = Array.isArray(r.suggestions)
    ? r.suggestions.filter((s): s is string => typeof s === 'string')
    : []

  return {
    score: typeof r.score === 'number' ? Math.max(0, Math.min(100, r.score)) : 0,
    summary: typeof r.summary === 'string' ? r.summary : '',
    timelineEdits,
    globalEdits,
    suggestions,
  }
}

function scoreTone(score: number) {
  if (score >= 80) return { text: 'text-emerald-600', bar: 'bg-emerald-500', ring: 'from-emerald-500' }
  if (score >= 60) return { text: 'text-amber-600', bar: 'bg-amber-400', ring: 'from-amber-400' }
  return { text: 'text-red-500', bar: 'bg-red-500', ring: 'from-red-500' }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function resultTitle(analysis: Analysis) {
  if (analysis.target_audience && analysis.platform) return `${analysis.platform} / ${analysis.target_audience}`
  if (analysis.platform) return analysis.platform
  if (analysis.target_audience) return analysis.target_audience
  return analysis.context || '视频分析'
}

export default function AgentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [storagePath, setStoragePath] = useState('')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [context, setContext] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [progress, setProgress] = useState<ProgressState>('idle')
  const [error, setError] = useState('')
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const isWorking = ['uploading', 'preparing', 'analyzing', 'finalizing'].includes(progress)
  const selectedFileName = file?.name || uploadedFileName
  const selectedFileSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''
  const canAnalyze = Boolean((file || storagePath) && targetAudience.trim() && platform && !isWorking)
  const tone = scoreTone(result?.score ?? 0)

  const refreshHistory = useCallback(() => {
    if (!user) return
    fetch('/api/history', { credentials: 'include' })
      .then(res => res.json())
      .then(data => setAnalyses(data.data || []))
      .catch(() => {})
  }, [user])

  useEffect(() => { refreshHistory() }, [refreshHistory])

  useEffect(() => {
    if (!id || !user) return
    ;(async () => {
      try {
        const res = await fetch(`/api/history/${id}`, { credentials: 'include' })
        if (!res.ok) return
        const analysis: Analysis = await res.json()
        setActiveAnalysis(analysis)
        setStoragePath(analysis.video_url)
        setUploadedFileName('历史视频素材')
        setTargetAudience(analysis.target_audience || '')
        setPlatform((analysis.platform as Platform) || '')
        setContext(analysis.context || '')
        setFile(null)
        setError('')
        if (analysis.status === 'completed' && analysis.report) {
          const parsed = parseReport(analysis.report)
          if (parsed) {
            setResult(parsed)
            setProgress('done')
          }
        } else if (analysis.status === 'failed') {
          setResult(null)
          setProgress('error')
          setError('这条历史分析未成功完成')
        } else {
          setResult(null)
          setProgress('idle')
        }
      } catch {
        setError('历史记录加载失败')
      }
    })()
  }, [id, user])

  const resetWorkspace = () => {
    setFile(null)
    setStoragePath('')
    setUploadedFileName('')
    setTargetAudience('')
    setPlatform('')
    setContext('')
    setResult(null)
    setProgress('idle')
    setError('')
    setActiveAnalysis(null)
    navigate('/')
  }

  const handleFileSelect = (nextFile: File | undefined) => {
    if (!nextFile) return
    setFile(nextFile)
    setStoragePath('')
    setUploadedFileName('')
    setResult(null)
    setActiveAnalysis(null)
    setProgress('idle')
    setError('')
    if (id) navigate('/')
  }

  const handleUpload = async (nextFile: File) => {
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(nextFile)
    })
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: nextFile.name, fileBase64: base64 }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '上传失败')
    return data.storagePath as string
  }

  const handleAnalyze = async () => {
    if (!user || isWorking) return
    if (!file && !storagePath) {
      setError('请先上传视频素材')
      return
    }
    if (!targetAudience.trim()) {
      setError('请填写目标用户')
      return
    }
    if (!platform) {
      setError('请选择投放平台')
      return
    }

    setError('')
    setResult(null)
    setProgress(file && !storagePath ? 'uploading' : 'preparing')

    try {
      let path = storagePath
      if (file && !path) {
        path = await handleUpload(file)
        setStoragePath(path)
        setUploadedFileName(file.name)
        setFile(null)
      }

      setProgress('preparing')
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storagePath: path,
          targetAudience: targetAudience.trim(),
          platform,
          context: context.trim() || undefined,
        }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: '分析请求失败' }))
        throw new Error(data.error || '分析请求失败')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventName = 'message'
      let streamedText = ''
      let receivedParsedResult = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''

        for (const block of blocks) {
          const lines = block.split('\n').filter(Boolean)
          const eventLine = lines.find(line => line.startsWith('event: '))
          const dataLine = lines.find(line => line.startsWith('data: '))
          if (eventLine) eventName = eventLine.slice(7).trim()
          if (!dataLine) continue

          const data = JSON.parse(dataLine.slice(6))
          if (eventName === 'status') {
            if (data.status === 'preparing') setProgress('preparing')
            if (data.status === 'analyzing') setProgress('analyzing')
          }
          if (eventName === 'progress') {
            setProgress('analyzing')
            if (typeof data.chunk === 'string') streamedText += data.chunk
          }
          if (eventName === 'result') {
            setProgress('finalizing')
            const parsed = parseReport(data.report)
            if (parsed) {
              receivedParsedResult = true
              setResult(parsed)
            }
          }
          if (eventName === 'error') {
            throw new Error(String(data.message || '分析失败'))
          }
        }
      }

      if (!receivedParsedResult && streamedText) {
        const cleaned = streamedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = parseReport(JSON.parse(jsonMatch[0]))
          if (parsed) {
            receivedParsedResult = true
            setResult(parsed)
          }
        }
      }

      setProgress('done')
      refreshHistory()
    } catch (err) {
      setProgress('error')
      setError(err instanceof Error ? err.message : '分析失败，请稍后再试')
    }
  }

  const handleDeleteHistory = async (e: React.MouseEvent, analysisId: string) => {
    e.stopPropagation()
    await fetch(`/api/history/${analysisId}`, { method: 'DELETE', credentials: 'include' })
    setAnalyses(prev => prev.filter(a => a.id !== analysisId))
    if (id === analysisId) resetWorkspace()
  }

  const briefStats = useMemo(() => {
    const completed = analyses.filter(item => item.status === 'completed').length
    const avgScore = analyses.length
      ? Math.round(analyses.reduce((sum, item) => sum + (item.score || 0), 0) / analyses.filter(item => item.score !== null).length || 0)
      : 0
    return { completed, avgScore }
  }, [analyses])

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center bg-[#f7f8f5] px-6">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-[0_24px_80px_-50px_rgba(24,24,27,0.45)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white">
            <Video size={24} weight="fill" />
          </div>
          <h1 className="mt-5 text-lg font-semibold tracking-tight text-zinc-950">登录后开始分析</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">上传视频素材，填写目标用户和投放平台，生成可执行的修改清单。</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-[#f7f8f5] text-zinc-950 transition-[grid-template-columns] duration-300 lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]"
      style={{ '--sidebar-width': sidebarOpen ? '280px' : '56px' } as React.CSSProperties}
    >
      <aside className="hidden min-h-0 border-r border-zinc-200/80 bg-white/70 lg:flex lg:flex-col">
        {!sidebarOpen ? (
          <div className="flex h-full flex-col items-center gap-3 p-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.96]"
              aria-label="展开历史分析侧边栏"
            >
              <SidebarSimple size={15} weight="regular" />
            </button>
            <button
              onClick={resetWorkspace}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.96]"
              aria-label="新建分析"
            >
              <ArrowRight size={15} weight="regular" />
            </button>
            <div className="mt-2 h-px w-8 bg-zinc-200" />
            <div className="flex flex-col items-center gap-1 rounded-xl bg-zinc-100 px-2 py-2">
              <span className="font-mono text-sm text-zinc-900">{briefStats.completed}</span>
              <span className="text-[10px] text-zinc-400">完成</span>
            </div>
          </div>
        ) : (
          <div className="contents">
            <div className="border-b border-zinc-200/80 p-4">
              <div className="flex gap-2">
                <button
                  onClick={resetWorkspace}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-zinc-950 px-3.5 py-3 text-sm font-medium text-white transition active:scale-[0.98]"
                >
                  新建分析
                  <ArrowRight size={16} weight="bold" />
                </button>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 active:scale-[0.98]"
                  aria-label="收起历史分析侧边栏"
                >
                  <Sidebar size={16} weight="regular" mirrored />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-zinc-100 px-3 py-2">
                  <p className="font-mono text-lg tracking-tight text-zinc-900">{briefStats.completed}</p>
                  <p className="text-[11px] text-zinc-500">已完成</p>
                </div>
                <div className="rounded-xl bg-zinc-100 px-3 py-2">
                  <p className="font-mono text-lg tracking-tight text-zinc-900">{briefStats.avgScore || '-'}</p>
                  <p className="text-[11px] text-zinc-500">均分</p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {analyses.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                  <ClockCounterClockwise size={20} className="text-zinc-300" />
                  <p className="mt-3 text-xs text-zinc-400">暂无历史分析</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {analyses.map(analysis => (
                    <button
                      key={analysis.id}
                      onClick={() => navigate(`/analysis/${analysis.id}`)}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        id === analysis.id ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-100'
                      }`}
                    >
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                        id === analysis.id ? 'bg-white/10' : 'bg-white'
                      }`}>
                        <FileVideo size={15} weight="fill" className={id === analysis.id ? 'text-white' : 'text-zinc-400'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{resultTitle(analysis)}</p>
                        <p className={`mt-0.5 text-[10px] ${id === analysis.id ? 'text-white/55' : 'text-zinc-400'}`}>
                          {formatDate(analysis.created_at)}
                        </p>
                      </div>
                      {analysis.score !== null && (
                        <span className={`font-mono text-xs font-semibold ${id === analysis.id ? 'text-white' : scoreTone(analysis.score).text}`}>
                          {analysis.score}
                        </span>
                      )}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={e => handleDeleteHistory(e, analysis.id)}
                        className={`rounded-md p-1 opacity-0 transition group-hover:opacity-100 ${
                          id === analysis.id ? 'text-white/50 hover:bg-white/10 hover:text-white' : 'text-zinc-300 hover:bg-red-50 hover:text-red-500'
                        }`}
                      >
                        <Trash size={13} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      <main className="min-h-0 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(360px,480px)_minmax(0,1fr)] lg:py-7">
          <section className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-60px_rgba(24,24,27,0.5)]">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Vidana analysis</p>
                  <h1 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-zinc-950 md:text-3xl">
                    视频投放前，把问题先挑出来
                  </h1>
                </div>
                <div className={`hidden rounded-full px-3 py-1.5 text-xs font-medium md:flex ${
                  progress === 'error' ? 'bg-red-50 text-red-600' : progress === 'done' ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {progressCopy[progress]}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-60px_rgba(24,24,27,0.5)]">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-950">分析条件</h2>
                {(file || storagePath || result) && (
                  <button
                    onClick={resetWorkspace}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    <ArrowClockwise size={13} />
                    重置
                  </button>
                )}
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-800">视频素材</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".mp4,.mov,.avi,.wmv,video/*"
                    className="hidden"
                    onChange={e => handleFileSelect(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex min-h-32 w-full items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-left transition active:scale-[0.99] ${
                      selectedFileName ? 'border-zinc-300 bg-zinc-50' : 'border-zinc-300 bg-white hover:border-zinc-500 hover:bg-zinc-50'
                    }`}
                  >
                    {selectedFileName ? (
                      <div className="flex w-full items-center gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white">
                          <FileVideo size={21} weight="fill" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-zinc-900">{selectedFileName}</p>
                          <p className="mt-1 text-xs text-zinc-500">{selectedFileSize || '已选择历史视频'}</p>
                        </div>
                        <X size={16} className="text-zinc-400" />
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
                          <UploadSimple size={22} />
                        </div>
                        <p className="mt-3 text-sm font-medium text-zinc-800">上传视频</p>
                        <p className="mt-1 text-xs text-zinc-400">MP4、MOV、AVI、WMV，建议 20MB 内</p>
                      </div>
                    )}
                  </button>
                </div>

                <div>
                  <label htmlFor="targetAudience" className="mb-2 block text-sm font-medium text-zinc-800">目标用户</label>
                  <div className="relative">
                    <Target size={17} className="pointer-events-none absolute left-3 top-3 text-zinc-400" />
                    <input
                      id="targetAudience"
                      value={targetAudience}
                      onChange={e => setTargetAudience(e.target.value)}
                      placeholder="例如：一线城市 25-35 岁新手妈妈"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-800">投放平台</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {PLATFORMS.map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPlatform(item)}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                          platform === item
                            ? 'border-zinc-950 bg-zinc-950 text-white'
                            : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="context" className="mb-2 block text-sm font-medium text-zinc-800">补充背景</label>
                  <textarea
                    id="context"
                    value={context}
                    onChange={e => setContext(e.target.value)}
                    rows={5}
                    placeholder="补充产品卖点、品牌调性、预算限制、已有脚本、必须保留的镜头等信息。"
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                    <Warning size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {isWorking ? <Spinner size={17} weight="bold" className="animate-spin" /> : <CheckCircle size={17} weight="bold" />}
                  点击分析
                </button>
              </div>
            </div>
          </section>

          <section className="min-h-[520px] rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-60px_rgba(24,24,27,0.5)]">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-950">分析结果</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {activeAnalysis ? `创建于 ${new Date(activeAnalysis.created_at).toLocaleString('zh-CN')}` : '完成后会生成评分、逐场景修改和全局建议'}
                </p>
              </div>
              {result && (
                <div className={`rounded-full bg-gradient-to-r ${tone.ring} to-zinc-200 p-[1px]`}>
                  <div className="rounded-full bg-white px-3 py-1.5 font-mono text-sm font-semibold text-zinc-900">
                    {result.score}/100
                  </div>
                </div>
              )}
            </div>

            {isWorking ? (
              <div className="p-6">
                <div className="rounded-2xl bg-zinc-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
                      <Spinner size={18} weight="bold" className="animate-spin" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{progressCopy[progress]}</p>
                      <p className="mt-1 text-xs text-zinc-500">视频越长，分析时间越久。当前页面保持打开即可。</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <div className="h-20 animate-pulse rounded-xl bg-zinc-200/70" />
                    <div className="h-28 animate-pulse rounded-xl bg-zinc-200/60" />
                    <div className="h-28 animate-pulse rounded-xl bg-zinc-200/50" />
                  </div>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-7 p-5 md:p-6">
                <div className="grid gap-5 lg:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="rounded-2xl bg-zinc-950 p-5 text-white">
                    <p className="text-xs text-white/55">效果评分</p>
                    <p className={`mt-4 font-mono text-5xl font-semibold tracking-tight ${tone.text}`}>{result.score}</p>
                    <div className="mt-5 h-1.5 rounded-full bg-white/15">
                      <div className={`h-1.5 rounded-full ${tone.bar}`} style={{ width: `${result.score}%` }} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 p-5">
                    <p className="text-xs font-medium text-zinc-500">综合判断</p>
                    <p className="mt-3 text-sm leading-7 text-zinc-700">{result.summary || '本次分析没有返回摘要。'}</p>
                  </div>
                </div>

                <ResultSection
                  icon={Clock}
                  title="逐场景修改"
                  count={result.timelineEdits.length}
                  empty="没有发现需要按时间点处理的问题"
                >
                  {result.timelineEdits.map((edit, index) => (
                    <EditRow key={`${edit.timestamp}-${index}`} timestamp={edit.timestamp} edit={edit} index={index} />
                  ))}
                </ResultSection>

                <ResultSection
                  icon={Warning}
                  title="全局修改"
                  count={result.globalEdits.length}
                  empty="没有发现影响全片的共性问题"
                >
                  {result.globalEdits.map((edit, index) => (
                    <EditRow key={`${edit.issue}-${index}`} edit={edit} index={index} />
                  ))}
                </ResultSection>

                <ResultSection
                  icon={SealCheck}
                  title="宏观建议"
                  count={result.suggestions.length}
                  empty="没有额外宏观建议"
                >
                  {result.suggestions.map((suggestion, index) => (
                    <div key={`${suggestion}-${index}`} className="flex gap-3 border-t border-zinc-200 py-3 first:border-t-0 first:pt-0">
                      <Info size={16} className="mt-1 flex-shrink-0 text-zinc-400" />
                      <p className="text-sm leading-6 text-zinc-700">{suggestion}</p>
                    </div>
                  ))}
                </ResultSection>
              </div>
            ) : (
              <div className="flex min-h-[450px] flex-col items-center justify-center px-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
                  <FilmSlate size={26} />
                </div>
                <h3 className="mt-5 text-base font-semibold tracking-tight text-zinc-900">等待分析条件</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                  上传视频，填写目标用户并选择投放平台。补充背景越具体，输出的修改动作越贴近投放场景。
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

function ResultSection({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: typeof Eye
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-zinc-400" />
        <h3 className="text-sm font-semibold tracking-tight text-zinc-950">{title}</h3>
        <span className="ml-auto rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-500">{count}</span>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
        {count > 0 ? children : <p className="py-4 text-center text-sm text-zinc-400">{empty}</p>}
      </div>
    </div>
  )
}

function EditRow({ edit, timestamp, index }: { edit: GlobalEdit; timestamp?: string; index: number }) {
  const category = categoryConfig[edit.category] || categoryConfig['视觉']
  const severity = severityConfig[edit.severity] || severityConfig.medium
  const CategoryIcon = category.icon

  return (
    <div className="grid gap-3 border-t border-zinc-200 py-4 first:border-t-0 first:pt-1 md:grid-cols-[104px_minmax(0,1fr)]">
      <div className="flex items-start gap-2">
        <span className="font-mono text-xs text-zinc-400">{timestamp || `#${String(index + 1).padStart(2, '0')}`}</span>
        <span className={`mt-1 h-1.5 w-1.5 rounded-full ${severity.dot}`} title={`${severity.label}优先级`} />
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${category.color}`}>
            <CategoryIcon size={12} weight="bold" />
            {category.label}
          </span>
          <span className={`text-[11px] font-medium ${severity.text}`}>{severity.label}优先级</span>
        </div>
        <p className="text-sm leading-6 text-zinc-700">{edit.issue}</p>
        <p className="mt-2 text-sm font-medium leading-6 text-zinc-950">{edit.action}</p>
      </div>
    </div>
  )
}
