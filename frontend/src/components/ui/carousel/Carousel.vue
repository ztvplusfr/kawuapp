<script setup>
import { ref, computed } from 'vue'
import emblaCarouselVue from 'embla-carousel-vue'
import { useProvideCarousel } from './useCarousel'
import { cn } from '../../../lib/utils'

const props = defineProps({
  opts: {
    type: Object,
    default: () => ({ loop: true })
  },
  plugins: {
    type: Array,
    default: () => []
  },
  orientation: {
    type: String,
    default: 'horizontal'
  },
  class: {
    type: String,
    default: ''
  }
})

const [emblaNode, emblaApi] = emblaCarouselVue(
  computed(() => ({
    ...props.opts,
    axis: props.orientation === 'horizontal' ? 'x' : 'y'
  })),
  props.plugins
)

const canScrollPrev = ref(false)
const canScrollNext = ref(false)

function onSelect(api) {
  canScrollPrev.value = api.canScrollPrev()
  canScrollNext.value = api.canScrollNext()
}

function scrollPrev() {
  emblaApi.value?.scrollPrev()
}

function scrollNext() {
  emblaApi.value?.scrollNext()
}

function scrollTo(index) {
  emblaApi.value?.scrollTo(index)
}

useProvideCarousel({
  carouselRef: emblaNode,
  carouselApi: emblaApi,
  canScrollPrev,
  canScrollNext,
  scrollPrev,
  scrollNext,
  scrollTo,
  orientation: props.orientation
})

defineExpose({
  canScrollPrev,
  canScrollNext,
  scrollPrev,
  scrollNext,
  scrollTo,
  emblaApi
})
</script>

<template>
  <div :class="cn('relative select-none', props.class)" role="region" aria-roledescription="carousel">
    <slot :can-scroll-prev="canScrollPrev" :can-scroll-next="canScrollNext" :scroll-prev="scrollPrev" :scroll-next="scrollNext" :scroll-to="scrollTo" :embla-api="emblaApi" />
  </div>
</template>
