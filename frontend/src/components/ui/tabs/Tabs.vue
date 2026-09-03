<script setup>
import { TabsRoot } from 'radix-vue'

const props = defineProps({
  defaultValue: {
    type: String,
    default: ''
  },
  modelValue: {
    type: String,
    default: undefined
  }
})

const emit = defineEmits(['update:modelValue'])
</script>

<template>
  <TabsRoot :default-value="props.defaultValue" :model-value="props.modelValue" @update:model-value="emit('update:modelValue', $event)">
    <slot />
  </TabsRoot>
</template>
