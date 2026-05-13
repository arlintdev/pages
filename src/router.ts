import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import PageView from './views/PageView.vue'
import TokensView from './views/TokensView.vue'
import StylesView from './views/StylesView.vue'

const routes = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/page/:id', name: 'page', component: PageView, props: true },
  { path: '/styles', name: 'styles', component: StylesView },
  { path: '/tokens', name: 'tokens', component: TokensView },
]

export default createRouter({ history: createWebHistory(), routes })
