import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

export type Me = {
  id: number
  email: string
  scopes: string[]
  auth_method: 'session' | 'token'
}

// useMe checks the current session. On a 401 when OIDC is enabled we
// redirect to /auth/login so the SPA never has to know about anonymous
// state — anything other than "logged in" gets bounced to the IdP. Dev
// mode (no OIDC) keeps working because the backend's dev fallback gives
// us a synthetic user instead of a 401.
export function useMe() {
  return useQuery<Me>({
    queryKey: ['me'],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch('/api/me')
      if (res.status === 401) {
        const status = await fetch('/auth/status')
          .then((r) => r.json())
          .catch(() => ({ oidc_enabled: false }))
        if (status.oidc_enabled) {
          const ret = encodeURIComponent(window.location.pathname + window.location.search)
          window.location.href = `/auth/login?return=${ret}`
          // Suspend the query — the redirect will replace the page.
          return new Promise<Me>(() => {})
        }
        throw new Error('not authenticated')
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}

export async function logout() {
  await fetch('/auth/logout', { method: 'POST' })
  window.location.href = '/'
}

export type StyleSummary = {
  name: string
  summary: string
  when_to_use: string
}

export type StyleDetail = StyleSummary & {
  starter_html: string
}

// Built-in styles are static — no per-request data. Cache forever.
export function useStyles() {
  return useQuery<StyleSummary[]>({
    queryKey: ['styles'],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch('/api/styles')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}

export function useStyle(name: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery<StyleDetail>({
    queryKey: ['style', name as unknown],
    staleTime: Infinity,
    enabled: () => !!toValue(name),
    queryFn: async () => {
      const res = await fetch(`/api/styles/${toValue(name)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}

// User-authored styles. Same shape as the built-in summary, but the
// detail/preview routes live under /api/custom-styles instead of
// /api/styles. Stored on the server keyed by (user_id, name).
export type CustomStyleSummary = {
  id: number
  name: string
  summary: string
  when_to_use: string
  created_at: string | null
  updated_at: string | null
}

export type CustomStyleDetail = CustomStyleSummary & {
  html: string
}

export function useCustomStyles() {
  return useQuery<CustomStyleSummary[]>({
    queryKey: ['custom-styles'],
    queryFn: async () => {
      const res = await fetch('/api/custom-styles')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}

export function useCustomStyle(name: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery<CustomStyleDetail>({
    queryKey: ['custom-style', name as unknown],
    enabled: () => !!toValue(name),
    queryFn: async () => {
      const res = await fetch(`/api/custom-styles/${toValue(name)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}

export type PageSummary = {
  id: number
  title: string
  slug: string
  shared: boolean
  share_url: string | null
  size: number
  created_at: string | null
  updated_at: string | null
}

export type PageDetail = PageSummary & { html: string }

export function usePages() {
  return useQuery<PageSummary[]>({
    queryKey: ['pages'],
    queryFn: async () => {
      const res = await fetch('/api/pages')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}

export function usePage(id: MaybeRefOrGetter<number | string>) {
  return useQuery<PageDetail>({
    queryKey: ['page', id as unknown],
    queryFn: async () => {
      const res = await fetch(`/api/pages/${toValue(id)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    },
  })
}
