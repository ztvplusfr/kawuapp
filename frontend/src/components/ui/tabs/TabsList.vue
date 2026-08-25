<script setup>
import { TabsList } from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <TabsList :class="cn('inline-flex h-10 items-center justify-center rounded-2xl bg-white/[0.06] p-1 text-white/60 border border-white/10 backdrop-blur-md', props.class)">
    <slot />
  </TabsList>
</template>
