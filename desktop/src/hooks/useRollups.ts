import { useEffect, useState } from 'react'
import { parseFrontmatter, extractSummary } from '@/lib/parser'
import type { RollupEpisode, RollupFrontmatter } from '@/lib/types'

export function useRollups(project: string | null) {
  const [rollups, setRollups] = useState<RollupEpisode[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!project) {
      setRollups([])
      setLoading(false)
      return
    }

    setLoading(true)
    fetch(`/api/axon/projects/${encodeURIComponent(project)}/rollups`)
      .then(r => r.json())
      .then((raw: Array<{ filename: string; content: string }>) => {
        const parsed = raw.map(r => {
          const result = parseFrontmatter<RollupFrontmatter>(r.content)
          if (result.ok && result.data) {
            return {
              filename: r.filename,
              frontmatter: {
                ...{ type: 'rollup' as const, date: '', project },
                ...result.data.frontmatter,
              },
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
      .catch(() => {
        setRollups([])
        setLoading(false)
      })
  }, [project])

  return { rollups, loading }
}
