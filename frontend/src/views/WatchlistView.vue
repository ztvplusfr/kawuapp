<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { getUserWatchlistCoupled } from '../services/api/watchService'
import Skeleton from '../components/ui/skeleton/Skeleton.vue'
import {
  IconPlayerPlay,
  IconChevronLeft,
  IconChevronRight
} from '@tabler/icons-vue'

const router = useRouter()
const { isLoggedIn, userName, userAvatar, userProfile, loginWithGoogle } = useAuth()

const watchlist = ref([])
const isLoading = ref(false)
const scrollContainer = ref(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(true)

const isUserConnected = ref(false)

function updatePagination() {
  if (!scrollContainer.value) return
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value
  canScrollLeft.value = scrollLeft > 10
  canScrollRight.value = scrollLeft < scrollWidth - clientWidth - 10
}

function scrollLeft() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollBy({ left: -scrollContainer.value.clientWidth * 0.88, behavior: 'smooth' })
  }
}

function scrollRight() {
  if (scrollContainer.value) {
    scrollContainer.value.scrollBy({ left: scrollContainer.value.clientWidth * 0.88, behavior: 'smooth' })
  }
}

function goToDetail(item) {
  router.push({
    path: `/detail/${item.supabaseContentId || item.id}`,
    query: { type: item.tmdbType || (item.genre?.includes('S ') ? 'tv' : 'movie') }
  })
}

function goToPlayer(item) {
  const id = item.supabaseContentId || item.id
  const type = item.tmdbType || (item.genre?.includes('S ') ? 'tv' : 'movie')
  router.push(`/player/${id}?type=${type}`)
}

async function loadWatchlist() {
  isUserConnected.value = isLoggedIn.value || !!localStorage.getItem('kawu_user_session')
  if (!isUserConnected.value || !userProfile.value?.id) {
    watchlist.value = []
    return
  }
  isLoading.value = true
  try {
    watchlist.value = await getUserWatchlistCoupled(userProfile.value.id)
  } catch (e) {
    console.warn('Error loading watchlist:', e)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  loadWatchlist()
  window.addEventListener('resize', updatePagination)
})

watch([isLoggedIn, () => userProfile.value?.id], () => {
  loadWatchlist()
})
</script>

