<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Header from './components/Header.vue'
import WelcomeModal from './components/WelcomeModal.vue'
import { useMacGestures } from './composables/useMacGestures'
import { IconChevronLeft } from '@tabler/icons-vue'

const { isSwipingBack, swipeProgress } = useMacGestures()
const route = useRoute()
const mainRef = ref(null)

const showHeader = computed(() => route.path !== '/')

// Scroll main to top on route change (hash history doesn't always trigger router scrollBehavior)
watch(() => route.path, () => {
  if (mainRef.value) {
    mainRef.value.scrollTop = 0
  }
})
</script>

<template>
  <div class="relative w-full h-full bg-[#000000] text-white overflow-hidden font-sans">

    <!-- PERSISTENT OLED GLASS BACKGROUND (visible across all pages, doesn't scroll) -->
    <div class="fixed inset-0 z-0 pointer-events-none">
      <div class="absolute -top-40 -left-20 w-[55rem] h-[55rem] bg-cyan-950/30 rounded-full blur-[180px]"></div>
      <div class="absolute top-1/3 -right-40 w-[50rem] h-[50rem] bg-blue-950/25 rounded-full blur-[190px]"></div>
      <div class="absolute -bottom-40 left-1/4 w-[55rem] h-[55rem] bg-cyan-950/20 rounded-full blur-[200px]"></div>
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] bg-blue-900/10 rounded-full blur-[160px]"></div>
    </div>

    <!-- Persistent subtle film grain + glass overlay (OLED feel) -->
    <div class="fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.025] via-transparent to-black pointer-events-none"></div>
    <div class="fixed inset-0 z-0 bg-black/40 backdrop-blur-[1px] pointer-events-none"></div>

    <Header v-if="showHeader" />

    <div
      v-if="isSwipingBack"
      class="fixed left-4 top-1/2 -translate-y-1/2 z-50 pointer-events-none transition-transform duration-100 ease-out"
      :style="{
        transform: `translateY(-50%) translateX(${swipeProgress * 20}px) scale(${0.8 + swipeProgress * 0.4})`,
        opacity: swipeProgress * 1.2
      }"
    >
      <div class="w-12 h-12 rounded-full bg-black/80 border border-cyan-400/50 backdrop-blur-2xl flex items-center justify-center text-cyan-400 shadow-2xl shadow-cyan-950/80">
        <IconChevronLeft :size="24" :stroke-width="3" />
      </div>
    </div>

    <main ref="mainRef" class="w-full h-full overflow-y-auto overflow-x-hidden z-10 scroll-smooth">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <WelcomeModal />

  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
