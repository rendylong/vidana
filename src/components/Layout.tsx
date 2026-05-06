import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function Layout() {
  const { user, login, logout } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-lg font-bold text-gray-900">Vidana</Link>
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/history" className="text-sm text-gray-600 hover:text-gray-900">历史记录</Link>
                <div className="flex items-center gap-2">
                  {user.avatar_url && <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />}
                  <span className="text-sm text-gray-700">{user.name}</span>
                  <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600">退出</button>
                </div>
              </>
            ) : (
              <button onClick={login} className="text-sm text-blue-600 hover:text-blue-800">登录</button>
            )}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8"><Outlet /></main>
    </div>
  )
}
