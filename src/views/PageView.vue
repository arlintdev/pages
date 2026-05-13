<template>
  <div class="view" v-if="page">
    <header class="hdr">
      <div class="title-row">
        <input
          v-model="title"
          class="title-input"
          placeholder="Untitled"
          @blur="saveTitle"
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
        />
        <span v-if="saving" class="muted small">Saving…</span>
        <span v-else-if="savedAt" class="muted small">Saved {{ savedAt }}</span>
      </div>
      <div class="actions">
        <button v-if="!page.shared" class="primary" @click="share">
          <Share2 :size="14" /> Share
        </button>
        <template v-else>
          <button class="ghost" @click="copyLink">
            <Link :size="14" /> {{ copied ? 'Copied!' : 'Copy link' }}
          </button>
          <button class="ghost" @click="share" title="Rotate link — old link will stop working">
            <RefreshCw :size="14" /> Rotate
          </button>
          <button class="danger" @click="unshare">
            <Lock :size="14" /> Unshare
          </button>
        </template>
        <button class="danger ghost" @click="remove">
          <Trash2 :size="14" /> Delete
        </button>
      </div>
    </header>

    <div v-if="page.shared" class="share-bar">
      <span class="dot on" />
      <span class="muted small">Public at</span>
      <a :href="page.share_url!" target="_blank" rel="noopener" class="share-link">
        {{ page.share_url }}
      </a>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'edit' }" @click="tab = 'edit'">HTML</button>
      <button :class="{ active: tab === 'preview' }" @click="tab = 'preview'">Preview</button>
    </div>

    <textarea
      v-if="tab === 'edit'"
      v-model="html"
      class="editor"
      spellcheck="false"
      @input="scheduleSave"
    />
    <iframe v-else class="preview" :srcdoc="html" sandbox="allow-same-origin" />
  </div>
  <div v-else-if="isLoading" class="view muted">Loading…</div>
  <div v-else class="view muted">Page not found.</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { Share2, Lock, Link, RefreshCw, Trash2 } from 'lucide-vue-next'
import { usePage } from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()

const pageId = computed(() => Number(route.params.id))
const { data: page, isLoading } = usePage(pageId)

const title = ref('')
const html = ref('')
const tab = ref<'edit' | 'preview'>('edit')
const saving = ref(false)
const savedAt = ref<string | null>(null)
const copied = ref(false)

// Sync local editor state when the underlying page row arrives or changes.
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
    savedAt.value = `Failed: ${(e as Error).message}`
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

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.view {
  padding: 32px 40px;
  max-width: 1100px;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}
.title-input {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text);
  font-size: 22px;
  font-weight: 500;
  padding: 4px 6px;
  border-radius: 6px;
  flex: 1;
  min-width: 0;
}
.title-input:hover {
  border-color: var(--border);
}
.title-input:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--bg-elev);
}
.actions {
  display: flex;
  gap: 8px;
}
.muted {
  color: var(--text-dim);
}
.small {
  font-size: 12px;
}
.share-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(52, 211, 153, 0.06);
  border: 1px solid rgba(52, 211, 153, 0.25);
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 13px;
}
.share-link {
  color: var(--accent);
  text-decoration: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.share-link:hover {
  text-decoration: underline;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.dot.on {
  background: var(--success);
}
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}
.tabs button {
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-dim);
  border-radius: 6px 6px 0 0;
  padding: 6px 12px;
  cursor: pointer;
  font-size: 13px;
}
.tabs button.active {
  color: var(--text);
  border-color: var(--border);
  border-bottom-color: transparent;
  background: var(--bg-elev);
}
.editor {
  flex: 1;
  min-height: 400px;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 0 8px 8px 8px;
  padding: 14px 16px;
  color: var(--text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  line-height: 1.55;
  resize: none;
}
.editor:focus {
  outline: none;
  border-color: var(--accent);
}
.preview {
  flex: 1;
  min-height: 400px;
  border: 1px solid var(--border);
  border-radius: 0 8px 8px 8px;
  background: white;
}
button {
  background: var(--bg-elev-2);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
button:hover {
  background: var(--bg-hover);
}
button.primary {
  background: var(--accent);
  color: #0b0d10;
  border-color: var(--accent);
}
button.ghost {
  background: transparent;
}
button.danger {
  color: var(--danger);
  border-color: var(--danger-soft);
}
</style>
