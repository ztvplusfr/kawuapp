<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { IconChevronLeft, IconChevronRight, IconPlayerPlay } from '@tabler/icons-vue'
import Skeleton from './ui/skeleton/Skeleton.vue'
import { useContextMenu } from '../composables/useContextMenu'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  items: {
    type: Array,
    required: true
  },
  isContinueWatching: {
    type: Boolean,
    default: false
  },
  isLoading: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()
const { openContextMenu } = useContextMenu()

// "Ajout récent" badge: shown for a few days after a title was added to Kawu (contents.created_at)
const NEW_BADGE_DAYS = 5
function isRecentlyAdded(item) {
  if (!item?.createdAt) return false
  const addedTime = new Date(item.createdAt).getTime()
  if (Number.isNaN(addedTime)) return false
  const diffDays = (Date.now() - addedTime) / (1000 * 60 * 60 * 24)
  return diffDays >= 0 && diffDays <= NEW_BADGE_DAYS
}

const scrollContainer = ref(null)
const currentPage = ref(0)
const totalPages = ref(1)
const canScrollLeft = ref(false)
const canScrollRight = ref(true)

function updatePagination() {
  if (!scrollContainer.value) return
  const { scrollLeft, scrollWidth, clientWidth } = scrollContainer.value
  const maxScroll = scrollWidth - clientWidth
  
  canScrollLeft.value = scrollLeft > 10
  canScrollRight.value = scrollLeft < maxScroll - 10

  if (maxScroll <= 0) {
    totalPages.value = 1
    currentPage.value = 0
    return
  }
  totalPages.value = Math.max(1, Math.ceil(scrollWidth / (clientWidth * 0.95)))
  currentPage.value = Math.min(
    totalPages.value - 1,
    Math.max(0, Math.round((scrollLeft / maxScroll) * (totalPages.value - 1)))
  )
}

function scrollLeft() {
  if (scrollContainer.value) {
    const width = scrollContainer.value.clientWidth * 0.88
    scrollContainer.value.scrollBy({ left: -width, behavior: 'smooth' })
  }
}

function scrollRight() {
  if (scrollContainer.value) {
    const width = scrollContainer.value.clientWidth * 0.88
    scrollContainer.value.scrollBy({ left: width, behavior: 'smooth' })
  }
}

