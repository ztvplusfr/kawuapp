<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { useUserPreferences } from '../composables/useUserPreferences'
import { getUserStats } from '../services/api/statsService'
import {
  IconClock,
  IconMovie,
  IconDeviceTv,
  IconPlayerPlay,
  IconChartBar,
  IconFlame,
  IconHistory,
  IconTrophy,
  IconCalendarStats,
  IconDeviceDesktopAnalytics,
  IconAdjustments,
  IconCheck,
  IconArrowLeft,
  IconUser,
  IconLogout
} from '@tabler/icons-vue'
import Skeleton from '../components/ui/skeleton/Skeleton.vue'
import kawuLogo from '../assets/kawu-logo-full.svg'
import { APP_VERSION } from '../version'

const router = useRouter()
const { isLoggedIn, userId, userName, userAvatar, logout } = useAuth()
const { preferredLanguage } = useUserPreferences()

// Leave room for macOS's traffic-light buttons (top-left) so the logo doesn't overlap them
const isMac = ref(false)
if (typeof navigator !== 'undefined') {
  const ua = navigator.userAgent.toLowerCase()
  const plat = (navigator.platform || '').toLowerCase()
  isMac.value = plat.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')
}

const isAvatarMenuOpen = ref(false)

function goBackToKawu() {
  router.push('/home')
}

function handleLogout() {
  logout()
  router.push('/')
}

const activeTab = ref('sessions') // 'sessions' | 'preferences'

const TABS = [
  { id: 'sessions', label: 'Statistiques', icon: IconDeviceDesktopAnalytics },
  { id: 'preferences', label: 'Préférences', icon: IconAdjustments }
]

const stats = ref(null)
const isLoading = ref(true)

async function loadStats() {
  if (!isLoggedIn.value || !userId.value) {
    stats.value = null
    isLoading.value = false
    return
  }
  isLoading.value = true
  stats.value = await getUserStats(userId.value)
  isLoading.value = false
}

onMounted(loadStats)
watch([isLoggedIn, userId], loadStats)