<template>
  <div class="w-full min-h-screen bg-transparent text-white pb-24">

    <!-- Page Header -->
    <div class="relative overflow-hidden border-b border-white/10">
      <div class="absolute inset-0 bg-gradient-to-b from-cyan-950/30 via-[#020205] to-transparent"></div>
      <div class="relative z-10 px-6 sm:px-12 lg:px-16 pt-28 pb-8">
        <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tight">Watchlist</h1>
        <p class="text-sm text-white/50 mt-1">{{ watchlist.length }} {{ watchlist.length > 1 ? 'titres sauvegardés' : 'titre sauvegardé' }}</p>
      </div>
    </div>

    <!-- Not connected -->
    <div v-if="!isUserConnected" class="px-6 sm:px-12 lg:px-16 pt-16">
      <div class="p-10 rounded-2xl border border-white/10 bg-white/[0.03] flex flex-col items-center justify-center gap-4 text-center max-w-md mx-auto">
        <p class="text-base font-bold text-white/80">Connecte-toi pour voir ta watchlist</p>
        <p class="text-sm text-white/40">Ajoute des films et séries à ta liste pour les retrouver ici.</p>
        <button @click="loginWithGoogle" class="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-xl transition-all">
          Connexion Google
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-else-if="isLoading" class="flex items-center gap-3 overflow-x-auto py-6 px-6 sm:px-12 no-scrollbar" style="scrollbar-width:none;-ms-overflow-style:none;">
      <div v-for="i in 8" :key="i" class="shrink-0 w-[calc((100vw-48px)/2.3)] sm:w-[calc((100vw-96px)/3.35)] md:w-[calc((100vw-96px)/4.35)] aspect-video rounded-xl overflow-hidden bg-[#0d111a] border border-white/10">
        <Skeleton class="w-full h-full rounded-none opacity-40" />
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="watchlist.length === 0" class="px-6 sm:px-12 lg:px-16 pt-16">
      <div class="p-10 rounded-2xl border border-dashed border-white/10 bg-white/[0.03] flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto">
        <p class="text-base font-bold text-white/80">Aucune watchlist</p>
        <p class="text-sm text-white/40">Clique sur <strong class="text-cyan-400">+</strong> sur n'importe quelle fiche pour l'ajouter ici.</p>
      </div>
    </div>

    <!-- Cards Row -->
    <div v-else class="relative group/row mt-4">

      <!-- Left arrow -->
      <button
        v-show="canScrollLeft"
        @click="scrollLeft"
        class="absolute left-0 top-0 bottom-0 z-30 w-12 sm:w-16 bg-gradient-to-r from-[#000000]/95 via-[#000000]/70 to-transparent text-white flex items-center justify-start pl-2 sm:pl-4 transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer hover:scale-105 active:scale-95"
      >
        <div class="w-8 h-8 rounded-full bg-black/60 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-xl">
          <IconChevronLeft :size="20" :stroke-width="2.5" />
        </div>
      </button>

      <!-- Scrollable row -->
      <div
        ref="scrollContainer"
        @scroll="updatePagination"
        class="flex items-center gap-3 sm:gap-3.5 overflow-x-auto scroll-smooth no-scrollbar py-4 px-6 sm:px-12 lg:px-16"
        style="scrollbar-width: none; -ms-overflow-style: none;"
      >
        <div
          v-for="item in watchlist"
          :key="item.id"
          @click="goToDetail(item)"
          class="relative shrink-0 w-[calc((100vw-48px)/2.3)] sm:w-[calc((100vw-96px)/3.35)] md:w-[calc((100vw-96px)/4.35)] lg:w-[calc((100vw-128px)/5.35)] aspect-video rounded-xl overflow-hidden bg-[#0a0d14] transition-all duration-300 hover:scale-[1.05] hover:z-20 cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-black/90 group/card flex items-center justify-center"
        >
          <!-- Background image -->
          <div
            class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover/card:scale-105"
            :style="{ backgroundImage: `url(${item.poster || item.bgImg})` }"
          />

          <!-- Vignette overlay -->
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/30 group-hover/card:via-black/10 transition-colors" />



          <!-- Logo / Title at bottom -->
          <div class="relative z-10 p-3 sm:p-4 pb-3 sm:pb-4 flex items-end justify-center w-full h-full text-center">
            <img
              v-if="item.logoUrl"
              :src="item.logoUrl"
              :alt="item.title"
              class="max-h-10 sm:max-h-12 max-w-[78%] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.98)] transition-transform duration-300 group-hover/card:scale-105"
            />
            <span
              v-else
              class="font-black text-xs sm:text-sm md:text-base tracking-wider text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] line-clamp-2 px-2 pb-1"
            >
              {{ item.title }}
            </span>
          </div>

          <!-- Play button on hover -->
          <div class="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none">
            <div class="w-10 h-10 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-xl transform scale-75 group-hover/card:scale-100 transition-transform">
              <IconPlayerPlay :size="18" :stroke-width="3" class="fill-current ml-0.5" />
            </div>
          </div>

          <!-- Type badge -->
          <div class="absolute bottom-2 right-2 z-20">
            <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-black/60 text-white/70 border border-white/10 backdrop-blur-md">
              {{ (item.type || item.tmdbType || (item.genre?.includes('S ') ? 'tv' : 'movie')) === 'tv' ? 'SERIES' : 'MOVIE' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Right arrow -->
      <button
        v-show="canScrollRight"
        @click="scrollRight"
        class="absolute right-0 top-0 bottom-0 z-30 w-12 sm:w-16 bg-gradient-to-l from-[#000000]/95 via-[#000000]/70 to-transparent text-white flex items-center justify-end pr-2 sm:pr-4 transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer hover:scale-105 active:scale-95"
      >
        <div class="w-8 h-8 rounded-full bg-black/60 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-xl">
          <IconChevronRight :size="20" :stroke-width="2.5" />
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