function goToDetail(item) {
  if (props.isContinueWatching) {
    const itemType = item.tmdbType || (item.season > 0 || item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie')
    const query = { type: itemType }
    if (item.season) query.season = item.season
    if (item.episode) query.episode = item.episode
    router.push({
      path: `/player/${item.id}`,
      query
    })
    return
  }
  router.push({
    path: `/detail/${item.id}`,
    query: { type: item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie') }
  })
}

watch(
  () => [props.items, props.isLoading],
  () => {
    nextTick(() => {
      updatePagination()
    })
  },
  { deep: true }
)

onMounted(() => {
  nextTick(() => {
    updatePagination()
  })
  window.addEventListener('resize', updatePagination)
})

onUnmounted(() => {
  window.removeEventListener('resize', updatePagination)
})
</script>

<template>
  <div class="relative flex flex-col gap-2.5 group/row select-none">
    
    <!-- HEADER: Title on Left & Pagination Indicators on Right -->
    <div class="flex items-center justify-between px-6 sm:px-12 lg:px-16">
      <h2 class="text-base sm:text-lg md:text-xl font-black text-white tracking-wide hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1.5">
        <span>{{ title }}</span>
        <span class="text-xs text-cyan-400 opacity-0 group-hover/row:opacity-100 transition-opacity">›</span>
      </h2>

      <!-- Netflix Pagination Dash Indicators (───────) -->
      <div v-if="totalPages > 1" class="flex items-center gap-1">
        <span
          v-for="pageIndex in totalPages"
          :key="pageIndex"
          :class="[
            'h-0.5 rounded-full transition-all duration-300',
            currentPage === pageIndex - 1 ? 'w-4 bg-cyan-400' : 'w-2 bg-white/20'
          ]"
        />
      </div>
    </div>

    <!-- CAROUSEL RAIL CONTAINER (Full Edge-to-Edge Bleed) -->
    <div class="relative w-full">
      
      <!-- Left Edge Arrow Slide Button -->
      <button
        v-show="canScrollLeft"
        @click="scrollLeft"
        class="absolute left-0 top-0 bottom-0 z-30 w-12 sm:w-16 bg-gradient-to-r from-[#000000]/95 via-[#000000]/70 to-transparent text-white flex items-center justify-start pl-2 sm:pl-4 transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer hover:scale-105 active:scale-95"
      >
        <div class="w-8 h-8 rounded-full bg-black/60 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-xl">
          <IconChevronLeft :size="20" :stroke-width="2.5" />
        </div>
      </button>

      <!-- 1. Scrollable Skeleton Card Row (While items loading) -->
      <div
        v-if="isLoading || !items || items.length === 0"
        class="flex items-center gap-3 sm:gap-3.5 overflow-x-hidden no-scrollbar py-3 px-6 sm:px-12 lg:px-16"
      >
        <div
          v-for="n in 6"
          :key="n"
          class="relative shrink-0 w-[calc((100vw-48px)/2.3)] sm:w-[calc((100vw-96px)/3.35)] md:w-[calc((100vw-96px)/4.35)] lg:w-[calc((100vw-128px)/5.35)] aspect-video rounded-xl overflow-hidden bg-[#0d111a] border border-white/10 p-3 flex flex-col justify-between"
        >
          <Skeleton class="absolute inset-0 w-full h-full rounded-none opacity-40" />
          <div class="relative z-10 flex justify-end">
            <Skeleton class="h-3.5 w-8 rounded bg-white/10" />
          </div>
          <div class="relative z-10 flex flex-col gap-1.5 items-center w-full px-2">
            <Skeleton class="h-4 w-3/5 rounded bg-white/20" />
            <Skeleton class="h-2 w-1/4 rounded bg-white/10" />
          </div>
        </div>
      </div>

      <!-- 2. Scrollable 16:9 Landscape Card Row (5 Full Cards + 6th Peek) -->
      <div
        v-else
        ref="scrollContainer"
        @scroll="updatePagination"
        class="flex items-center gap-3 sm:gap-3.5 overflow-x-auto scroll-smooth no-scrollbar py-3 px-6 sm:px-12 lg:px-16"
        style="scrollbar-width: none; -ms-overflow-style: none;"
      >
        <div
          v-for="item in items"
          :key="item.id"
          @click="goToDetail(item)"
          @contextmenu="openContextMenu(item, $event)"
          class="group/card relative shrink-0 w-[calc((100vw-48px)/2.3)] sm:w-[calc((100vw-96px)/3.35)] md:w-[calc((100vw-96px)/4.35)] lg:w-[calc((100vw-128px)/5.35)] rounded-xl overflow-visible bg-transparent hover:z-20 cursor-pointer"
        >
          <!-- Card wrapper for aspect ratio + border/shadow -->
          <div class="aspect-video rounded-xl overflow-hidden bg-[#0a0d14] border border-white/10 hover:border-cyan-400/60 transition-all duration-300 hover:scale-[1.05] shadow-lg hover:shadow-2xl hover:shadow-black/90 group-hover/card:scale-[1.05] flex items-center justify-center relative">
          
            <!-- 1. 16:9 Backdrop Background Image -->
            <div
              class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover/card:scale-105"
              :style="{ backgroundImage: `url(${item.poster || item.bgImg})` }"
            ></div>

            <!-- 2. Dark Cinematic Vignette Overlay -->
            <div
              :class="[
                'absolute inset-0 transition-colors',
                isContinueWatching
                  ? 'bg-gradient-to-t from-black/90 via-black/40 to-black/30 group-hover/card:via-black/20'
                  : 'bg-gradient-to-t from-black/80 via-black/25 to-black/30 group-hover/card:via-black/10'
              ]"
            ></div>

            <!-- Top Rank Badge (#1..#10) -->
            <div v-if="item.rank" class="absolute top-2 left-2.5 z-20 pointer-events-none">
              <span class="text-2xl sm:text-3xl font-black italic tracking-tighter text-cyan-400 drop-shadow-[0_2px_8px_rgba(0,0,0,1)] select-none">
                #{{ item.rank }}
              </span>
            </div>

            <!-- "Ajout récent" Badge (recently added to Kawu, Netflix-style) -->
            <div v-if="isRecentlyAdded(item)" class="absolute bottom-0 inset-x-0 z-20 flex justify-center pointer-events-none">
              <span class="px-3 py-1 rounded-t-md text-[10px] sm:text-xs font-bold bg-red-600 text-white shadow-lg tracking-wide">
                Ajout récent
              </span>
            </div>

            <!-- 3. Official Logo positioned lower down (FR/EN) or Clean Typography -->
            <div :class="[
              'relative z-10 p-3 sm:p-4 flex items-end justify-center w-full h-full text-center',
              isRecentlyAdded(item) ? 'pb-7 sm:pb-8' : 'pb-3 sm:pb-4'
            ]">
              <img
                v-if="item.logoUrl"
                :src="item.logoUrl"
                :alt="item.title"
                :class="[
                  'max-w-[78%] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.98)] transition-transform duration-300 group-hover/card:scale-105',
                  isContinueWatching ? 'max-h-8 sm:max-h-10 md:max-h-12' : 'max-h-10 sm:max-h-12 md:max-h-14'
                ]"
              />
              <span
                v-else
                class="font-black text-xs sm:text-sm md:text-base tracking-wider text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] line-clamp-2 px-2 pb-1"
              >
                {{ item.title }}
              </span>
            </div>

            <!-- 4. Play Floating Action (Always visible on Continue Watching, hover-only on standard) -->
            <div
              :class="[
                'absolute inset-0 z-20 flex items-center justify-center transition-all duration-300 pointer-events-none',
                isContinueWatching
                  ? 'opacity-90 group-hover/card:opacity-100'
                  : 'opacity-0 group-hover/card:opacity-100'
              ]"
            >
              <div
                :class="[
                  'rounded-full flex items-center justify-center shadow-xl transition-all duration-300',
                  isContinueWatching
                    ? 'w-10 h-10 sm:w-11 sm:h-11 bg-black/60 border border-white/30 text-white backdrop-blur-md group-hover/card:bg-cyan-500 group-hover/card:text-slate-950 group-hover/card:border-cyan-400 group-hover/card:scale-110'
                    : 'w-10 h-10 bg-cyan-500 text-slate-950 transform scale-75 group-hover/card:scale-100'
                ]"
              >
                <IconPlayerPlay :size="18" :stroke-width="3" class="fill-current ml-0.5" />
              </div>
            </div>

            <!-- 5. Continue Watching Progress Bar (Embedded at bottom) -->
            <div v-if="isContinueWatching || item.progress" class="absolute inset-x-0 bottom-0 z-20 h-1.5 bg-black/70 overflow-hidden">
              <div
                class="h-full bg-cyan-400 rounded-r-full shadow-[0_0_8px_rgba(34,211,238,0.6)] transition-all duration-300"
                :style="{ width: (item.progress || 50) + '%' }"
              ></div>
            </div>

          </div>

          <!-- 6. Info Section Under Card (Always visible on Continue Watching without hover) -->
          <div v-if="isContinueWatching" class="mt-2.5 px-0.5 flex flex-col gap-0.5">
            <span class="text-xs sm:text-sm font-black text-white truncate group-hover/card:text-cyan-300 transition-colors">
              {{ item.title }}
            </span>
            <div class="flex items-center justify-between text-[11px] sm:text-xs text-white/60">
              <span class="truncate font-medium text-white/80">
                {{ item.season ? `S${item.season} • Épisode ${item.episode}` : (item.genre || item.category || 'Film') }}
              </span>
              <span v-if="item.timeLeft" class="text-cyan-400 font-semibold shrink-0 ml-2">
                {{ item.timeLeft }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Edge Arrow Slide Button -->
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
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
