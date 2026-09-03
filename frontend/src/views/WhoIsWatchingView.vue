<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { IconUser, IconPlus, IconSettings, IconLogout2 } from '@tabler/icons-vue'
import kawuLogo from '../assets/kawu-logo-full.svg'

const router = useRouter()
const { userName, userAvatar, logout } = useAuth()

function enterApp() {
  router.push('/home')
}

function handleLogout() {
  logout()
  router.push('/')
}
</script>

<template>
  <div class="relative w-full min-h-screen bg-black text-white flex flex-col items-center select-none overflow-hidden">

    <!-- Ambient Glow -->
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[50rem] h-[30rem] bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none"></div>

    <!-- Logo Top Center -->
    <div class="relative z-10 pt-10 sm:pt-12">
      <img :src="kawuLogo" alt="Kawu" class="h-6 sm:h-7 w-auto object-contain" />
    </div>

    <!-- Main Content -->
    <div class="relative z-10 flex-1 flex flex-col items-center justify-center gap-10 sm:gap-12 px-6 -mt-10">

      <h1 class="text-3xl sm:text-4xl font-black text-white text-center tracking-tight">
        Qui regarde aujourd'hui ?
      </h1>

      <!-- Profile Tiles Row -->
      <div class="flex items-start gap-6 sm:gap-8">

        <!-- Real User Profile -->
        <button
          @click="enterApp"
          class="group/tile flex flex-col items-center gap-3 cursor-pointer"
        >
          <div class="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-gradient-to-br from-cyan-500/30 to-blue-600/30 border-2 border-transparent group-hover/tile:border-cyan-400 transition-all duration-200 shadow-xl group-hover/tile:scale-105 flex items-center justify-center">
            <img v-if="userAvatar" :src="userAvatar" :alt="userName" class="w-full h-full object-cover" />
            <IconUser v-else :size="44" :stroke-width="1.5" class="text-cyan-300" />
          </div>
          <div class="flex flex-col items-center gap-0.5">
            <span class="text-sm sm:text-base font-bold text-white/80 group-hover/tile:text-white transition-colors">{{ userName }}</span>
            <span class="text-[11px] font-semibold text-cyan-400/80 uppercase tracking-wider">Propriétaire</span>
          </div>
        </button>

        <!-- Add Profile (decorative — Kawu is single-profile for now) -->
        <button
          title="Bientôt disponible"
          class="group/tile flex flex-col items-center gap-3 cursor-not-allowed opacity-60"
        >
          <div class="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl border-2 border-dashed border-white/20 flex items-center justify-center">
            <IconPlus :size="34" :stroke-width="1.5" class="text-white/40" />
          </div>
          <span class="text-sm sm:text-base font-bold text-white/40">Ajouter un profil</span>
        </button>

      </div>

      <!-- Footer Links -->
      <div class="flex flex-col items-center gap-4 pt-4">
        <button
          title="Bientôt disponible"
          class="flex items-center gap-2 text-white/50 hover:text-white/70 text-sm font-semibold tracking-wide transition-colors cursor-not-allowed"
        >
          <IconSettings :size="16" :stroke-width="2" />
          <span>Gérer les profils</span>
        </button>
        <button
          @click="handleLogout"
          class="flex items-center gap-2 text-white/40 hover:text-white transition-colors cursor-pointer text-xs"
        >
          <IconLogout2 :size="14" :stroke-width="2" />
          <span>Ce n'est pas vous ? Se déconnecter</span>
        </button>
      </div>

    </div>

  </div>
</template>
