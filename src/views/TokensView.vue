<template>
  <div class="view">
    <header class="hdr">
      <div>
        <h1>API tokens</h1>
        <p class="muted">
          Tokens let external tools (like Claude Desktop's MCP client) talk to this
          server without going through Cloudflare Access. Each token carries a
          scope set — keep them narrow.
        </p>
      </div>
      <button class="primary" @click="showCreate = true">
        <Plus :size="14" /> New token
      </button>
    </header>

    <section v-if="freshToken" class="card success">
      <div class="row">
        <strong>Token created</strong>
        <button class="link" @click="freshToken = null">Dismiss</button>
      </div>
      <p class="muted small">
        Copy it now — it won't be shown again. Use it as
        <code>Authorization: Bearer &lt;token&gt;</code>, or paste it into your
        MCP client config below.
      </p>
      <pre class="token">{{ freshToken }}</pre>
    </section>

    <!-- Install / setup guide. The snippets use the freshly-minted token
         if there is one this session; otherwise they fall back to a
         placeholder and tell the user to substitute their token. -->
    <section class="card install">
      <h2>Connect a Claude client</h2>
      <p class="muted small">
        Paste one of these into your Claude tool of choice. It tells Claude
        about the pages MCP endpoint and the bearer token to authenticate with.
      </p>

      <div class="tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          :class="['tab', { active: activeTab === t.id }]"
          @click="activeTab = t.id"
        >
          {{ t.label }}
        </button>
      </div>

      <div v-if="!freshToken && (!tokens || tokens.length === 0)" class="hint muted small">
        <strong>Mint a token first.</strong> Click "New token" above. The full
        token value is only shown once at creation — that's the value to paste
        into your client.
      </div>
      <div v-else-if="!freshToken" class="hint muted small">
        Showing a snippet with a placeholder. Replace
        <code>YOUR_TOKEN_HERE</code> with the full token value you saved when
        you created
        <code v-if="lastSavedPrefix">{{ lastSavedPrefix }}…</code> (or any
        other token you've still got the value for). If you've lost it, revoke
        the old one and mint a new one.
      </div>

      <div class="snippet-wrap">
        <button class="copy-btn" @click="copySnippet">
          <Check v-if="copiedSnippet" :size="13" />
          <Copy v-else :size="13" />
          {{ copiedSnippet ? 'Copied' : 'Copy' }}
        </button>
        <pre class="snippet">{{ activeSnippet }}</pre>
      </div>

      <p v-if="activeTab === 'desktop'" class="muted small footnote">
        Paste this into your Claude Desktop chat as a plain message. Claude
        Desktop will guide you through editing
        <code>claude_desktop_config.json</code> and restarting the app.
      </p>
      <p v-else-if="activeTab === 'code'" class="muted small footnote">
        Run this in your terminal where the <code>claude</code> CLI is
        installed. Restart any existing Claude Code session afterwards so the
        new tools show up.
      </p>
      <p v-else class="muted small footnote">
        Paste this into any Claude product (claude.ai, an API integration,
        an Agent SDK script) and it'll do its best to wire up the connection.
      </p>
    </section>

    <section class="card">
      <h2>MCP endpoint</h2>
      <p class="muted small">
        Point your MCP client at this URL and authenticate with a bearer token
        that has at least <code>pages:read</code>.
      </p>
      <pre>{{ mcpUrl }}</pre>
    </section>

    <div v-if="isLoading" class="muted">Loading…</div>
    <div v-else-if="!tokens || tokens.length === 0" class="muted">
      No tokens yet.
    </div>
    <table v-else class="tbl">
      <thead>
        <tr>
          <th>Name</th>
          <th>Prefix</th>
          <th>Scopes</th>
          <th>Last used</th>
          <th>Created</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="t in tokens" :key="t.id">
          <td>{{ t.name }}</td>
          <td><code>{{ t.token_prefix }}…</code></td>
          <td>
            <span v-for="s in t.scopes" :key="s" class="chip">{{ s }}</span>
          </td>
          <td class="muted small">{{ t.last_used_at ?? '—' }}</td>
          <td class="muted small">{{ t.created_at }}</td>
          <td>
            <button class="danger" @click="revoke(t)">Revoke</button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Create modal -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <h2>New token</h2>
        <label>
          Name
          <input v-model="form.name" placeholder="claude-desktop" />
        </label>
        <fieldset>
          <legend>Scopes</legend>
          <label v-for="s in availableScopes" :key="s" class="scope">
            <input
              type="checkbox"
              :value="s"
              v-model="form.scopes"
            />
            <span>{{ s }}</span>
          </label>
        </fieldset>
        <label>
          Expires (optional, ISO 8601)
          <input v-model="form.expires_at" placeholder="2027-01-01T00:00:00Z" />
        </label>
        <div v-if="createError" class="err">{{ createError }}</div>
        <div class="actions">
          <button class="link" @click="showCreate = false">Cancel</button>
          <button class="primary" :disabled="creating" @click="submit">
            {{ creating ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { Plus, Copy, Check } from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm'

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
  expires_at: '',
})

const mcpUrl = computed(() => {
  if (typeof window === 'undefined') return '/api/mcp'
  return `${window.location.origin}/api/mcp`
})

// ---------- install snippet generator ----------
//
// Three target audiences, each shipped its own paste-this-into-Claude
// snippet. We auto-fill the token if one was minted in this session;
// otherwise we leave a YOUR_TOKEN_HERE placeholder so we never bake a
// stale or partial token into the rendered text.
//
// We persist the prefix of the most-recently-minted token to
// localStorage so the install card can hint at *which* token the user
// should paste even after a page reload. The full token is never
// persisted client-side — only the visible prefix the server already
// returns on list_tokens.

const PREFIX_STORAGE_KEY = 'pages:lastSavedPrefix'
const lastSavedPrefix = ref<string | null>(null)
if (typeof window !== 'undefined') {
  lastSavedPrefix.value = window.localStorage.getItem(PREFIX_STORAGE_KEY)
}

type TabId = 'desktop' | 'code' | 'generic'
const tabs: { id: TabId; label: string }[] = [
  { id: 'desktop', label: 'Claude Desktop' },
  { id: 'code', label: 'Claude Code' },
  { id: 'generic', label: 'Other Claude clients' },
]
const activeTab = ref<TabId>('desktop')
const copiedSnippet = ref(false)

// The token used in the rendered snippet. Falls back to a literal
// placeholder so users without a fresh token still see a sensible
// example (and the placeholder makes it obvious where to substitute).
const snippetToken = computed(() => freshToken.value ?? 'YOUR_TOKEN_HERE')

const desktopSnippet = computed(() => `Set up an MCP server called "pages" using:

  endpoint: ${mcpUrl.value}
  token:    ${snippetToken.value}

It's an HTTP MCP server that needs an Authorization: Bearer header.
Walk me through editing claude_desktop_config.json and restarting Claude
Desktop so the new tools show up.`)

const codeSnippet = computed(
  () => `claude mcp add --transport http -s user pages ${mcpUrl.value} \\
  --header "Authorization: Bearer ${snippetToken.value}"`,
)

const genericSnippet = computed(() => `I want to use a remote MCP server called "pages".

  endpoint: ${mcpUrl.value}
  token:    ${snippetToken.value}

Authenticate with an Authorization: Bearer header carrying that token.
Connect to it and list the available tools so I can verify it works.`)

const activeSnippet = computed(() => {
  if (activeTab.value === 'desktop') return desktopSnippet.value
  if (activeTab.value === 'code') return codeSnippet.value
  return genericSnippet.value
})

async function copySnippet() {
  try {
    await navigator.clipboard.writeText(activeSnippet.value)
    copiedSnippet.value = true
    setTimeout(() => (copiedSnippet.value = false), 1500)
  } catch {
    alert("Couldn't copy — your browser blocked clipboard access.")
  }
}

// Whenever a new token is minted, remember its prefix so the install
// card can reference it after the freshToken value is dismissed.
watch(freshToken, (val) => {
  if (!val || typeof window === 'undefined') return
  const prefix = val.slice(0, 11) // pt_ + 8 hex chars — matches the server's TOKEN_PREFIX_LEN
  lastSavedPrefix.value = prefix
  window.localStorage.setItem(PREFIX_STORAGE_KEY, prefix)
})

async function submit() {
  creating.value = true
  createError.value = null
  try {
    const body: Record<string, unknown> = {
      name: form.name,
      scopes: form.scopes,
    }
    if (form.expires_at.trim()) body.expires_at = form.expires_at.trim()
    const res = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      createError.value = data.error || `HTTP ${res.status}`
      return
    }
    freshToken.value = data.token
    showCreate.value = false
    form.name = ''
    form.expires_at = ''
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
</script>

<style scoped>
.view {
  padding: 32px 40px;
  max-width: 980px;
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
h2 {
  margin: 0 0 8px 0;
  font-size: 16px;
}
.muted {
  color: var(--text-dim);
}
.small {
  font-size: 12px;
}
.card {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 20px;
  margin: 24px 0;
}
.card.success {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(52, 211, 153, 0.05);
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.token {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  user-select: all;
  word-break: break-all;
  white-space: pre-wrap;
}
.tbl {
  width: 100%;
  border-collapse: collapse;
}
.tbl th,
.tbl td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.tbl th {
  color: var(--text-dim);
  font-weight: 500;
}
.chip {
  display: inline-block;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 999px;
  padding: 2px 8px;
  margin-right: 4px;
  font-size: 11px;
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
}
button:hover {
  background: var(--bg-hover);
}
button.primary {
  background: var(--accent);
  color: #0b0d10;
  border-color: var(--accent);
}
button.danger {
  color: var(--danger);
  border-color: var(--danger-soft);
}
button.link {
  background: transparent;
  border: none;
  color: var(--text-dim);
  text-decoration: underline;
  padding: 2px 4px;
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-dim);
}
.modal input[type='text'],
.modal input:not([type]) {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--text);
}
fieldset {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 12px;
}
legend {
  color: var(--text-dim);
  font-size: 12px;
  padding: 0 4px;
}
.scope {
  display: flex;
  flex-direction: row !important;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  padding: 2px 0;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.err {
  color: var(--danger);
  font-size: 13px;
}
pre {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  margin: 0;
  user-select: all;
}
code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

/* ---------- install card ---------- */
.install h2 {
  margin-top: 0;
}
.tabs {
  display: flex;
  gap: 4px;
  margin: 16px 0 12px;
  border-bottom: 1px solid var(--border);
}
.tab {
  background: transparent;
  border: none;
  color: var(--text-dim);
  font: inherit;
  font-size: 13px;
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab:hover {
  color: var(--text);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.hint {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  line-height: 1.55;
}
.hint code {
  background: var(--bg-elev);
  padding: 1px 5px;
  border-radius: 3px;
}
.snippet-wrap {
  position: relative;
}
.snippet {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px 16px;
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: all;
  overflow-x: auto;
}
.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.copy-btn:hover {
  background: var(--bg-hover);
}
.footnote {
  margin-top: 10px;
}
</style>
