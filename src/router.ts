import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import PageView from './views/PageView.vue'
import TokensView from './views/TokensView.vue'
import StylesView from './views/StylesView.vue'
import OAuthConsentView from './views/OAuthConsentView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/page/:id', name: 'page', component: PageView, props: true },
  { path: '/styles', name: 'styles', component: StylesView },
  { path: '/tokens', name: 'tokens', component: TokensView },
  // Standalone consent screen — reached via /oauth/authorize after the
  // server has validated the OAuth request and minted a pending-consent
  // request_id. Rendered inside the SPA shell (no sidebar) so the user
  // is focused on the approve/deny decision.
  { path: '/oauth/consent', name: 'oauth-consent', component: OAuthConsentView, meta: { fullscreen: true } },
]

export default createRouter({ history: createWebHistory(), routes })
