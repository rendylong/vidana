import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { House, Key, List, SignOut, TerminalWindow, X } from '@phosphor-icons/react'

export default function Layout() {
  const { user, loading, login, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const navItems = [
    { to: '/', label: '分析首页', icon: House },
    { to: '/cli', label: 'CLI', icon: TerminalWindow },
    { to: '/api-keys', label: 'API Keys', icon: Key },
  ]

  const handleLogout = () => {
    setMobileNavOpen(false)
    logout()
  }

  return (
    <div className="h-dvh flex flex-col bg-zinc-50 font-sans">
      <header className="flex items-center justify-between px-5 h-12 border-b border-zinc-200/60 bg-white/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition active:scale-[0.96] sm:hidden"
            aria-label="打开导航菜单"
          >
            <List size={17} weight="bold" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-baseline gap-2 text-left"
          >
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              Ovidly
            </span>
            <span className="hidden text-[10px] font-medium text-zinc-400 sm:inline">
              多模态视频分析 Agent
            </span>
          </button>
          <nav className="hidden items-center gap-3 sm:flex">
            {navItems.slice(1).map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `text-xs font-medium transition ${isActive ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-900'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1">
          {user ? (
            <div className="flex min-w-0 items-center gap-2">
              {typeof user.analysis_credits === 'number' && (
                <span className="hidden rounded-md bg-zinc-100 px-2 py-1 font-mono text-[11px] text-zinc-600 sm:inline">
                  剩余 {user.analysis_credits} 次
                </span>
              )}
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

      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-950/35"
            aria-label="关闭导航菜单"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(82vw,320px)] flex-col border-r border-zinc-200 bg-white shadow-[18px_0_70px_-35px_rgba(24,24,27,0.55)]">
            <div className="flex h-12 items-center justify-between border-b border-zinc-200 px-4">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false)
                  navigate('/')
                }}
                className="flex min-w-0 items-baseline gap-2 text-left"
              >
                <span className="text-sm font-semibold tracking-tight text-zinc-900">Ovidly</span>
                <span className="truncate text-[10px] font-medium text-zinc-400">多模态视频分析 Agent</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 transition active:scale-[0.96]"
                aria-label="关闭导航菜单"
              >
                <X size={16} />
              </button>
            </div>

            <nav className="flex-1 space-y-1 p-3">
              {navItems.map(item => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                        isActive ? 'bg-zinc-950 text-white' : 'text-zinc-600 active:bg-zinc-100'
                      }`
                    }
                  >
                    <Icon size={17} weight="regular" />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </nav>

            <div className="border-t border-zinc-200 p-3">
              {user ? (
                <div className="space-y-2">
                  <div className="rounded-xl bg-zinc-100 px-3 py-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{user.name}</p>
                    {typeof user.analysis_credits === 'number' && (
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">剩余 {user.analysis_credits} 次</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-zinc-600 transition active:bg-zinc-100"
                  >
                    <SignOut size={17} weight="regular" />
                    <span>退出登录</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false)
                    login()
                  }}
                  className="flex w-full items-center justify-center rounded-xl bg-zinc-950 px-3 py-3 text-sm font-medium text-white transition active:scale-[0.98]"
                >
                  登录
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 min-h-0 overflow-hidden">
        {!loading && <Outlet />}
      </main>
    </div>
  )
}
