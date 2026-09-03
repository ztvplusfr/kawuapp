<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useSearchOverlay } from '../composables/useSearchOverlay'
import {
  IconSearch,
  IconUser,
  IconHeart,
  IconHistory,
  IconLogout,
  IconBrandGoogle,
  IconCrown,
  IconBrandDiscord,
  IconCalendarEvent,
  IconUsers,
  IconSettings,
  IconShieldLock,
  IconDeviceTv
} from '@tabler/icons-vue'
import RemotePairingModal from './RemotePairingModal.vue'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'
import kawuLogo from '../assets/kawu-logo-full.svg'
import { APP_VERSION } from '../version'

const isMac = ref(false)
if (typeof navigator !== 'undefined') {
  const ua = navigator.userAgent.toLowerCase()
  const plat = (navigator.platform || '').toLowerCase()
  isMac.value = plat.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')
}

const router = useRouter()
const route = useRoute()
const { isLoggedIn, isAdmin, userName, userAvatar, userProfile, loginWithGoogle, logout } = useAuth()
const { openSearch } = useSearchOverlay()

const DISCORD_URL = 'https://discord.gg/GKH8APBxFN'

function openDiscord() {
  try {
    BrowserOpenURL(DISCORD_URL)
  } catch (e) {
    window.open(DISCORD_URL, '_blank')
  }
  closeProfileDropdown()
}

const isUserConnected = computed(() => {
  return isLoggedIn.value || !!localStorage.getItem('kawu_user_session')
})

const isProfileDropdownOpen = ref(false)
const isRemoteModalOpen = ref(false)
const isScrolled = ref(false)
const profileButtonRef = ref(null)
const dropdownRef = ref(null)
const dropdownPos = ref({ top: 0, right: 0 })

function updateDropdownPos() {
  const btn = profileButtonRef.value
  if (!btn) return
  const rect = btn.getBoundingClientRect()
  dropdownPos.value = {
    top: rect.bottom + 8,
    right: window.innerWidth - rect.right
  }
}

function navigateToHome() {
  if (isUserConnected.value) {
    router.push('/home')
  } else {
    router.push('/')
  }
  closeProfileDropdown()
}

function navigateTo(path) {
  router.push(path)
  closeProfileDropdown()
}

function navigateToCatalog(type) {
  router.push({ path: '/catalog', query: type ? { type } : {} })
  closeProfileDropdown()
}

function isCatalogTypeActive(type) {
  return route.path === '/catalog' && route.query.type === type
}

function isHomeActive() {
  if (isUserConnected.value) {
    return route.path === '/home' || route.path === '/'
  }
  return route.path === '/'
}

function toggleProfileDropdown() {
  if (!isProfileDropdownOpen.value) {
    updateDropdownPos()
  }
  isProfileDropdownOpen.value = !isProfileDropdownOpen.value
}

function closeProfileDropdown() {
  isProfileDropdownOpen.value = false
}

function handleLogout() {
  logout()
  closeProfileDropdown()
  router.push('/')
}

function handleGoogleLogin() {
  loginWithGoogle()
  closeProfileDropdown()
}

function handleClickOutside(e) {
  if (!isProfileDropdownOpen.value) return
  const btn = profileButtonRef.value
  const dd = dropdownRef.value
  if (btn && btn.contains(e.target)) return
  if (dd && dd.contains(e.target)) return
  closeProfileDropdown()
}

let scrollEl = null

