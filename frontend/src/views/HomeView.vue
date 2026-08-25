<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useCatalog } from '../composables/useCatalog'
import { getUserContinueWatching } from '../services/api/watchService'
import { IconBrandDiscord, IconChevronRight } from '@tabler/icons-vue'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'
import HeroSlider from '../components/HeroSlider.vue'
import MediaRow from '../components/MediaRow.vue'

const router = useRouter()
const { userName, userId, isLoggedIn } = useAuth()

const DISCORD_URL = 'https://discord.gg/GKH8APBxFN'

function openDiscord() {
  try {
    BrowserOpenURL(DISCORD_URL)
  } catch (e) {
    window.open(DISCORD_URL, '_blank')
  }
}
const {
  recentAdditions,
  top10France,
  dramaSeries,
  animesRail,
  moviesRail,
  sciFiRail,
  comediesRail,
  topRatedRail,
  isLoading
} = useCatalog()

const continueWatching = ref([])
const isProgressLoading = ref(false)

async function loadContinueWatching() {
  if (!isLoggedIn.value || !userId.value) return
  isProgressLoading.value = true
  try {
    const list = await getUserContinueWatching(userId.value)
    if (list && list.length > 0) {
      continueWatching.value = list
    }
  } catch (e) {
    console.warn('[HomeView] Error loading continue watching:', e)
  } finally {
    isProgressLoading.value = false
  }
}

onMounted(() => {
  loadContinueWatching()
})

watch([isLoggedIn, userId], () => {
  if (isLoggedIn.value) {
    loadContinueWatching()
  }
})
</script>

<template>
  <div class="w-full pt-20 pb-12 flex flex-col gap-10 select-none overflow-x-hidden">
    
    <!-- 1. CINEMA HERO SLIDER (Coupled Supabase Contents + TMDB Trending 4K) -->
    <div class="px-6 sm:px-12 lg:px-16">
      <HeroSlider />
    </div>

    <!-- 2. REPRENDRE LA LECTURE (Coupled Supabase watch_progress + TMDB) -->
    <MediaRow
      v-if="continueWatching.length > 0"
      :title="`Reprendre avec le profil de ${userName}`"
      :items="continueWatching"
      :is-continue-watching="true"
      :is-loading="isProgressLoading"
    />

    <!-- DISCORD COMMUNITY BANNER (Sous la section Reprendre) -->
    <div class="px-6 sm:px-12 lg:px-16">
      <div
        @click="openDiscord"
        class="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#5865F2]/30 bg-gradient-to-r from-[#5865F2]/20 via-[#101426] to-[#0d1222] p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-5 backdrop-blur-xl group cursor-pointer hover:border-[#5865F2]/60 hover:shadow-2xl hover:shadow-[#5865F2]/20 transition-all duration-300"
      >
        <!-- Glow effect -->
        <div class="absolute -left-10 -top-10 w-48 h-48 bg-[#5865F2]/30 rounded-full blur-[80px] pointer-events-none group-hover:scale-125 transition-transform duration-500"></div>
        <div class="absolute -right-10 -bottom-10 w-48 h-48 bg-cyan-500/15 rounded-full blur-[80px] pointer-events-none"></div>

        <!-- Left info -->
        <div class="relative z-10 flex items-center gap-4 sm:gap-5 w-full sm:w-auto">
          <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#5865F2] flex items-center justify-center text-white shadow-xl shadow-[#5865F2]/40 shrink-0 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
            <IconBrandDiscord :size="28" :stroke-width="2" />
          </div>
          <div class="flex flex-col">
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base sm:text-lg font-black text-white tracking-tight">Rejoins la communauté Discord Kawu</h3>
              <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#5865F2]/30 text-[#a5b4fc] border border-[#5865F2]/40">
                GKH8APBxFN
              </span>
            </div>
            <p class="text-xs sm:text-sm text-white/60 mt-0.5 max-w-xl leading-relaxed">
              Demande des ajouts de films/séries, signale un souci et sois notifié des dernières sorties en avant-première !
            </p>
          </div>
        </div>

        <!-- Right button -->
        <div class="relative z-10 flex items-center gap-2 px-5 py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-sm shadow-lg shadow-[#5865F2]/30 group-hover:shadow-[#5865F2]/50 group-hover:translate-x-1 transition-all duration-300 shrink-0 w-full sm:w-auto justify-center">
          <span>Rejoindre le Discord</span>
          <IconChevronRight :size="18" :stroke-width="2.5" />
        </div>
      </div>
    </div>

    <!-- 3. CONTENT RAILS (Coupled Supabase Contents + TMDB Official Streaming Data) -->
    <div class="flex flex-col gap-10">
      
      <!-- Section 1: Ajoutés récemment sur Kawu (Supabase contents) -->
      <MediaRow
        v-if="recentAdditions.length > 0"
        title="Ajoutés récemment sur Kawu"
        :items="recentAdditions"
        :is-loading="isLoading && recentAdditions.length === 0"
      />

      <!-- Section 2: Top 10 en France aujourd'hui -->
      <MediaRow
        title="Top 10 en France aujourd'hui"
        :items="top10France.length > 0 ? top10France : dramaSeries"
        :is-loading="isLoading && top10France.length === 0"
      />

      <!-- Section 3: Séries dramatiques & Thrillers (Supabase TV + TMDB) -->
      <MediaRow
        title="Séries dramatiques & Thrillers"
        :items="dramaSeries"
        :is-loading="isLoading && dramaSeries.length === 0"
      />

      <!-- Section 4: Animés en Simulcast & Manga (Supabase + TMDB) -->
      <MediaRow
        title="Animés en Simulcast & Manga"
        :items="animesRail"
        :is-loading="isLoading && animesRail.length === 0"
      />

      <!-- Section 5: Blockbusters & Films d'action 4K HDR (Supabase Movies + TMDB) -->
      <MediaRow
        title="Films d'action et Blockbusters 4K HDR"
        :items="moviesRail"
        :is-loading="isLoading && moviesRail.length === 0"
      />

      <!-- Section 6: Science-Fiction & Mondes Fantastiques -->
      <MediaRow
        title="Science-Fiction & Mondes Fantastiques"
        :items="sciFiRail"
        :is-loading="isLoading && sciFiRail.length === 0"
      />

      <!-- Section 7: Comédies populaires & Divertissement -->
      <MediaRow
        title="Comédies populaires & Détente"
        :items="comediesRail"
        :is-loading="isLoading && comediesRail.length === 0"
      />

      <!-- Section 8: Chefs-d'œuvre & Mieux Notés (★) -->
      <MediaRow
        title="Chefs-d'œuvre & Les Mieux Notés"
        :items="topRatedRail"
        :is-loading="isLoading && topRatedRail.length === 0"
      />

    </div>

    <!-- 4. FOOTER MEMBRE -->
    <footer class="border-t border-white/[0.08] pt-8 pb-6 px-6 sm:px-12 lg:px-16 flex items-center justify-between text-xs text-white/40">
      <span>Kawu Streaming • Base de données Supabase & TMDB couplées</span>
      <span>4K HDR • Dolby Atmos • Zéro Pub</span>
    </footer>

  </div>
</template>
