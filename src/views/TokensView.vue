<template>
  <div class="view">
    <TopBar :crumbs="[{ label: 'Account' }, { label: 'MCP integration' }]">
      <template #actions>
        <button class="btn primary" @click="showCreate = true">
          <Plus :size="12" /> Create key
        </button>
      </template>
    </TopBar>

    <div class="page-body">
      <!-- Sub-nav -->
      <nav class="sub-nav">
        <div class="uppercase-label">Account</div>
        <div class="sub-item future">Profile</div>
        <button class="sub-item active">API keys & MCP</button>
        <div class="sub-item future">Custom domains</div>
        <div class="sub-item future">Webhooks</div>
        <div class="sub-item future">Billing</div>
        <div class="sub-item future">Team</div>
        <div class="sub-item future danger">Danger zone</div>
      </nav>

      <div class="content">
        <div class="content-inner">
          <header class="page-hdr">
            <h1>MCP integration</h1>
            <p class="muted">
              Let AI agents create, edit and ship pages on your behalf. Drop this
              config into Claude Desktop, Claude Code, or any MCP-aware client.
            </p>
          </header>

          <!-- Freshly minted token banner — only shown once -->
          <section v-if="freshToken" class="fresh-token">
            <div class="fresh-token-head">
              <div class="fresh-token-title">
                <Check :size="14" /> Token created
              </div>
              <button class="btn ghost sm" @click="freshToken = null">Dismiss</button>
            </div>
            <p class="muted small">
              Copy it now — it won't be shown again. Use it as
              <span class="mono">Authorization: Bearer &lt;token&gt;</span>.
            </p>
            <div class="fresh-token-pill mono">{{ freshToken }}</div>
          </section>

          <!-- MCP server card -->
          <section class="mcp-card">
            <div class="mcp-card-head">
              <LiveDot :size="8" />
              <div class="mcp-meta">
                <div class="mcp-meta-title">MCP server</div>
                <div class="mcp-meta-sub muted small">
                  {{ activeTokens }} {{ activeTokens === 1 ? 'token' : 'tokens' }} active<template v-if="lastPing">
                    · last ping {{ lastPing }}
                  </template>
                </div>
              </div>
              <div class="spacer" />
              <span class="endpoint-pill mono">{{ mcpUrl }}</span>
            </div>
            <div class="code-block">
              <pre><code v-html="highlightedSnippet" /></pre>
              <button class="code-copy" @click="copySnippet">
                <Check v-if="copiedSnippet" :size="11" />
                <Copy v-else :size="11" />
                {{ copiedSnippet ? 'Copied' : 'Copy config' }}
              </button>
            </div>
            <div class="install-tabs">
              <button
                v-for="t in installTabs"
                :key="t.id"
                class="install-tab"
                :class="{ active: activeInstall === t.id }"
                @click="activeInstall = t.id"
              >{{ t.label }}</button>
            </div>
          </section>

          <!-- API keys -->
          <section>
            <div class="section-head">
              <h2>API keys</h2>
              <span class="mono dim">{{ tokens?.length ?? 0 }}</span>
              <div class="spacer" />
              <span class="muted small">Scoped tokens used by MCP and direct API.</span>
            </div>

            <div v-if="isLoading" class="muted small">Loading…</div>
            <div v-else-if="!tokens || tokens.length === 0" class="empty-keys">
              <p class="muted">No keys yet.</p>
              <button class="btn primary" @click="showCreate = true">
                <Plus :size="12" /> Create your first key
              </button>
            </div>
            <div v-else class="keys-table">
              <div class="keys-head">
                <div>Name</div>
                <div>Token</div>
                <div>Scopes</div>
                <div>Last used</div>
                <div />
              </div>
              <div v-for="(t, i) in tokens" :key="t.id" class="keys-row">
                <div class="key-name">
                  <LiveDot v-if="i === 0 && t.last_used_at" :size="6" />
                  <span class="key-name-text">{{ t.name }}</span>
                </div>
                <div class="mono key-token">
                  {{ t.token_prefix }}<span class="dim">••••••••</span>
                </div>
                <div class="key-scopes">
                  <span v-for="s in t.scopes" :key="s" class="scope-chip mono">{{ s }}</span>
                </div>
                <div class="muted small key-used">{{ relativeTime(t.last_used_at) || 'never' }}</div>
                <div class="key-action">
                  <button class="icon-btn" @click="revoke(t)" title="Revoke">
                    <Trash2 :size="13" />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Tools exposed -->
          <section>
            <div class="section-head">
              <h2>Tools exposed to agents</h2>
              <div class="spacer" />
              <span class="muted small">{{ TOOLS.length }} tools · pages MCP v2</span>
            </div>
            <div class="tools-grid">
              <div v-for="tool in TOOLS" :key="tool.name" class="tool-card">
                <div class="tool-head">
                  <Zap :size="11" />
                  <span class="mono tool-name">{{ tool.name }}</span>
                </div>
                <div class="tool-desc muted small">{{ tool.desc }}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- Create modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
          <div class="modal" @click.stop>
            <header class="modal-head">
              <h3>Create API key</h3>
              <button class="icon-btn" @click="showCreate = false">
                <X :size="14" />
              </button>
            </header>
            <div class="modal-body">
              <label>
                <span class="uppercase-label">Name</span>
                <input v-model="form.name" placeholder="Claude Desktop" />
              </label>
              <fieldset>
                <legend class="uppercase-label">Scopes</legend>
                <label v-for="s in availableScopes" :key="s" class="scope-row">
                  <input type="checkbox" :value="s" v-model="form.scopes" />
                  <span class="mono">{{ s }}</span>
                </label>
              </fieldset>
              <div v-if="createError" class="err">{{ createError }}</div>
            </div>
            <div class="modal-actions">
              <button class="btn ghost" @click="showCreate = false">Cancel</button>
              <button class="btn primary" :disabled="creating" @click="submit">
                {{ creating ? 'Creating…' : 'Create key' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Plus, Check, Copy, Trash2, Zap, X } from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm'
import TopBar from '@/components/TopBar.vue'
import LiveDot from '@/components/LiveDot.vue'

type TokenRow = {
  id: number
  name: string
  scopes: string[]
  token_prefix: string
  expires_at: string | null
  last_used_at: string | null
  created_at: string
}

const queryClient = useQueryClient()
const { confirm } = useConfirm()

const { data: tokens, isLoading } = useQuery<TokenRow[]>({
  queryKey: ['tokens'],
  queryFn: async () => {
    const res = await fetch('/api/tokens')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },
})

const availableScopes = ['pages:read', 'pages:write', 'tokens:read', 'tokens:write']
const showCreate = ref(false)
const freshToken = ref<string | null>(null)
const creating = ref(false)
const createError = ref<string | null>(null)
const form = reactive({
  name: '',
  scopes: ['pages:read', 'pages:write'] as string[],
})

const mcpUrl = computed(() => {
  if (typeof window === 'undefined') return '/api/mcp'
  return `${window.location.origin}/api/mcp`
})

const activeTokens = computed(() => tokens.value?.length ?? 0)

// Honest "last ping" — most recent last_used_at across all tokens. The
// mock had "2 clients connected · 14s ago"; we have no clients-count so
// we just lean on real timestamps.
const lastPing = computed(() => {
  const rows = tokens.value ?? []
  let latest: number | null = null
  for (const t of rows) {
    if (!t.last_used_at) continue
    const ms = Date.parse(
      t.last_used_at.includes('T') ? t.last_used_at : t.last_used_at.replace(' ', 'T') + 'Z',
    )
    if (Number.isFinite(ms) && (latest === null || ms > latest)) latest = ms
  }
  return latest ? relativeTime(new Date(latest).toISOString()) : null
})

type InstallTabId = 'desktop' | 'code' | 'generic'
const installTabs: { id: InstallTabId; label: string }[] = [
  { id: 'desktop', label: 'Claude Desktop' },
  { id: 'code', label: 'Claude Code' },
  { id: 'generic', label: 'Other clients' },
]
const activeInstall = ref<InstallTabId>('desktop')

const snippetToken = computed(() => freshToken.value ?? 'YOUR_TOKEN_HERE')

const installSnippet = computed(() => {
  if (activeInstall.value === 'desktop') {
    return `{
  "mcpServers": {
    "pages": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${mcpUrl.value}", "--header", "Authorization:Bearer \${PAGES_TOKEN}"],
      "env": {
        "PAGES_TOKEN": "${snippetToken.value}"
      }
    }
  }
}`
  }
  if (activeInstall.value === 'code') {
    return `claude mcp add --transport http -s user pages ${mcpUrl.value} \\
  --header "Authorization: Bearer ${snippetToken.value}"`
  }
  return `# Remote MCP server "pages"
endpoint: ${mcpUrl.value}
token:    ${snippetToken.value}

# Authenticate with: Authorization: Bearer <token>`
})

// Cheap syntax highlight for JSON snippets — recognizes string literals
// and renders them in a different shade. Plain text snippets pass
// through unchanged.
const highlightedSnippet = computed(() => {
  const text = installSnippet.value
  // First escape HTML special chars
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  // Highlight quoted strings
  return escaped.replace(/("[^"]*")/g, '<span class="hl-str">$1</span>')
})

const copiedSnippet = ref(false)
async function copySnippet() {
  try {
    await navigator.clipboard.writeText(installSnippet.value)
    copiedSnippet.value = true
    setTimeout(() => (copiedSnippet.value = false), 1500)
  } catch {
    alert(`Couldn't copy. ${installSnippet.value}`)
  }
}

const TOOLS = [
  { name: 'list_pages', desc: 'Enumerate your pages with their share state and slugs.' },
  { name: 'get_page', desc: 'Fetch HTML + metadata for a single page.' },
  { name: 'create_page', desc: 'Create a new page from raw HTML. Optionally share on creation.' },
  { name: 'update_page', desc: "Update a page's title and/or HTML. Share links survive edits." },
  { name: 'share_page', desc: 'Mint a share token. Calling again rotates and kills the old link.' },
  { name: 'unshare_page', desc: 'Revoke the share link. The URL stops working immediately.' },
  { name: 'delete_page', desc: 'Permanently delete a page and any active share link.' },
  { name: 'list_styles', desc: 'Browse curated visual styles for agents to use as page starters.' },
]

async function submit() {
  creating.value = true
  createError.value = null
  try {
    const res = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, scopes: form.scopes }),
    })
    const data = await res.json()
    if (!res.ok) {
      createError.value = data.error || `HTTP ${res.status}`
      return
    }
    freshToken.value = data.token
    showCreate.value = false
    form.name = ''
    queryClient.invalidateQueries({ queryKey: ['tokens'] })
  } finally {
    creating.value = false
  }
}

