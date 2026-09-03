import { createRouter, createWebHashHistory } from 'vue-router'
import LandingView from '../views/LandingView.vue'
import HomeView from '../views/HomeView.vue'
import CatalogView from '../views/CatalogView.vue'
import PlayerView from '../views/PlayerView.vue'
import WatchlistView from '../views/WatchlistView.vue'
import DetailView from '../views/DetailView.vue'
import AdminView from '../views/AdminView.vue'
import CalendarView from '../views/CalendarView.vue'
import WhoIsWatchingView from '../views/WhoIsWatchingView.vue'
import SettingsView from '../views/SettingsView.vue'
import { useAuth, ADMIN_EMAILS } from '../composables/useAuth'

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
  },
  {
    path: '/calendar',
    name: 'calendar',
    component: CalendarView
  },
  {
    path: '/profiles',
    name: 'profiles',
    component: WhoIsWatchingView
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView
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
  const { isLoggedIn, isAdmin } = useAuth()
  const rawSession = localStorage.getItem('kawu_user_session')
  const hasStoredSession = !!rawSession
  const authenticated = isLoggedIn.value || hasStoredSession

  if (to.path !== '/' && !authenticated) {
    next('/')
  } else if (to.path === '/' && authenticated) {
    next('/profiles')
  } else if (to.path === '/admin') {
    // Vérification stricte du rôle admin (rôle ou email admin autorisé)
    let userIsAdmin = isAdmin.value
    if (!userIsAdmin && rawSession) {
      try {
        const parsed = JSON.parse(rawSession)
        const role = (parsed.role || parsed.profile?.role || parsed.user?.role || '').toLowerCase()
        const email = (parsed.email || parsed.profile?.email || parsed.user?.email || '').toLowerCase()
        if (role === 'admin' || ADMIN_EMAILS.includes(email)) {
          userIsAdmin = true
        }
      } catch (_) {}
    }

    if (userIsAdmin) {
      next()
    } else {
      console.warn('[Router Guard] Accès refusé : rôle admin requis pour', to.path)
      next('/home')
    }
  } else {
    next()
  }
})

export default router
