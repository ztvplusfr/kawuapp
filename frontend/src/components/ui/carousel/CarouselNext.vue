<script setup>
import { useCarousel } from './useCarousel'
import { cn } from '../../../lib/utils'

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
})

const { orientation, scrollNext, canScrollNext } = useCarousel()
</script>

<template>
  <button
    type="button"
    :class="cn(
      'absolute z-30 h-10 w-10 rounded-full bg-[#0b0e14]/60 hover:bg-cyan-500 hover:text-slate-950 text-white border border-white/20 backdrop-blur-xl flex items-center justify-center text-sm font-bold transition-all shadow-xl cursor-pointer',
      orientation === 'horizontal'
        ? 'right-4 top-1/2 -translate-y-1/2'
        : '-bottom-12 left-1/2 -translate-x-1/2 rotate-90',
      props.class
    )"
    @click="scrollNext"
  >
    ›
  </button>
</template>
