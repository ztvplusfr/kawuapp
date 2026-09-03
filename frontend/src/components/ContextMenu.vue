<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useContextMenu } from '../composables/useContextMenu'
import {
  IconPlayerPlay,
  IconInfoCircle,
  IconBookmark,
  IconBookmarkFilled,
  IconCopy,
  IconCheck,
  IconLoader2
} from '@tabler/icons-vue'

const router = useRouter()
const {
  isOpen,
  position,
  currentItem,
  isInWatchlist,
  isTogglingWatchlist,
  toastMessage,
  closeContextMenu,
  handleToggleWatchlist,
  copyTitle
} = useContextMenu()

const mediaType = computed(() => {
  if (!currentItem.value) return 'movie'
  return currentItem.value.tmdbType || (
    currentItem.value.type === 'tv' || 
    currentItem.value.category === 'Séries' || 
    currentItem.value.category === 'Animés' ||
    currentItem.value.season > 0
      ? 'tv' 
      : 'movie'
  )
})

function goToPlayer() {
  if (!currentItem.value) return
  const id = currentItem.value.supabaseContentId || currentItem.value.id
  closeContextMenu()
  router.push({
    path: `/player/${id}`,
    query: { type: mediaType.value }
  })
}

function goToDetail() {
  if (!currentItem.value) return
  const id = currentItem.value.supabaseContentId || currentItem.value.id
  closeContextMenu()
  router.push({
    path: `/detail/${id}`,
    query: { type: mediaType.value }
  })
}
</script>

<template>
  <div>
    <!-- TOAST NOTIFICATION (Noir Glass) -->
    <transition name="toast">
      <div
        v-if="toastMessage"
        class="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-5 py-2.5 rounded-full bg-black/85 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_1px_0_0_rgba(255,255,255,0.2)] text-white text-xs sm:text-sm font-bold flex items-center gap-2 pointer-events-none"
        style="backdrop-filter: blur(40px) saturate(1.8); -webkit-backdrop-filter: blur(40px) saturate(1.8);"
      >
        <span class="text-cyan-400 font-black">✦</span>
        <span>{{ toastMessage }}</span>
      </div>
    </transition>

    <!-- CONTEXT MENU OVERLAY & POPOVER -->
    <div v-if="isOpen" class="fixed inset-0 z-50 select-none">
      <!-- Click catcher backdrop -->
      <div class="absolute inset-0" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />

      <!-- Popover Menu (Pure Noir Glass) -->
      <div
        @click.stop
        class="absolute z-10 w-64 rounded-2xl bg-black/80 border border-white/20 p-2 flex flex-col gap-1 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.98),inset_0_1px_0_0_rgba(255,255,255,0.25)] animate-in fade-in zoom-in-95 duration-150"
        :style="{
          left: `${position.x}px`,
          top: `${position.y}px`,
          backdropFilter: 'blur(40px) saturate(2.0)',
          WebkitBackdropFilter: 'blur(40px) saturate(2.0)'
        }"
      >
        <!-- Header Info Card -->
        <div v-if="currentItem" class="p-2 flex items-center gap-2.5 rounded-xl bg-white/[0.06] border border-white/10 mb-1">
          <img
            v-if="currentItem.poster || currentItem.bgImg"
            :src="currentItem.poster || currentItem.bgImg"
            :alt="currentItem.title"
            class="w-10 h-14 object-cover rounded-lg shrink-0 shadow-md"
          />
          <div class="flex flex-col min-w-0 pr-1">
            <span class="text-xs font-black text-white truncate">{{ currentItem.title }}</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span class="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                {{ mediaType === 'tv' ? 'SÉRIE' : 'FILM' }}
              </span>
              <span v-if="currentItem.year" class="text-[10px] text-white/50">• {{ currentItem.year }}</span>
            </div>
          </div>
        </div>

        <!-- 1. Regarder Maintenant -->
        <button
          @click="goToPlayer"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-bold text-white hover:bg-cyan-500 hover:text-slate-950 transition-colors cursor-pointer group"
        >
          <IconPlayerPlay :size="16" :stroke-width="2.5" class="text-cyan-400 group-hover:text-slate-950" />
          <span>Regarder</span>
        </button>

        <!-- 2. Plus d'infos -->
        <button
          @click="goToDetail"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-bold text-white hover:bg-white/10 transition-colors cursor-pointer group"
        >
          <IconInfoCircle :size="16" :stroke-width="2" class="text-white/70 group-hover:text-white" />
          <span>Plus d'infos</span>
        </button>

        <div class="h-px bg-white/10 my-0.5 mx-1" />

        <!-- 3. Enregistrer / Retirer de la Watchlist -->
        <button
          @click="handleToggleWatchlist"
          :disabled="isTogglingWatchlist"
          class="flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs font-bold transition-colors cursor-pointer group hover:bg-white/10"
          :class="isInWatchlist ? 'text-cyan-300' : 'text-white'"
        >
          <div class="flex items-center gap-3">
            <IconLoader2 v-if="isTogglingWatchlist" :size="16" class="animate-spin text-cyan-400" />
            <IconBookmarkFilled v-else-if="isInWatchlist" :size="16" class="text-cyan-400" />
            <IconBookmark v-else :size="16" :stroke-width="2" class="text-white/70 group-hover:text-white" />
            <span>{{ isInWatchlist ? 'Dans ta Watchlist' : 'Enregistrer' }}</span>
          </div>
          <IconCheck v-if="isInWatchlist" :size="14" class="text-cyan-400" :stroke-width="3" />
        </button>

        <!-- 4. Copier le titre -->
        <button
          @click="copyTitle"
          class="flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer group"
        >
          <IconCopy :size="16" :stroke-width="2" class="text-white/50 group-hover:text-white" />
          <span>Copier le titre</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 15px) scale(0.95);
}
</style>