function handleScroll() {
  const scrollTop = scrollEl ? scrollEl.scrollTop : window.scrollY
  isScrolled.value = scrollTop > 40
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  scrollEl = document.querySelector('main')
  const target = scrollEl || window
  target.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  const target = scrollEl || window
  target.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <!-- TOP HEADER: full-width Netflix-style bar with avatar+logo on left, nav center, N on right -->
  <header
    :class="[
      'fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 sm:px-8 lg:px-10 transition-all duration-300',
      isScrolled
        ? 'bg-black/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
        : 'bg-gradient-to-b from-black/60 via-black/20 to-transparent'
    ]"
    style="--wails-draggable: drag; -webkit-app-region: drag;"
  >

    <!-- LEFT: App Logo -->
    <div 
      :class="['flex items-center', isMac ? 'pl-16 sm:pl-18' : 'pl-0']" 
      style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
    >
      <button
        @click="navigateToHome"
        class="pointer-events-auto flex items-center gap-2 p-1 rounded-xl hover:opacity-80 transition-all cursor-pointer"
        title="Kawu - Accueil"
      >
        <img :src="kawuLogo" alt="Kawu" class="h-4 sm:h-5 w-auto object-contain" />
      </button>
    </div>

    <!-- CENTER: Search + Home + Films + Séries + Watchlist + Calendrier -->
    <nav class="hidden md:flex items-center gap-1 sm:gap-2 absolute left-1/2 -translate-x-1/2" style="--wails-draggable: no-drag; -webkit-app-region: no-drag;">
      <button
        @click="openSearch"
        class="pointer-events-auto p-2 rounded-full hover:bg-white/10 transition-all cursor-pointer text-white/80 hover:text-white"
        title="Rechercher"
      >
        <IconSearch :size="18" :stroke-width="2" />
      </button>

      <button
        @click="navigateToHome"
        :class="[
          'pointer-events-auto px-4 py-1.5 text-sm font-bold rounded-full transition-all cursor-pointer',
          isHomeActive()
            ? 'bg-white text-slate-950 border border-white'
            : 'text-white/80 hover:text-white'
        ]"
      >
        Home
      </button>

      <button
        @click="navigateToCatalog('movie')"
        :class="[
          'pointer-events-auto px-4 py-1.5 text-sm font-bold rounded-full transition-all cursor-pointer',
          isCatalogTypeActive('movie')
            ? 'bg-white text-slate-950 border border-white'
            : 'text-white/80 hover:text-white'
        ]"
      >
        Films
      </button>

      <button
        @click="navigateToCatalog('tv')"
        :class="[
          'pointer-events-auto px-4 py-1.5 text-sm font-bold rounded-full transition-all cursor-pointer',
          isCatalogTypeActive('tv')
            ? 'bg-white text-slate-950 border border-white'
            : 'text-white/80 hover:text-white'
        ]"
      >
        Séries
      </button>

      <button
        v-if="isUserConnected"
        @click="navigateTo('/watchlist')"
        :class="[
          'pointer-events-auto px-4 py-1.5 text-sm font-bold rounded-full transition-all cursor-pointer',
          route.path === '/watchlist'
            ? 'bg-white text-slate-950 border border-white'
            : 'text-white/80 hover:text-white'
        ]"
      >
        Watchlist
      </button>
    </nav>

    <!-- RIGHT: Profile avatar (with dropdown) -->
    <div class="flex items-center relative gap-2">
      <!-- Remote Button -->
      <button
        @click="isRemoteModalOpen = true"
        class="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/90 hover:text-white transition-all cursor-pointer shadow-sm"
        title="Télécommande Kawu Remote"
        style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
      >
        <IconDeviceTv :size="16" :stroke-width="2" class="text-purple-400" />
        <span class="text-xs font-semibold hidden md:inline">Télécommande</span>
      </button>

      <RemotePairingModal :isOpen="isRemoteModalOpen" @close="isRemoteModalOpen = false" />

      <button
        ref="profileButtonRef"
        @click="toggleProfileDropdown"
        class="pointer-events-auto p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0"
        style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
      >
        <div class="w-8 h-8 rounded-sm bg-slate-950 flex items-center justify-center overflow-hidden">
          <img v-if="userAvatar" :src="userAvatar" alt="Avatar" class="w-full h-full object-cover" />
          <IconUser v-else :size="16" :stroke-width="2" class="text-white/70" />
        </div>
      </button>

      <!-- Profile Dropdown (teleported to body so its glass blur isn't nested inside the header's own blurred layer) -->
      <Teleport to="body">
      <transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 -translate-y-1 scale-95"
      >
        <div
          v-if="isProfileDropdownOpen"
          ref="dropdownRef"
          class="fixed z-50 w-52 overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl origin-top-right"
          :style="{
            top: dropdownPos.top + 'px',
            right: dropdownPos.right + 'px'
          }"
        >
          <div v-if="isUserConnected" class="flex items-center gap-2.5 p-3 border-b border-white/10">
            <div class="w-9 h-9 rounded-full bg-slate-950 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="userAvatar" :src="userAvatar" alt="Avatar" class="w-full h-full object-cover" />
              <IconUser v-else :size="18" :stroke-width="1.5" class="text-cyan-400" />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-bold text-white truncate">{{ userName || 'Utilisateur' }}</span>
              <span class="text-[11px] text-white/50 truncate">{{ userProfile?.email || 'Compte Kawu' }}</span>
            </div>
          </div>

          <div class="py-1">
            <button
              v-if="isUserConnected"
              @click="navigateTo('/profiles')"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <IconUsers :size="16" :stroke-width="2" />
              <span>Changer de profil</span>
            </button>

            <button
              @click="openDiscord"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <IconBrandDiscord :size="16" :stroke-width="2" />
              <span>Discord</span>
            </button>

            <button
              v-if="isUserConnected"
              @click="navigateTo('/settings')"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <IconSettings :size="16" :stroke-width="2" />
              <span>Réglages</span>
            </button>

            <button
              v-if="isUserConnected && isAdmin"
              @click="navigateTo('/admin')"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <IconShieldLock :size="16" :stroke-width="2" />
              <span>Admin</span>
            </button>

            <div class="my-1 border-t border-white/10"></div>

            <button
              v-if="isUserConnected"
              @click="handleLogout"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <IconLogout :size="16" :stroke-width="2" />
              <span>Se déconnecter</span>
            </button>

            <button
              v-else
              @click="handleGoogleLogin"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 transition-colors cursor-pointer"
            >
              <IconBrandGoogle :size="16" :stroke-width="2.5" />
              <span>Connexion Google</span>
            </button>

            <div class="px-4 py-1.5 text-[10px] font-mono text-white/30 text-center select-none border-t border-white/5 mt-1">
              v{{ APP_VERSION }}
            </div>
          </div>
        </div>
      </transition>
      </Teleport>
    </div>

  </header>
</template>
