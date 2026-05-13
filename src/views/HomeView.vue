<template>
  <div class="view">
    <TopBar :crumbs="[{ label: 'Workspace' }, { label: 'Pages' }]" show-search :search-value="search" @update:search-value="search = $event">
      <template #actions>
        <button class="btn" @click="onUploadClick">
          <Upload :size="12" /> Upload
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".html,.htm,text/html"
          style="display:none"
          @change="onFilePicked"
        />
        <button class="btn primary" @click="newPage">
          <Plus :size="12" /> New page
        </button>
      </template>
    </TopBar>

    <!-- Page header -->
    <header class="hdr">
      <div class="title-block">
        <h1>Pages</h1>
        <p v-if="pages" class="muted small">
          {{ pages.length }} {{ pages.length === 1 ? 'page' : 'pages' }}
          <template v-if="sharedCount > 0">
            ·
            <LiveDot :size="5" class="inline-dot" />
            {{ sharedCount }} shared
          </template>
        </p>
      </div>
    </header>

    <!-- Filter tabs -->
    <div class="tab-bar">
      <button
        v-for="t in tabs"
        :key="t.id"
        class="tab"
        :class="{ active: activeTab === t.id }"
        @click="activeTab = t.id"
      >
        {{ t.label }}
        <span class="mono count">{{ t.count }}</span>
      </button>
      <div class="spacer" />
      <!-- Future: grid/list toggle -->
      <div class="view-toggle future">
        <button class="view-toggle-btn active">
          <Grid3x3 :size="12" />
        </button>
        <button class="view-toggle-btn">
          <List :size="12" />
        </button>
      </div>
      <!-- Future: sort -->
      <button class="btn sm future">
        Last updated <ChevronDown :size="11" />
      </button>
    </div>

    <!-- Loading / empty / grid -->
    <div v-if="isLoading" class="state muted">Loading…</div>
    <div v-else-if="!filteredPages || filteredPages.length === 0" class="state empty">
      <p v-if="search">No pages match "{{ search }}".</p>
      <template v-else>
        <p class="muted">No pages yet.</p>
        <button class="btn primary" @click="newPage">
          <Plus :size="12" /> Create your first page
        </button>
      </template>
    </div>
    <div v-else class="grid">
      <article
        v-for="p in filteredPages"
        :key="p.id"
        class="card"
        @click="openPage(p)"
      >
        <!-- Hero with gradient + glyph + Live pulse when shared -->
        <div
          class="hero"
          :style="{ background: gradientFor(p.id).background }"
        >
          <div v-if="p.shared" class="live-badge">
            <LiveDot :size="5" />
            <span>Live</span>
          </div>
          <span class="glyph" :style="{ mixBlendMode: gradientFor(p.id).iconBlend }">
            {{ glyphFor(p.id, p.title) }}
          </span>

          <!-- Hover actions -->
          <div class="actions" @click.stop>
            <button
              v-if="!p.shared"
              class="action-btn"
              title="Share — mint a public link"
              @click.stop="share(p)"
            >
              <Share2 :size="13" />
            </button>
            <template v-else>
              <button
                class="action-btn"
                :title="copiedId === p.id ? 'Copied!' : 'Copy share link'"
                @click.stop="copyLink(p)"
              >
                <Check v-if="copiedId === p.id" :size="13" />
                <LinkIcon v-else :size="13" />
              </button>
              <button class="action-btn" title="Rotate — kill the old link" @click.stop="share(p)">
                <RefreshCw :size="13" />
              </button>
              <button class="action-btn danger" title="Unshare" @click.stop="unshare(p)">
                <Lock :size="13" />
              </button>
            </template>
            <button class="action-btn danger" title="Delete this page" @click.stop="remove(p)">
              <Trash2 :size="13" />
            </button>
          </div>
        </div>

        <!-- Card foot -->
        <div class="foot">
          <div class="card-title">{{ p.title }}</div>
          <div class="card-slug mono">
            <span class="muted">{{ slugHost }}/p/{{ usernameForPath }}/</span>{{ p.slug }}
          </div>
          <div class="card-meta">
            <VisChip :shared="p.shared" />
            <div class="spacer" />
            <span class="muted mono">{{ formatSize(p.size) }}</span>
            <span class="dim">·</span>
            <span class="muted">{{ relativeTime(p.updated_at) }}</span>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import {
  Plus,
  Upload,
  Share2,
  Lock,
  Link as LinkIcon,
  RefreshCw,
  Trash2,
  Check,
  Grid3x3,
  List,
  ChevronDown,
} from 'lucide-vue-next'
import { usePages, useMe, type PageSummary } from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'
import { formatSize } from '@/lib/format'
import { gradientFor, glyphFor } from '@/lib/gradient'
import TopBar from '@/components/TopBar.vue'
import VisChip from '@/components/VisChip.vue'
import LiveDot from '@/components/LiveDot.vue'

