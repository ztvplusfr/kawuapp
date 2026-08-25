<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCoupledMediaDetails } from '../services/api/mediaService'
import { getSeasonEpisodes } from '../services/tmdb'
import { toggleWatchlist, getUserWatchlistCoupled } from '../services/api/watchService'
import { getWatchlist, supabase } from '../services/supabase'
import MediaRow from '../components/MediaRow.vue'
import MediaCard from '../components/MediaCard.vue'
import { BrowserOpenURL } from '../../wailsjs/runtime/runtime'

// Tabler Stroke Icons
import {
  IconPlayerPlay,
  IconPlus,
  IconCheck,
  IconMovie,
  IconChevronLeft,
  IconChevronDown,
  IconUser,
  IconBrandYoutube,
  IconExternalLink,
  IconArrowsSort,
  IconRotate2,
  IconClock
} from '@tabler/icons-vue'

// Shadcn Vue Skeleton Component
import Skeleton from '../components/ui/skeleton/Skeleton.vue'

import { useAuth } from '../composables/useAuth'

const { isLoggedIn, userProfile } = useAuth()
const route = useRoute()
const router = useRouter()

const media = ref(null)
const isLoading = ref(true)
const activeTab = ref('cast') // 'episodes' | 'cast' | 'similar' | 'extras'
const selectedSeason = ref(1)
const episodes = ref([])
const isSynopsisExpanded = ref(false)
const isInList = ref(false)
const sortOrder = ref('asc') // 'asc' | 'desc' | 'rating'

// Watch Progress State
const watchProgressList = ref([])
const isProgressLoading = ref(false)

function goToSimilarDetail(item) {
  const targetId = item.supabaseContentId || item.id
  const targetType = item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' || item.type === 'Série' || item.type === 'tv' ? 'tv' : 'movie')
  router.push({
    path: `/detail/${targetId}`,
    query: { type: targetType }
  })
}

const sortedEpisodes = computed(() => {
  if (!episodes.value || episodes.value.length === 0) return []
  const list = [...episodes.value]
  if (sortOrder.value === 'desc') {
    return list.sort((a, b) => b.episodeNumber - a.episodeNumber)
  }
  if (sortOrder.value === 'rating') {
    return list.sort((a, b) => {
      const rA = parseFloat(a.rating?.replace(/[^\d.]/g, '') || 0)
      const rB = parseFloat(b.rating?.replace(/[^\d.]/g, '') || 0)
      return rB - rA
    })
  }
  return list.sort((a, b) => a.episodeNumber - b.episodeNumber)
})

// Map of episode progress keyed by S{season}_E{episode}
const episodesProgressMap = computed(() => {
  const map = {}
  if (!watchProgressList.value || watchProgressList.value.length === 0) return map

  watchProgressList.value.forEach(item => {
    const s = Number(item.season) || 1
    const e = Number(item.episode) || 1
    const key = `S${s}_E${e}`
    
    const progSec = Number(item.progress_seconds || item.current_time || 0)
    const durSec = Number(item.duration_seconds || item.duration || 0)
    let percent = durSec > 0 
      ? Math.min(100, Math.round((progSec / durSec) * 100)) 
      : Number(item.progress || 0)
    
    const completed = item.completed || (durSec > 0 && progSec >= durSec * 0.9) || percent >= 90
    if (completed) percent = 100

    const minutesLeft = (durSec > progSec && durSec > 0) 
      ? Math.max(1, Math.round((durSec - progSec) / 60)) 
      : null

    map[key] = {
      season: s,
      episode: e,
      progressSeconds: progSec,
      durationSeconds: durSec,
      percent,
      completed,
      minutesLeft,
      updatedAt: item.updated_at
    }
  })

  return map
})

// Most recent progress entry across all seasons/episodes or movies
const latestProgress = computed(() => {
  if (!watchProgressList.value || watchProgressList.value.length === 0) return null
  const sorted = [...watchProgressList.value].sort((a, b) => {
    const dateA = new Date(a.updated_at || 0).getTime()
    const dateB = new Date(b.updated_at || 0).getTime()
    return dateB - dateA
  })
  const latest = sorted[0]
  if (!latest) return null

  const s = Number(latest.season) || 1
  const e = Number(latest.episode) || 1
  const progSec = Number(latest.progress_seconds || latest.current_time || 0)
  const durSec = Number(latest.duration_seconds || latest.duration || 0)
  let percent = durSec > 0 
    ? Math.min(100, Math.round((progSec / durSec) * 100)) 
    : Number(latest.progress || 0)

  const completed = latest.completed || (durSec > 0 && progSec >= durSec * 0.9) || percent >= 90
  if (completed) percent = 100

  const minutesLeft = (durSec > progSec && durSec > 0) 
    ? Math.max(1, Math.round((durSec - progSec) / 60)) 
    : null

  return {
    season: s,
    episode: e,
    progressSeconds: progSec,
    durationSeconds: durSec,
    percent,
    completed,
    minutesLeft,
    updatedAt: latest.updated_at
  }
})

