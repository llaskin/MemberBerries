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

/**
 * Install a global fetch interceptor that injects auth headers on all
 * /api/mb/* requests. Call this ONCE at app startup (App.tsx).
 * This avoids having to replace 50+ fetch() call sites across 17 files.
 */
export function installAuthInterceptor() {
  const originalFetch = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url

    // Inject auth header for Axon API calls (but not login/config endpoints)
    if (url.startsWith('/api/mb') && !url.includes('server-config/login')) {
      const token = getStoredToken()
      if (token) {
        const headers = new Headers(init?.headers)
        headers.set('Authorization', `Bearer ${token}`)
        init = { ...init, headers }
      }
    }

    let res: Response
    try {
      res = await originalFetch(input, init as RequestInit)
    } catch (err) {
      // Network error (server down, no connectivity)
      if (url.startsWith('/api/mb')) {
        const { useErrorStore } = await import('@/store/errorStore')
        useErrorStore.getState().showError('Server unreachable', { source: 'network', detail: url })
      }
      throw err
    }

    // On 401, trigger auth overlay (not for login/config endpoints)
    if (res.status === 401 && url.startsWith('/api/mb') && !url.includes('/login') && !url.includes('server-config')) {
      onAuthRequired?.()
    }

    // Surface server errors (5xx)
    if (res.status >= 500 && url.startsWith('/api/mb')) {
      const { useErrorStore } = await import('@/store/errorStore')
      useErrorStore.getState().showError(`Server error (${res.status})`, { source: 'server', detail: url })
    }

    return res
  }
}

/** Get the WebSocket URL with auth token as query param */
export function getAuthenticatedWsUrl(baseUrl: string): string {
  const token = getStoredToken()
  if (!token) return baseUrl
  const sep = baseUrl.includes('?') ? '&' : '?'
  return `${baseUrl}${sep}token=${encodeURIComponent(token)}`
}
