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
  agent: string
  model: string | null
  estimated_total_tokens: number
  is_sidechain: number
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
  is_sidechain: number
  tags: string[]
  pinned: boolean
  nickname: string | null
}

export function useSessions(projectName: string | null, includeSidechains = false) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ totalSessions: 0, analyticsIndexed: 0, ftsIndexed: 0, ready: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (projectName) params.set('project', projectName)
      if (includeSidechains) params.set('includeSidechains', 'true')
      const qs = params.toString()
      const url = qs ? `/api/mb/sessions?${qs}` : '/api/mb/sessions'
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
  }, [projectName, includeSidechains])

  useEffect(() => {
    setLoading(true)
    fetchSessions()
  }, [fetchSessions])

  // No polling — manual refresh only (page reload or refetch call)

  return { sessions, indexStatus, loading, error, refetch: fetchSessions }
}

export interface ProjectGroup {
  projectName: string
  projectPath: string
  sessions: SessionSummary[]
  totalCost: number
  lastActive: string | null
}

export function useSessionsByProject() {
  const [projects, setProjects] = useState<ProjectGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mb/sessions/by-project')
      const data = await res.json()
      setProjects(data.projects || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  return { projects, loading, error, refetch: fetchProjects }
}

export function usePromptTimeline(sessionId: string | null) {
  const [prompts, setPrompts] = useState<Array<{ display: string; timestamp: number }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) { setPrompts([]); return }
    setLoading(true)
    fetch(`/api/mb/sessions/${sessionId}/prompts`)
      .then(r => r.json())
      .then(data => setPrompts(data.prompts || []))
      .catch(() => setPrompts([]))
      .finally(() => setLoading(false))
  }, [sessionId])

  return { prompts, loading }
}

export function useSessionSearch(query: string, includeSidechains = false) {
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
        const sc = includeSidechains ? '&includeSidechains=true' : ''
        const res = await fetch(`/api/mb/sessions/search?q=${encodeURIComponent(query)}${sc}`)
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timerRef.current)
  }, [query, includeSidechains])

  return { results, loading }
}
