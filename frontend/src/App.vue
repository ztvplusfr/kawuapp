<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import Header from './components/Header.vue'
import WelcomeModal from './components/WelcomeModal.vue'
import ContextMenu from './components/ContextMenu.vue'
import SearchOverlay from './components/SearchOverlay.vue'
import SplashScreen from './components/SplashScreen.vue'
import { useMacGestures } from './composables/useMacGestures'
import { useCatalog } from './composables/useCatalog'
import { useRemoteReceiver } from './composables/useRemoteReceiver'
import { IconChevronLeft } from '@tabler/icons-vue'

useRemoteReceiver()

const { isSwipingBack, swipeProgress } = useMacGestures()
const route = useRoute()
const mainRef = ref(null)

const showHeader = computed(() => !['/', '/profiles', '/settings'].includes(route.path))

// Scroll main to top on route change (hash history doesn't always trigger router scrollBehavior)
watch(() => route.path, () => {
  if (mainRef.value) {
    mainRef.value.scrollTop = 0
  }
})

// SPLASH SCREEN: preload the catalog before revealing the app
const { isLoading: catalogLoading } = useCatalog()
const showSplash = ref(true)
const splashProgress = ref(0)
let splashProgressTimer = null
let splashMaxWaitTimer = null
let stopSplashWatch = null

function finishSplash() {
  if (!showSplash.value) return
  if (splashProgressTimer) clearInterval(splashProgressTimer)
  if (splashMaxWaitTimer) clearTimeout(splashMaxWaitTimer)
  if (stopSplashWatch) stopSplashWatch()
  splashProgress.value = 100
  setTimeout(() => {
    showSplash.value = false
  }, 250)
}

onMounted(() => {
  // Animate progress toward 90% while the real preload is happening,
  // then jump to 100% once the catalog has actually finished loading.
  splashProgressTimer = setInterval(() => {
    if (splashProgress.value < 90) {
      splashProgress.value += (90 - splashProgress.value) * 0.08 + 0.4
    }
  }, 100)

  // Safety net: never block the app behind the splash for more than a few seconds
  splashMaxWaitTimer = setTimeout(finishSplash, 6000)

  stopSplashWatch = watch(catalogLoading, (loading) => {
    if (!loading) finishSplash()
  }, { immediate: true })
})

onUnmounted(() => {
  if (splashProgressTimer) clearInterval(splashProgressTimer)
  if (splashMaxWaitTimer) clearTimeout(splashMaxWaitTimer)
  if (stopSplashWatch) stopSplashWatch()
})
</script>

<template>
  <div class="relative w-full h-full bg-black text-white overflow-hidden font-sans">

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
      <router-view />
    </main>

    <WelcomeModal />
    <ContextMenu />
    <SearchOverlay />
    <SplashScreen v-if="showSplash" :progress="splashProgress" />

  </div>
</template>
