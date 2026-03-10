import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'

export function useThemeSync() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
}
