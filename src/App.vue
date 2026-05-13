<template>
  <div class="shell">
    <aside class="sidebar">
      <!-- Brand block -->
      <div class="brand">
        <Logo :size="22" />
        <span class="brand-word">pages</span>
      </div>

      <!-- Primary action -->
      <button class="btn primary new-btn" @click="newPage">
        <Upload :size="13" /> New page
      </button>

      <!-- Main nav -->
      <nav class="nav">
        <router-link
          :to="{ name: 'home' }"
          class="nav-item"
          active-class="active"
          :class="{ active: route.name === 'home' || route.name === 'page' }"
        >
          <FileText :size="14" />
          <span>Pages</span>
          <span v-if="pages" class="nav-count mono">{{ pages.length }}</span>
        </router-link>

        <!-- Future: drafts -->
        <div class="nav-item future">
          <Folder :size="14" />
          <span>Drafts</span>
        </div>
        <!-- Future: archive -->
        <div class="nav-item future">
          <BookMarked :size="14" />
          <span>Archive</span>
        </div>
        <!-- Future: analytics -->
        <div class="nav-item future">
          <BarChart3 :size="14" />
          <span>Analytics</span>
        </div>
      </nav>

      <!-- Account section -->
      <div class="section-label">Account</div>
      <nav class="nav">
        <router-link :to="{ name: 'tokens' }" class="nav-item" active-class="active">
          <KeyRound :size="14" />
          <span>API keys</span>
        </router-link>
        <router-link :to="{ name: 'tokens' }" class="nav-item" active-class="active">
          <Sparkles :size="14" />
          <span>MCP integration</span>
        </router-link>
        <router-link :to="{ name: 'styles' }" class="nav-item" active-class="active">
          <Palette :size="14" />
          <span>Styles</span>
        </router-link>
      </nav>

      <div class="spacer" />

      <!-- Theme toggle -->
      <button class="theme-toggle" @click="toggle" :title="`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`">
        <Sun v-if="theme === 'dark'" :size="13" />
        <Moon v-else :size="13" />
        <span class="mono small">{{ theme === 'dark' ? 'Light' : 'Dark' }}</span>
      </button>

      <!-- Account block -->
      <div v-if="me" class="account" @click="logout" title="Sign out">
        <div class="avatar">{{ initials }}</div>
        <div class="account-info">
          <div class="account-name">{{ displayName }}</div>
          <div class="account-handle mono">{{ me.email }}</div>
        </div>
        <LogOut :size="13" class="account-logout" />
      </div>
    </aside>

    <main class="content">
      <router-view />
    </main>
  </div>
  <ConfirmHost />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { usePages, useMe, logout } from '@/composables/useApi'
import { useTheme } from '@/composables/useTheme'
import {
  FileText,
  Folder,
  BookMarked,
  BarChart3,
  KeyRound,
  Sparkles,
  Palette,
  Upload,
  LogOut,
  Sun,
  Moon,
} from 'lucide-vue-next'
import Logo from '@/components/Logo.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { data: me } = useMe()
const { data: pages } = usePages()
const { theme, toggle } = useTheme()

const displayName = computed(() => {
  if (!me.value) return ''
  return me.value.email.split('@')[0] || me.value.email
})

const initials = computed(() => {
  const name = displayName.value
  if (!name) return '··'
  return name.slice(0, 2).toUpperCase()
})

const STARTER_HTML = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Untitled</title>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>
`

// Primary New page action lives in the sidebar so the design's
// "always one click away" pattern carries through every screen. Routes
// the user into the editor for the freshly-created page.
async function newPage() {
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Untitled', html: STARTER_HTML }),
  })
  if (!res.ok) {
    alert(`Failed: HTTP ${res.status}`)
    return
  }
  const data = await res.json()
  queryClient.invalidateQueries({ queryKey: ['pages'] })
  router.push({ name: 'page', params: { id: data.id } })
}
</script>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 236px 1fr;
  height: 100vh;
  background: var(--bg);
  color: var(--text-1);
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 14px;
  border-right: 1px solid var(--border);
  background: var(--bg);
  min-width: 0;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 8px 4px;
}
.brand-word {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-1);
}

.new-btn {
  height: 34px;
  margin: 0 4px;
  border-radius: 8px;
  font-size: 13px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: 6px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 400;
  text-decoration: none;
  cursor: pointer;
  background: transparent;
  border: none;
  font-family: inherit;
  text-align: left;
  letter-spacing: -0.005em;
  transition: background 0.1s ease, color 0.1s ease;
}
.nav-item:hover {
  color: var(--text-1);
  background: var(--hover);
}
.nav-item.active {
  color: var(--text-1);
  font-weight: 500;
  background: var(--surface-2);
}
.nav-item :deep(svg) {
  flex: 0 0 auto;
}
.nav-item > span:first-of-type {
  flex: 1;
}
.nav-count {
  font-size: 11px;
  color: var(--text-3);
}

.section-label {
  padding: 2px 10px 6px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.spacer {
  flex: 1;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease, border-color 0.1s ease;
}
.theme-toggle:hover {
  color: var(--text-1);
  background: var(--hover);
  border-color: var(--border-strong);
}
.theme-toggle .small {
  font-size: 11px;
}

.account {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.1s ease;
}
.account:hover {
  background: var(--hover);
}
.account:hover .account-logout {
  opacity: 1;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--text-1), var(--text-2));
  color: var(--bg);
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.account-info {
  flex: 1;
  min-width: 0;
}
.account-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-1);
  text-transform: capitalize;
}
.account-handle {
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account-logout {
  color: var(--text-3);
  opacity: 0;
  transition: opacity 0.1s ease;
}

.content {
  min-width: 0;
  overflow: auto;
}
</style>
