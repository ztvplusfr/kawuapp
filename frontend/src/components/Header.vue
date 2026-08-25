<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import {
  IconSearch,
  IconUser,
  IconHeart,
  IconHistory,
  IconLogout,
  IconBrandGoogle,
  IconCrown,
  IconBrandDiscord
} from '@tabler/icons-vue'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'
import logoUrl from '../assets/logo.svg'

const router = useRouter()
const route = useRoute()
const { isLoggedIn, userName, userAvatar, userProfile, loginWithGoogle, logout } = useAuth()

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
const isScrolled = ref(false)
const profileButtonRef = ref(null)
const dropdownRef = ref(null)

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

function isHomeActive() {
  if (isUserConnected.value) {
    return route.path === '/home' || route.path === '/'
  }
  return route.path === '/'
}

function toggleProfileDropdown() {
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

function handleScroll() {
  isScrolled.value = window.scrollY > 40
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('scroll', handleScroll, { passive: true })
  handleScroll()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <!-- TOP HEADER: full-width Netflix-style bar with avatar+logo on left, nav center, N on right -->
  <header
    :class="[
      'fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 sm:px-8 lg:px-10 transition-all duration-300',
      isScrolled
        ? 'bg-black/80 backdrop-blur-2xl border-b border-white/10 shadow-2xl shadow-black/40'
        : 'bg-gradient-to-b from-black/60 via-black/20 to-transparent'
    ]"
    style="--wails-draggable: drag; -webkit-app-region: drag;"
  >

    <!-- LEFT: empty spacer -->
    <div class="w-10 shrink-0"></div>

    <!-- CENTER: Search + Home + Explore + My Kawu -->
    <nav class="hidden md:flex items-center gap-1 sm:gap-2 absolute left-1/2 -translate-x-1/2" style="--wails-draggable: no-drag; -webkit-app-region: no-drag;">
      <button
        @click="navigateTo('/catalog')"
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
        @click="navigateTo('/catalog')"
        :class="[
          'pointer-events-auto px-4 py-1.5 text-sm font-bold rounded-full transition-all cursor-pointer',
          route.path === '/catalog' || route.path.startsWith('/player')
            ? 'bg-white text-slate-950 border border-white'
            : 'text-white/80 hover:text-white'
        ]"
      >
        Explorer
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
    <div class="flex items-center relative">
      <button
        ref="profileButtonRef"
        @click="toggleProfileDropdown"
        class="pointer-events-auto p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
        style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
      >
        <div :class="[
          'p-[2px] rounded-md transition-all',
          isUserConnected ? 'bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600' : 'bg-white/15'
        ]">
          <div class="w-8 h-8 rounded-sm bg-slate-950 flex items-center justify-center overflow-hidden">
            <img v-if="userAvatar" :src="userAvatar" alt="Avatar" class="w-full h-full object-cover" />
            <IconUser v-else :size="16" :stroke-width="2" class="text-white/70" />
          </div>
        </div>
      </button>

      <!-- Profile Dropdown -->
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
          class="absolute right-0 top-[calc(100%+8px)] z-50 min-w-64 overflow-hidden rounded-2xl border border-white/10 bg-black/95 backdrop-blur-2xl shadow-2xl shadow-black/90 origin-top-right"
        >
          <div v-if="isUserConnected" class="flex items-center gap-3 p-3 border-b border-white/10">
            <div class="p-[2px] rounded-full bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 shrink-0">
              <div class="w-11 h-11 rounded-full bg-slate-950 flex items-center justify-center overflow-hidden">
                <img v-if="userAvatar" :src="userAvatar" alt="Avatar" class="w-full h-full object-cover" />
                <IconUser v-else :size="22" :stroke-width="1.5" class="text-cyan-400" />
              </div>
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-sm font-bold text-white truncate">{{ userName || 'Utilisateur' }}</span>
              <span class="text-[11px] text-white/50 truncate">{{ userProfile?.email || 'Compte Kawu' }}</span>
            </div>
          </div>

          <div class="py-1.5">
            <button
              @click="openDiscord"
              class="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-[#5865F2] hover:text-[#7289da] hover:bg-[#5865F2]/10 transition-colors group cursor-pointer"
            >
              <div class="flex items-center gap-3">
                <IconBrandDiscord :size="17" :stroke-width="2" />
                <span>Discord</span>
              </div>
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#5865F2]/20 text-[#8ea1e1] border border-[#5865F2]/30">GKH8APBxFN</span>
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
          </div>
        </div>
      </transition>
    </div>

  </header>
</template>
