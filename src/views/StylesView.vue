<template>
  <div class="view">
    <TopBar :crumbs="[{ label: 'Account' }, { label: 'Styles' }]">
      <template #actions>
        <button class="btn primary" @click="openEditor(null)">
          <Plus :size="12" /> New style
        </button>
      </template>
    </TopBar>

    <div class="page-body">
      <header class="page-hdr">
        <h1>Styles</h1>
        <p class="muted">
          Visual styles available to the MCP's <span class="mono">list_styles</span>
          tool. Click a card to preview. Add your own to give agents extra options.
        </p>
      </header>

      <!-- User-authored styles, only shown when at least one exists. -->
      <section v-if="customStyles && customStyles.length" class="section">
        <div class="section-head">
          <h2 class="uppercase-label">Your styles</h2>
          <span class="mono dim">{{ customStyles.length }}</span>
        </div>
        <ul class="grid">
          <li v-for="s in customStyles" :key="s.name">
            <button class="card" @click="open(s.name, 'custom')">
              <div class="thumb-wrap">
                <iframe
                  class="thumb"
                  :src="`/api/custom-styles/${s.name}/preview?v=${encodeURIComponent(s.updated_at ?? '')}`"
                  loading="lazy"
                  scrolling="no"
                  tabindex="-1"
                  aria-hidden="true"
                />
                <div class="thumb-shield" />
                <span class="src-badge">custom</span>
              </div>
              <div class="card-foot">
                <div class="card-title mono">{{ s.name }}</div>
                <div class="card-summary">{{ s.summary }}</div>
              </div>
            </button>
          </li>
        </ul>
      </section>

      <section class="section">
        <div v-if="customStyles && customStyles.length" class="section-head">
          <h2 class="uppercase-label">Built-in</h2>
          <span v-if="styles" class="mono dim">{{ styles.length }}</span>
        </div>
        <div v-if="isLoading" class="muted">Loading…</div>
        <div v-else-if="!styles || styles.length === 0" class="muted">
          No styles configured.
        </div>
        <ul v-else class="grid">
          <li v-for="s in styles" :key="s.name">
            <button class="card" @click="open(s.name, 'builtin')">
              <div class="thumb-wrap">
                <iframe
                  class="thumb"
                  :src="`/api/styles/${s.name}/preview`"
                  loading="lazy"
                  scrolling="no"
                  tabindex="-1"
                  aria-hidden="true"
                />
                <div class="thumb-shield" />
              </div>
              <div class="card-foot">
                <div class="card-title mono">{{ s.name }}</div>
                <div class="card-summary">{{ s.summary }}</div>
              </div>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- Preview / detail modal — shows extra Edit + Delete buttons when
         the selected style is one of the user's customs. -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="selected"
          class="styles-modal-backdrop"
          role="dialog"
          aria-modal="true"
          @click.self="close"
        >
          <div class="modal" @click.stop>
            <header class="modal-head">
              <div class="modal-head-text">
                <div class="modal-name">
                  <span class="mono">{{ selected.name }}</span>
                  <span v-if="selected.source === 'custom'" class="src-pill">custom</span>
                </div>
                <p v-if="selectedWhen" class="muted modal-when">{{ selectedWhen }}</p>
              </div>
              <button class="iconbtn" title="Close" @click="close">
                <X :size="14" />
              </button>
            </header>

            <div class="modal-preview">
              <iframe :src="selectedPreviewUrl" loading="lazy" aria-label="Style preview" />
            </div>

            <div class="modal-actions">
              <button class="btn" @click="openPreviewTab">
                <ExternalLink :size="12" /> Open preview
              </button>
              <button class="btn" @click="copyStarter">
                <Check v-if="copied" :size="12" />
                <Copy v-else :size="12" />
                {{ copied ? 'Copied' : 'Copy starter HTML' }}
              </button>
              <template v-if="selected.source === 'custom'">
                <button class="btn" @click="editSelected">
                  <Pencil :size="12" /> Edit
                </button>
                <button class="btn danger" @click="deleteSelected">
                  <Trash2 :size="12" /> Delete
                </button>
              </template>
              <div class="modal-actions-spacer" />
              <button class="btn primary" @click="useAsStarter">
                <Plus :size="12" /> New page from this
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Editor modal — create or edit a custom style. -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="editorOpen"
          class="styles-modal-backdrop"
          role="dialog"
          aria-modal="true"
          @click.self="closeEditor"
        >
          <div class="modal editor-modal" @click.stop>
            <header class="modal-head">
              <div class="modal-head-text">
                <div class="modal-name">
                  <span class="mono">
                    {{ editingOriginalName ? `edit · ${editingOriginalName}` : 'new custom style' }}
                  </span>
                </div>
                <p class="muted modal-when">
                  A single HTML doc — used as both the preview and the starter
                  shell agents drop content into. Include
                  <span class="mono">&lt;!-- CONTENT --&gt;</span>
                  if you want a specific slot; otherwise content gets appended
                  before <span class="mono">&lt;/body&gt;</span>.
                </p>
              </div>
              <button class="iconbtn" title="Close" @click="closeEditor">
                <X :size="14" />
              </button>
            </header>

            <div class="editor-body">
              <div class="editor-fields">
                <label>
                  <span class="uppercase-label">Name</span>
                  <input
                    v-model.trim="form.name"
                    placeholder="my-style"
                    maxlength="40"
                    spellcheck="false"
                  />
                  <span class="hint">
                    Kebab-case (a-z, 0-9, single hyphens). Cannot match a built-in name.
                  </span>
                </label>
                <label>
                  <span class="uppercase-label">Summary</span>
                  <input
                    v-model.trim="form.summary"
                    placeholder="A one-line description"
                    maxlength="280"
                  />
                </label>
                <label>
                  <span class="uppercase-label">When to use</span>
                  <textarea
                    v-model.trim="form.when_to_use"
                    rows="3"
                    placeholder="A hint for the agent — when is this style the right pick?"
                    maxlength="280"
                  />
                </label>
                <label class="grow">
                  <span class="uppercase-label">HTML</span>
                  <textarea
                    v-model="form.html"
                    class="code"
                    spellcheck="false"
                    placeholder="<!doctype html>..."
                  />
                </label>
                <div v-if="editorError" class="err">{{ editorError }}</div>
              </div>
              <div class="editor-preview">
                <div class="uppercase-label preview-lbl">Live preview</div>
                <iframe :srcdoc="previewSrcdoc" aria-label="Live preview" />
              </div>
            </div>

            <div class="modal-actions editor-actions">
              <div class="modal-actions-spacer" />
              <button class="btn" @click="closeEditor">Cancel</button>
              <button class="btn primary" :disabled="saving" @click="saveStyle">
                {{ saving ? 'Saving…' : editingOriginalName ? 'Save changes' : 'Create style' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { Copy, Check, ExternalLink, Plus, X, Pencil, Trash2 } from 'lucide-vue-next'
import {
  useStyles,
  useStyle,
  useCustomStyles,
  useCustomStyle,
} from '@/composables/useApi'
import { useConfirm } from '@/composables/useConfirm'
import TopBar from '@/components/TopBar.vue'

const router = useRouter()
const queryClient = useQueryClient()
const { confirm } = useConfirm()

const { data: styles, isLoading } = useStyles()
const { data: customStyles } = useCustomStyles()

type Selected = { name: string; source: 'builtin' | 'custom' }
const selected = ref<Selected | null>(null)

const selectedBuiltinName = computed(() =>
  selected.value?.source === 'builtin' ? selected.value.name : null,
)
const selectedCustomName = computed(() =>
  selected.value?.source === 'custom' ? selected.value.name : null,
)
const { data: selectedBuiltin } = useStyle(selectedBuiltinName)
const { data: selectedCustom } = useCustomStyle(selectedCustomName)

// Stitched view of whichever source is loaded — keeps the template free
// of source-by-source branches for the common fields.
const selectedWhen = computed(() => {
  if (selected.value?.source === 'builtin') return selectedBuiltin.value?.when_to_use
  if (selected.value?.source === 'custom') return selectedCustom.value?.when_to_use
  return null
})
const selectedPreviewUrl = computed(() => {
  if (!selected.value) return ''
  if (selected.value.source === 'builtin') {
    return `/api/styles/${selected.value.name}/preview`
  }
  // updated_at busts the 60s preview cache after an edit.
  const v = selectedCustom.value?.updated_at ?? ''
  return `/api/custom-styles/${selected.value.name}/preview?v=${encodeURIComponent(v)}`
})
const selectedStarter = computed(() => {
  if (selected.value?.source === 'builtin') return selectedBuiltin.value?.starter_html
  if (selected.value?.source === 'custom') return selectedCustom.value?.html
  return undefined
})

const copied = ref(false)

function open(name: string, source: 'builtin' | 'custom') {
  selected.value = { name, source }
  copied.value = false
}
function close() {
  selected.value = null
}

// Body scroll-lock + Escape for both modals.
watch([selected, () => editorOpen.value], ([sel, ed]) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = sel || ed ? 'hidden' : ''
})
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (editorOpen.value) closeEditor()
  else if (selected.value) close()
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKey)
  onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  })
}