function formatDuration(totalSeconds) {
  const s = Math.round(totalSeconds || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return `${m}min`
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const overviewTiles = computed(() => {
  if (!stats.value) return []
  return [
    { icon: IconClock, value: formatDuration(stats.value.totalSeconds), label: 'Temps total' },
    { icon: IconMovie, value: String(stats.value.moviesWatched), label: 'Films vus' },
    { icon: IconDeviceTv, value: String(stats.value.episodesWatched), label: 'Épisodes' },
    { icon: IconPlayerPlay, value: formatDuration(stats.value.avgSessionSeconds), label: 'Moy. / session' },
    { icon: IconChartBar, value: `${stats.value.completionRate}%`, label: 'Taux complétion' },
    { icon: IconFlame, value: `${stats.value.streak}j`, label: 'Streak' }
  ]
})
</script>

<template>
  <div class="relative w-full min-h-screen bg-black text-white select-none">

    <!-- MINIMAL HEADER: Logo left, Avatar right (dedicated Settings "window") -->
    <header class="fixed top-0 left-0 right-0 z-50 h-16 flex items-center justify-between px-6 sm:px-8 lg:px-10 bg-black border-b border-white/10" style="--wails-draggable: drag;">
      <button
        @click="goBackToKawu"
        :class="['flex items-center gap-2 p-1 rounded-xl hover:opacity-80 transition-all cursor-pointer', isMac ? 'ml-16 sm:ml-18' : 'ml-0']"
        style="--wails-draggable: no-drag;"
        title="Retour à Kawu"
      >
        <img :src="kawuLogo" alt="Kawu" class="h-4 sm:h-5 w-auto object-contain" />
      </button>

      <div class="relative" style="--wails-draggable: no-drag;">
        <button
          @click="isAvatarMenuOpen = !isAvatarMenuOpen"
          class="w-8 h-8 rounded-full bg-slate-950 border border-white/10 flex items-center justify-center overflow-hidden cursor-pointer"
        >
          <img v-if="userAvatar" :src="userAvatar" alt="Avatar" class="w-full h-full object-cover" />
          <IconUser v-else :size="16" :stroke-width="2" class="text-cyan-400" />
        </button>

        <div
          v-if="isAvatarMenuOpen"
          @click="isAvatarMenuOpen = false"
          class="fixed inset-0 z-40"
        ></div>

        <div
          v-if="isAvatarMenuOpen"
          class="absolute right-0 top-11 z-50 w-52 rounded-2xl bg-black border border-white/10 shadow-2xl overflow-hidden"
        >
          <button
            @click="goBackToKawu"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <IconArrowLeft :size="16" :stroke-width="2" />
            <span>Retour à Kawu</span>
          </button>
          <div class="my-1 border-t border-white/10"></div>
          <button
            @click="handleLogout"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <IconLogout :size="16" :stroke-width="2" />
            <span>Se déconnecter</span>
          </button>
        </div>
      </div>
    </header>

    <div class="pb-24 pt-24 px-6 sm:px-12 lg:px-16">
    <div class="max-w-6xl mx-auto flex flex-col gap-2">

      <h1 class="text-3xl sm:text-4xl font-black text-white mb-8">Réglages</h1>

      <div class="flex flex-col md:flex-row gap-10">

        <!-- LEFT SIDEBAR NAV -->
        <nav class="flex flex-col gap-1 md:w-56 shrink-0">
          <button
            @click="goBackToKawu"
            class="flex items-center gap-2 px-4 py-2.5 mb-3 text-sm font-bold text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <IconArrowLeft :size="16" :stroke-width="2" />
            <span>Retour à Kawu</span>
          </button>
          <div class="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            <button
              v-for="tab in TABS"
              :key="tab.id"
              @click="activeTab = tab.id"
              :class="[
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap',
                activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
              ]"
            >
              <component :is="tab.icon" :size="18" :stroke-width="1.75" />
              <span>{{ tab.label }}</span>
            </button>
          </div>
          <div class="mt-auto pt-6 px-4 hidden md:block">
            <span class="text-[11px] font-mono text-white/30 tracking-wider">Kawu v{{ APP_VERSION }}</span>
          </div>
        </nav>

        <!-- RIGHT CONTENT -->
        <div class="flex-1 min-w-0 flex flex-col gap-6">

          <!-- ============ SESSIONS TAB ============ -->
          <template v-if="activeTab === 'sessions'">

            <div class="flex flex-col gap-1">
              <h2 class="text-xl font-black text-white">Statistiques</h2>
              <p class="text-sm text-white/50">Ton activité de visionnage sur Kawu</p>
            </div>

            <div v-if="!isLoggedIn" class="rounded-2xl border border-white/10 bg-[#0a0d14] p-10 text-center text-white/50 text-sm">
              Connecte-toi pour voir tes statistiques de visionnage.
            </div>

            <div v-else-if="isLoading" class="flex flex-col gap-6">
              <Skeleton class="h-32 w-full rounded-2xl" />
              <Skeleton class="h-24 w-full rounded-2xl" />
              <Skeleton class="h-48 w-full rounded-2xl" />
            </div>

            <div v-else-if="!stats || stats.history.length === 0" class="rounded-2xl border border-white/10 bg-[#0a0d14] p-10 text-center text-white/50 text-sm">
              Aucune activité de visionnage enregistrée pour le moment. Regarde un film ou un épisode pour commencer à générer des statistiques.
            </div>

            <template v-else>

              <!-- VUE D'ENSEMBLE -->
              <div class="rounded-2xl border border-white/10 bg-[#0a0d14] p-6 flex flex-col gap-5">
                <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest">Vue d'ensemble</h3>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div
                    v-for="tile in overviewTiles"
                    :key="tile.label"
                    class="flex flex-col items-center gap-2 rounded-xl bg-white/[0.03] border border-white/5 py-5 px-2"
                  >
                    <component :is="tile.icon" :size="20" :stroke-width="1.75" class="text-cyan-400" />
                    <span class="text-xl font-black text-white">{{ tile.value }}</span>
                    <span class="text-[10px] font-semibold uppercase tracking-wider text-white/40 text-center">{{ tile.label }}</span>
                  </div>
                </div>
              </div>

              <!-- RATIO FILMS / SÉRIES -->
              <div class="rounded-2xl border border-white/10 bg-[#0a0d14] p-6 flex flex-col gap-5">
                <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest">Ratio Films / Séries</h3>
                <div class="flex flex-col gap-4">
                  <div class="flex items-center gap-4">
                    <span class="w-14 text-sm text-white/70 shrink-0">Films</span>
                    <div class="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div class="h-full rounded-full bg-cyan-400 transition-all duration-500" :style="{ width: `${stats.filmsPct}%` }"></div>
                    </div>
                    <span class="w-12 text-sm font-bold text-white text-right shrink-0">{{ stats.filmsPct }}%</span>
                  </div>
                  <div class="flex items-center gap-4">
                    <span class="w-14 text-sm text-white/70 shrink-0">Séries</span>
                    <div class="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                      <div class="h-full rounded-full bg-blue-500 transition-all duration-500" :style="{ width: `${stats.seriesPct}%` }"></div>
                    </div>
                    <span class="w-12 text-sm font-bold text-white text-right shrink-0">{{ stats.seriesPct }}%</span>
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <!-- TOP 3 SÉRIES -->
                <div class="rounded-2xl border border-white/10 bg-[#0a0d14] p-6 flex flex-col gap-4">
                  <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <IconTrophy :size="14" />
                    <span>Top 3 séries les plus regardées</span>
                  </h3>
                  <div v-if="stats.topSeries.length === 0" class="text-sm text-white/40 py-4 text-center">
                    Aucune série regardée pour l'instant.
                  </div>
                  <div v-else class="flex flex-col gap-3">
                    <div
                      v-for="(serie, idx) in stats.topSeries"
                      :key="serie.contentId"
                      class="flex items-center gap-3"
                    >
                      <span class="text-lg font-black text-white/30 w-5 shrink-0">#{{ idx + 1 }}</span>
                      <div class="w-11 h-16 rounded-lg overflow-hidden bg-white/5 shrink-0 bg-cover bg-center" :style="{ backgroundImage: `url(${serie.poster})` }"></div>
                      <div class="min-w-0 flex-1">
                        <span class="block truncate font-bold text-white text-sm">{{ serie.title }}</span>
                        <span class="block text-xs text-white/50">{{ serie.episodeCount }} épisode{{ serie.episodeCount > 1 ? 's' : '' }} · {{ formatDuration(serie.totalSeconds) }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- CE MOIS-CI -->
                <div class="rounded-2xl border border-white/10 bg-[#0a0d14] p-6 flex flex-col gap-4">
                  <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                    <IconCalendarStats :size="14" />
                    <span>Ce mois-ci</span>
                  </h3>
                  <div class="grid grid-cols-2 gap-3 flex-1">
                    <div class="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.03] border border-white/5 py-6">
                      <span class="text-2xl font-black text-white">{{ stats.monthMovies }}</span>
                      <span class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Films</span>
                    </div>
                    <div class="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white/[0.03] border border-white/5 py-6">
                      <span class="text-2xl font-black text-white">{{ stats.monthEpisodes }}</span>
                      <span class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Épisodes</span>
                    </div>
                  </div>
                </div>

              </div>

              <!-- HISTORIQUE -->
              <div class="rounded-2xl border border-white/10 bg-[#0a0d14] p-6 flex flex-col gap-4">
                <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                  <IconHistory :size="14" />
                  <span>Historique ({{ stats.history.length }})</span>
                </h3>
                <div class="flex flex-col divide-y divide-white/5 max-h-[480px] overflow-y-auto">
                  <div
                    v-for="item in stats.history"
                    :key="item.groupKey + item.startedAt"
                    class="flex items-center gap-3 py-3"
                  >
                    <div class="w-10 h-14 rounded-lg overflow-hidden bg-white/5 shrink-0 bg-cover bg-center" :style="{ backgroundImage: `url(${item.poster})` }"></div>
                    <div class="min-w-0 flex-1">
                      <span class="block truncate font-semibold text-white text-sm">{{ item.title }}</span>
                      <span class="block text-xs text-white/50">
                        {{ item.mediaType === 'tv' ? `S${item.season} · Épisode ${item.episode}` : 'Film' }}
                        · {{ formatDuration(item.durationSeconds) }}
                        <span v-if="item.completed" class="text-emerald-400">· Terminé</span>
                      </span>
                    </div>
                    <span class="text-[11px] text-white/30 shrink-0">{{ formatDate(item.startedAt) }}</span>
                  </div>
                </div>
              </div>

            </template>

          </template>

          <!-- ============ PRÉFÉRENCES TAB ============ -->
          <template v-else-if="activeTab === 'preferences'">

            <div class="flex flex-col gap-1">
              <h2 class="text-xl font-black text-white">Préférences</h2>
              <p class="text-sm text-white/50">Personnalise ton expérience Kawu</p>
            </div>

            <div class="rounded-2xl border border-white/10 bg-[#0a0d14] p-6 flex flex-col gap-4">
              <h3 class="text-xs font-black text-cyan-400 uppercase tracking-widest">Langue par défaut</h3>
              <p class="text-xs text-white/40 -mt-2">
                Langue utilisée automatiquement quand un titre est disponible en VF et en VOSTFR.
              </p>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                <button
                  @click="preferredLanguage = 'vf'"
                  :class="[
                    'flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all cursor-pointer',
                    preferredLanguage === 'vf' ? 'bg-cyan-500/10 border-cyan-400/60' : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                  ]"
                >
                  <div class="flex flex-col items-start">
                    <span class="text-sm font-bold text-white">VF</span>
                    <span class="text-xs text-white/40">Version Française</span>
                  </div>
                  <IconCheck v-if="preferredLanguage === 'vf'" :size="18" :stroke-width="2.5" class="text-cyan-400" />
                </button>

                <button
                  @click="preferredLanguage = 'vostfr'"
                  :class="[
                    'flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all cursor-pointer',
                    preferredLanguage === 'vostfr' ? 'bg-cyan-500/10 border-cyan-400/60' : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                  ]"
                >
                  <div class="flex flex-col items-start">
                    <span class="text-sm font-bold text-white">VOSTFR</span>
                    <span class="text-xs text-white/40">Version Originale Sous-titrée</span>
                  </div>
                  <IconCheck v-if="preferredLanguage === 'vostfr'" :size="18" :stroke-width="2.5" class="text-cyan-400" />
                </button>
              </div>
            </div>

          </template>

        </div>

      </div>

    </div>
    </div>
  </div>
</template>
