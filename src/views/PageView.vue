<template>
  <div v-if="page" class="view">
    <TopBar
      :crumbs="[
        { label: 'Pages', to: { name: 'home' } },
        { label: page.title },
      ]"
    >
      <template #actions>
        <a
          v-if="page.shared && page.share_url"
          :href="page.share_url"
          target="_blank"
          rel="noopener"
          class="btn"
        >
          <ExternalLink :size="12" /> Visit
        </a>
        <button class="btn danger ghost" @click="remove">
          <Trash2 :size="12" />
        </button>
      </template>
    </TopBar>

    <!-- Two-column layout: editor/preview on the left, sidebar on right -->
    <div class="page-body">
      <div class="left">
        <!-- Hero strip -->
        <section class="hero">
          <div class="hero-meta">
            <LiveDot v-if="page.shared" :size="6" />
            <span
              class="status"
              :class="{ live: page.shared }"
            >{{ page.shared ? 'Live' : 'Private' }}</span>
            <span class="dim">·</span>
            <span class="muted small">
              last edited {{ relativeTime(page.updated_at) }}
            </span>
            <span v-if="saving" class="muted small">· saving…</span>
            <span v-else-if="savedAt" class="muted small">· saved {{ savedAt }}</span>
          </div>

          <input
            v-model="title"
            class="title-input"
            placeholder="Untitled"
            @blur="saveTitle"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />

          <div class="hero-actions">
            <!-- URL pill (only when shared) -->
            <div v-if="page.shared && page.share_url" class="url-pill">
              <span class="url-scheme">https://</span>
              <span class="url-host mono">{{ urlHost }}</span>
              <span class="url-path mono">{{ urlPath }}</span>
              <button class="url-copy" @click="copyLink">
                <Check v-if="copied" :size="12" />
                <Copy v-else :size="12" />
                <span>{{ copied ? 'Copied' : 'Copy' }}</span>
              </button>
            </div>
            <button v-if="!page.shared" class="btn primary" @click="share">
              <Share2 :size="12" /> Share
            </button>
            <template v-else>
              <button class="btn" @click="share" title="Rotate the share link — old link dies">
                <RefreshCw :size="12" /> Rotate
              </button>
              <button class="btn danger" @click="unshare">
                <Lock :size="12" /> Unshare
              </button>
            </template>
            <VisChip :shared="page.shared" />
          </div>
        </section>

        <!-- Tab bar -->
        <div class="tab-bar">
          <button
            class="tab"
            :class="{ active: tab === 'html' }"
            @click="tab = 'html'"
          >HTML</button>
          <button
            class="tab"
            :class="{ active: tab === 'preview' }"
            @click="tab = 'preview'"
          >Preview</button>
          <button class="tab future">Analytics</button>
          <button class="tab future">Versions</button>
          <button class="tab future">Embed</button>
        </div>

        <!-- Tab content -->
        <div v-if="tab === 'html'" class="tab-content">
          <textarea
            v-model="html"
            class="editor"
            spellcheck="false"
            @input="scheduleSave"
          />
        </div>
        <div v-else class="tab-content">
          <!-- Browser-chrome preview frame, from the mock -->
          <div class="browser">
            <div class="browser-head">
              <div class="browser-dots">
                <span /><span /><span />
              </div>
              <div class="browser-address mono">
                {{ page.shared ? urlHost + urlPath : 'private — not shared' }}
              </div>
              <div class="browser-actions">
                <span /><span class="empty" />
              </div>
            </div>
            <iframe class="preview-frame" :srcdoc="html" />
          </div>
        </div>
      </div>

      <!-- Right rail -->
      <aside class="rail">
        <!-- Share settings table -->
        <section>
          <div class="uppercase-label">Share</div>
          <div class="rail-rows">
            <div class="rail-row">
              <span class="muted small">Visibility</span>
              <span class="rail-value">
                <Globe v-if="page.shared" :size="11" class="muted" />
                <Lock v-else :size="11" class="muted" />
                {{ page.shared ? 'Public' : 'Private' }}
              </span>
            </div>
            <div class="rail-row future">
              <span class="muted small">Password</span>
              <span class="rail-value">Off</span>
            </div>
            <div class="rail-row future">
              <span class="muted small">Expires</span>
              <span class="rail-value">Never</span>
            </div>
            <div class="rail-row future">
              <span class="muted small">Indexed</span>
              <span class="rail-value">No</span>
            </div>
            <div class="rail-row future">
              <span class="muted small">Custom domain</span>
              <span class="rail-value mono">—</span>
            </div>
          </div>
        </section>

        <!-- MCP card -->
        <section class="mcp-card">
          <div class="mcp-head">
            <Sparkles :size="12" />
            <span class="mcp-title">Editable via MCP</span>
          </div>
          <p class="mcp-body muted small">
            Connected AI agents can update this page using the
            <span class="mono">update_page</span> tool.
          </p>
          <div class="mcp-id">
            page_id: <span class="mono">pg_{{ page.id }}</span>
          </div>
        </section>

        <!-- Recent versions — future-disabled -->
        <section class="future-card">
          <div class="uppercase-label">Recent versions</div>
          <div class="future-card-body">
            <div class="future-row">
              <span class="mono small">v3</span>
              <span class="muted small">you · just now</span>
            </div>
            <div class="future-row">
              <span class="mono small">v2</span>
              <span class="muted small">you · earlier</span>
            </div>
          </div>
          <span class="future-pill mono">Coming soon</span>
        </section>
      </aside>
    </div>
  </div>

  <div v-else-if="isLoading" class="loading">Loading…</div>
  <div v-else class="loading">Page not found.</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import {
  Share2,
  Lock,
  Copy,
  Check,
  RefreshCw,
  Trash2,
  ExternalLink,
  Globe,
  Sparkles,
} from 'lucide-vue-next'
import { usePage } from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'
import TopBar from '@/components/TopBar.vue'
import VisChip from '@/components/VisChip.vue'
import LiveDot from '@/components/LiveDot.vue'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()

