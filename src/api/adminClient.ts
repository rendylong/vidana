const ADMIN_API_BASE = '/api/admin'

export async function adminFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${ADMIN_API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  })

  if (res.status === 401) {
    window.location.href = '/admin/login'
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: '后台数据加载失败' }))
    throw new Error(data.error || `HTTP ${res.status}`)
  }

  return res.json()
}

export function adminLogin(password: string) {
  return adminFetch<{ authenticated: true }>('/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}

export function adminLogout() {
  return adminFetch<{ authenticated: false }>('/logout', { method: 'POST' })
}
