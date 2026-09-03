<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { IconSearch, IconX, IconInfoCircle, IconPlus, IconCheck } from '@tabler/icons-vue'
import { useSearchOverlay } from '../composables/useSearchOverlay'
import { useAuth } from '../composables/useAuth'
import { useCatalog } from '../composables/useCatalog'
import { toggleWatchlist } from '../services/api/watchService'
import { getWatchlist } from '../services/supabase'

const router = useRouter()
const { isOpen, closeSearch } = useSearchOverlay()
const { isLoggedIn, userId } = useAuth()
// Only titles actually hosted on Kawu (Supabase contents), never plain TMDB filler
const { recentAdditions } = useCatalog()

const query = ref('')
const inputRef = ref(null)
const watchlistIds = ref(new Set())
const togglingId = ref(null)

// Fetch the user's actual watchlist so each result's button reflects the real state
async function loadWatchlistStatus() {
  if (!isLoggedIn.value || !userId.value) return
  const rows = await getWatchlist(userId.value)
  const contentIds = new Set((rows || []).map(r => String(r.content_id)))
  const matched = new Set()
  recentAdditions.value.forEach(item => {
    const key = String(item.supabaseContentId || item.id)
    if (contentIds.has(key)) matched.add(item.id)
  })
  watchlistIds.value = matched
}

watch(isOpen, (open) => {
  if (open) {
    query.value = ''
    watchlistIds.value = new Set()
    loadWatchlistStatus()
    nextTick(() => inputRef.value?.focus())
  }
})

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return []
  return recentAdditions.value.filter(item => (item.title || '').toLowerCase().includes(q))
})

function goToDetail(item) {
  closeSearch()
  router.push({
    path: `/detail/${item.id}`,
    query: { type: item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie') }
  })
}

async function onToggleWatchlist(item) {
  if (!isLoggedIn.value || !userId.value || togglingId.value) return
  togglingId.value = item.id
  try {
    const contentKey = item.supabaseContentId || item.id
    const newState = await toggleWatchlist(userId.value, contentKey)
    const set = new Set(watchlistIds.value)
    if (newState) set.add(item.id)
    else set.delete(item.id)
    watchlistIds.value = set
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <Teleport to="body">
    <transition name="search-fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[10000] bg-black/92 backdrop-blur-2xl flex flex-col overflow-y-auto"
        @click.self="closeSearch"
      >
        <div class="w-full max-w-4xl mx-auto px-6 pt-24 pb-16 flex flex-col gap-10">

          <!-- Search Bar -->
          <div class="flex items-center gap-4 border-b border-white/15 pb-6">
            <IconSearch :size="30" class="text-white/50 shrink-0" />
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              placeholder="Rechercher..."
              class="flex-1 bg-transparent outline-none text-3xl sm:text-4xl text-white placeholder:text-white/30"
              @keydown.esc="closeSearch"
            />
            <button
              @click="closeSearch"
              class="text-white/50 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <IconX :size="30" />
            </button>
          </div>

          <!-- Results List (no card boxes, plain list rows) -->
          <div v-if="query.trim() && results.length > 0" class="flex flex-col divide-y divide-white/10">
            <div
              v-for="item in results"
              :key="item.id"
              class="flex items-center gap-5 py-4 hover:bg-white/[0.04] transition-colors -mx-3 px-3 rounded-xl"
            >
              <!-- Thumbnail with Logo/Title Overlay -->
              <div
                @click="goToDetail(item)"
                class="relative shrink-0 w-36 sm:w-44 aspect-video rounded-xl overflow-hidden bg-black/60 cursor-pointer flex items-center justify-center"
              >
                <div
                  class="absolute inset-0 bg-cover bg-center"
                  :style="{ backgroundImage: `url(${item.poster || item.bgImg})` }"
                ></div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25"></div>
                <img
                  v-if="item.logoUrl"
                  :src="item.logoUrl"
                  :alt="item.title"
                  class="relative z-10 max-h-9 max-w-[80%] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]"
                />
              </div>

              <!-- Title + Meta -->
              <div @click="goToDetail(item)" class="min-w-0 flex-1 cursor-pointer">
                <span class="block truncate font-bold text-white text-lg sm:text-xl">{{ item.title }}</span>
                <span class="block truncate text-sm text-white/50 mt-1">
                  {{ item.type }}
                  <template v-if="item.genre"> · {{ item.genre }}</template>
                  <template v-if="item.year"> · {{ item.year }}</template>
                  <template v-if="item.rating"> · {{ item.rating }}</template>
                </span>
              </div>

              <!-- Actions: Plus d'infos + Watchlist -->
              <div class="flex items-center gap-2.5 shrink-0">
                <button
                  @click="goToDetail(item)"
                  class="hidden sm:flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-bold transition-all cursor-pointer"
                >
                  <IconInfoCircle :size="17" />
                  <span>Plus d'infos</span>
                </button>
                <button
                  v-if="isLoggedIn"
                  @click="onToggleWatchlist(item)"
                  :disabled="togglingId === item.id"
                  title="Ma liste"
                  :class="[
                    'w-11 h-11 rounded-lg border flex items-center justify-center transition-all cursor-pointer disabled:opacity-50 shrink-0',
                    watchlistIds.has(item.id) ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-white/10 hover:bg-white/20 text-white border-white/10'
                  ]"
                >
                  <IconCheck v-if="watchlistIds.has(item.id)" :size="18" :stroke-width="2.5" />
                  <IconPlus v-else :size="18" :stroke-width="2" />
                </button>
              </div>
            </div>
          </div>

          <div v-else-if="query.trim()" class="text-center text-white/40 text-sm py-16">
            Aucun résultat sur Kawu pour « {{ query }} ».
          </div>

        </div>
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.search-fade-enter-active,
.search-fade-leave-active {
  transition: opacity 0.15s ease;
}
.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
}
</style>
