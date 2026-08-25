<script setup>
import { TabsContent } from 'radix-vue'
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
  <TabsContent :value="props.value" :class="cn('mt-2 ring-offset-background focus-visible:outline-none', props.class)">
    <slot />
  </TabsContent>
</template>