const pageId = computed(() => Number(route.params.id))
const { data: page, isLoading } = usePage(pageId)

const title = ref('')
const html = ref('')
const tab = ref<'html' | 'preview'>('html')
const saving = ref(false)
const savedAt = ref<string | null>(null)
const copied = ref(false)

watch(
  page,
  (p) => {
    if (!p) return
    title.value = p.title
    html.value = p.html
  },
  { immediate: true },
)

let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveHtml, 700)
}

async function saveHtml() {
  if (!page.value) return
  saving.value = true
  try {
    const res = await fetch(`/api/pages/${page.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html: html.value }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    savedAt.value = formatTime(new Date())
    queryClient.invalidateQueries({ queryKey: ['pages'] })
  } catch (e) {
    savedAt.value = `failed: ${(e as Error).message}`
  } finally {
    saving.value = false
  }
}

async function saveTitle() {
  if (!page.value || title.value.trim() === page.value.title) return
  saving.value = true
  try {
    const res = await fetch(`/api/pages/${page.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.value.trim() || 'Untitled' }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    queryClient.invalidateQueries({ queryKey: ['page', pageId.value] })
    queryClient.invalidateQueries({ queryKey: ['pages'] })
  } finally {
    saving.value = false
  }
}

async function share() {
  if (!page.value) return
  const res = await fetch(`/api/pages/${page.value.id}/share`, { method: 'POST' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  queryClient.invalidateQueries({ queryKey: ['page', pageId.value] })
  queryClient.invalidateQueries({ queryKey: ['pages'] })
}

async function unshare() {
  if (!page.value) return
  const ok = await confirm({
    title: 'Unshare page?',
    message: 'The current share link will stop working immediately. You can re-share later, but it will be a new URL.',
    confirmLabel: 'Unshare',
    destructive: true,
  })
  if (!ok) return
  const res = await fetch(`/api/pages/${page.value.id}/share`, { method: 'DELETE' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  queryClient.invalidateQueries({ queryKey: ['page', pageId.value] })
  queryClient.invalidateQueries({ queryKey: ['pages'] })
}

async function copyLink() {
  if (!page.value?.share_url) return
  await navigator.clipboard.writeText(page.value.share_url)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

async function remove() {
  if (!page.value) return
  const ok = await confirm({
    title: 'Delete page?',
    message: `"${page.value.title}" will be permanently deleted. Any active share link dies with it. This cannot be undone.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  const res = await fetch(`/api/pages/${page.value.id}`, { method: 'DELETE' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  queryClient.invalidateQueries({ queryKey: ['pages'] })
  router.push({ name: 'home' })
}

// Split the share URL into host + path so we can render it as the mock
// does: scheme in dim, host in muted-mono, slug-with-token in bold-mono.
const urlHost = computed(() => {
  if (!page.value?.share_url) return ''
  try {
    const u = new URL(page.value.share_url)
    return u.host
  } catch {
    return ''
  }
})
const urlPath = computed(() => {
  if (!page.value?.share_url) return ''
  try {
    const u = new URL(page.value.share_url)
    return u.pathname
  } catch {
    return ''
  }
})

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 8) return `${wk}w ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.loading {
  padding: 64px;
  color: var(--text-2);
  text-align: center;
}

.page-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.left {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 24px 28px;
  overflow: hidden;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}
.hero-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
}
.status {
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-2);
  font-size: 11px;
}
.status.live {
  color: var(--live);
}
.dim {
  color: var(--text-3);
}
.muted {
  color: var(--text-2);
}
.small {
  font-size: 11px;
}
.title-input {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-1);
  font-family: inherit;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.025em;
  padding: 4px 6px;
  margin: 0 -6px;
  border-radius: 6px;
  outline: none;
}
.title-input:hover {
  border-color: var(--border);
}
.title-input:focus {
  border-color: var(--border-strong);
  background: var(--surface);
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.url-pill {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font-family: var(--font-mono);
  font-size: 12.5px;
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}
.url-scheme {
  padding: 7px 0 7px 12px;
  color: var(--text-3);
}
.url-host {
  padding: 7px 0;
  color: var(--text-1);
}
.url-path {
  padding: 7px 12px 7px 0;
  color: var(--text-1);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.url-copy {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-left: 1px solid var(--border);
  color: var(--text-1);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
}
.url-copy:hover {
  background: var(--hover);
}

.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin: 0 -28px 0;
  padding: 0 28px;
}
.tab {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 400;
  color: var(--text-2);
  background: transparent;
  border: none;
  border-bottom: 1.5px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  font-family: inherit;
  letter-spacing: -0.005em;
}
.tab.active {
  color: var(--text-1);
  font-weight: 500;
  border-bottom-color: var(--text-1);
}
.tab:hover:not(.future) {
  color: var(--text-1);
}

.tab-content {
  flex: 1;
  margin-top: 16px;
  display: flex;
  min-height: 0;
}

.editor {
  flex: 1;
  width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  color: var(--text-1);
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  resize: none;
  outline: none;
  transition: border-color 0.12s ease;
}
.editor:focus {
  border-color: var(--border-strong);
}

.browser {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
}
.browser-head {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.browser-dots {
  display: flex;
  gap: 5px;
}
.browser-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
}
.browser-address {
  flex: 1;
  height: 18px;
  border-radius: 4px;
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10.5px;
  color: var(--text-2);
  padding: 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.browser-actions {
  display: flex;
  gap: 3px;
}
.browser-actions span {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: var(--surface-2);
}
.browser-actions span.empty {
  background: transparent;
}
.preview-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: white;
}

/* Right rail ---------------------------------------------------------- */
.rail {
  width: 340px;
  flex: 0 0 340px;
  border-left: 1px solid var(--border);
  background: var(--bg);
  padding: 24px 22px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 22px;
}
.rail-rows {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
}
.rail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 4px;
  border-bottom: 1px solid var(--border);
}
.rail-row:last-child {
  border-bottom: none;
}
.rail-value {
  font-size: 12.5px;
  color: var(--text-1);
  display: flex;
  align-items: center;
  gap: 5px;
}

.mcp-card {
  padding: 14px;
  border-radius: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
}
.mcp-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--text-1);
}
.mcp-title {
  font-size: 12px;
  font-weight: 500;
}
.mcp-body {
  line-height: 1.5;
}
.mcp-id {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--text-2);
}
.mcp-id .mono {
  color: var(--text-1);
}

.future-card {
  position: relative;
}
.future-card-body {
  display: flex;
  flex-direction: column;
  margin-top: 10px;
  opacity: 0.55;
}
.future-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 4px;
  border-top: 1px solid var(--border);
}
.future-row:first-child {
  border-top: none;
}
.future-pill {
  display: inline-block;
  margin-top: 10px;
  padding: 2px 7px;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  background: var(--surface-2);
  color: var(--text-3);
  border: 1px solid var(--border);
  border-radius: 3px;
}

.btn :deep(svg) {
  flex: 0 0 auto;
}
.btn.danger.ghost {
  border: none;
  background: transparent;
}
.btn.danger.ghost:hover {
  background: var(--danger-soft);
}

/* Future tabs in the page-detail tab bar are hidden completely; the .future
 * class would otherwise show a "Soon" pill which fights the tab layout. */
.tab.future {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}
.tab.future::after {
  display: none;
}

@media (max-width: 1100px) {
  .rail {
    display: none;
  }
}
</style>
