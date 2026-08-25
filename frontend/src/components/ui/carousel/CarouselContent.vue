<script setup>
import { useCarousel } from './useCarousel'
import { cn } from '../../../lib/utils'

const props = defineProps({
  class: {
    type: String,
    default: ''
  }
})

const { carouselRef, orientation } = useCarousel()
</script>

<template>
  <div ref="carouselRef" class="overflow-hidden rounded-3xl">
    <div :class="cn('flex', orientation === 'horizontal' ? '-ml-4' : '-mt-4 flex-col', props.class)">
      <slot />
    </div>
  </div>
</template>
