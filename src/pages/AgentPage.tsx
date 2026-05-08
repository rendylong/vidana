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

interface BenchmarkResult {
  contentType: string
  summary: string
  coreMechanism: string
  scriptDesign: {
    structure: string[]
    copyPatterns: string[]
    emotionalCurve: string
  }
  visualDesign: {
    sceneStyle: string
    shotList: string[]
    editingRhythm: string
    subtitleAndAudio: string
  }
  hookDesign: {
    openingHook: string
    retentionHooks: string[]
    conversionOrPayoff: string
  }
  imitationPlan: {
    adaptedAngle: string
    scriptOutline: string[]
    shotInstructions: string[]
    copyExamples: string[]
    avoid: string[]
  }
  productionChecklist: string[]
  risks: string[]
}

type AgentMode = 'analysis' | 'benchmark'
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object')
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function nestedObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

function parseBenchmarkReport(report: unknown): BenchmarkResult | null {
  let source = report
  if (typeof report === 'string') {
    const cleaned = report.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        source = JSON.parse(jsonMatch[0])
      } catch {
        return {
          contentType: '',
          summary: cleaned,
          coreMechanism: '',
          scriptDesign: { structure: [], copyPatterns: [], emotionalCurve: '' },
          visualDesign: { sceneStyle: '', shotList: [], editingRhythm: '', subtitleAndAudio: '' },
          hookDesign: { openingHook: '', retentionHooks: [], conversionOrPayoff: '' },
          imitationPlan: { adaptedAngle: '', scriptOutline: [], shotInstructions: [], copyExamples: [], avoid: [] },
          productionChecklist: [],
          risks: [],
        }
      }
    } else {
      return cleaned ? {
        contentType: '',
        summary: cleaned,
        coreMechanism: '',
        scriptDesign: { structure: [], copyPatterns: [], emotionalCurve: '' },
        visualDesign: { sceneStyle: '', shotList: [], editingRhythm: '', subtitleAndAudio: '' },
        hookDesign: { openingHook: '', retentionHooks: [], conversionOrPayoff: '' },
        imitationPlan: { adaptedAngle: '', scriptOutline: [], shotInstructions: [], copyExamples: [], avoid: [] },
        productionChecklist: [],
        risks: [],
      } : null
    }
  }

  if (!isObject(source)) return null
  const scriptDesign = nestedObject(source.scriptDesign)
  const visualDesign = nestedObject(source.visualDesign)
  const hookDesign = nestedObject(source.hookDesign)
  const imitationPlan = nestedObject(source.imitationPlan)

  return {
    contentType: typeof source.contentType === 'string' ? source.contentType : '',
    summary: typeof source.summary === 'string' ? source.summary : '',
    coreMechanism: typeof source.coreMechanism === 'string' ? source.coreMechanism : '',
    scriptDesign: {
      structure: stringArray(scriptDesign.structure),
      copyPatterns: stringArray(scriptDesign.copyPatterns),
      emotionalCurve: typeof scriptDesign.emotionalCurve === 'string' ? scriptDesign.emotionalCurve : '',
    },
    visualDesign: {
      sceneStyle: typeof visualDesign.sceneStyle === 'string' ? visualDesign.sceneStyle : '',
      shotList: stringArray(visualDesign.shotList),
      editingRhythm: typeof visualDesign.editingRhythm === 'string' ? visualDesign.editingRhythm : '',
      subtitleAndAudio: typeof visualDesign.subtitleAndAudio === 'string' ? visualDesign.subtitleAndAudio : '',
    },
    hookDesign: {
      openingHook: typeof hookDesign.openingHook === 'string' ? hookDesign.openingHook : '',
      retentionHooks: stringArray(hookDesign.retentionHooks),
      conversionOrPayoff: typeof hookDesign.conversionOrPayoff === 'string' ? hookDesign.conversionOrPayoff : '',
    },
    imitationPlan: {
      adaptedAngle: typeof imitationPlan.adaptedAngle === 'string' ? imitationPlan.adaptedAngle : '',
      scriptOutline: stringArray(imitationPlan.scriptOutline),
      shotInstructions: stringArray(imitationPlan.shotInstructions),
      copyExamples: stringArray(imitationPlan.copyExamples),
      avoid: stringArray(imitationPlan.avoid),
    },
    productionChecklist: stringArray(source.productionChecklist),
    risks: stringArray(source.risks),
  }
}

