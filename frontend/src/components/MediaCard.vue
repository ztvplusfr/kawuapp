<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconPlayerPlay,
  IconFlame,
  IconBolt,
  IconDeviceTv,
  IconMovie,
  IconSparkles,
  IconCrown
} from '@tabler/icons-vue'

import { useContextMenu } from '../composables/useContextMenu'

const props = defineProps({
  item: {
    type: Object,
    required: true
  },
  showRank: {
    type: Boolean,
    default: true
  }
})

const router = useRouter()
const { openContextMenu } = useContextMenu()

function playItem() {
  router.push(`/player/${props.item.id}`)
}

const CategoryIcon = computed(() => {
  if (props.item.category === 'Animés') return IconBolt
  if (props.item.category === 'Films') return IconMovie
  if (props.item.category === 'Séries') return IconDeviceTv
  return IconSparkles
})
</script>

<template>
  <div @click="playItem"
       @contextmenu="openContextMenu(item, $event)"
       :class="[
         'group relative p-5 rounded-3xl bg-gradient-to-br border border-white/10 backdrop-blur-xl transition-all duration-300 cursor-pointer hover:scale-[1.02] hover:shadow-2xl shadow-black/60 flex flex-col justify-between h-48 overflow-hidden select-none',
         item.accent, item.border
       ]">
    
    <!-- Giant Rank Number Background -->
    <span v-if="showRank && item.rank"
          class="absolute -bottom-4 right-3 text-7xl font-black text-white/[0.07] pointer-events-none group-hover:text-white/[0.12] transition-colors">
      #{{ item.rank }}
    </span>

    <!-- Top Row -->
    <div class="flex items-center justify-between z-10">
      <div class="p-2.5 rounded-2xl bg-white/10 border border-white/10 backdrop-blur-md text-cyan-300 shadow-sm">
        <component :is="CategoryIcon" :size="20" :stroke-width="2" />
      </div>
      
      <div class="flex items-center gap-2">
        <span class="px-2.5 py-1 rounded-lg text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm">
          {{ item.tag || item.category }}
        </span>
        <span class="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
          {{ item.quality }}
        </span>
      </div>
    </div>

    <!-- Bottom Row -->
    <div class="flex items-end justify-between gap-3 z-10">
      <div class="flex flex-col">
        <span class="text-base font-black text-white group-hover:text-cyan-200 transition-colors truncate max-w-[180px]">
          {{ item.title }}
        </span>
        <span class="text-xs text-white/60 mt-0.5">{{ item.genre }} • {{ item.rating }}</span>
      </div>

      <button class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black shadow-lg shadow-cyan-950/40 transition-all shrink-0 active:scale-95">
        <IconPlayerPlay :size="13" :stroke-width="3" class="fill-current" />
        <span>Regarder</span>
      </button>
    </div>

  </div>
</template>
