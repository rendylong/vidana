import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminFetch } from '../api/adminClient'
import type { AdminUserListItem } from '../lib/types'

interface UsersResponse {
  data: AdminUserListItem[]
  count: number
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString()
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([])
  const [q, setQ] = useState('')
  const [count, setCount] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    setError('')
    setLoading(true)
    adminFetch<UsersResponse>(`/users?q=${encodeURIComponent(q)}`)
      .then(result => {
        if (!active) return
        setUsers(result.data)
        setCount(result.count)
      })
      .catch(err => {
        if (!active) return
        setUsers([])
        setCount(0)
        setError(err instanceof Error ? err.message : '用户列表加载失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [q])

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Users</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">用户管理</h1>
          <p className="mt-1 text-sm text-zinc-500">{loading ? '正在加载用户...' : `共 ${count} 个用户`}</p>
        </div>
        <input
          value={q}
          onChange={event => setQ(event.target.value)}
          placeholder="搜索用户"
          className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 sm:w-64"
        />
      </div>

      {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">额度</th>
                <th className="px-4 py-3 font-medium">分析</th>
                <th className="px-4 py-3 font-medium">成功/失败</th>
                <th className="px-4 py-3 font-medium">最近分析</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                    加载中...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                    暂无用户
                  </td>
                </tr>
              ) : (
                users.map(user => (
                  <tr key={user.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link className="font-medium text-zinc-950 hover:text-zinc-600" to={`/admin/users/${user.id}`}>
                        {user.name || '未命名用户'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono">{user.analysis_credits}</td>
                    <td className="px-4 py-3 font-mono">{user.total_analyses}</td>
                    <td className="px-4 py-3 font-mono">
                      {user.completed_analyses}/{user.failed_analyses}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">{formatDate(user.last_analysis_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-zinc-100 md:hidden">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">加载中...</p>
          ) : users.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-400">暂无用户</p>
          ) : (
            users.map(user => (
              <Link key={user.id} to={`/admin/users/${user.id}`} className="block px-4 py-4 hover:bg-zinc-50">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium text-zinc-950">{user.name || '未命名用户'}</span>
                  <span className="shrink-0 font-mono text-sm text-zinc-900">{user.analysis_credits}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                  <span>分析 {user.total_analyses}</span>
                  <span className="text-right">
                    成功/失败 {user.completed_analyses}/{user.failed_analyses}
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-zinc-400">最近分析 {formatDate(user.last_analysis_at)}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