const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()
const { data: pages, isLoading } = usePages()
const { data: me } = useMe()

const search = ref('')
const copiedId = ref<number | null>(null)

// Host shown in the card's URL hint. Pulls from window.location so the
// preview reflects whatever host the user is on (pages.arlint.dev in
// prod, localhost:5173 in dev, an ngrok URL when testing externally).
// Falls back to a generic label on SSR / pre-render — never matters in
// practice because this view is client-rendered.
const slugHost = computed(() => {
  if (typeof window === 'undefined') return 'pages'
  return window.location.host
})

// Username slot in the URL. The backend backfills usernames on login
// for every authenticated user, so this is almost always populated.
// Defensive fallback: derive from the email's local part, mirroring the
// server's pickUsername() so what we render here matches what the
// server would have generated if it hadn't gotten around to it yet.
const usernameForPath = computed(() => {
  if (me.value?.username) return me.value.username
  const local = me.value?.email?.split('@')[0] ?? ''
  return (
    local
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'you'
  )
})

type TabId = 'all' | 'shared' | 'private'
const activeTab = ref<TabId>('all')

const sharedCount = computed(() => pages.value?.filter((p) => p.shared).length ?? 0)
const privateCount = computed(() => pages.value?.filter((p) => !p.shared).length ?? 0)

const tabs = computed<{ id: TabId; label: string; count: number }[]>(() => [
  { id: 'all', label: 'All', count: pages.value?.length ?? 0 },
  { id: 'shared', label: 'Shared', count: sharedCount.value },
  { id: 'private', label: 'Private', count: privateCount.value },
])

const filteredPages = computed(() => {
  if (!pages.value) return []
  let list = pages.value
  if (activeTab.value === 'shared') list = list.filter((p) => p.shared)
  else if (activeTab.value === 'private') list = list.filter((p) => !p.shared)
  const q = search.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
    )
  }
  return list
})

function openPage(p: PageSummary) {
  router.push({ name: 'page', params: { id: p.id } })
}

// Relative time formatter — "2d", "6h", "now". The card meta is small;
// shaving syllables matters. Falls back to absolute date for old pages.
function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 8) return `${wk}w`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

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

async function newPage() {
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Untitled', html: STARTER_HTML }),
  })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  const data = await res.json()
  queryClient.invalidateQueries({ queryKey: ['pages'] })
  router.push({ name: 'page', params: { id: data.id } })
}

// Upload an existing .html file — reads the file client-side and POSTs
// it as the html body. The body never touches Claude's context if the
// agent didn't open it. Real users with real files get a one-click
// import path.
const fileInput = ref<HTMLInputElement | null>(null)
function onUploadClick() {
  fileInput.value?.click()
}
async function onFilePicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // reset so picking the same file twice still fires
  if (!file) return
  const html = await file.text()
  const titleFromName = file.name.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ') || 'Untitled'
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: titleFromName, html }),
  })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  const data = await res.json()
  queryClient.invalidateQueries({ queryKey: ['pages'] })
  router.push({ name: 'page', params: { id: data.id } })
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['pages'] })
}

