<template>
  <div class="shell" :class="{ collapsed }">
    <aside class="sidebar">
      <div class="top">
        <router-link to="/" class="brand" aria-label="Pages home">
          <Logo :size="28" />
          <span class="brand-word label">pages</span>
        </router-link>
        <button class="collapse-btn" @click="toggle" :title="collapsed ? 'Expand sidebar' : 'Collapse sidebar'">
          <PanelLeftClose v-if="!collapsed" :size="16" />
          <PanelLeftOpen v-else :size="16" />
        </button>
      </div>

      <router-link
        to="/"
        class="new-btn"
        :class="{ active: route.name === 'home' }"
        :title="collapsed ? 'All pages' : undefined"
      >
        <Plus :size="14" />
        <span class="label">All pages</span>
      </router-link>

      <div class="section-label">
        <span class="label">Pages</span>
        <span v-if="pages" class="count">{{ pages.length }}</span>
      </div>

      <div v-if="isLoading" class="muted small label">Loading…</div>
      <div v-else-if="!pages || pages.length === 0" class="muted small label">
        No pages yet.
      </div>
      <nav v-else class="site-list">
        <router-link
          v-for="p in pages"
          :key="p.id"
          :to="{ name: 'page', params: { id: p.id } }"
          class="site-link"
          active-class="active"
          :title="collapsed ? p.title : undefined"
        >
          <FileText :size="14" class="icon" />
          <span class="name label">{{ p.title }}</span>
          <span v-if="p.shared" class="dot on" title="Shared" />
        </router-link>
      </nav>

      <div class="footer label">
        <router-link
          :to="{ name: 'styles' }"
          class="footer-link"
          active-class="active"
          :title="collapsed ? 'Styles' : undefined"
        >
          <Palette :size="12" />
          <span class="label">Styles</span>
        </router-link>
        <router-link
          :to="{ name: 'tokens' }"
          class="footer-link"
          active-class="active"
          :title="collapsed ? 'API tokens' : undefined"
        >
          <KeyRound :size="12" />
          <span class="label">API tokens</span>
        </router-link>
        <button
          v-if="me"
          class="footer-link logout"
          :title="collapsed ? `Sign out ${me.email}` : undefined"
          @click="logout"
        >
          <LogOut :size="12" />
          <span class="label">{{ me.email }}</span>
        </button>
        <a class="footer-link" href="https://arlint.dev" target="_blank" rel="noopener">
          arlint.dev
        </a>
      </div>
    </aside>

    <main class="content">
      <router-view />
    </main>
  </div>
  <!-- Single instance lives here so any view's useConfirm() call lands
       in one shared modal queue. -->
  <ConfirmHost />
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { usePages, useMe, logout } from '@/composables/useApi'
import { useSidebar } from '@/composables/useUI'
import { Plus, FileText, PanelLeftClose, PanelLeftOpen, KeyRound, LogOut, Palette } from 'lucide-vue-next'
import Logo from '@/components/Logo.vue'
import ConfirmHost from '@/components/ConfirmHost.vue'

const route = useRoute()
// useMe fires the auth check on app mount; a 401 redirects to /auth/login.
const { data: me } = useMe()
const { data: pages, isLoading } = usePages()
const { collapsed, toggle } = useSidebar()
</script>

<style>
:root {
  --bg: #0b0d10;
  --bg-elev: #111418;
  --bg-elev-2: #161a20;
  --bg-hover: #1c2128;
  --border: #23282f;
  --border-strong: #2c333c;
  --text: #e6e9ee;
  --text-dim: #9aa3af;
  --text-mute: #6b7280;
  --accent: #a78bfa;
  --accent-soft: rgba(167, 139, 250, 0.15);
  --danger: #f87171;
  --danger-soft: rgba(248, 113, 113, 0.12);
  --success: #34d399;
}

* {
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  margin: 0;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

a {
  color: inherit;
}

button {
  font-family: inherit;
}

::selection {
  background: var(--accent-soft);
  color: var(--text);
}
</style>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
  transition: grid-template-columns 0.18s ease;
}

.shell.collapsed {
  grid-template-columns: 56px 1fr;
}

.sidebar {
  background: var(--bg-elev);
  border-right: 1px solid var(--border);
  padding: 14px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
}

.shell.collapsed .label {
  display: none;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px 12px;
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
  min-width: 0;
}

.collapse-btn {
  background: transparent;
  border: none;
  padding: 4px;
  border-radius: 6px;
  color: var(--text-mute);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}

.collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.shell.collapsed .top {
  flex-direction: column;
  gap: 8px;
  padding: 0 0 10px;
}

.brand-word {
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.01em;
}

.shell.collapsed .brand {
  justify-content: center;
}

.new-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  color: var(--text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.12s, border-color 0.12s;
}

.shell.collapsed .new-btn {
  justify-content: center;
  padding: 8px;
}

.new-btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-strong);
}

.new-btn.active {
  background: var(--accent-soft);
  border-color: rgba(167, 139, 250, 0.4);
  color: var(--accent);
}

.section-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  margin-top: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-mute);
  font-weight: 600;
  min-height: 18px;
}

.shell.collapsed .section-label {
  justify-content: center;
}

.shell.collapsed .section-label .count {
  display: none;
}

.count {
  background: var(--bg-elev-2);
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 10px;
  letter-spacing: 0;
  color: var(--text-dim);
  text-transform: none;
}

.site-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.site-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  text-decoration: none;
  color: var(--text-dim);
  font-size: 13px;
  transition: background 0.12s, color 0.12s;
}

.shell.collapsed .site-link {
  justify-content: center;
  padding: 7px;
}

.site-link:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.site-link.active {
  background: var(--accent-soft);
  color: var(--accent);
}

.site-link .icon {
  flex-shrink: 0;
  opacity: 0.8;
}

.site-link .name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-link .badge {
  font-size: 11px;
  color: var(--text-mute);
  background: var(--bg-elev-2);
  padding: 1px 6px;
  border-radius: 8px;
}

.site-link.active .badge {
  background: rgba(167, 139, 250, 0.2);
  color: var(--accent);
}

.site-link .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.site-link .dot.on {
  background: var(--success);
}

.muted {
  color: var(--text-mute);
}

.muted.small {
  font-size: 12px;
  padding: 8px 10px;
}

.shell.collapsed .muted.small {
  display: none;
}

.shell.collapsed .footer {
  display: none;
}

.footer {
  margin-top: auto;
  padding: 10px 6px 0;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-mute);
}

.footer-link {
  text-decoration: none;
  color: var(--text-mute);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  border-radius: 4px;
}

.footer-link:hover {
  color: var(--text-dim);
}

.footer-link.logout {
  background: transparent;
  border: none;
  font: inherit;
  cursor: pointer;
  width: 100%;
  text-align: left;
  font-size: 11px;
}

.footer-link .label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content {
  min-width: 0;
}
</style>
