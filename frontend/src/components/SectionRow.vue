<script setup>
import { ref, computed } from 'vue'
import MediaCard from './MediaCard.vue'
import {
  IconChevronLeft,
  IconChevronRight,
  IconFlame,
  IconBolt,
  IconMovie,
  IconDeviceTv,
  IconSparkles
} from '@tabler/icons-vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  iconType: {
    type: String,
    default: 'sparkles'
  },
  items: {
    type: Array,
    required: true
  },
  showRank: {
    type: Boolean,
    default: false
  }
})

const HeaderIcon = computed(() => {
  if (props.iconType === 'flame') return IconFlame
  if (props.iconType === 'bolt') return IconBolt
  if (props.iconType === 'movie') return IconMovie
  if (props.iconType === 'device-tv') return IconDeviceTv
  return IconSparkles
})

const rowRef = ref(null)

function scrollLeft() {
  if (rowRef.value) {
    rowRef.value.scrollBy({ left: -380, behavior: 'smooth' })
  }
}

function scrollRight() {
  if (rowRef.value) {
    rowRef.value.scrollBy({ left: 380, behavior: 'smooth' })
  }
}
</script>

<template>
  <section class="flex flex-col gap-4 group select-none">
    
    <!-- Section Header Row -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 text-cyan-400 shadow-sm">
          <component :is="HeaderIcon" :size="22" :stroke-width="2" />
        </div>
        <div>
          <h2 class="text-xl sm:text-2xl font-black text-white tracking-wide">{{ title }}</h2>
          <p v-if="subtitle" class="text-xs text-white/60 mt-0.5">{{ subtitle }}</p>
        </div>
      </div>

      <!-- Arrow Controls with Tabler Icons -->
      <div class="flex items-center gap-2">
        <button @click="scrollLeft"
                class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95">
          <IconChevronLeft :size="16" :stroke-width="2.5" />
        </button>
        <button @click="scrollRight"
                class="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 text-white border border-white/10 flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95">
          <IconChevronRight :size="16" :stroke-width="2.5" />
        </button>
      </div>
    </div>

    <!-- Horizontal Scrollable Row of Cards -->
    <div ref="rowRef"
         class="flex items-center gap-4 overflow-x-auto pb-4 pt-1 scroll-smooth no-scrollbar"
         style="scrollbar-width: none; -ms-overflow-style: none;">
      <div v-for="item in items" :key="item.id" class="w-72 sm:w-80 shrink-0">
        <MediaCard :item="item" :show-rank="showRank" />
      </div>
    </div>

  </section>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
