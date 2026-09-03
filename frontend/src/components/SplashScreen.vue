<script setup>
import kawuLogo from '../assets/kawu-logo-full.svg'

defineProps({
  progress: {
    type: Number,
    default: 0
  }
})
</script>

<template>
  <div class="fixed inset-0 z-[20000] bg-black flex flex-col items-center justify-center select-none">

    <!-- Centered Logo -->
    <img :src="kawuLogo" alt="Kawu" class="h-14 sm:h-16 w-auto object-contain animate-pulse" />

    <!-- Bottom Progress Bar -->
    <div class="fixed bottom-16 inset-x-0 flex flex-col items-center gap-2.5">
      <div class="w-56 sm:w-64 h-1 rounded-full bg-white/10 overflow-hidden">
        <div
          class="h-full bg-cyan-400 rounded-full transition-all duration-200 ease-out"
          :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }"
        ></div>
      </div>
      <span class="text-[11px] font-semibold text-white/30 tracking-wide">Chargement...</span>
    </div>

  </div>
</template>
