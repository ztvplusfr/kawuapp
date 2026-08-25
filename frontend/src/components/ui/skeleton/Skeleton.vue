<script setup>
import { cn } from '../../../lib/utils'

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <div :class="cn('animate-pulse rounded-2xl bg-white/[0.06] border border-white/5', props.class)" />
</template>
