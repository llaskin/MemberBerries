import { useEffect, useState } from 'react'
import { parseFrontmatter, extractSummary, normalizeRollupFrontmatter } from '@/lib/parser'
import { useBackend } from '@/providers/DataProvider'
import type { RollupEpisode, RollupFrontmatter } from '@/lib/types'

export function useRollups(project: string | null) {
  const [rollups, setRollups] = useState<RollupEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const backend = useBackend()

  useEffect(() => {
    if (!project) {
      setRollups([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    backend.getRollups(project)
      .then((raw) => {
        const parsed = raw.map(r => {
          const result = parseFrontmatter<RollupFrontmatter>(r.content)
          if (result.ok && result.data) {
            const normalized = normalizeRollupFrontmatter({
              type: 'rollup', date: '', project,
              ...result.data.frontmatter as unknown as Record<string, unknown>,
            })
            return {
              filename: r.filename,
              frontmatter: normalized,
              summary: extractSummary(result.data.body),
              body: result.data.body,
            } satisfies RollupEpisode
          }
          return {
            filename: r.filename,
            frontmatter: { type: 'rollup' as const, date: '', project },
            summary: '',
            body: r.content,
          } satisfies RollupEpisode
        })
        setRollups(parsed)
        setLoading(false)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load rollups')
        setRollups([])
        setLoading(false)
      })
  }, [project])

  return { rollups, loading, error }
}
