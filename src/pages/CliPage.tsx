import { useCallback, useEffect, useState } from 'react'
import { Copy, Key, Terminal, Trash } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'
import type { ApiKeySummary, CreatedApiKeyResponse } from '../lib/types'

const installCommand = 'npm install -g vidana'
const exportCommand = 'export VIDANA_API_KEY="vdn_your_key_here"'
const analyzeCommand = `vidana analyze ./demo.mp4 \\
  --audience "二三线城市 30-50 岁男性" \\
  --platform "抖音" \\
  --context "集成空调投放素材" > report.md`
const agentPrompt = '请使用 vidana analyze 分析 ./demo.mp4，目标用户是二三线城市 30-50 岁男性，平台是抖音，补充背景是集成空调投放素材。'

function isCreatedApiKeyResponse(data: CreatedApiKeyResponse | { error?: string }): data is CreatedApiKeyResponse {
  return typeof (data as CreatedApiKeyResponse).secret === 'string'
}

export default function CliPage() {
  const { user, login } = useAuth()
  const [keys, setKeys] = useState<ApiKeySummary[]>([])
  const [createdSecret, setCreatedSecret] = useState('')
  const [name, setName] = useState('Claude Code')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const refreshKeys = useCallback(async () => {
    if (!user) return
    setError('')
    try {
      const res = await fetch('/api/api-keys', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'API Key 列表加载失败')
      setKeys(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 列表加载失败')
    }
  }, [user])

  useEffect(() => {
    void refreshKeys()
  }, [refreshKeys])

  const createKey = async () => {
    setError('')
    setCopied(false)
    setLoading(true)
    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data: CreatedApiKeyResponse | { error?: string } = await res.json()
      if (!res.ok || !isCreatedApiKeyResponse(data)) throw new Error('error' in data ? data.error : 'API Key 创建失败')
      setCreatedSecret(data.secret)
      await refreshKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 创建失败')
    } finally {
      setLoading(false)
    }
  }

  const revokeKey = async (id: string) => {
    setError('')
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'API Key 删除失败')
      }
      await refreshKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 删除失败')
    }
  }

  const copySecret = async () => {
    if (!createdSecret) return
    await navigator.clipboard.writeText(createdSecret)
    setCopied(true)
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Vidana CLI</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950">
            把视频分析接进你的 Agent 工作流
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-600">
            CLI 版 Vidana 调用线上分析服务，默认输出 Markdown。适合放进 Claude Code、Codex 或团队自己的自动化脚本里。
          </p>

          <div className="mt-8 grid gap-4">
            <DocBlock title="1. 安装 CLI" code={installCommand} />
            <DocBlock title="2. 设置 API Key" code={exportCommand} />
            <DocBlock title="3. 分析视频" code={analyzeCommand} />
            <DocBlock title="4. 在 Agent 中使用" code={agentPrompt} />
          </div>
        </section>

        <aside className="h-fit rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Key size={18} />
            <h2 className="text-sm font-semibold text-zinc-950">API Key</h2>
          </div>

          {!user ? (
            <div className="mt-5">
              <p className="text-sm leading-6 text-zinc-500">登录后可以创建用于 CLI 和 Agent 的 API Key。</p>
              <button onClick={login} className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
                登录
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-500">名称</span>
                <input
                  value={name}
                  onChange={event => setName(event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                />
              </label>
              <button
                onClick={createKey}
                disabled={loading}
                className="w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '创建中...' : '创建 API Key'}
              </button>

              {createdSecret && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-amber-800">只显示一次，请立即复制。</p>
                    <button onClick={copySecret} className="rounded-md p-1.5 text-amber-700 transition hover:bg-amber-100">
                      <Copy size={15} />
                    </button>
                  </div>
                  <code className="mt-2 block break-all font-mono text-xs text-zinc-900">{createdSecret}</code>
                  {copied && <p className="mt-2 text-xs text-amber-700">已复制</p>}
                </div>
              )}

              {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <div className="space-y-2">
                {keys.length === 0 ? (
                  <p className="rounded-md bg-zinc-50 px-3 py-3 text-sm text-zinc-500">还没有 API Key。</p>
                ) : keys.map(key => (
                  <div key={key.id} className="flex items-center gap-2 rounded-md bg-zinc-50 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-800">{key.name}</p>
                      <p className="font-mono text-xs text-zinc-400">{key.prefix}</p>
                    </div>
                    {!key.revoked_at && (
                      <button
                        onClick={() => void revokeKey(key.id)}
                        className="rounded-md p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-500"
                        aria-label={`删除 ${key.name}`}
                      >
                        <Trash size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function DocBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Terminal size={16} className="text-zinc-400" />
        <h2 className="text-sm font-semibold text-zinc-950">{title}</h2>
      </div>
      <pre className="overflow-x-auto rounded-md bg-zinc-950 p-4 font-mono text-sm leading-6 text-zinc-50">
        <code>{code}</code>
      </pre>
    </div>
  )
}
