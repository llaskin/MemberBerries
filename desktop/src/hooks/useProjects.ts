import { useEffect } from 'react'
import { useProjectStore } from '@/store/projectStore'
import type { Project } from '@/lib/types'

export function useProjects() {
  const { projects, setProjects, activeProject, setActiveProject } = useProjectStore()

  useEffect(() => {
    fetch('/api/axon/projects')
      .then(r => r.json())
      .then((data: Project[]) => {
        setProjects(data)
        // Auto-select first active project if none selected
        if (!activeProject && data.length > 0) {
          const first = data.find(p => p.status === 'active') || data[0]
          setActiveProject(first.name)
        }
      })
      .catch(() => {})
  }, [])

  return { projects, activeProject, setActiveProject }
}
