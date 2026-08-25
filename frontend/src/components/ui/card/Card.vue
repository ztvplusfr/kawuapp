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
  <div :class="cn('rounded-3xl border border-white/10 bg-white/[0.03] text-white backdrop-blur-2xl shadow-xl transition-all', props.class)">
    <slot />
  </div>
</template>
