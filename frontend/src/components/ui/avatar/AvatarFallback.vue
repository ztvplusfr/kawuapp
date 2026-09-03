<script setup>
import { AvatarFallback } from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <AvatarFallback :class="cn('flex h-full w-full items-center justify-center rounded-full bg-slate-900 text-xs font-black text-cyan-400', props.class)">
    <slot />
  </AvatarFallback>
</template>
