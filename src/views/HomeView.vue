<template>
  <div class="view">
    <header class="hdr">
      <div>
        <h1>Pages</h1>
        <p class="sub">Your HTML pages. Click any card to edit or share.</p>
      </div>
      <button class="primary" @click="newPage">
        <Plus :size="14" /> New page
      </button>
    </header>

    <div v-if="isLoading" class="muted">Loading…</div>
    <div v-else-if="!pages || pages.length === 0" class="empty">
      <p>No pages yet.</p>
      <button class="primary" @click="newPage">
        <Plus :size="14" /> Create your first page
      </button>
    </div>
    <ul v-else class="grid">
      <li v-for="p in pages" :key="p.id" class="card-li">
        <router-link :to="{ name: 'page', params: { id: p.id } }" class="card">
          <div class="thumb-wrap">
            <iframe
              class="thumb"
              :src="`/api/pages/${p.id}/raw?v=${encodeURIComponent(p.updated_at ?? '')}`"
              loading="lazy"
              scrolling="no"
              tabindex="-1"
              aria-hidden="true"
            />
            <!-- Pointer shield: the iframe would otherwise steal clicks/hovers
                 from the surrounding <router-link>. -->
            <div class="thumb-shield" />
            <span v-if="p.shared" class="shared-badge" title="Public via share link">
              <Share2 :size="11" /> Shared
            </span>
          </div>
          <div class="card-foot">
            <div class="card-title">{{ p.title }}</div>
            <div class="card-meta">
              <span :class="['dot', p.shared ? 'on' : 'off']" />
              <span>{{ p.shared ? 'Shared' : 'Private' }}</span>
              <span>·</span>
              <span v-if="p.updated_at">{{ formatDate(p.updated_at) }}</span>
            </div>
          </div>
        </router-link>

        <!-- Action bar sits OUTSIDE the router-link so its buttons don't
             nest as descendants of an <a>, and we don't need to fight the
             link's pointer events. Positioned absolutely over the card. -->
        <div class="actions" @click.stop @pointerdown.stop>
          <button
            v-if="!p.shared"
            class="iconbtn"
            title="Share — mint a public link"
            @click.stop.prevent="share(p)"
          >
            <Share2 :size="14" />
          </button>
          <template v-else>
            <button
              class="iconbtn"
              :title="copiedId === p.id ? 'Copied!' : 'Copy share link'"
              @click.stop.prevent="copyLink(p)"
            >
              <Check v-if="copiedId === p.id" :size="14" />
              <Link v-else :size="14" />
            </button>
            <button
              class="iconbtn"
              title="Rotate — kill the old link and mint a fresh one"
              @click.stop.prevent="share(p)"
            >
              <RefreshCw :size="14" />
            </button>
            <button
              class="iconbtn danger"
              title="Unshare — make this page private again"
              @click.stop.prevent="unshare(p)"
            >
              <Lock :size="14" />
            </button>
          </template>
          <button
            class="iconbtn danger"
            title="Delete this page"
            @click.stop.prevent="remove(p)"
          >
            <Trash2 :size="14" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { Plus, Share2, Lock, Link, RefreshCw, Trash2, Check } from 'lucide-vue-next'
import { usePages, type PageSummary } from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'
import { formatDate } from '@/lib/format'

const router = useRouter()
const queryClient = useQueryClient()
const { data: pages, isLoading } = usePages()
const { confirm } = useConfirm()

const copiedId = ref<number | null>(null)

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ['pages'] })
}

async function share(p: PageSummary) {
  const res = await fetch(`/api/pages/${p.id}/share`, { method: 'POST' })
  if (!res.ok) return alert(`Failed: HTTP ${res.status}`)
  const data = await res.json()
  invalidate()
  // Copy the freshly minted link straight to the clipboard — saves the
  // user a second click after they hit the share button.
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
.view {
  padding: 32px 40px;
  max-width: 1200px;
}
.hdr {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
}
h1 {
  margin: 0 0 4px 0;
  font-size: 24px;
}
.sub {
  margin: 0;
  color: var(--text-dim);
}
.muted {
  color: var(--text-dim);
}
.empty {
  border: 1px dashed var(--border);
  border-radius: 10px;
  padding: 48px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-dim);
}
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  /* 3-up on desktop, scales gracefully down to 1-up on phone */
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}
.card-li {
  position: relative;
}
.card {
  display: flex;
  flex-direction: column;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.15s, transform 0.15s;
}
.card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.shared-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  background: rgba(11, 13, 16, 0.78);
  color: var(--success);
  border: 1px solid rgba(52, 211, 153, 0.4);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  padding: 4px;
  background: rgba(11, 13, 16, 0.78);
  border: 1px solid var(--border);
  border-radius: 8px;
  backdrop-filter: blur(4px);
  opacity: 0;
  transition: opacity 0.15s;
  /* Sit above the card's hover transform */
  z-index: 2;
}
.card-li:hover .actions,
.actions:focus-within {
  opacity: 1;
}
/* Touch devices can't hover — always reveal so the buttons are reachable. */
@media (hover: none) {
  .actions {
    opacity: 1;
  }
}
.iconbtn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  width: 28px;
  height: 28px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}
.iconbtn:hover {
  background: var(--bg-hover);
  color: var(--text);
}
.iconbtn.danger:hover {
  color: var(--danger);
}
.thumb-wrap {
  position: relative;
  /* Pin the wrapper to a 4:3 box and absolutely position the iframe so
     its intrinsic 1280×960 size can't force the wrapper taller. */
  width: 100%;
  aspect-ratio: 4 / 3;
  background: white;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}
/* The iframe renders at a virtual 1280×960 viewport and is scaled down to
   fit the card. transform-origin top-left keeps the content anchored to
   the upper-left corner so the preview looks like the top of the page. */
.thumb {
  position: absolute;
  top: 0;
  left: 0;
  width: 1280px;
  height: 960px;
  border: 0;
  transform: scale(0.25);
  transform-origin: top left;
  pointer-events: none;
}
.thumb-shield {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.card-foot {
  padding: 12px 14px;
}
.card-title {
  font-weight: 500;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-meta {
  color: var(--text-dim);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}
.dot.on {
  background: var(--success);
  box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.15);
}
.dot.off {
  background: var(--text-mute);
}
button {
  background: var(--bg-elev-2);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  padding: 8px 14px;
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
</style>
