// Light/dark theme — applied as a `.dark` class on the documentElement
// so every CSS var picks up the dark scope. Persisted to localStorage;
// initial value falls back to the OS preference.
//
// Why class-on-root rather than data-attribute or attribute selector?
// Tailwind-compatible if we ever adopt it, and it's the lightest possible
// hook for the var swap.

import { ref, watchEffect } from 'vue'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'pages:theme'

function detectInitial(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<Theme>(detectInitial())

// Push the class onto <html> the moment theme changes — even before any
// component mounts. Persist to localStorage so reloads stay consistent.
watchEffect(() => {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme.value === 'dark')
  try {
    window.localStorage.setItem(STORAGE_KEY, theme.value)
  } catch {
    /* private mode, ignore */
  }
})

export function useTheme() {
  function toggle() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }
  function set(next: Theme) {
    theme.value = next
  }
  return { theme, toggle, set }
}
