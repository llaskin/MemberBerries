import { useState, useEffect, useRef, useCallback } from 'react'

export interface SessionSummary {
  id: string
  project_id: string
  project_name: string
  project_path: string | null
  first_prompt: string | null
  custom_title: string | null
  heuristic_summary: string | null
  message_count: number
  tool_call_count: number
  errors: number
  estimated_cost_usd: number | null
  git_branch: string | null
  heatstrip_json: string | null
  created_at: string | null
  modified_at: string | null
  analytics_indexed: number
  tags: string[]
  pinned: boolean
  nickname: string | null
}

export interface IndexStatus {
  totalSessions: number
  analyticsIndexed: number
  ftsIndexed: number
  ready: boolean
}

export interface SearchResult {
  id: string
  project_name: string
  first_prompt: string | null
  heuristic_summary: string | null
  message_count: number
  tool_call_count: number
  estimated_cost_usd: number | null
  heatstrip_json: string | null
  created_at: string | null
  modified_at: string | null
  git_branch: string | null
  snippet: string
  tags: string[]
  pinned: boolean
  nickname: string | null
}

export function useSessions(projectName: string | null) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ totalSessions: 0, analyticsIndexed: 0, ftsIndexed: 0, ready: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const url = projectName
        ? `/api/axon/sessions?project=${encodeURIComponent(projectName)}`
        : '/api/axon/sessions'
      const res = await fetch(url)
      const data = await res.json()
      setSessions(data.sessions || [])
      setIndexStatus(data.indexStatus || { totalSessions: 0, analyticsIndexed: 0, ftsIndexed: 0, ready: false })
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions')
    } finally {
      setLoading(false)
    }
  }, [projectName])

  useEffect(() => {
    setLoading(true)
    fetchSessions()
  }, [fetchSessions])

  // Poll for index progress while indexing is happening
  useEffect(() => {
    if (indexStatus.ready && indexStatus.analyticsIndexed >= indexStatus.totalSessions) return
    const interval = setInterval(fetchSessions, 3000)
    return () => clearInterval(interval)
  }, [indexStatus, fetchSessions])

  return { sessions, indexStatus, loading, error, refetch: fetchSessions }
}

export function useSessionSearch(query: string) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    setLoading(true)
    clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/axon/sessions/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timerRef.current)
  }, [query])

  return { results, loading }
}
