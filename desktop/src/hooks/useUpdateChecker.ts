import { useState, useEffect } from 'react'

interface UpdateState {
  currentVersion: string
  latestVersion: string | null
  latestUrl: string | null
  updateAvailable: boolean
}

const CHECK_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const GITHUB_API = 'https://api.github.com/repos/llaskin/MemberBerries/releases/latest'

// Module-level cache — survives re-renders, not page reloads
let cached: { latestVersion: string; latestUrl: string; updateAvailable: boolean } | null = null

/** Returns true if latest is newer than current.
 *  Handles "-dev.N" suffix: "0.1.11-dev.5" is treated as ahead of "0.1.11". */
function isNewerRelease(current: string, latest: string): boolean {
  // Strip dev suffix — "0.1.11-dev.5" → base "0.1.11", dev build 5
  const [currentBase] = current.split('-')
  const a = currentBase.split('.').map(Number)
  const b = latest.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (bv > av) return true
    if (bv < av) return false
  }
  // Base versions equal — if current has -dev suffix, it's ahead of the release
  return false
}

function stripTagPrefix(tag: string): string {
  return tag.replace(/^desktop-v/, '').replace(/^v/, '')
}

export function useUpdateChecker(): UpdateState {
  const currentVersion = __APP_VERSION__
  const [state, setState] = useState<UpdateState>(() => ({
    currentVersion,
    latestVersion: cached?.latestVersion ?? null,
    latestUrl: cached?.latestUrl ?? null,
    updateAvailable: cached?.updateAvailable ?? false,
  }))

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(GITHUB_API, {
          headers: { Accept: 'application/vnd.github.v3+json' },
        })
        if (!res.ok) return

        const data = await res.json()
        const tagName: string = data.tag_name ?? ''
        const latestVersion = stripTagPrefix(tagName)
        const latestUrl: string = data.html_url ?? ''
        const updateAvailable = isNewerRelease(currentVersion, latestVersion)

        cached = { latestVersion, latestUrl, updateAvailable }

        if (!cancelled) {
          setState({
            currentVersion,
            latestVersion,
            latestUrl,
            updateAvailable,
          })
        }
      } catch {
        // Silent failure — never block UI
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [currentVersion])

  return state
}
