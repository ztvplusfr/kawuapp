import { createRouter, createWebHashHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import HomeView from '../views/HomeView.vue'
import CatalogView from '../views/CatalogView.vue'
import PlayerView from '../views/PlayerView.vue'
import WatchlistView from '../views/WatchlistView.vue'
import DetailView from '../views/DetailView.vue'
import AdminView from '../views/AdminView.vue'
import { useAuth } from '../composables/useAuth'

const routes = [
  {
    path: '/',
    name: 'landing',
    component: LandingView
  },
  {
    path: '/home',
    name: 'home',
    component: HomeView
  },
  {
    path: '/catalog',
    name: 'catalog',
    component: CatalogView
  },
  {
    path: '/media/:id',
    name: 'media-detail',
    component: DetailView
  },
  {
    path: '/detail/:id',
    name: 'detail',
    component: DetailView
  },
  {
    path: '/player/:id',
    name: 'player',
    component: PlayerView
  },
  {
    path: '/watch/:id',
    name: 'watch',
    component: PlayerView
  },
  {
    path: '/watchlist',
    name: 'watchlist',
    component: WatchlistView
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

// Global Navigation Guard:
// - Non connecté : redirige automatiquement vers '/' (Landing / Connexion) si on tente d'accéder à une page interne
// - Connecté : redirige automatiquement de '/' vers '/home'
router.beforeEach((to, from, next) => {
  const { isLoggedIn } = useAuth()
  const hasStoredSession = !!localStorage.getItem('kawu_user_session')
  const authenticated = isLoggedIn.value || hasStoredSession

  if (to.path !== '/' && !authenticated) {
    next('/')
  } else if (to.path === '/' && authenticated) {
    next('/home')
  } else {
    next()
  }
})

export default router
