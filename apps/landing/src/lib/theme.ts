import { useCallback, useEffect, useState } from 'react'

/**
 * Light/dark theme for the marketing site and docs. index.html applies the
 * saved (or system) theme before first paint; this hook keeps React in step
 * and persists explicit choices under the same `aura-theme` key.
 */
export type Theme = 'light' | 'dark'

const KEY = 'aura-theme'

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => (typeof document === 'undefined' ? 'dark' : current()))

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.classList.toggle('dark', t === 'dark')
    try {
      localStorage.setItem(KEY, t)
    } catch {
      // Private mode / blocked storage: the choice lasts for this page only.
    }
    setThemeState(t)
  }, [])

  // Follow the system setting until the visitor picks a theme explicitly.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => {
      let saved: string | null = null
      try {
        saved = localStorage.getItem(KEY)
      } catch {
        saved = null
      }
      if (saved === 'light' || saved === 'dark') return
      const next: Theme = media.matches ? 'light' : 'dark'
      document.documentElement.classList.toggle('dark', next === 'dark')
      setThemeState(next)
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return [theme, setTheme]
}
