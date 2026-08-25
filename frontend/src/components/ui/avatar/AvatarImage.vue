<script setup>
import { AvatarImage } from 'radix-vue'
import { cn } from '../../../lib/utils'

const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  alt: {
    type: String,
    default: ''
  },
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <AvatarImage :src="props.src" :alt="props.alt" :class="cn('aspect-square h-full w-full object-cover', props.class)" />
</template>
