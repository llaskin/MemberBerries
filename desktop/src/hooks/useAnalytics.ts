import { useState, useEffect, useCallback } from 'react'

export interface AnalyticsData {
  totalTokens: number
  avgTokensPerSession: number
  totalSessions: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheCreationTokens: number
  totalCacheReadTokens: number
  totalCost: number
  tokensByAgent: { agent: string; tokens: number; cost: number }[]
  tokensByModel: { model: string; agent: string; tokens: number; inputTokens: number; outputTokens: number; cacheCreationTokens: number; cacheReadTokens: number }[]
  activeAgents: string[]
}

export function useAnalytics(since: string | null) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const url = since
        ? `/api/mb/sessions/analytics?since=${encodeURIComponent(since)}`
        : '/api/mb/sessions/analytics'
      const res = await fetch(url)
      setData(await res.json())
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [since])

  useEffect(() => { fetchData() }, [fetchData])

  return { data, loading, refetch: fetchData }
}
