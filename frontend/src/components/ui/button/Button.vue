<script setup>
import { cva } from 'class-variance-authority'
import { cn } from '../../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-xs font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-95 select-none gap-2',
  {
    variants: {
      variant: {
        default: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-950/40',
        cyan: 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-lg shadow-cyan-950/50',
        secondary: 'bg-white/10 hover:bg-white/15 text-white backdrop-blur-md border border-white/10',
        outline: 'border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 backdrop-blur-md',
        ghost: 'hover:bg-white/10 text-white/80 hover:text-white',
        glass: 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-white backdrop-blur-xl shadow-lg',
        white: 'bg-white hover:bg-gray-100 text-slate-950 font-black shadow-xl shadow-white/10'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-[11px]',
        lg: 'h-11 rounded-2xl px-6 text-sm',
        icon: 'h-9 w-9 rounded-xl'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

const props = defineProps({
  variant: {
    type: String,
    default: 'default'
  },
  size: {
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
  <button :class="cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)">
    <slot />
  </button>
</template>