async function share(p: PageSummary) {
  const res = await fetch(`/api/pages/${p.id}/share`, { method: 'POST' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  const data = await res.json()
  invalidate()
  if (data.share_url) {
    try {
      await navigator.clipboard.writeText(data.share_url)
      copiedId.value = p.id
      setTimeout(() => {
        if (copiedId.value === p.id) copiedId.value = null
      }, 1500)
    } catch {
      /* clipboard blocked — silent */
    }
  }
}

async function unshare(p: PageSummary) {
  const ok = await confirm({
    title: 'Unshare page?',
    message: `The share link for "${p.title}" will stop working immediately. You can re-share later, but it will be a new URL.`,
    confirmLabel: 'Unshare',
    destructive: true,
  })
  if (!ok) return
  const res = await fetch(`/api/pages/${p.id}/share`, { method: 'DELETE' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  invalidate()
}

async function copyLink(p: PageSummary) {
  if (!p.share_url) return
  try {
    await navigator.clipboard.writeText(p.share_url)
    copiedId.value = p.id
    setTimeout(() => {
      if (copiedId.value === p.id) copiedId.value = null
    }, 1500)
  } catch {
    alert(`Couldn't copy. Link: ${p.share_url}`)
  }
}

async function remove(p: PageSummary) {
  const ok = await confirm({
    title: 'Delete page?',
    message: `"${p.title}" will be permanently deleted. Any active share link dies with it. This cannot be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  const res = await fetch(`/api/pages/${p.id}`, { method: 'DELETE' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  invalidate()
}
</script>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.hdr {
  padding: 28px 32px 18px;
  display: flex;
  align-items: flex-end;
  gap: 16px;
}
.title-block h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.025em;
  color: var(--text-1);
}
.title-block p {
  margin: 4px 0 0;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 5px;
}
.inline-dot {
  vertical-align: middle;
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 32px;
  border-bottom: 1px solid var(--border);
}
.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 10px;
  background: transparent;
  border: none;
  border-bottom: 1.5px solid transparent;
  margin-bottom: -1px;
  color: var(--text-2);
  font: inherit;
  font-size: 12.5px;
  font-weight: 400;
  cursor: pointer;
  letter-spacing: -0.005em;
  transition: color 0.1s ease, border-color 0.1s ease;
}
.tab:hover {
  color: var(--text-1);
}
.tab.active {
  color: var(--text-1);
  font-weight: 500;
  border-bottom-color: var(--text-1);
}
.tab .count {
  font-size: 10.5px;
  color: var(--text-3);
  margin-left: 2px;
}
.spacer {
  flex: 1;
}
.view-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  margin-bottom: 6px;
}
.view-toggle-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.view-toggle-btn.active {
  background: var(--surface-2);
  color: var(--text-1);
}

.state {
  padding: 64px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}
.state.empty {
  border: 1px dashed var(--border);
  border-radius: 10px;
  margin: 32px;
  padding: 48px 16px;
}

.grid {
  padding: 18px 32px 32px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.card {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: border-color 0.12s ease, transform 0.12s ease;
}
.card:hover {
  border-color: var(--border-strong);
}
.card:hover .actions {
  opacity: 1;
}

.hero {
  height: 128px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}
.glyph {
  font-family: var(--font-mono);
  font-size: 36px;
  font-weight: 300;
  color: rgba(255, 255, 255, 0.78);
  pointer-events: none;
  user-select: none;
}
.live-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  font-size: 10px;
  font-weight: 500;
  color: #0a0a0a;
  letter-spacing: -0.005em;
}

.actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 7px;
  background: rgba(10, 10, 10, 0.78);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0;
  transition: opacity 0.12s ease;
  z-index: 2;
}
.action-btn {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.action-btn.danger:hover {
  background: rgba(229, 72, 77, 0.2);
  color: #ff8a8e;
}
@media (hover: none) {
  .actions {
    opacity: 1;
  }
}

.foot {
  padding: 11px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-1);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-slug {
  display: flex;
  align-items: center;
  gap: 0;
  font-size: 10.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-2);
}
.card-meta .spacer {
  flex: 1;
}
.dim {
  color: var(--text-3);
}
.muted {
  color: var(--text-2);
}
.small {
  font-size: 12px;
}
</style>
