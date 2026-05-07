import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminLogin } from '../api/adminClient'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      await adminLogin(password)
      navigate('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : '密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Ovidly Admin</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-950">后台登录</h1>
        <label className="mt-6 block">
          <span className="text-xs font-medium text-zinc-500">后台密码</span>
          <input
            value={password}
            onChange={event => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
          />
        </label>
        {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <button
          disabled={loading}
          className="mt-5 w-full rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  )
}
