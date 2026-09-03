<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { showWelcomeScreen, userName, userAvatar, closeWelcomeScreen } = useAuth()

function enterApp() {
  closeWelcomeScreen()
  router.push('/profiles')
}
</script>

<template>
  <!-- FULLSCREEN CINEMATIC WELCOME MODAL ON GOOGLE LOGIN -->
  <Transition name="welcome">
    <div v-if="showWelcomeScreen"
         class="fixed inset-0 z-50 flex items-center justify-center bg-[#07090e]/95 backdrop-blur-3xl p-6 select-none">
      
      <!-- Ambient Radial Glows -->
      <div class="absolute w-[36rem] h-[36rem] bg-cyan-500/20 rounded-full blur-[140px] pointer-events-none animate-pulse"></div>
      <div class="absolute w-[28rem] h-[28rem] bg-blue-600/15 rounded-full blur-[120px] pointer-events-none"></div>

      <!-- Center Card -->
      <div class="relative z-10 max-w-md w-full flex flex-col items-center text-center gap-6 p-8 rounded-3xl bg-[#0e131d]/90 border border-cyan-500/30 shadow-2xl shadow-cyan-950/60 backdrop-blur-2xl animate-fade-in-up">
        
        <!-- Animated Avatar Ring -->
        <div class="relative flex items-center justify-center">
          <div class="absolute w-28 h-28 rounded-full bg-cyan-500/20 animate-ping"></div>
          <div class="relative w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-400 to-blue-600 shadow-xl shadow-cyan-500/30">
            <img v-if="userAvatar" :src="userAvatar" alt="Google Avatar" class="w-full h-full rounded-full object-cover"/>
            <div v-else class="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl font-black text-cyan-400">
              G
            </div>
          </div>
          <div class="absolute -bottom-1 px-2.5 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow">
            Connecté
          </div>
        </div>

        <!-- Greeting Header -->
        <div class="flex flex-col gap-1.5 mt-1">
          <span class="text-xs font-bold tracking-widest text-cyan-400 uppercase">✦ Authentification réussie ✦</span>
          <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Bienvenue, {{ userName }} !
          </h2>
          <p class="text-xs text-white/70 max-w-xs leading-relaxed">
            Votre compte Google est synchronisé et mémorisé. Accès au streaming illimité sans publicité activé.
          </p>
        </div>

        <!-- 3 Unlocked Benefits List -->
        <div class="w-full flex flex-col gap-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10">
          <div class="flex items-center gap-2.5 text-xs text-white/90 font-semibold">
            <span class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[11px] font-bold">✓</span>
            <span>Qualité 4K Ultra HD & Dolby Atmos débloquée</span>
          </div>
          <div class="flex items-center gap-2.5 text-xs text-white/90 font-semibold">
            <span class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[11px] font-bold">✓</span>
            <span>Historique & Favoris synchronisés</span>
          </div>
          <div class="flex items-center gap-2.5 text-xs text-white/90 font-semibold">
            <span class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[11px] font-bold">✓</span>
            <span>100% Gratuit et sans interruption pub à vie</span>
          </div>
        </div>

        <!-- Enter Kawu Button (Redirects to /home) -->
        <button @click="enterApp"
                class="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm rounded-xl shadow-xl shadow-cyan-950/60 transition-all duration-200 cursor-pointer active:scale-95 flex items-center justify-center gap-2 mt-1">
          <span>Entrer dans Kawu</span>
          <span class="text-base">›</span>
        </button>

      </div>

    </div>
  </Transition>
</template>

<style scoped>
.welcome-enter-active,
.welcome-leave-active {
  transition: opacity 0.4s ease, transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.welcome-enter-from,
.welcome-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
