import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { SignOut } from '@phosphor-icons/react'

export default function Layout() {
  const { user, loading, login, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="h-dvh flex flex-col bg-zinc-50 font-sans">
      <header className="flex items-center justify-between px-5 h-12 border-b border-zinc-200/60 bg-white/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <span
            onClick={() => navigate('/')}
            className="text-sm font-semibold tracking-tight text-zinc-900 cursor-pointer"
          >
            Vidana
          </span>
          <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded">
            Beta
          </span>
          <NavLink
            to="/cli"
            className={({ isActive }) =>
              `text-xs font-medium transition ${isActive ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-900'}`
            }
          >
            CLI
          </NavLink>
          <NavLink
            to="/api-keys"
            className={({ isActive }) =>
              `text-xs font-medium transition ${isActive ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-900'}`
            }
          >
            API Keys
          </NavLink>
        </div>

        <div className="flex items-center gap-1">
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 max-w-[120px] truncate">{user.name}</span>
              <button onClick={logout} className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 transition-colors">
                <SignOut size={16} weight="regular" />
              </button>
            </div>
          ) : (
            <button onClick={login} className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1 rounded-md hover:bg-zinc-100 transition-colors">
              登录
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {!loading && <Outlet />}
      </main>
    </div>
  )
}
