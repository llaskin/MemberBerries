import { useState, useCallback, useEffect } from 'react'
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { setStoredToken, getStoredToken } from '@/lib/apiClient'

interface AuthOverlayProps {
  visible: boolean
  onAuthenticated: () => void
}

export function AuthOverlay({ visible, onAuthenticated }: AuthOverlayProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)

  // Auto-verify stored session token on mount
  useEffect(() => {
    if (!visible) return
    const token = getStoredToken()
    if (token) {
      // Probe a protected endpoint with the stored session token
      fetch('/api/axon/projects', {
        headers: { 'Authorization': `Bearer ${token}` },
      })
        .then(r => {
          if (r.ok) onAuthenticated()
          // else: token expired, show login form
        })
        .catch(() => {})
    }
  }, [visible, onAuthenticated])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/axon/server-config/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (data.valid && data.token) {
        // Store the session token — never the password
        if (remember) {
          setStoredToken(data.token)
        }
        setPassword('')
        onAuthenticated()
      } else if (res.status === 429) {
        setError(data.error || 'Too many attempts. Try again later.')
      } else {
        setError('Invalid password')
      }
    } catch {
      setError('Connection failed')
    } finally {
      setLoading(false)
    }
  }, [password, remember, onAuthenticated])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-ax-base/95 backdrop-blur-sm animate-fade-in">
      <div className="max-w-sm w-full mx-4 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-ax-brand/10 flex items-center justify-center">
            <Lock size={18} className="text-ax-brand" />
          </div>
          <div>
            <h2 className="font-serif italic text-h3 text-ax-text-primary">Connect to Axon</h2>
            <p className="text-small text-ax-text-secondary">Enter your server password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-ax-elevated rounded-xl border border-ax-border p-5">
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                placeholder="Server password"
                aria-label="Server password"
                autoFocus
                className="w-full bg-ax-sunken rounded-lg border border-ax-border-subtle px-3 py-2.5 pr-10
                  text-body text-ax-text-primary placeholder:text-ax-text-tertiary/50
                  outline-none focus:border-ax-brand transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ax-text-tertiary hover:text-ax-text-secondary transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && (
              <p className="mt-2 text-micro font-mono text-[var(--ax-error)]">{error}</p>
            )}

            <label className="flex items-center gap-2 mt-3 cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="rounded border-ax-border-subtle accent-ax-brand"
              />
              <span className="text-small text-ax-text-tertiary">Remember on this device</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full mt-4 px-6 py-2.5 rounded-lg font-mono text-small
              bg-ax-brand text-white hover:bg-ax-brand-hover transition-colors
              disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
