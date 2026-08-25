<script setup>
import { DialogPortal, DialogOverlay, DialogContent, DialogClose } from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <DialogPortal>
    <DialogOverlay class="fixed inset-0 z-50 bg-[#07090e]/80 backdrop-blur-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
    <DialogContent
      :class="cn('fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-cyan-500/20 bg-[#0b0e14]/95 p-6 shadow-2xl shadow-cyan-950/50 backdrop-blur-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-3xl text-white', props.class)"
    >
      <slot />
      <DialogClose class="absolute right-4 top-4 rounded-full p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
        ✕
      </DialogClose>
    </DialogContent>
  </DialogPortal>
</template>