// Dynamic Hero Play/Resume Button label
const heroPlayButtonText = computed(() => {
  if (!media.value) return 'Lecture'

  if (latestProgress.value) {
    if (media.value.type === 'Série') {
      if (!latestProgress.value.completed) {
        return `Reprendre S${latestProgress.value.season} E${latestProgress.value.episode}`
      } else {
        return `Regarder S${latestProgress.value.season} E${latestProgress.value.episode + 1}`
      }
    } else {
      return !latestProgress.value.completed ? 'Reprendre la lecture' : 'Recommencer'
    }
  }

  if (media.value.type === 'Série') {
    return `Regarder S${selectedSeason.value} E1`
  }

  return 'Lecture'
})

async function loadData(id) {
  isLoading.value = true
  try {
    const type = route.query.type || 'movie'
    const fullData = await getCoupledMediaDetails(id, type)
    if (fullData) {
      media.value = fullData
      if (media.value.type === 'Série') {
        activeTab.value = 'episodes'
        if (media.value.seasons && media.value.seasons.length > 0) {
          media.value.seasons = media.value.seasons.filter(s => s.season_number > 0)
          selectedSeason.value = media.value.seasons[0]?.season_number || 1
          await loadEpisodes(media.value.id, selectedSeason.value)
        }
      } else {
        activeTab.value = 'cast'
      }

      // Check Watchlist status & fetch Watch Progress
      await checkWatchlistStatus()
      await loadWatchProgress()
    }
  } catch (err) {
    console.error('Failed to load media details:', err)
  } finally {
    isLoading.value = false
  }
}

async function loadWatchProgress() {
  if (!media.value) return
  const targetId = media.value.supabaseContentId || media.value.id
  const tmdbId = media.value.id

  try {
    isProgressLoading.value = true
    let list = []

    if (isLoggedIn.value && userProfile.value?.id) {
      const { data, error } = await supabase
        .from('watch_progress')
        .select('*')
        .eq('user_id', String(userProfile.value.id))
        .order('updated_at', { ascending: false })

      if (!error && data) {
        list = data.filter(item => 
          String(item.content_id) === String(targetId) ||
          String(item.content_id) === String(tmdbId)
        )
      }
    }

    // Local storage fallback
    try {
      const localKey = `kawu_progress_${targetId}`
      const localStr = localStorage.getItem(localKey)
      if (localStr) {
        const parsed = JSON.parse(localStr)
        if (Array.isArray(parsed)) {
          parsed.forEach(localItem => {
            if (!list.some(i => i.season === localItem.season && i.episode === localItem.episode)) {
              list.push(localItem)
            }
          })
        }
      }
    } catch (e) {}

    watchProgressList.value = list

    // If latest progress is for a specific season in a series, set selectedSeason automatically to that season
    if (media.value?.type === 'Série' && latestProgress.value && latestProgress.value.season) {
      const hasSeason = media.value.seasons?.some(s => s.season_number === latestProgress.value.season)
      if (hasSeason && selectedSeason.value !== latestProgress.value.season) {
        selectedSeason.value = latestProgress.value.season
        loadEpisodes(media.value.id, selectedSeason.value)
      }
    }
  } catch (err) {
    console.warn('[DetailView] loadWatchProgress error:', err)
  } finally {
    isProgressLoading.value = false
  }
}

async function checkWatchlistStatus() {
  if (!isLoggedIn.value || !userProfile.value?.id || !media.value) {
    isInList.value = false
    return
  }
  try {
    const list = await getWatchlist(userProfile.value.id)
    const targetCheckId = media.value.supabaseContentId || media.value.id
    const tmdbId = media.value.id
    isInList.value = (list || []).some(item => 
      String(item.content_id) === String(targetCheckId) || 
      String(item.content_id) === String(tmdbId) ||
      String(item.media_id) === String(targetCheckId) || 
      String(item.media_id) === String(tmdbId)
    )
  } catch (e) {
    console.warn('[DetailView] Watchlist check error:', e)
  }
}

async function loadEpisodes(tvId, seasonNum) {
  const targetId = media.value?.id || tvId
  const currentSeasonObj = media.value?.seasons?.find(s => s.season_number === seasonNum) || media.value?.seasons?.[seasonNum - 1]
  const eps = await getSeasonEpisodes(targetId, seasonNum, currentSeasonObj)
  episodes.value = eps || []
}

