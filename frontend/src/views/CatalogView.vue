<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getCoupledExploreCatalog } from '../services/api/mediaService'
import { searchTmdb } from '../services/tmdb'

// Tabler Stroke Icons
import {
  IconSearch,
  IconX,
  IconPlayerPlay,
  IconArrowsShuffle,
  IconLayoutGrid,
  IconGridDots,
  IconAdjustments,
  IconChevronDown,
  IconMovie,
  IconLoader2
} from '@tabler/icons-vue'

// Shadcn Vue Skeleton Component
import Skeleton from '../components/ui/skeleton/Skeleton.vue'
import { useContextMenu } from '../composables/useContextMenu'

const router = useRouter()
const route = useRoute()
const { openContextMenu } = useContextMenu()

const searchQuery = ref('')
const selectedType = ref(['movie', 'tv'].includes(route.query.type) ? route.query.type : 'all') // 'all' | 'movie' | 'tv' | 'anime'
const selectedGenre = ref('all')
const selectedSort = ref('recent') // 'recent' | 'popularity' | 'rating'
const gridMode = ref('normal') // 'normal' | 'compact'
const catalogItems = ref([])
const searchResults = ref([])
const isLoading = ref(true)
let searchDebounce = null

const genreList = [
  { id: 'all', label: 'Tous les genres', tmdbId: null },
  { id: 'action', label: 'Action & Sci-Fi', tmdbId: '28,878' },
  { id: 'drame', label: 'Drame', tmdbId: '18' },
  { id: 'animation', label: 'Animés & Manga', tmdbId: '16' },
  { id: 'thriller', label: 'Thrillers & Mystère', tmdbId: '53,9648' },
  { id: 'comedie', label: 'Comédie', tmdbId: '35' },
  { id: 'horreur', label: 'Horreur', tmdbId: '27' },
  { id: 'aventure', label: 'Aventure', tmdbId: '12' },
  { id: 'crime', label: 'Policier & Crime', tmdbId: '80' },
  { id: 'fantasy', label: 'Fantastique', tmdbId: '14' }
]

async function loadCatalog() {
  isLoading.value = true
  try {
    const currentGenreObj = genreList.find(g => g.id === selectedGenre.value)
    const genreId = currentGenreObj?.tmdbId || null
    const res = await getCoupledExploreCatalog(selectedType.value, genreId)
    catalogItems.value = res || []
  } catch (err) {
    console.error('Error loading explore catalog:', err)
  } finally {
    isLoading.value = false
  }
}

// Watch filters to dynamically fetch TMDB live
watch([selectedType, selectedGenre], () => {
  if (!searchQuery.value.trim()) {
    loadCatalog()
  }
})

// Header "Films"/"Séries" links navigate here with a ?type= query on an
// already-mounted CatalogView — sync the filter when that query changes
watch(() => route.query.type, (type) => {
  selectedType.value = ['movie', 'tv'].includes(type) ? type : 'all'
})

// Filter and sort catalog
const displayedItems = computed(() => {
  if (searchQuery.value.trim() && searchResults.value.length > 0) {
    return searchResults.value
  }

  let list = [...catalogItems.value]

  // Sort
  if (selectedSort.value === 'rating') {
    list.sort((a, b) => {
      const rA = parseFloat(a.rating?.replace(/[^\d.]/g, '') || 0)
      const rB = parseFloat(b.rating?.replace(/[^\d.]/g, '') || 0)
      return rB - rA
    })
  } else if (selectedSort.value === 'popularity') {
    // Keep TMDB popularity order
  } else if (selectedSort.value === 'recent') {
    list.sort((a, b) => (parseInt(b.year) || 0) - (parseInt(a.year) || 0))
  }

  return list
})

// Live TMDB Search Handler
watch(searchQuery, (q) => {
  if (searchDebounce) clearTimeout(searchDebounce)
  if (!q.trim()) {
    searchResults.value = []
    return
  }
  isLoading.value = true
  searchDebounce = setTimeout(async () => {
    try {
      const res = await searchTmdb(q)
      searchResults.value = res || []
    } catch (e) {
      console.error(e)
    } finally {
      isLoading.value = false
    }
  }, 350)
})