function openPreviewTab() {
  if (!selected.value) return
  window.open(selectedPreviewUrl.value, '_blank', 'noopener')
}

async function copyStarter() {
  const html = selectedStarter.value
  if (!html) return
  try {
    await navigator.clipboard.writeText(html)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    alert("Couldn't copy — your browser blocked clipboard access.")
  }
}

async function useAsStarter() {
  const html = selectedStarter.value
  if (!html || !selected.value) return
  const res = await fetch('/api/pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: `Untitled (${selected.value.name})`,
      html,
    }),
  })
  if (!res.ok) {
    alert(`Failed: HTTP ${res.status}`)
    return
  }
  const data = await res.json()
  queryClient.invalidateQueries({ queryKey: ['pages'] })
  close()
  router.push({ name: 'page', params: { id: data.id } })
}

// ---------- editor ----------

const editorOpen = ref(false)
const editingOriginalName = ref<string | null>(null)
const editorError = ref<string | null>(null)
const saving = ref(false)
const form = reactive({
  name: '',
  summary: '',
  when_to_use: '',
  html: '',
})

const PREVIEW_PLACEHOLDER =
  '<p style="padding:2rem;font-family:system-ui;color:#888">Type HTML to see a preview…</p>'
const previewSrcdoc = computed(() => form.html || PREVIEW_PLACEHOLDER)