function onSeasonChange(seasonNum) {
  selectedSeason.value = seasonNum
  if (media.value?.id) {
    loadEpisodes(media.value.id, seasonNum)
  }
}

function playMedia(episode = null, forceRestart = false) {
  const targetId = media.value?.supabaseContentId || media.value?.id || 1
  let s = selectedSeason.value
  let epNum = episode?.episodeNumber || 1
  let startTime = 0

  if (forceRestart) {
    s = 1
    epNum = 1
    startTime = 0
  } else if (episode) {
    // Specific episode clicked
    s = selectedSeason.value
    epNum = episode.episodeNumber
    const key = `S${s}_E${epNum}`
    const prog = episodesProgressMap.value[key]
    if (prog && !prog.completed) {
      startTime = prog.progressSeconds || 0
    }
  } else if (latestProgress.value) {
    // Hero main resume button clicked
    if (media.value?.type === 'Série') {
      if (!latestProgress.value.completed) {
        s = latestProgress.value.season
        epNum = latestProgress.value.episode
        startTime = latestProgress.value.progressSeconds || 0
      } else {
        s = latestProgress.value.season
        epNum = latestProgress.value.episode + 1
        startTime = 0
      }
    } else {
      if (!latestProgress.value.completed) {
        startTime = latestProgress.value.progressSeconds || 0
      }
    }
  }

  if (media.value?.type === 'Série') {
    selectedSeason.value = s
  }

  router.push({
    path: `/watch/${targetId}`,
    query: {
      type: media.value?.tmdbType || (media.value?.type === 'Série' ? 'tv' : 'movie'),
      season: s,
      episode: epNum,
      ...(startTime > 0 ? { t: Math.floor(startTime) } : {})
    }
  })
}

function openTrailerNativeGo() {
  if (media.value?.trailerKey) {
    const url = `https://www.youtube.com/watch?v=${media.value.trailerKey}`
    try {
      if (window.go?.main?.App?.OpenURL) {
        window.go.main.App.OpenURL(url)
      } else if (BrowserOpenURL) {
        BrowserOpenURL(url)
      } else {
        window.open(url, '_blank')
      }
    } catch (e) {
      window.open(url, '_blank')
    }
  }
}

async function toggleList() {
  if (!isLoggedIn.value || !userProfile.value?.id || !media.value) {
    isInList.value = !isInList.value
    return
  }
  const contentKey = media.value.supabaseContentId || media.value.id
  const newState = await toggleWatchlist(userProfile.value.id, contentKey)
  isInList.value = newState
}

function goBack() {
  router.back()
}

onMounted(() => {
  loadData(route.params.id)
})

watch(() => route.params.id, (newId) => {
  if (newId) loadData(newId)
})

watch([isLoggedIn, () => userProfile.value?.id], () => {
  checkWatchlistStatus()
  loadWatchProgress()
})
</script>

