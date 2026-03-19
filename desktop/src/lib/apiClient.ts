/* ── API client with auth header injection ── */

const TOKEN_KEY = 'axon-remote-token'

let onAuthRequired: (() => void) | null = null

export function setAuthHandler(handler: () => void) {
  onAuthRequired = handler
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY)
}

/** Fetch wrapper that injects auth header when a token is stored */
export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getStoredToken()
  const headers = new Headers(init?.headers)

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(url, { ...init, headers })

  // On 401, trigger auth overlay (but not for login/config endpoints)
  if (res.status === 401 && !url.includes('/login') && !url.includes('server-config')) {
    onAuthRequired?.()
  }

  return res
}

/** Get the WebSocket URL with auth token as query param */
export function getAuthenticatedWsUrl(baseUrl: string): string {
  const token = getStoredToken()
  if (!token) return baseUrl
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}token=${encodeURIComponent(token)}`
}