const DEFAULT_STARTER = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>My style</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 38rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.6; color: #222; }
    h1 { color: #6d28d9; }
  </style>
</head>
<body>
  <h1>Hello</h1>
  <!-- CONTENT -->
</body>
</html>
`

function openEditor(name: string | null) {
  editorError.value = null
  if (name) {
    editingOriginalName.value = name
    // Hydrate the form from the cached row if we have it. Otherwise the
    // user may briefly see empty fields while the GET resolves — fine.
    const existing = customStyles.value?.find((s) => s.name === name)
    if (existing) {
      form.name = existing.name
      form.summary = existing.summary
      form.when_to_use = existing.when_to_use
      form.html = ''
      fetch(`/api/custom-styles/${name}`)
        .then((r) => r.json())
        .then((d) => {
          form.html = d.html
        })
    }
  } else {
    editingOriginalName.value = null
    form.name = ''
    form.summary = ''
    form.when_to_use = ''
    form.html = DEFAULT_STARTER
  }
  // Close the preview modal first if it's open — only one modal at a time.
  selected.value = null
  editorOpen.value = true
}

function closeEditor() {
  if (saving.value) return
  editorOpen.value = false
  editorError.value = null
}

function editSelected() {
  if (selected.value?.source !== 'custom') return
  openEditor(selected.value.name)
}

async function deleteSelected() {
  if (selected.value?.source !== 'custom') return
  const name = selected.value.name
  const ok = await confirm({
    title: 'Delete custom style?',
    message: `"${name}" will be removed from your catalog. Existing pages already using it keep their HTML.`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  const res = await fetch(`/api/custom-styles/${name}`, { method: 'DELETE' })
  if (!res.ok) {
    alert(`Failed: HTTP ${res.status}`)
    return
  }
  close()
  queryClient.invalidateQueries({ queryKey: ['custom-styles'] })
}

async function saveStyle() {
  editorError.value = null
  saving.value = true
  try {
    const body = {
      name: form.name.trim().toLowerCase(),
      summary: form.summary,
      when_to_use: form.when_to_use,
      html: form.html,
    }
    const url = editingOriginalName.value
      ? `/api/custom-styles/${editingOriginalName.value}`
      : '/api/custom-styles'
    const method = editingOriginalName.value ? 'PUT' : 'POST'
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      editorError.value = data.error || `HTTP ${res.status}`
      return
    }
    editorOpen.value = false
    queryClient.invalidateQueries({ queryKey: ['custom-styles'] })
    if (editingOriginalName.value && editingOriginalName.value !== body.name) {
      // Invalidate both old and new keys so the modal-preview iframe
      // picks up the rename without a stale src lying around.
      queryClient.invalidateQueries({ queryKey: ['custom-style', editingOriginalName.value] })
    }
    queryClient.invalidateQueries({ queryKey: ['custom-style', body.name] })
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.page-body {
  padding: 28px 36px;
  max-width: 1280px;
  width: 100%;
}

.page-hdr {
  margin-bottom: 28px;
}
.page-hdr h1 {
  margin: 0 0 6px;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.page-hdr p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  max-width: 56ch;
}

.section {
  margin-top: 32px;
}
.section:first-of-type {
  margin-top: 0;
}
.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 12px;
}
.section-head h2 {
  margin: 0;
  /* uppercase-label utility already styles the text — we just need to
   * reset the heading's default font-weight so it doesn't compete. */
  padding: 0;
}

.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.card {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  padding: 0;
  font: inherit;
  color: inherit;
  transition: border-color 0.12s ease;
}
.card:hover {
  border-color: var(--border-strong);
}

.thumb-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: white;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}
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

/* "custom" pill in the corner of user-authored style cards. Uses the
 * live-green to mirror the dashboard's Live badge so the user reads
 * "this is mine" at the same glance speed. */
.src-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: #0a0a0a;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
}

.card-foot {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-1);
  letter-spacing: -0.005em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card-summary {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dim {
  color: var(--text-3);
}
.muted {
  color: var(--text-2);
}
</style>

<!-- Unscoped block for the teleported modal so its styles still apply
     after Vue lifts it out of this component's DOM subtree. Classes are
     prefixed with `.styles-modal-` to avoid clashing with other modals
     in the app (Confirm uses `.confirm-*`). -->
<style>
/* Modal backdrop — Linear/Vercel pattern: light tint + heavy blur, not a
 * dark curtain. The card sits on a `--bg` surface with a generous shadow
 * for depth. */
.styles-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: color-mix(in srgb, var(--bg) 50%, transparent);
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  display: grid;
  place-items: center;
  padding: 24px;
  overflow-y: auto;
}
.styles-modal-backdrop .modal {
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.04),
    0 12px 32px -8px rgba(0, 0, 0, 0.18),
    0 32px 80px -16px rgba(0, 0, 0, 0.24);
}

.styles-modal-backdrop .modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border);
}
.styles-modal-backdrop .modal-head-text {
  min-width: 0;
}
.styles-modal-backdrop .modal-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text-1);
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.styles-modal-backdrop .modal-when {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  max-width: 64ch;
}
.styles-modal-backdrop .modal-when .mono {
  background: var(--surface-2);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 11.5px;
  color: var(--text-1);
}
.styles-modal-backdrop .src-pill {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 999px;
  color: var(--text-1);
  background: var(--chip);
  border: 1px solid var(--border);
}

.styles-modal-backdrop .modal-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: white;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
}
.styles-modal-backdrop .modal-preview iframe {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

.styles-modal-backdrop .modal-actions {
  display: flex;
  gap: 8px;
  padding: 14px 22px;
  background: var(--surface);
  flex-wrap: wrap;
  align-items: center;
}
.styles-modal-backdrop .modal-actions-spacer {
  flex: 1;
}

/* Editor-specific layout overrides */
.styles-modal-backdrop .editor-modal {
  width: min(1080px, 100%);
}
.styles-modal-backdrop .editor-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  flex: 1;
  min-height: 0;
}
.styles-modal-backdrop .editor-fields {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}
.styles-modal-backdrop .editor-fields label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.styles-modal-backdrop .editor-fields label.grow {
  flex: 1;
}
.styles-modal-backdrop .hint {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.4;
}
.styles-modal-backdrop .editor-fields input,
.styles-modal-backdrop .editor-fields textarea {
  background: var(--bg);
  color: var(--text-1);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  letter-spacing: -0.005em;
  transition: border-color 0.12s ease;
}
.styles-modal-backdrop .editor-fields textarea {
  resize: vertical;
  min-height: 60px;
}
.styles-modal-backdrop .editor-fields textarea.code {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.55;
  min-height: 280px;
  flex: 1;
}
.styles-modal-backdrop .editor-fields input:focus,
.styles-modal-backdrop .editor-fields textarea:focus {
  outline: none;
  border-color: var(--border-strong);
}

.styles-modal-backdrop .editor-preview {
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.styles-modal-backdrop .preview-lbl {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
}
.styles-modal-backdrop .editor-preview iframe {
  flex: 1;
  width: 100%;
  border: 0;
  background: white;
  min-height: 380px;
}
.styles-modal-backdrop .editor-actions {
  border-top: 1px solid var(--border);
  justify-content: flex-end;
}

.styles-modal-backdrop .err {
  background: var(--danger-soft);
  border: 1px solid var(--danger-soft);
  color: var(--danger);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12.5px;
}

.styles-modal-backdrop .btn.danger {
  /* Override theme.css default — solid danger color for delete in the
   * modal action bar, matches ConfirmHost's destructive button. */
  color: var(--danger);
}
.styles-modal-backdrop .btn.danger:hover:not(:disabled) {
  background: var(--danger-soft);
  border-color: var(--danger-soft);
}

.styles-modal-backdrop .iconbtn {
  background: transparent;
  border: none;
  color: var(--text-3);
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.styles-modal-backdrop .iconbtn:hover {
  background: var(--hover);
  color: var(--text-1);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .modal,
.fade-leave-active .modal {
  transition: transform 0.18s ease, opacity 0.15s ease;
}
.fade-enter-from .modal,
.fade-leave-to .modal {
  transform: translateY(8px) scale(0.98);
  opacity: 0;
}

@media (max-width: 720px) {
  .styles-modal-backdrop .editor-body {
    grid-template-columns: 1fr;
  }
  .styles-modal-backdrop .editor-preview {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
</style>
