<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-vue'
import Skeleton from './ui/skeleton/Skeleton.vue'
import StatusBadge from './StatusBadge.vue'
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
  isLoading: {
    type: Boolean,
    default: false
  }
})

const router = useRouter()
const { openContextMenu } = useContextMenu()
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
  router.push({
    path: `/detail/${item.id}`,
    query: { type: item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie') }
  })
}

function badgeLabel(item) {
  return item.category === 'Séries' || item.category === 'Animés' || item.type === 'Série'
    ? 'Nouvelle saison'
    : 'Ajout récent'
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

    <!-- CAROUSEL RAIL CONTAINER -->
    <div class="relative w-full">

      <!-- Left Edge Arrow -->
      <button
        v-show="canScrollLeft"
        @click="scrollLeft"
        class="absolute left-0 top-0 bottom-0 z-30 w-12 sm:w-16 bg-gradient-to-r from-[#000000]/95 via-[#000000]/70 to-transparent text-white flex items-center justify-start pl-2 sm:pl-4 transition-all opacity-0 group-hover/row:opacity-100 cursor-pointer hover:scale-105 active:scale-95"
      >
        <div class="w-8 h-8 rounded-full bg-black/60 border border-white/20 backdrop-blur-md flex items-center justify-center shadow-xl">
          <IconChevronLeft :size="20" :stroke-width="2.5" />
        </div>
      </button>

      <!-- Skeleton -->
      <div
        v-if="isLoading || !items || items.length === 0"
        class="flex items-end gap-1 overflow-x-hidden no-scrollbar py-3 px-6 sm:px-12 lg:px-16"
      >
        <div v-for="n in 6" :key="n" class="flex items-end shrink-0">
          <Skeleton class="h-24 sm:h-32 w-14 sm:w-20 rounded bg-white/5 -mr-4 sm:-mr-6" />
          <Skeleton class="aspect-[2/3] w-24 sm:w-32 rounded-lg bg-white/10" />
        </div>
      </div>

      <!-- TOP 10 RAIL: big outlined rank numbers behind portrait poster cards -->
      <div
        v-else
        ref="scrollContainer"
        @scroll="updatePagination"
        class="flex items-end gap-0 overflow-x-auto scroll-smooth no-scrollbar py-3 px-6 sm:px-12 lg:px-16"
        style="scrollbar-width: none; -ms-overflow-style: none;"
      >
        <div
          v-for="(item, index) in items.slice(0, 10)"
          :key="item.id"
          class="flex items-end shrink-0 last:pr-2"
        >
          <!-- Giant outlined rank number -->
          <span
            class="top10-rank shrink-0 select-none pointer-events-none leading-none font-black italic text-[5.5rem] sm:text-[7.5rem] md:text-[8.5rem] -mr-3 sm:-mr-5 md:-mr-6 pb-1"
          >{{ index + 1 }}</span>

          <!-- Portrait poster card -->
          <div
            @click="goToDetail(item)"
            @contextmenu="openContextMenu(item, $event)"
            class="group/card relative z-10 w-28 sm:w-36 md:w-40 aspect-[2/3] rounded-md overflow-hidden bg-[#0a0d14] border border-white/10 hover:border-cyan-400/60 transition-all duration-300 hover:scale-[1.04] shadow-lg hover:shadow-2xl hover:shadow-black/90 cursor-pointer"
          >
            <img
              :src="item.posterUrl || item.poster || item.bgImg"
              :alt="item.title"
              class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent"></div>

            <!-- Logo positioned above the badge -->
            <div class="absolute inset-x-0 bottom-11 sm:bottom-12 px-2 flex items-end justify-center">
              <img
                v-if="item.logoUrl"
                :src="item.logoUrl"
                :alt="item.title"
                class="max-w-full max-h-10 sm:max-h-12 object-contain drop-shadow-[0_4px_12px_rgba(0,0,0,0.95)]"
              />
              <span
                v-else
                class="text-center font-black text-xs sm:text-sm text-white uppercase tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)] line-clamp-2"
              >
                {{ item.title }}
              </span>
            </div>

            <!-- Full-width status badge flush with the bottom edge -->
            <div class="absolute inset-x-0 bottom-0">
              <StatusBadge :label="badgeLabel(item)" block />
            </div>
          </div>
        </div>
      </div>

      <!-- Right Edge Arrow -->
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

.top10-rank {
  color: transparent;
  -webkit-text-stroke: 2px rgba(255, 255, 255, 0.55);
}
</style>