<template>
  <div class="relative w-full min-h-screen bg-[#000000] text-white select-none pb-20">
    
    <!-- Top Back Navigation -->
    <div class="absolute top-24 left-6 sm:left-12 z-40">
      <button @click="goBack"
              class="w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 backdrop-blur-md flex items-center justify-center text-white transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-xl">
        <IconChevronLeft :size="20" :stroke-width="2.5" />
      </button>
    </div>

    <!-- SKELETON LOADING STATE -->
    <div v-if="isLoading" class="flex flex-col gap-8">
      <div class="relative w-full h-[560px] sm:h-[620px] lg:h-[680px] overflow-hidden bg-[#0d111a] border-b border-white/10">
        <Skeleton class="absolute inset-0 w-full h-full rounded-none opacity-30" />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
        <div class="absolute inset-0 px-6 sm:px-12 lg:px-16 flex flex-col justify-end pb-12 max-w-3xl gap-4 z-20">
          <Skeleton class="h-16 w-3/4 max-w-md rounded-2xl bg-white/20" />
          <div class="flex items-center gap-3">
            <Skeleton class="h-5 w-12 rounded-md bg-white/15" />
            <Skeleton class="h-5 w-24 rounded-md bg-white/15" />
            <Skeleton class="h-5 w-20 rounded-md bg-white/15" />
            <Skeleton class="h-5 w-16 rounded-md bg-white/15" />
          </div>
          <Skeleton class="h-14 w-full rounded-xl bg-white/10" />
          <div class="flex items-center gap-4 pt-2">
            <Skeleton class="h-12 w-44 rounded-full bg-cyan-500/30" />
            <Skeleton class="h-12 w-44 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
      <div class="px-6 sm:px-12 lg:px-16 flex flex-col gap-6">
        <div class="flex items-center gap-3 border-b border-white/10 pb-4">
          <Skeleton class="h-8 w-32 rounded-full bg-white/15" />
          <Skeleton class="h-8 w-40 rounded-full bg-white/10" />
          <Skeleton class="h-8 w-32 rounded-full bg-white/10" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="n in 8" :key="n" class="aspect-video rounded-2xl bg-[#0d111a] border border-white/10 p-3 flex flex-col justify-between">
            <Skeleton class="absolute inset-0 w-full h-full rounded-none opacity-40" />
            <div class="relative z-10 flex justify-end">
              <Skeleton class="h-3.5 w-8 rounded bg-white/10" />
            </div>
            <div class="relative z-10 flex flex-col gap-1.5 items-center w-full px-2">
              <Skeleton class="h-4 w-3/5 rounded bg-white/20" />
              <Skeleton class="h-2 w-1/4 rounded bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MAIN MEDIA CONTENT (When loaded) -->
    <div v-else-if="media">
      <!-- 1. HERO BANNER STAGE -->
      <div class="relative w-full h-[560px] sm:h-[620px] lg:h-[680px] overflow-hidden">
      
      <!-- Full-Bleed 16:9 Backdrop Image -->
      <div class="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-105"
           :style="{ backgroundImage: `url(${media?.bgImg || media?.poster})` }">
      </div>

      <!-- Cinematic Dark Overlays -->
      <div class="absolute inset-0 bg-gradient-to-r from-black via-black/55 to-transparent"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>

      <!-- Hero Details Content Block -->
      <div class="absolute inset-0 px-6 sm:px-12 lg:px-16 flex flex-col justify-end pb-8 sm:pb-12 max-w-3xl z-20 gap-3.5">
        
        <!-- Official Clear PNG Logo or Real Title -->
        <div class="min-h-[50px] flex items-end">
          <img
            v-if="media?.logoUrl"
            :src="media.logoUrl"
            :alt="media.title"
            class="max-h-24 sm:max-h-32 md:max-h-36 max-w-[340px] sm:max-w-[460px] object-contain drop-shadow-[0_4px_20px_rgba(0,0,0,0.98)]"
          />
          <h1
            v-else
            class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.98)] font-sans"
          >
            {{ media?.title }}
          </h1>
        </div>

        <!-- Real TMDB Metadata Line -->
        <div class="flex items-center gap-2.5 text-xs font-semibold text-white/90 flex-wrap">
          
          <!-- Age Badge -->
          <span class="px-1.5 py-0.5 rounded border border-white/40 text-[10px] font-bold">
            {{ media?.age || '16+' }}
          </span>

          <!-- Real Runtime / Seasons count -->
          <span v-if="media?.runtimeStr">{{ media.runtimeStr }}</span>
          <span v-else-if="media?.numberOfSeasons">{{ media.numberOfSeasons }} {{ media.numberOfSeasons > 1 ? 'Saisons' : 'Saison' }}</span>

          <!-- Release Year -->
          <span v-if="media?.year">{{ media.year }}</span>

          <!-- Real Genres -->
          <span v-if="media?.genre" class="text-cyan-300">{{ media.genre }}</span>

          <!-- 4K Quality -->
          <span class="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30 text-[10px] font-bold text-cyan-300">
            {{ media?.quality || '4K UHD' }}
          </span>

          <!-- Audio Badge -->
          <span class="px-1.5 py-0.5 rounded bg-white/15 border border-white/20 text-[10px] font-bold tracking-wider">
            Dolby ATMOS
          </span>

          <!-- Real Rating -->
          <span v-if="media?.rating" class="text-emerald-400 font-black text-xs flex items-center gap-1">
            <span>{{ media.rating }}</span>
            <span v-if="media.voteCount" class="text-[10px] text-white/40 font-normal">({{ media.voteCount }})</span>
          </span>

        </div>

        <!-- Tagline if exists -->
        <div v-if="media?.tagline" class="text-xs sm:text-sm font-semibold text-white/80 italic">
          « {{ media.tagline }} »
        </div>

        <!-- Synopsis with "... Plus" expansion -->
        <div class="text-xs sm:text-sm text-white/75 leading-relaxed max-w-2xl">
          <p :class="[!isSynopsisExpanded && 'line-clamp-2']">
            {{ media?.synopsis }}
          </p>
          <button v-if="media?.synopsis && media.synopsis.length > 120"
                  @click="isSynopsisExpanded = !isSynopsisExpanded"
                  class="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline mt-1 cursor-pointer">
            {{ isSynopsisExpanded ? 'Moins' : 'Plus' }}
          </button>
        </div>

        <!-- ACTION BUTTONS ROW: [ ▶ Reprendre S2 E3 ]  [ 🔄 Recommencer ]  [ + ]  [ 🎬 Bande-annonce ] -->
        <div class="flex flex-col gap-3 pt-2">
          <div class="flex items-center gap-3 flex-wrap">
            
            <!-- Primary Solid Play/Resume Pill Button -->
            <button @click="playMedia()"
                    class="flex items-center gap-2.5 px-7 py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-black text-sm rounded-full shadow-2xl shadow-cyan-500/30 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105">
              <IconPlayerPlay :size="18" :stroke-width="3" class="fill-current" />
              <span>{{ heroPlayButtonText }}</span>
            </button>

            <!-- Recommencer Button (if progress exists) -->
            <button v-if="latestProgress"
                    @click="playMedia(null, true)"
                    title="Recommencer depuis le début"
                    class="flex items-center gap-2 px-4 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 text-xs font-bold">
              <IconRotate2 :size="16" :stroke-width="2.5" />
              <span>Recommencer</span>
            </button>

            <!-- Add to My List (+) -->
            <button @click="toggleList"
                    title="Ajouter à ma liste"
                    :class="[
                      'w-11 h-11 rounded-full border backdrop-blur-md flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-lg',
                      isInList ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                    ]">
              <IconCheck v-if="isInList" :size="19" :stroke-width="2.5" />
              <IconPlus v-else :size="19" :stroke-width="2" />
            </button>

            <!-- Trailer / Extras Button (🎬) -->
            <button v-if="media?.trailerKey"
                    @click="openTrailerNativeGo"
                    title="Bande-annonce"
                    class="flex items-center gap-2 px-5 py-3 rounded-full bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-lg text-xs font-bold">
              <IconMovie :size="17" :stroke-width="2" />
              <span>Bande-annonce</span>
            </button>

          </div>

          <!-- Hero Watch Progress Bar (When in progress) -->
          <div v-if="latestProgress && latestProgress.percent > 0 && !latestProgress.completed"
               class="flex items-center gap-3 max-w-md bg-black/50 border border-white/15 backdrop-blur-md rounded-2xl px-4 py-2">
            <div class="flex-1 bg-white/15 h-2 rounded-full overflow-hidden">
              <div class="bg-cyan-400 h-full rounded-full transition-all duration-500 shadow-sm"
                   :style="{ width: `${latestProgress.percent}%` }"></div>
            </div>
            <span class="text-xs font-bold text-cyan-300 whitespace-nowrap flex items-center gap-1.5">
              <IconClock :size="13" />
              <span>{{ latestProgress.percent }}%</span>
              <span v-if="latestProgress.minutesLeft" class="text-white/70 font-normal">({{ latestProgress.minutesLeft }} min res.)</span>
            </span>
          </div>
        </div>

      </div>

    </div>

    <!-- 2. NAVIGATION TABS (Pill Switcher) -->
    <div class="px-6 sm:px-12 lg:px-16 pt-6 flex flex-col gap-8">
      
      <!-- Pills Header -->
      <div class="flex items-center gap-3 border-b border-white/10 pb-4 overflow-x-auto">
        
        <!-- Tab: Épisodes (for series) -->
        <button
          v-if="media?.type === 'Série'"
          @click="activeTab = 'episodes'"
          :class="[
            'px-5 py-2 rounded-full text-xs font-black transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'episodes'
              ? 'bg-transparent text-white border border-white shadow-lg'
              : 'text-white/60 hover:text-white'
          ]"
        >
          Épisodes ({{ media?.numberOfEpisodes || episodes.length }})
        </button>

        <!-- Tab: Distribution / Acteurs en Grand Format -->
        <button
          @click="activeTab = 'cast'"
          :class="[
            'px-5 py-2 rounded-full text-xs font-black transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'cast'
              ? 'bg-transparent text-white border border-white shadow-lg'
              : 'text-white/60 hover:text-white'
          ]"
        >
          Distribution & Acteurs ({{ media?.actors?.length || 0 }})
        </button>

        <!-- Tab: Titres similaires -->
        <button
          @click="activeTab = 'similar'"
          :class="[
            'px-5 py-2 rounded-full text-xs font-black transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'similar'
              ? 'bg-transparent text-white border border-white shadow-lg'
              : 'text-white/60 hover:text-white'
          ]"
        >
          Titres similaires
        </button>

        <!-- Tab: Extras / Bandes-annonces -->
        <button
          v-if="media?.trailerKey"
          @click="activeTab = 'extras'"
          :class="[
            'px-5 py-2 rounded-full text-xs font-black transition-all cursor-pointer whitespace-nowrap',
            activeTab === 'extras'
              ? 'bg-transparent text-white border border-white shadow-lg'
              : 'text-white/60 hover:text-white'
          ]"
        >
          Bande-annonce & Vidéos
        </button>

      </div>

      <!-- 3. TAB CONTENTS -->
      
      <!-- A. CAST & ACTORS TAB (Large High-Res Portrait Cards for Desktop) -->
      <div v-if="activeTab === 'cast'" class="flex flex-col gap-6">
        
        <div v-if="media?.director" class="text-xs text-white/70">
          <span class="font-bold text-white">Réalisation / Création :</span> {{ media.director }}
        </div>

        <!-- Large Desktop Portrait Cards Grid -->
        <div v-if="media?.actors && media.actors.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
          <div
            v-for="actor in media.actors"
            :key="actor.id"
            class="group/actor relative aspect-[2/3] rounded-2xl overflow-hidden bg-[#0d121c] border border-white/10 hover:border-cyan-400/60 transition-all duration-300 hover:scale-[1.04] shadow-xl hover:shadow-2xl hover:shadow-black/90 flex flex-col justify-end p-4"
          >
            <!-- Large Full Portrait Photo -->
            <img
              v-if="actor.photo"
              :src="actor.photo"
              :alt="actor.name"
              class="absolute inset-0 w-full h-full object-cover group-hover/actor:scale-105 transition-transform duration-500"
            />
            <div v-else class="absolute inset-0 w-full h-full bg-[#121622] flex items-center justify-center text-white/30">
              <IconUser :size="48" :stroke-width="1.5" />
            </div>

            <!-- Dark Gradient Overlay for Readability -->
            <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>

            <!-- Actor & Character Names in Foreground -->
            <div class="relative z-10 flex flex-col gap-0.5">
              <span class="text-sm sm:text-base font-black text-white group-hover/actor:text-cyan-300 transition-colors drop-shadow-md">
                {{ actor.name }}
              </span>
              <span v-if="actor.character" class="text-xs font-semibold text-white/70 truncate drop-shadow-sm">
                {{ actor.character }}
              </span>
            </div>
          </div>
        </div>

        <div v-else class="text-xs text-white/50 p-8 text-center">
          Informations de casting non disponibles pour ce titre.
        </div>
      </div>

      <!-- B. EPISODES TAB -->
      <div v-else-if="activeTab === 'episodes' && media?.type === 'Série'" class="flex flex-col gap-6">
        
        <!-- Season Selector & Filter By Order Dropdown Row -->
        <div class="flex items-center justify-between flex-wrap gap-4">
          
          <div class="flex items-center gap-3 flex-wrap">
            <!-- 1. Season Selector Dropdown -->
            <div v-if="media?.seasons && media.seasons.length > 0" class="relative inline-block">
              <select
                :value="selectedSeason"
                @change="onSeasonChange(Number($event.target.value))"
                class="appearance-none px-5 py-2.5 pr-10 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs outline-none cursor-pointer backdrop-blur-md transition-colors"
              >
                <option v-for="season in media.seasons" :key="season.season_number" :value="season.season_number" class="bg-slate-900 text-white">
                  S{{ season.season_number }} — {{ season.name || `Saison ${season.season_number}` }} {{ season.episode_count ? `(${season.episode_count} éps)` : '' }}
                </option>
              </select>
              <div class="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/70">
                <IconChevronDown :size="15" :stroke-width="2.5" />
              </div>
            </div>

            <!-- 2. Filter By Order Dropdown Menu (Filtre par ordre) -->
            <div class="relative inline-block">
              <select
                v-model="sortOrder"
                class="appearance-none px-4 py-2.5 pr-9 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs outline-none cursor-pointer backdrop-blur-md transition-colors"
              >
                <option value="asc" class="bg-slate-900 text-white">Ordre croissant (1 → {{ episodes.length }})</option>
                <option value="desc" class="bg-slate-900 text-white">Ordre décroissant ({{ episodes.length }} → 1)</option>
                <option value="rating" class="bg-slate-900 text-white">Mieux notés (★)</option>
              </select>
              <div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/70">
                <IconArrowsSort :size="14" :stroke-width="2.5" />
              </div>
            </div>
          </div>

          <!-- Total Episodes Count Badge -->
          <span class="text-xs font-mono text-white/40">
            {{ sortedEpisodes.length }} {{ sortedEpisodes.length > 1 ? 'épisodes' : 'épisode' }}
          </span>

        </div>

        <!-- Episodes Vertical List (Netflix / HBO Style with Watch Progress) -->
        <div v-if="sortedEpisodes.length > 0" class="flex flex-col gap-3.5">
          <div
            v-for="ep in sortedEpisodes"
            :key="ep.id"
            @click="playMedia(ep)"
            :class="[
              'group/ep flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border backdrop-blur-xl transition-all duration-300 cursor-pointer shadow-lg relative overflow-hidden',
              episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.completed
                ? 'border-emerald-500/20 opacity-80 hover:opacity-100'
                : episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.percent > 0
                ? 'border-cyan-400/50 bg-cyan-950/10'
                : 'border-white/10 hover:border-cyan-400/50'
            ]"
          >
            <!-- Large Episode Index -->
            <span class="text-xl sm:text-2xl font-black text-white/40 w-6 sm:w-8 shrink-0 text-center group-hover/ep:text-cyan-400 transition-colors">
              {{ ep.episodeNumber }}
            </span>

            <!-- 16:9 Episode Thumbnail with Play Overlay & Progress Bar -->
            <div class="relative w-full sm:w-56 aspect-video shrink-0 rounded-xl overflow-hidden bg-black/60 shadow-md">
              <img
                :src="ep.still || media?.poster"
                :alt="ep.title"
                class="w-full h-full object-cover group-hover/ep:scale-105 transition-transform duration-500"
              />
              <div class="absolute inset-0 bg-black/40 group-hover/ep:bg-black/20 transition-colors flex items-center justify-center">
                <div class="w-10 h-10 rounded-full bg-white/20 group-hover/ep:bg-cyan-500 text-white group-hover/ep:text-slate-950 flex items-center justify-center backdrop-blur-md transition-all shadow-xl">
                  <IconPlayerPlay :size="16" :stroke-width="3" class="fill-current ml-0.5" />
                </div>
              </div>

              <span v-if="ep.runtime" class="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white backdrop-blur-md z-10">
                {{ ep.runtime }}
              </span>

              <!-- Episode Thumbnail Bottom Progress Bar -->
              <div v-if="episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.percent > 0"
                   class="absolute bottom-0 left-0 right-0 h-1.5 bg-black/80 z-20 overflow-hidden">
                <div class="h-full bg-cyan-400 rounded-r-full transition-all duration-300"
                     :style="{ width: `${episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`].percent}%` }"></div>
              </div>
            </div>

            <!-- Episode Details -->
            <div class="flex flex-col gap-1.5 flex-1 min-w-0">
              
              <!-- Title, Rating & Progress Status Row -->
              <div class="flex items-center gap-3 flex-wrap">
                <span class="text-sm sm:text-base font-black text-white group-hover/ep:text-cyan-300 transition-colors">
                  {{ ep.title }}
                </span>

                <!-- Watched Badge (Vu) -->
                <span v-if="episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.completed"
                      class="text-[10px] font-extrabold text-emerald-400 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-1">
                  <IconCheck :size="12" :stroke-width="3" />
                  <span>Vu</span>
                </span>

                <!-- In Progress Badge (En cours - X%) -->
                <span v-else-if="episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.percent > 0"
                      class="text-[10px] font-extrabold text-cyan-300 px-2.5 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center gap-1">
                  <IconPlayerPlay :size="10" :stroke-width="2.5" class="fill-current" />
                  <span>En cours ({{ episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`].percent }}%)</span>
                  <span v-if="episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`].minutesLeft" class="text-white/60 font-normal">
                    • {{ episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`].minutesLeft }} min res.
                  </span>
                </span>

                <!-- Rating Badge -->
                <span v-if="ep.rating" class="text-[11px] font-bold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1">
                  {{ ep.rating }}
                </span>

                <!-- Release Date (Date de sortie) -->
                <span v-if="ep.airDate" class="text-xs text-white/50">
                  {{ ep.airDate }}
                </span>
              </div>

              <!-- Synopsis Overview -->
              <p class="text-xs text-white/70 line-clamp-2 leading-relaxed">
                {{ ep.overview }}
              </p>

            </div>

            <!-- Right Action Play / Resume Button -->
            <div class="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 group-hover/ep:bg-cyan-500 group-hover/ep:text-slate-950 text-white text-xs font-bold transition-all shrink-0 ml-auto shadow">
              <IconPlayerPlay :size="14" :stroke-width="3" class="fill-current" />
              <span>{{ episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.percent > 0 && !episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.completed ? 'Reprendre' : 'Lire' }}</span>
            </div>

          </div>
        </div>

        <div v-else class="text-xs text-white/50 p-8 text-center">
          Chargement des épisodes officiels de la saison {{ selectedSeason }}...
        </div>

      </div>

      <!-- C. SIMILAR TITLES TAB (16:9 Landscape Cards Grid matching MediaRow.vue style) -->
      <div v-else-if="activeTab === 'similar'" class="flex flex-col gap-6">
        <div v-if="media?.similar && media.similar.length > 0" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          <div
            v-for="simItem in media.similar"
            :key="simItem.id"
            @click="goToSimilarDetail(simItem)"
            class="relative aspect-video rounded-2xl overflow-hidden bg-[#0a0d14] border border-white/10 hover:border-cyan-400/60 transition-all duration-300 hover:scale-[1.03] cursor-pointer shadow-lg hover:shadow-2xl hover:shadow-black/90 group/simCard flex items-center justify-center"
          >
            <!-- 1. 16:9 Backdrop Background Image -->
            <div
              class="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover/simCard:scale-105"
              :style="{ backgroundImage: `url(${simItem.bgImg || simItem.poster})` }"
            />

            <!-- 2. Dark Vignette Gradient -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/20 group-hover/simCard:via-black/10 transition-colors" />



            <!-- 3. Official Clear PNG Logo or Title -->
            <div class="relative z-10 p-4 pb-4 flex items-end justify-center w-full h-full text-center">
              <img
                v-if="simItem.logoUrl"
                :src="simItem.logoUrl"
                :alt="simItem.title"
                class="max-h-12 sm:max-h-14 md:max-h-16 max-w-[82%] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.98)] transition-transform duration-300 group-hover/simCard:scale-105"
              />
              <span
                v-else
                class="font-black text-sm sm:text-base tracking-wider text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] line-clamp-2 px-2 pb-1"
              >
                {{ simItem.title }}
              </span>
            </div>

            <!-- 4. Hover Play Button -->
            <div class="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover/simCard:opacity-100 transition-opacity pointer-events-none">
              <div class="w-12 h-12 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-xl transform scale-75 group-hover/simCard:scale-100 transition-transform">
                <IconPlayerPlay :size="22" :stroke-width="3" class="fill-current ml-0.5" />
              </div>
            </div>

          </div>
        </div>
        <div v-else class="text-xs text-white/50 p-8 text-center">
          Aucun titre similaire correspondant disponible pour le moment.
        </div>
      </div>

      <!-- D. EXTRAS TAB (Native Go Stream Launcher) -->
      <div v-else-if="activeTab === 'extras'" class="flex flex-col gap-6">
        <div v-if="media?.trailerKey" class="flex flex-col gap-4 max-w-4xl">
          
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <IconBrandYoutube :size="18" :stroke-width="2" class="text-red-500" />
              <span>Bande-annonce officielle (TMDB 4K)</span>
            </h3>
            
            <button
              @click="openTrailerNativeGo"
              class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-xs text-cyan-300 font-bold border border-white/10 transition-all cursor-pointer hover:scale-105 active:scale-95"
            >
              <IconExternalLink :size="14" :stroke-width="2" />
              <span>Ouvrir via Go</span>
            </button>
          </div>

          <!-- Cinema Trailer Display Card (Native Go Backend Trigger) -->
          <div
            @click="openTrailerNativeGo"
            class="relative w-full aspect-video rounded-3xl overflow-hidden border border-cyan-500/25 bg-black shadow-2xl group/trailer cursor-pointer flex items-center justify-center"
          >
            <!-- Trailer Backdrop Image -->
            <img
              :src="`https://img.youtube.com/vi/${media.trailerKey}/maxresdefault.jpg`"
              alt="Bande-annonce"
              class="absolute inset-0 w-full h-full object-cover group-hover/trailer:scale-105 transition-transform duration-700"
              @error="$event.target.src = media.bgImg || media.poster"
            />
            
            <!-- Cinematic Dark Vignette Overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/40 group-hover/trailer:via-black/15 transition-colors"></div>

            <!-- Big Glowing Play Action Button -->
            <div class="relative z-10 flex flex-col items-center gap-3">
              <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shadow-2xl shadow-cyan-500/50 group-hover/trailer:scale-110 group-hover/trailer:bg-white transition-all duration-300">
                <IconPlayerPlay :size="32" :stroke-width="3" class="fill-current ml-1" />
              </div>
              <span class="text-sm sm:text-base font-black text-white tracking-wider uppercase drop-shadow-md">
                Lancer la bande-annonce (4K 60fps)
              </span>
            </div>

            <!-- Bottom Left Badge -->
            <div class="absolute bottom-4 left-6 z-10 flex items-center gap-2">
              <span class="px-3 py-1 rounded-xl bg-black/70 border border-white/20 text-xs font-bold text-white backdrop-blur-md">
                Lancement Natif Go • Zéro Erreur
              </span>
            </div>
          </div>

        </div>
        <div v-else class="text-xs text-white/50 p-8 text-center">
          Aucune bande-annonce disponible pour ce titre.
        </div>
      </div>
    </div>

  </div>
  </div>
</template>
