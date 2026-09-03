<script setup>
import { TabsTrigger } from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps({
  value: {
    type: String,
    required: true
  },
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <TabsTrigger
    :value="props.value"
    :class="cn('inline-flex items-center justify-center whitespace-nowrap rounded-xl px-3.5 py-1.5 text-xs font-bold ring-offset-background transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border data-[state=active]:border-cyan-500/40 data-[state=active]:shadow-sm cursor-pointer', props.class)"
  >
    <slot />
  </TabsTrigger>
</template>