async function revoke(t: TokenRow) {
  const ok = await confirm({
    title: 'Revoke token?',
    message: `"${t.name}" (${t.token_prefix}…) will stop working immediately. Any client using it will start getting 401s.`,
    confirmLabel: 'Revoke',
    destructive: true,
  })
  if (!ok) return
  const res = await fetch(`/api/tokens/${t.id}`, { method: 'DELETE' })
  if (res.ok) queryClient.invalidateQueries({ queryKey: ['tokens'] })
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z')
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 14) return `${day}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.page-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* sub-nav --------------------------------------------------------- */
.sub-nav {
  width: 200px;
  flex: 0 0 200px;
  padding: 24px 14px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.sub-nav .uppercase-label {
  padding: 2px 10px 8px;
}
.sub-item {
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-2);
  cursor: pointer;
  background: transparent;
  border: none;
  text-align: left;
  font-family: inherit;
  transition: background 0.1s ease, color 0.1s ease;
}
.sub-item:hover:not(.future) {
  background: var(--hover);
  color: var(--text-1);
}
.sub-item.active {
  background: var(--surface-2);
  color: var(--text-1);
  font-weight: 500;
}
.sub-item.danger {
  color: var(--danger);
}

/* content --------------------------------------------------------- */
.content {
  flex: 1;
  padding: 28px 36px;
  overflow: auto;
}
.content-inner {
  max-width: 760px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.page-hdr h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.025em;
}
.page-hdr p {
  margin: 6px 0 0;
  font-size: 13.5px;
  line-height: 1.6;
  max-width: 560px;
}

/* fresh token banner --------------------------------------------- */
.fresh-token {
  padding: 14px 18px;
  border: 1px solid color-mix(in srgb, var(--live) 30%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--live) 4%, var(--surface));
}
.fresh-token-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.fresh-token-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--live);
}
.fresh-token-pill {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 12px;
  word-break: break-all;
  user-select: all;
}

/* MCP server card ------------------------------------------------ */
.mcp-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  overflow: hidden;
}
.mcp-card-head {
  padding: 14px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid var(--border);
}
.mcp-meta-title {
  font-size: 13px;
  font-weight: 500;
}
.mcp-meta-sub {
  margin-top: 2px;
}
.endpoint-pill {
  font-size: 11.5px;
  padding: 4px 8px;
  border-radius: 5px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}
.spacer {
  flex: 1;
}

.code-block {
  position: relative;
  background: #0a0a0a;
}
.code-block pre {
  margin: 0;
  padding: 16px 18px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.65;
  color: #e0e0e0;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
}
.code-block :deep(.hl-str) {
  color: #9cdcfe;
}
.code-copy {
  position: absolute;
  top: 10px;
  right: 10px;
  height: 26px;
  padding: 0 9px;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #fafafa;
  font-family: var(--font-sans);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
}
.code-copy:hover {
  background: rgba(255, 255, 255, 0.14);
}
.install-tabs {
  display: flex;
  gap: 0;
  padding: 4px 18px 0;
  background: var(--surface);
}
.install-tab {
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-bottom: 1.5px solid transparent;
  margin-bottom: -1px;
  font-family: inherit;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}
.install-tab.active {
  color: var(--text-1);
  font-weight: 500;
  border-bottom-color: var(--text-1);
}

/* section heads -------------------------------------------------- */
.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 14px;
}
.section-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* keys table ---------------------------------------------------- */
.keys-table {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  overflow: hidden;
}
.keys-head,
.keys-row {
  display: grid;
  grid-template-columns: 1.3fr 1.2fr 1fr 0.7fr 40px;
  align-items: center;
  gap: 0;
  padding: 12px 16px;
}
.keys-head {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  padding-top: 10px;
  padding-bottom: 10px;
}
.keys-row {
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.keys-row:last-child {
  border-bottom: none;
}
.key-name {
  display: flex;
  align-items: center;
  gap: 8px;
}
.key-name-text {
  font-weight: 500;
  color: var(--text-1);
}
.key-token {
  font-size: 12px;
  color: var(--text-2);
}
.key-scopes {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.scope-chip {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--chip);
  color: var(--text-2);
}
.key-used {
  white-space: nowrap;
}
.key-action {
  text-align: right;
}
.icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease, color 0.1s ease;
}
.icon-btn:hover {
  background: var(--hover);
  color: var(--text-1);
}

.empty-keys {
  padding: 32px 16px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

/* tools grid ---------------------------------------------------- */
.tools-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.tool-card {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.tool-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  color: var(--text-1);
}
.tool-name {
  font-size: 12px;
  font-weight: 500;
}
.tool-desc {
  line-height: 1.5;
}

/* modal --------------------------------------------------------- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  padding: 24px;
}
.modal {
  background: var(--bg);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  width: min(440px, 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 8px;
}
.modal-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.modal-body {
  padding: 8px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.modal-body label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.modal-body input[type='text'],
.modal-body input:not([type]) {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
  color: var(--text-1);
}
.modal-body input:focus {
  outline: none;
  border-color: var(--border-strong);
}
.modal-body fieldset {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
  margin: 0;
}
.modal-body fieldset legend {
  padding: 0 4px;
}
.scope-row {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 13px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 18px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface);
}
.err {
  color: var(--danger);
  font-size: 12.5px;
  background: var(--danger-soft);
  border: 1px solid var(--danger-soft);
  padding: 8px 10px;
  border-radius: 6px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .sub-nav {
    display: none;
  }
  .tools-grid {
    grid-template-columns: 1fr;
  }
  .keys-head,
  .keys-row {
    grid-template-columns: 1fr 0.6fr;
  }
  .keys-head > :not(:first-child):not(:last-child),
  .keys-row > .key-token,
  .keys-row > .key-scopes,
  .keys-row > .key-used {
    display: none;
  }
}
</style>
