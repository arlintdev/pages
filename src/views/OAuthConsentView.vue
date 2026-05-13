<template>
  <div class="consent-page">
    <div class="card">
      <header class="card-head">
        <div class="brand">
          <Logo :size="22" />
          <span class="brand-word">pages</span>
        </div>
      </header>

      <div v-if="loading" class="state muted">Loading…</div>

      <div v-else-if="error" class="state err">
        <ShieldAlert :size="16" />
        <div>
          <div class="state-title">Request not available</div>
          <div class="muted small">{{ error }}</div>
        </div>
      </div>

      <template v-else-if="ctx">
        <h1 class="title">
          Authorize
          <span class="client-name">{{ ctx.client_name }}</span>
        </h1>
        <p class="muted small">
          This app is requesting access to your <strong>pages</strong> account.
          Signed in as <span class="mono">{{ ctx.user_email }}</span>.
        </p>

        <div class="scopes">
          <div class="uppercase-label">Will be allowed to</div>
          <div v-for="s in ctx.scopes" :key="s" class="scope-row">
            <Check :size="13" />
            <div>
              <div class="scope-name">{{ SCOPE_LABELS[s]?.title ?? s }}</div>
              <div class="muted small">{{ SCOPE_LABELS[s]?.desc ?? '' }}</div>
            </div>
            <span class="mono scope-id">{{ s }}</span>
          </div>
        </div>

        <div class="footnote muted small">
          You can revoke this access any time. The connecting app will
          land at
          <span class="mono ru">{{ truncateUri(ctx.redirect_uri) }}</span>
          when you continue.
        </div>

        <div class="actions">
          <button class="btn" :disabled="busy" @click="decide(false)">Deny</button>
          <button class="btn primary" :disabled="busy" @click="decide(true)">
            {{ busy ? 'Working…' : 'Authorize' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Check, ShieldAlert } from 'lucide-vue-next'
import Logo from '@/components/Logo.vue'

type Scope = 'pages:read' | 'pages:write'
type Ctx = {
  request_id: string
  client_name: string
  client_id: string
  redirect_uri: string
  scopes: Scope[]
  user_email: string
}

const route = useRoute()
const ctx = ref<Ctx | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const busy = ref(false)

// Human-friendly copy for the scope checklist. Keep this close to the
// MCP tool descriptions in server/mcp.ts so the user knows what they're
// agreeing to.
const SCOPE_LABELS: Record<string, { title: string; desc: string }> = {
  'pages:read': {
    title: 'Read your pages',
    desc: 'View your HTML pages, share status, and metadata.',
  },
  'pages:write': {
    title: 'Create, edit, share, and delete pages',
    desc: 'Make changes on your behalf — including minting and revoking share links.',
  },
}

function truncateUri(uri: string): string {
  if (uri.length <= 64) return uri
  return uri.slice(0, 61) + '…'
}

onMounted(async () => {
  const requestId = (route.query.request_id as string) || ''
  if (!requestId) {
    error.value = 'Missing request_id. Start the flow from your application.'
    loading.value = false
    return
  }
  try {
    const res = await fetch(
      `/oauth/consent-context?request_id=${encodeURIComponent(requestId)}`,
      { credentials: 'same-origin' },
    )
    if (res.status === 401) {
      // Not signed in. Send the user through OIDC and back here.
      const here = window.location.pathname + window.location.search
      window.location.href = `/auth/login?return=${encodeURIComponent(here)}`
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      error.value = body.error_description || `HTTP ${res.status}`
      return
    }
    ctx.value = await res.json()
  } catch (e) {
    error.value = (e as Error).message || 'Network error'
  } finally {
    loading.value = false
  }
})

async function decide(approve: boolean) {
  if (!ctx.value) return
  busy.value = true
  try {
    const res = await fetch('/oauth/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ request_id: ctx.value.request_id, approve }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      error.value = body.error_description || `HTTP ${res.status}`
      busy.value = false
      return
    }
    const out = (await res.json()) as { redirect: string }
    // Follow the redirect the server constructed — this is the client's
    // registered redirect_uri (https://… or claude://…) so we can't use
    // router.push.
    window.location.href = out.redirect
  } catch (e) {
    error.value = (e as Error).message || 'Network error'
    busy.value = false
  }
}
</script>

<style scoped>
.consent-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background: var(--bg);
  color: var(--text-1);
}

.card {
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.08);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}
.brand-word {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  letter-spacing: -0.02em;
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.25;
}
.client-name {
  /* Subtle highlight on the requesting app's name so the user knows
     exactly who they're authorizing. */
  background: var(--surface-2);
  padding: 2px 8px;
  border-radius: 6px;
  font-weight: 500;
}

.muted {
  color: var(--text-2);
}
.small {
  font-size: 12.5px;
  line-height: 1.55;
}
.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.uppercase-label {
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  margin-bottom: 8px;
}

.scopes {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}
.scope-row {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border);
}
.scope-row:last-child {
  border-bottom: none;
}
.scope-row > :first-child {
  color: var(--live);
  margin-top: 2px;
}
.scope-name {
  font-weight: 500;
  font-size: 13.5px;
  color: var(--text-1);
}
.scope-id {
  color: var(--text-3);
  font-size: 11px;
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 4px;
  align-self: center;
}

.footnote {
  display: block;
  padding: 0 2px;
}
.ru {
  color: var(--text-2);
  word-break: break-all;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.state {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
}
.state-title {
  font-weight: 500;
  font-size: 13px;
}
.state.err > :first-child {
  color: var(--danger);
}
</style>