function goToDetail(item) {
  router.push({
    path: `/detail/${item.id}`,
    query: { type: item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie') }
  })
}

function pickRandom() {
  if (displayedItems.value.length === 0) return
  const randomIndex = Math.floor(Math.random() * displayedItems.value.length)
  const chosen = displayedItems.value[randomIndex]
  if (chosen) {
    goToDetail(chosen)
  }
}

onMounted(() => {
  loadCatalog()
})
</script>

<template>
  <div class="relative w-full min-h-screen bg-[#000000] text-white select-none pb-24 pt-20 px-6 sm:px-12 lg:px-16 flex flex-col gap-6 overflow-x-hidden">
    
    <!-- 1. TITLE & SUBTITLE -->
    <div class="flex flex-col gap-1">
      <h1 class="text-3xl sm:text-4xl font-black text-white tracking-tight">
        Catalogue
      </h1>
      <p class="text-xs sm:text-sm text-white/50">
        Explorez tout le contenu disponible sur Kawu
      </p>
    </div>

    <!-- 2. FULL WIDTH CINEMA SEARCH BAR -->
    <div class="relative w-full">
      <div class="flex items-center gap-3 px-4 py-3 sm:py-3.5 rounded-2xl bg-[#12141a]/90 hover:bg-[#181b22] focus-within:bg-[#1a1e28] border border-white/10 focus-within:border-cyan-500/50 transition-all shadow-xl shadow-black/60">
        <IconSearch :size="19" :stroke-width="2" class="text-white/40 shrink-0" />
        <input
          type="text"
          v-model="searchQuery"
          placeholder="Rechercher un film, une série, un animé..."
          class="w-full bg-transparent text-xs sm:text-sm text-white placeholder-white/40 outline-none border-none"
        />
        <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/40 hover:text-white cursor-pointer p-1">
          <IconX :size="16" :stroke-width="2" />
        </button>
      </div>
    </div>

    <!-- 3. CONTROL BAR ROW (Segmented Type Switcher on Left + Tools on Right) -->
    <div class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 py-1">
      
      <!-- Left: Segmented Switcher (Tout | Films | Séries | Animés) -->
      <div class="flex items-center p-1 rounded-xl bg-[#12141a] border border-white/10 shrink-0 overflow-x-auto max-w-full">
        <button
          @click="selectedType = 'all'"
          :class="[
            'px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
            selectedType === 'all'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          ]"
        >
          Tout
        </button>
        <button
          @click="selectedType = 'movie'"
          :class="[
            'px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
            selectedType === 'movie'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          ]"
        >
          Films
        </button>
        <button
          @click="selectedType = 'tv'"
          :class="[
            'px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
            selectedType === 'tv'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          ]"
        >
          Séries
        </button>
        <button
          @click="selectedType = 'anime'"
          :class="[
            'px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap',
            selectedType === 'anime'
              ? 'bg-white/15 text-white shadow-sm'
              : 'text-white/50 hover:text-white'
          ]"
        >
          Animés
        </button>
      </div>

      <!-- Right: Grid switcher + Aléatoire + Genres dropdown + Sort dropdown + Titres counter -->
      <div class="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs w-full lg:w-auto justify-start lg:justify-end">
        
        <!-- View Grid Switcher [ ⊞ | ▦ ] -->
        <div class="flex items-center p-1 rounded-xl bg-[#12141a] border border-white/10">
          <button
            @click="gridMode = 'normal'"
            :title="'Vue standard'"
            :class="[
              'p-1.5 rounded-lg transition-all cursor-pointer',
              gridMode === 'normal' ? 'bg-white/15 text-cyan-400' : 'text-white/40 hover:text-white'
            ]"
          >
            <IconLayoutGrid :size="16" :stroke-width="2" />
          </button>
          <button
            @click="gridMode = 'compact'"
            :title="'Vue compacte'"
            :class="[
              'p-1.5 rounded-lg transition-all cursor-pointer',
              gridMode === 'compact' ? 'bg-white/15 text-cyan-400' : 'text-white/40 hover:text-white'
            ]"
          >
            <IconGridDots :size="16" :stroke-width="2" />
          </button>
        </div>

        <!-- Aléatoire Button -->
        <button
          @click="pickRandom"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#12141a] hover:bg-[#1c202a] border border-white/10 hover:border-cyan-500/40 text-white/80 hover:text-white transition-all cursor-pointer active:scale-95"
        >
          <IconArrowsShuffle :size="15" :stroke-width="2" class="text-cyan-400" />
          <span class="font-medium">Aléatoire</span>
        </button>

        <!-- Genre Dropdown Menu -->
        <div class="relative inline-flex items-center">
          <div class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#12141a] hover:bg-[#1c202a] border border-white/10 transition-all text-white/80">
            <IconAdjustments :size="15" :stroke-width="2" class="text-white/50" />
            <select
              v-model="selectedGenre"
              class="appearance-none bg-transparent text-white font-medium pr-5 outline-none cursor-pointer text-xs"
            >
              <option v-for="g in genreList" :key="g.id" :value="g.id" class="bg-[#12141a] text-white">
                {{ g.label }}
              </option>
            </select>
            <IconChevronDown :size="13" class="absolute right-3 pointer-events-none text-white/40" />
          </div>
        </div>

        <!-- Sort Dropdown Menu -->
        <div class="relative inline-flex items-center">
          <div class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#12141a] hover:bg-[#1c202a] border border-white/10 transition-all text-white/80">
            <select
              v-model="selectedSort"
              class="appearance-none bg-transparent text-white font-medium pr-5 outline-none cursor-pointer text-xs"
            >
              <option value="recent" class="bg-[#12141a] text-white">Récemment ajoutés</option>
              <option value="popularity" class="bg-[#12141a] text-white">Popularité</option>
              <option value="rating" class="bg-[#12141a] text-white">Mieux notés (★)</option>
            </select>
            <IconChevronDown :size="13" class="absolute right-3 pointer-events-none text-white/40" />
          </div>
        </div>

        <!-- Titles Count -->
        <span class="text-white/40 text-xs font-semibold pl-1 whitespace-nowrap">
          {{ displayedItems.length }} titres
        </span>

      </div>

    </div>

    <!-- 4. CATALOG GRID / SKELETON LOADING (16:9 Landscape Backdrop Cards matching MediaRow) -->
    <div
      v-if="isLoading"
      :class="[
        'grid gap-4 sm:gap-5 transition-all duration-300',
        gridMode === 'compact'
          ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
          : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
      ]"
    >
      <div
        v-for="n in (gridMode === 'compact' ? 16 : 12)"
        :key="n"
        class="relative aspect-video rounded-2xl overflow-hidden bg-[#0d111a] border border-white/10 p-3 flex flex-col justify-between"
      >
        <Skeleton class="absolute inset-0 w-full h-full rounded-none opacity-40" />
        <div class="relative z-10 flex justify-end">
          <Skeleton class="h-4 w-10 rounded bg-white/10" />
        </div>
        <div class="relative z-10 flex flex-col gap-1.5 items-center w-full px-2 pb-1">
          <Skeleton class="h-5 w-3/4 rounded-md bg-white/20" />
          <Skeleton class="h-2.5 w-1/3 rounded-md bg-white/10" />
        </div>
      </div>
    </div>

    <div
      v-else-if="displayedItems.length > 0"
      :class="[
        'grid gap-4 sm:gap-5 transition-all duration-300',
        gridMode === 'compact'
          ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
          : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
      ]"
    >
      <div
        v-for="item in displayedItems"
        :key="item.id"
        @click="goToDetail(item)"
        @contextmenu="openContextMenu(item, $event)"
        class="group/card relative aspect-video rounded-2xl overflow-hidden bg-[#0a0d14] border border-white/10 hover:border-cyan-400/60 transition-all duration-300 hover:scale-[1.05] hover:z-20 cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-black/90 flex items-center justify-center"
      >
        <!-- 16:9 Backdrop Image -->
        <div
          class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover/card:scale-105"
          :style="{ backgroundImage: `url(${item.poster || item.bgImg})` }"
        />

        <!-- Dark Cinematic Vignette Overlay -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/30 group-hover/card:via-black/10 transition-colors" />

        <!-- Logo or Stylized Title Positioned Lower Down -->
        <div class="relative z-10 p-3 pb-3 sm:pb-3.5 flex items-end justify-center w-full h-full text-center">
          <img
            v-if="item.logoUrl"
            :src="item.logoUrl"
            :alt="item.title"
            class="max-h-9 sm:max-h-11 md:max-h-12 max-w-[80%] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.98)] transition-transform duration-300 group-hover/card:scale-105"
          />
          <span
            v-else
            class="font-black text-xs sm:text-sm tracking-wider text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] line-clamp-2 px-2 pb-1"
          >
            {{ item.title }}
          </span>
        </div>

        <!-- Rating Corner Badge on Hover -->
        <div class="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
          <span v-if="item.rating" class="px-2 py-0.5 rounded bg-black/80 border border-white/20 text-[10px] font-bold text-emerald-400 backdrop-blur-md">
            {{ item.rating }}
          </span>
        </div>

        <!-- Hover Play Button Overlay -->
        <div class="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity pointer-events-none">
          <div class="w-10 h-10 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-xl transform scale-75 group-hover/card:scale-100 transition-transform">
            <IconPlayerPlay :size="18" :stroke-width="3" class="fill-current ml-0.5" />
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center p-16 text-center gap-3 rounded-3xl bg-white/[0.02] border border-white/10">
      <div class="p-4 rounded-3xl bg-white/5 text-cyan-400">
        <IconMovie :size="40" :stroke-width="1.5" />
      </div>
      <h3 class="text-lg font-bold text-white">Aucun titre correspondant</h3>
      <p class="text-xs text-white/60">Modifiez votre recherche ou réinitialisez les filtres.</p>
      <button
        @click="searchQuery = ''; selectedType = 'all'; selectedGenre = 'all'; selectedSort = 'recent'; loadCatalog()"
        class="px-5 py-2.5 bg-cyan-500 text-slate-950 font-black rounded-xl text-xs mt-2 cursor-pointer hover:bg-cyan-400 transition-all shadow-lg"
      >
        Réinitialiser les filtres
      </button>
    </div>

  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
