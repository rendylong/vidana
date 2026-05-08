import { ChartLine, SignOut, UsersThree } from '@phosphor-icons/react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { adminLogout } from '../api/adminClient'

export default function AdminLayout() {
  const navigate = useNavigate()

  const logout = async () => {
    await adminLogout().catch(() => undefined)
    navigate('/admin/login')
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2 sm:px-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-semibold">Ovidly Admin</span>
          <span className="shrink-0 text-[11px] text-zinc-400">运营后台</span>
        </div>
        <nav className="flex flex-wrap items-center gap-2">
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                isActive ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`
            }
          >
            <ChartLine size={14} />
            <span>Dashboard</span>
          </NavLink>
          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
                isActive ? 'bg-zinc-950 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`
            }
          >
            <UsersThree size={14} />
            <span>用户</span>
          </NavLink>
          <button
            type="button"
            onClick={logout}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            <SignOut size={14} />
            <span>退出</span>
          </button>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-5">
        <Outlet />
      </main>
    </div>
  )
}
