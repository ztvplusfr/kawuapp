<script setup>
import { cva } from 'class-variance-authority'
import { cn } from '../../../lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2.5 py-0.5 text-[10px] font-bold transition-colors focus:outline-none select-none gap-1',
  {
    variants: {
      variant: {
        default: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
        cyan: 'bg-cyan-500 text-slate-950 font-black shadow-sm',
        emerald: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
        purple: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
        secondary: 'bg-white/10 text-white/90 border border-white/15 backdrop-blur-md',
        outline: 'text-white/70 border border-white/20',
        dark: 'bg-black/60 text-white/80 border border-white/10'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

const props = defineProps({
  variant: {
    type: String,
    default: 'default'
  },
  class: {
    type: String,
    default: ''
  }
})
</script>

<template>
  <span :class="cn(badgeVariants({ variant: props.variant }), props.class)">
    <slot />
  </span>
</template>
