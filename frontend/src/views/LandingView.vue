<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import {
  IconMovie,
  IconDeviceTv,
  IconSparkles,
  IconPlayerPlay,
  IconChevronRight,
  IconBan,
  IconFlame,
  IconDevices
} from '@tabler/icons-vue'
import appIcon from '../assets/appicon.png'
import googleGIcon from '../assets/google-g.svg'

const router = useRouter()
const { loginWithGoogle, isAuthenticating } = useAuth()
</script>

<template>
  <div class="relative min-h-screen bg-[#000000] text-white overflow-hidden flex flex-col justify-between select-none">
    
    <!-- Cinematic Layered Ambient Background -->
    <div class="fixed inset-0 z-0 pointer-events-none">
      <div class="absolute -top-40 left-1/2 -translate-x-1/2 w-[70rem] h-[35rem] bg-cyan-600/15 rounded-full blur-[180px]"></div>
      <div class="absolute bottom-0 left-1/4 w-[45rem] h-[30rem] bg-blue-600/10 rounded-full blur-[200px]"></div>
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.15)_0%,_transparent_60%)]"></div>
      <div class="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black"></div>
    </div>

    <!-- Header (Simple: Icon left, Google login right) -->
    <header class="relative z-30 flex items-center justify-between px-6 md:px-12 py-6 pt-8 max-w-7xl w-full mx-auto">
      <div class="flex items-center">
        <img :src="appIcon" alt="Kawu" class="w-10 h-10 object-contain hover:scale-105 transition-transform" />
      </div>

      <button 
        @click="loginWithGoogle"
        :disabled="isAuthenticating"
        class="group flex items-center gap-2.5 px-4 py-2 bg-white/10 hover:bg-white/15 active:scale-95 border border-white/15 hover:border-cyan-400/40 text-white font-semibold rounded-xl text-sm transition-all shadow-lg backdrop-blur-md disabled:opacity-60 cursor-pointer"
      >
        <img :src="googleGIcon" alt="Google" class="w-4 h-4 object-contain" />
        <span>{{ isAuthenticating ? 'Connexion...' : 'Se connecter' }}</span>
      </button>
    </header>

    <!-- Main Content -->
    <main class="relative z-20 flex-1 flex flex-col items-center justify-center text-center px-4 py-8 max-w-5xl mx-auto my-auto w-full">
      
      <!-- Top Minimal Badge -->
      <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 backdrop-blur-xl mb-6 shadow-lg shadow-cyan-950/40">
        <IconSparkles :size="15" :stroke-width="2.2" class="text-cyan-400 animate-pulse" />
        <span class="text-xs font-semibold tracking-wide text-cyan-300">100% GRATUIT • SANS PUB • ILLIMITÉ</span>
      </div>
      
      <!-- Main Title -->
      <h1 class="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[1.08] max-w-4xl mb-5 bg-gradient-to-b from-white via-white to-white/70 bg-clip-text text-transparent">
        Films, séries & animés.
      </h1>
      
      <!-- Short Subtitle -->
      <p class="text-base sm:text-xl text-white/60 mb-8 max-w-2xl font-normal leading-relaxed">
        Accédez à l'ensemble du catalogue en haute définition. Gratuit, sans abonnement et sans interruption publicitaire.
      </p>

      <!-- Primary CTA Google Login Button -->
      <div class="flex flex-col items-center gap-3 w-full max-w-md mb-12">
        <button 
          @click="loginWithGoogle"
          :disabled="isAuthenticating"
          class="group w-full py-4 px-8 bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] text-slate-950 font-black rounded-2xl text-base sm:text-lg transition-all flex items-center justify-center gap-3.5 shadow-2xl shadow-cyan-500/30 hover:shadow-cyan-400/50 disabled:opacity-70 cursor-pointer"
        >
          <div class="w-7 h-7 rounded-full bg-white flex items-center justify-center p-1 shadow-sm shrink-0">
            <img :src="googleGIcon" alt="Google" class="w-full h-full object-contain" />
          </div>
          <span class="tracking-tight">{{ isAuthenticating ? 'Connexion en cours...' : 'Commencer avec Google' }}</span>
          <IconChevronRight :size="20" :stroke-width="3" class="group-hover:translate-x-1 transition-transform ml-auto text-slate-900" />
        </button>
        <span class="text-xs text-white/40 font-medium">Connexion en un clic • Aucune carte bancaire requise</span>
      </div>

      <!-- 3 Key Pillars: Films, Séries, Animés (Simple, Clean, Modern Cards) -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full max-w-3xl text-left">
        
        <!-- Pillar 1: Films -->
        <div class="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 transition-colors backdrop-blur-xl flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center shrink-0 text-cyan-400">
            <IconMovie :size="20" :stroke-width="2" />
          </div>
          <div>
            <h2 class="text-sm font-bold text-white">Films</h2>
            <p class="text-xs text-white/50">Blockbusters & classiques</p>
          </div>
        </div>

        <!-- Pillar 2: Séries -->
        <div class="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 transition-colors backdrop-blur-xl flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0 text-blue-400">
            <IconDeviceTv :size="20" :stroke-width="2" />
          </div>
          <div>
            <h2 class="text-sm font-bold text-white">Séries TV</h2>
            <p class="text-xs text-white/50">Saisons intégrales</p>
          </div>
        </div>

        <!-- Pillar 3: Animés -->
        <div class="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-cyan-500/30 transition-colors backdrop-blur-xl flex items-center gap-3.5">
          <div class="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0 text-purple-400">
            <IconFlame :size="20" :stroke-width="2" />
          </div>
          <div>
            <h2 class="text-sm font-bold text-white">Animés</h2>
            <p class="text-xs text-white/50">VF & VOSTFR en continu</p>
          </div>
        </div>

      </div>

    </main>

    <!-- Minimal Clean Footer -->
    <footer class="relative z-20 py-5 px-6 text-center text-xs text-white/30 border-t border-white/5 max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
      <span>Gratuit & sans publicité • Kawu Streaming</span>
      <span>Films • Séries • Animés</span>
    </footer>

  </div>
</template>
