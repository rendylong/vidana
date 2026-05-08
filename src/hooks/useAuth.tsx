import { useState, useEffect, createContext, useContext } from 'react'
import type { User } from '../lib/types'

interface AuthState {
  user: User | null
  loading: boolean
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null, loading: true, login: () => {}, logout: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { setUser(data?.user ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const login = () => { window.location.href = '/api/auth/feishu' }
  const logout = () => {
    document.cookie = 'token=; Path=/; Max-Age=0'
    setUser(null)
    window.location.href = '/'
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
