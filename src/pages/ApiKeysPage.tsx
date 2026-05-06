import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Key, PencilSimple, Plus, Trash, X } from '@phosphor-icons/react'
import { useAuth } from '../hooks/useAuth'
import type { ApiKeySummary, CreatedApiKeyResponse } from '../lib/types'

function isCreatedApiKeyResponse(data: CreatedApiKeyResponse | { error?: string }): data is CreatedApiKeyResponse {
  return typeof (data as CreatedApiKeyResponse).secret === 'string'
}

export default function ApiKeysPage() {
  const { user, login } = useAuth()
  const [keys, setKeys] = useState<ApiKeySummary[]>([])
  const [name, setName] = useState('Claude Code')
  const [createdSecret, setCreatedSecret] = useState('')
  const [copied, setCopied] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  const updateKey = async (id: string) => {
    const nextName = editingName.trim()
    if (!nextName) {
      setError('名称不能为空')
      return
    }

    setError('')
    try {
      const res = await fetch(`/api/api-keys/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'API Key 更新失败')
      setEditingId('')
      setEditingName('')
      await refreshKeys()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API Key 更新失败')
    }
  }

  const deleteKey = async (id: string) => {
    setError('')
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE', credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'API Key 删除失败')
      setKeys(current => current.filter(key => key.id !== id))
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
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Vidana API Keys</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950">管理 CLI 和 Agent 使用的 Key</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
              创建后只显示一次完整密钥。删除会立即让对应 CLI 或 Agent 调用失效。
            </p>
          </div>
        </div>

        {!user ? (
          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-600">登录后可以管理 API Key。</p>
            <button onClick={login} className="mt-4 rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
              登录
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
            <section className="h-fit rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Plus size={18} />
                <h2 className="text-sm font-semibold text-zinc-950">创建 API Key</h2>
              </div>
              <label className="mt-5 block">
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
                className="mt-4 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? '创建中...' : '创建'}
              </button>

              {createdSecret && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-amber-800">只显示一次，请立即复制。</p>
                    <button onClick={copySecret} className="rounded-md p-1.5 text-amber-700 transition hover:bg-amber-100" aria-label="复制 API Key">
                      <Copy size={15} />
                    </button>
                  </div>
                  <code className="mt-2 block break-all font-mono text-xs text-zinc-900">{createdSecret}</code>
                  {copied && <p className="mt-2 text-xs text-amber-700">已复制</p>}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Key size={18} />
                <h2 className="text-sm font-semibold text-zinc-950">已有 API Key</h2>
              </div>

              {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

              <div className="mt-5 divide-y divide-zinc-100">
                {keys.length === 0 ? (
                  <p className="rounded-md bg-zinc-50 px-3 py-4 text-sm text-zinc-500">还没有 API Key。</p>
                ) : keys.map(key => (
                  <div key={key.id} className="flex items-center gap-3 py-3">
                    {editingId === key.id ? (
                      <input
                        value={editingName}
                        onChange={event => setEditingName(event.target.value)}
                        className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-zinc-400"
                      />
                    ) : (
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-zinc-800">{key.name}</p>
                        <p className="font-mono text-xs text-zinc-400">
                          {key.prefix}
                          {key.last_used_at ? ` · 最近使用 ${new Date(key.last_used_at).toLocaleString()}` : ' · 尚未使用'}
                        </p>
                      </div>
                    )}

                    {editingId === key.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => void updateKey(key.id)} className="rounded-md p-2 text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-600" aria-label="保存名称">
                          <Check size={16} />
                        </button>
                        <button onClick={() => { setEditingId(''); setEditingName('') }} className="rounded-md p-2 text-zinc-500 transition hover:bg-zinc-100" aria-label="取消编辑">
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditingId(key.id); setEditingName(key.name) }} className="rounded-md p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700" aria-label={`编辑 ${key.name}`}>
                          <PencilSimple size={16} />
                        </button>
                        <button onClick={() => void deleteKey(key.id)} className="rounded-md p-2 text-zinc-400 transition hover:bg-red-50 hover:text-red-500" aria-label={`删除 ${key.name}`}>
                          <Trash size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