function parseBenchmarkContext(context: string | null) {
  const fields = {
    ipPositioning: '',
    productOrService: '',
    targetCustomer: '',
    benchmarkGoal: '',
  }
  if (!context) return fields
  for (const line of context.split('\n')) {
    const [key, ...rest] = line.split('：')
    const value = rest.join('：').trim()
    if (!value) continue
    if (key === '账号/IP定位') fields.ipPositioning = value
    if (key === '产品/服务') fields.productOrService = value
    if (key === '目标客户') fields.targetCustomer = value
    if (key === '模仿目标/限制条件') fields.benchmarkGoal = value
  }
  return fields
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
  if (analysis.analysis_type === 'benchmark') {
    const contextFields = parseBenchmarkContext(analysis.context)
    if (analysis.platform && analysis.target_audience) return `对标 / ${analysis.platform} / ${analysis.target_audience}`
    if (analysis.platform && contextFields.ipPositioning) return `对标 / ${analysis.platform} / ${contextFields.ipPositioning}`
    if (analysis.platform) return `对标 / ${analysis.platform}`
    return '视频对标'
  }
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
  const [mode, setMode] = useState<AgentMode>('analysis')
  const [targetAudience, setTargetAudience] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const [context, setContext] = useState('')
  const [ipPositioning, setIpPositioning] = useState('')
  const [productOrService, setProductOrService] = useState('')
  const [targetCustomer, setTargetCustomer] = useState('')
  const [benchmarkGoal, setBenchmarkGoal] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null)
  const [progress, setProgress] = useState<ProgressState>('idle')
  const [error, setError] = useState('')
  const [activeAnalysis, setActiveAnalysis] = useState<Analysis | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false)

  const isWorking = ['uploading', 'preparing', 'analyzing', 'finalizing'].includes(progress)
  const selectedFileName = file?.name || uploadedFileName
  const selectedFileSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''
  const canAnalyze = Boolean((file || storagePath) && targetAudience.trim() && platform && !isWorking)
  const canBenchmark = Boolean((file || storagePath) && ipPositioning.trim() && platform && !isWorking)
  const canSubmit = mode === 'analysis' ? canAnalyze : canBenchmark
  const tone = scoreTone(result?.score ?? 0)
  const currentProgressCopy = mode === 'benchmark' && progress === 'analyzing' ? 'AI 正在拆解参考视频' : progressCopy[progress]

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
        const loadedMode: AgentMode = analysis.analysis_type === 'benchmark' ? 'benchmark' : 'analysis'
        const benchmarkFields = parseBenchmarkContext(analysis.context)
        setActiveAnalysis(analysis)
        setMode(loadedMode)
        setStoragePath(analysis.video_url)
        setUploadedFileName('历史视频素材')
        setTargetAudience(loadedMode === 'analysis' ? analysis.target_audience || '' : '')
        setPlatform((analysis.platform as Platform) || '')
        setContext(loadedMode === 'analysis' ? analysis.context || '' : '')
        setIpPositioning(loadedMode === 'benchmark' ? benchmarkFields.ipPositioning : '')
        setProductOrService(loadedMode === 'benchmark' ? benchmarkFields.productOrService : '')
        setTargetCustomer(loadedMode === 'benchmark' ? analysis.target_audience || benchmarkFields.targetCustomer : '')
        setBenchmarkGoal(loadedMode === 'benchmark' ? benchmarkFields.benchmarkGoal : '')
        setFile(null)
        setError('')
        if (analysis.status === 'completed' && analysis.report) {
          if (loadedMode === 'benchmark') {
            const parsed = parseBenchmarkReport(analysis.report)
            setResult(null)
            if (parsed) {
              setBenchmarkResult(parsed)
              setProgress('done')
            }
          } else {
            const parsed = parseReport(analysis.report)
            setBenchmarkResult(null)
            if (parsed) {
              setResult(parsed)
              setProgress('done')
            }
          }
        } else if (analysis.status === 'failed') {
          setResult(null)
          setBenchmarkResult(null)
          setProgress('error')
          setError('这条历史分析未成功完成')
        } else {
          setResult(null)
          setBenchmarkResult(null)
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
    setIpPositioning('')
    setProductOrService('')
    setTargetCustomer('')
    setBenchmarkGoal('')
    setResult(null)
    setBenchmarkResult(null)
    setProgress('idle')
    setError('')
    setActiveAnalysis(null)
    setMobileHistoryOpen(false)
    navigate('/')
  }

  const handleFileSelect = (nextFile: File | undefined) => {
    if (!nextFile) return
    setFile(nextFile)
    setStoragePath('')
    setUploadedFileName('')
    setResult(null)
    setBenchmarkResult(null)
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

  const switchMode = (nextMode: AgentMode) => {
    setMode(nextMode)
    setResult(null)
    setBenchmarkResult(null)
    setError('')
    setProgress('idle')
    setActiveAnalysis(null)
    if (id) navigate('/')
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

  const handleBenchmark = async () => {
    if (!user || isWorking) return
    if (!file && !storagePath) {
      setError('请先上传参考视频')
      return
    }
    if (!ipPositioning.trim()) {
      setError('请填写你的账号/IP定位')
      return
    }
    if (!platform) {
      setError('请选择发布平台')
      return
    }

    setError('')
    setResult(null)
    setBenchmarkResult(null)
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
      const res = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storagePath: path,
          ipPositioning: ipPositioning.trim(),
          platform,
          productOrService: productOrService.trim() || undefined,
          targetCustomer: targetCustomer.trim() || undefined,
          benchmarkGoal: benchmarkGoal.trim() || undefined,
        }),
      })

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({ error: '对标请求失败' }))
        throw new Error(data.error || '对标请求失败')
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
            const parsed = parseBenchmarkReport(data.report)
            if (parsed) {
              receivedParsedResult = true
              setBenchmarkResult(parsed)
            }
          }
          if (eventName === 'error') {
            throw new Error(String(data.message || '对标报告生成失败'))
          }
        }
      }

      if (!receivedParsedResult && streamedText) {
        const parsed = parseBenchmarkReport(streamedText)
        if (parsed) {
          receivedParsedResult = true
          setBenchmarkResult(parsed)
        }
      }

      if (!receivedParsedResult) throw new Error('对标报告生成失败')
      setProgress('done')
      refreshHistory()
    } catch (err) {
      setProgress('error')
      setError(err instanceof Error ? err.message : '对标报告生成失败')
    }
  }

  const handleDeleteHistory = async (e: React.MouseEvent, analysisId: string) => {
    e.stopPropagation()
    await fetch(`/api/history/${analysisId}`, { method: 'DELETE', credentials: 'include' })
    setAnalyses(prev => prev.filter(a => a.id !== analysisId))
    if (id === analysisId) resetWorkspace()
  }

  const openHistoryAnalysis = (analysisId: string) => {
    setMobileHistoryOpen(false)
    navigate(`/analysis/${analysisId}`)
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

      {mobileHistoryOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/35"
            aria-label="关闭历史记录"
            onClick={() => setMobileHistoryOpen(false)}
          />
          <div className="absolute inset-x-3 top-3 max-h-[calc(100vh-24px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-35px_rgba(24,24,27,0.45)]">
            <div className="border-b border-zinc-200 p-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={resetWorkspace}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-xl bg-zinc-950 px-3.5 py-3 text-sm font-medium text-white transition active:scale-[0.98]"
                >
                  新建分析
                  <ArrowRight size={16} weight="bold" />
                </button>
                <button
                  onClick={() => setMobileHistoryOpen(false)}
                  className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition active:scale-[0.98]"
                  aria-label="关闭历史记录"
                >
                  <X size={16} />
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
            <div className="max-h-[min(70vh,560px)] overflow-y-auto p-2">
              {analyses.length === 0 ? (
                <div className="flex min-h-44 flex-col items-center justify-center px-8 text-center">
                  <ClockCounterClockwise size={20} className="text-zinc-300" />
                  <p className="mt-3 text-xs text-zinc-400">暂无历史分析</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {analyses.map(analysis => (
                    <button
                      key={analysis.id}
                      onClick={() => openHistoryAnalysis(analysis.id)}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                        id === analysis.id ? 'bg-zinc-950 text-white' : 'text-zinc-600 active:bg-zinc-100'
                      }`}
                    >
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                        id === analysis.id ? 'bg-white/10' : 'bg-zinc-50'
                      }`}>
                        <FileVideo size={16} weight="fill" className={id === analysis.id ? 'text-white' : 'text-zinc-400'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{resultTitle(analysis)}</p>
                        <p className={`mt-0.5 text-[11px] ${id === analysis.id ? 'text-white/55' : 'text-zinc-400'}`}>
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
                        className={`rounded-md p-2 transition ${
                          id === analysis.id ? 'text-white/50 active:bg-white/10 active:text-white' : 'text-zinc-300 active:bg-red-50 active:text-red-500'
                        }`}
                      >
                        <Trash size={14} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="min-h-0 overflow-y-auto">
        <div className="sticky top-0 z-30 flex items-center gap-2 border-b border-zinc-200/80 bg-[#f7f8f5]/95 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobileHistoryOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm active:scale-[0.98]"
            aria-label="打开历史记录"
          >
            <ClockCounterClockwise size={17} />
          </button>
          <button
            onClick={resetWorkspace}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-sm active:scale-[0.98]"
            aria-label="新建分析"
          >
            <ArrowRight size={16} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-zinc-950">Ovidly</span>
              <span className="shrink-0 text-[10px] font-medium text-zinc-400">多模态视频分析 Agent</span>
            </p>
            <p className="text-[11px] text-zinc-500">{briefStats.completed} 条已完成</p>
          </div>
          {activeAnalysis && (
            <span className="max-w-[42vw] truncate rounded-lg bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500">
              {resultTitle(activeAnalysis)}
            </span>
          )}
        </div>
        <div className="mx-auto grid w-full max-w-[1400px] gap-5 px-4 py-5 md:px-6 lg:grid-cols-[minmax(360px,480px)_minmax(0,1fr)] lg:py-7">
          <section className="space-y-5">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_24px_80px_-60px_rgba(24,24,27,0.5)]">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-950">分析条件</h2>
                {(file || storagePath || result || benchmarkResult) && (
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
                <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1">
                  {(['analysis', 'benchmark'] as AgentMode[]).map(item => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => switchMode(item)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium transition active:scale-[0.98] ${
                        mode === item ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-900'
                      }`}
                    >
                      {item === 'analysis' ? '投放分析' : '视频对标'}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-800">{mode === 'analysis' ? '视频素材' : '参考视频'}</label>
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

                {mode === 'analysis' ? (
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
                ) : (
                  <>
                    <div>
                      <label htmlFor="ipPositioning" className="mb-2 block text-sm font-medium text-zinc-800">你的账号/IP定位</label>
                      <div className="relative">
                        <UserFocus size={17} className="pointer-events-none absolute left-3 top-3 text-zinc-400" />
                        <input
                          id="ipPositioning"
                          value={ipPositioning}
                          onChange={e => setIpPositioning(e.target.value)}
                          placeholder="例如：创始人号、门店老板、母婴博主"
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="productOrService" className="mb-2 block text-sm font-medium text-zinc-800">产品/服务（选填）</label>
                      <input
                        id="productOrService"
                        value={productOrService}
                        onChange={e => setProductOrService(e.target.value)}
                        placeholder="例如：AI 视频分析工具、同城餐饮门店"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                      />
                    </div>

                    <div>
                      <label htmlFor="targetCustomer" className="mb-2 block text-sm font-medium text-zinc-800">目标客户（选填）</label>
                      <div className="relative">
                        <Target size={17} className="pointer-events-none absolute left-3 top-3 text-zinc-400" />
                        <input
                          id="targetCustomer"
                          value={targetCustomer}
                          onChange={e => setTargetCustomer(e.target.value)}
                          placeholder="例如：本地生活商家、准备装修的新婚家庭"
                          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-800">{mode === 'analysis' ? '投放平台' : '发布平台'}</label>
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

                {mode === 'analysis' ? (
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
                ) : (
                  <div>
                    <label htmlFor="benchmarkGoal" className="mb-2 block text-sm font-medium text-zinc-800">模仿目标/限制条件（选填）</label>
                    <textarea
                      id="benchmarkGoal"
                      value={benchmarkGoal}
                      onChange={e => setBenchmarkGoal(e.target.value)}
                      rows={5}
                      placeholder="例如：学习开头、改成同城获客、不能露脸、预算有限、保留品牌调性。"
                      className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm leading-6 text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:ring-4 focus:ring-zinc-100"
                    />
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                    <Warning size={16} className="mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={mode === 'analysis' ? handleAnalyze : handleBenchmark}
                  disabled={!canSubmit}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {isWorking ? <Spinner size={17} weight="bold" className="animate-spin" /> : <CheckCircle size={17} weight="bold" />}
                  {mode === 'analysis' ? '点击分析' : '生成对标报告'}
                </button>
              </div>
            </div>
          </section>

          <section className="min-h-[520px] rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_80px_-60px_rgba(24,24,27,0.5)]">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-950">{mode === 'analysis' ? '分析结果' : '对标报告'}</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  {activeAnalysis
                    ? `创建于 ${new Date(activeAnalysis.created_at).toLocaleString('zh-CN')}`
                    : mode === 'analysis'
                      ? '完成后会生成评分、逐场景修改和全局建议'
                      : '完成后会生成拆解、翻拍方案和拍摄清单'}
                </p>
              </div>
              {mode === 'analysis' && result && (
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
                      <p className="text-sm font-medium text-zinc-900">{currentProgressCopy}</p>
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
            ) : benchmarkResult ? (
              <BenchmarkResultView result={benchmarkResult} />
            ) : (
              <div className="flex min-h-[450px] flex-col items-center justify-center px-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
                  <FilmSlate size={26} />
                </div>
                <h3 className="mt-5 text-base font-semibold tracking-tight text-zinc-900">
                  {mode === 'analysis' ? '等待分析条件' : '等待对标条件'}
                </h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                  {mode === 'analysis'
                    ? '上传视频，填写目标用户并选择投放平台。补充背景越具体，输出的修改动作越贴近投放场景。'
                    : '上传参考视频，填写账号/IP定位和发布平台。补充业务背景后，报告会更贴近你的翻拍场景。'}
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

function BenchmarkResultView({ result }: { result: BenchmarkResult }) {
  return (
    <div className="space-y-7 p-5 md:p-6">
      <div className="grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-2xl bg-zinc-950 p-5 text-white">
          <p className="text-xs text-white/55">视频类型</p>
          <p className="mt-4 text-2xl font-semibold tracking-tight">{result.contentType || '未识别'}</p>
        </div>
        <div className="rounded-2xl bg-zinc-50 p-5">
          <p className="text-xs font-medium text-zinc-500">核心学习点</p>
          <p className="mt-3 text-sm leading-7 text-zinc-700">{result.summary || '本次对标报告没有返回摘要。'}</p>
          {result.coreMechanism && (
            <p className="mt-3 border-t border-zinc-200 pt-3 text-sm leading-7 text-zinc-700">{result.coreMechanism}</p>
          )}
        </div>
      </div>

      <BenchmarkSection icon={TextAa} title="脚本设计">
        <KeyValueList
          rows={[
            ['结构', result.scriptDesign.structure],
            ['表达方式', result.scriptDesign.copyPatterns],
            ['情绪节奏', result.scriptDesign.emotionalCurve],
          ]}
        />
      </BenchmarkSection>

      <BenchmarkSection icon={FilmSlate} title="画面与剪辑设计">
        <KeyValueList
          rows={[
            ['画面风格', result.visualDesign.sceneStyle],
            ['关键镜头', result.visualDesign.shotList],
            ['剪辑节奏', result.visualDesign.editingRhythm],
            ['字幕音频', result.visualDesign.subtitleAndAudio],
          ]}
        />
      </BenchmarkSection>

      <BenchmarkSection icon={Target} title="钩子与留人机制">
        <KeyValueList
          rows={[
            ['前 3 秒钩子', result.hookDesign.openingHook],
            ['中途留人点', result.hookDesign.retentionHooks],
            ['最终 payoff', result.hookDesign.conversionOrPayoff],
          ]}
        />
      </BenchmarkSection>

      <BenchmarkSection icon={ArrowRight} title="结合自身需求的翻拍方案">
        <KeyValueList
          rows={[
            ['翻拍角度', result.imitationPlan.adaptedAngle],
            ['脚本大纲', result.imitationPlan.scriptOutline],
            ['镜头建议', result.imitationPlan.shotInstructions],
            ['台词字幕', result.imitationPlan.copyExamples],
            ['不要照搬', result.imitationPlan.avoid],
          ]}
        />
      </BenchmarkSection>

      <BenchmarkSection icon={CheckCircle} title="拍摄检查清单">
        <PlainList items={result.productionChecklist} empty="没有返回拍摄检查项" />
      </BenchmarkSection>

      <BenchmarkSection icon={Warning} title="风险与避坑">
        <PlainList items={result.risks} empty="没有返回风险提示" />
      </BenchmarkSection>
    </div>
  )
}

function BenchmarkSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Eye
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-zinc-400" />
        <h3 className="text-sm font-semibold tracking-tight text-zinc-950">{title}</h3>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3">
        {children}
      </div>
    </section>
  )
}

function KeyValueList({ rows }: { rows: [string, string | string[]][] }) {
  const visibleRows = rows.filter(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value))
  if (visibleRows.length === 0) return <p className="py-4 text-center text-sm text-zinc-400">这一节没有返回可展示内容</p>

  return (
    <div className="divide-y divide-zinc-200">
      {visibleRows.map(([label, value]) => (
        <div key={label} className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[96px_minmax(0,1fr)]">
          <p className="text-xs font-medium text-zinc-500">{label}</p>
          {Array.isArray(value) ? <PlainList items={value} /> : <p className="text-sm leading-6 text-zinc-700">{value}</p>}
        </div>
      ))}
    </div>
  )
}

function PlainList({ items, empty }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="py-1 text-sm text-zinc-400">{empty || '暂无内容'}</p>

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={`${item}-${index}`} className="flex gap-2">
          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-zinc-300" />
          <p className="text-sm leading-6 text-zinc-700">{item}</p>
        </div>
      ))}
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
