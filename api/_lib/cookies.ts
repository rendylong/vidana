export function secureCookieAttribute(appUrl = process.env.VITE_APP_URL): string {
  if (!appUrl) return ''
  try {
    return new URL(appUrl).protocol === 'https:' ? '; Secure' : ''
  } catch {
    return ''
  }
}

export function authCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly${secureCookieAttribute()}; SameSite=Lax; Max-Age=${maxAge}`
}

export function clearAuthCookie(name: string): string {
  return `${name}=; Path=/; HttpOnly; Max-Age=0`
}
