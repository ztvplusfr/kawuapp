<script setup>
defineProps({
  label: {
    type: String,
    required: true
  },
  block: {
    type: Boolean,
    default: false
  }
})
</script>

<template>
  <span
    :class="[
      'bg-red-600 text-white font-bold leading-none shadow-md',
      block
        ? 'block w-full text-center px-2 py-2 text-[11px] sm:text-xs rounded-none'
        : 'inline-block px-2 py-1 text-[10px] sm:text-xs whitespace-nowrap rounded-md'
    ]"
  >
    {{ label }}
  </span>
</template>
