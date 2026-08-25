<script setup>
import { useAuth } from '../composables/useAuth'
import LandingView from './LandingView.vue'
import HomeView from './HomeView.vue'

const { isLoggedIn } = useAuth()
</script>

<template>
  <component :is="isLoggedIn ? HomeView : LandingView" />
</template>
