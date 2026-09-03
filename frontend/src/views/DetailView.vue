<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCoupledMediaDetails } from '../services/api/mediaService'
import { getSeasonEpisodes } from '../services/tmdb'
import { getAvailableEpisodesMap } from '../services/api/movieSourcesService'
import {
  toggleWatchlist,
  getUserWatchlistCoupled,
  getManualWatched,
  markWatchedManual,
  unmarkWatchedManual,
  markSeasonWatchedManual,
  unmarkSeasonWatchedManual,
  isMediaCompleted
} from '../services/api/watchService'
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
  IconEye,
  IconEyeCheck,
  IconCalendar,
  IconClock,
  IconChevronRight,
  IconX
} from '@tabler/icons-vue'

// Shadcn Vue Skeleton Component
import Skeleton from '../components/ui/skeleton/Skeleton.vue'

import { useAuth } from '../composables/useAuth'

const { isLoggedIn, userProfile, userId } = useAuth()
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
const showSeasonModal = ref(false)

const availableSeasons = computed(() => {
  if (!media.value?.seasons || media.value.seasons.length === 0) return []
  return media.value.seasons.filter((s) => Number(s.season_number) > 0)
})

const currentSeasonObj = computed(() => {
  return availableSeasons.value.find((s) => Number(s.season_number) === Number(selectedSeason.value))
})

const currentSeasonTitle = computed(() => {
  if (!currentSeasonObj.value) return `Saison ${selectedSeason.value}`
  return currentSeasonObj.value.name || `Saison ${currentSeasonObj.value.season_number}`
})

const canGoPrevSeason = computed(() => {
  const seasons = availableSeasons.value.map((s) => Number(s.season_number)).sort((a, b) => a - b)
  const idx = seasons.indexOf(Number(selectedSeason.value))
  return idx > 0
})

const canGoNextSeason = computed(() => {
  const seasons = availableSeasons.value.map((s) => Number(s.season_number)).sort((a, b) => a - b)
  const idx = seasons.indexOf(Number(selectedSeason.value))
  return idx !== -1 && idx < seasons.length - 1
})

function prevSeasonAction() {
  const seasons = availableSeasons.value.map((s) => Number(s.season_number)).sort((a, b) => a - b)
  const idx = seasons.indexOf(Number(selectedSeason.value))
  if (idx > 0) {
    onSeasonChange(seasons[idx - 1])
  }
}

function nextSeasonAction() {
  const seasons = availableSeasons.value.map((s) => Number(s.season_number)).sort((a, b) => a - b)
  const idx = seasons.indexOf(Number(selectedSeason.value))
  if (idx !== -1 && idx < seasons.length - 1) {
    onSeasonChange(seasons[idx + 1])
  }
}

function cycleSortOrder() {
  if (sortOrder.value === 'asc') sortOrder.value = 'desc'
  else if (sortOrder.value === 'desc') sortOrder.value = 'rating'
  else sortOrder.value = 'asc'
}

// Watch Progress State
const watchProgressList = ref([])
const isProgressLoading = ref(false)

// Manual "Déjà vu" Marks State (independent from real watch_progress)
const manualWatchedList = ref([])

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
    
    const completed = item.completed || isMediaCompleted(progSec, durSec, false) || percent >= 95
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

// Set of "S{season}_E{episode}" keys manually marked as "déjà vu"
const manualWatchedSet = computed(() => {
  const set = new Set()
  manualWatchedList.value.forEach(m => set.add(`S${Number(m.season) || 0}_E${Number(m.episode) || 0}`))
  return set
})

// An episode counts as watched if it was actually completed OR manually marked
function isEpisodeWatched(ep) {
  const key = `S${selectedSeason.value}_E${ep.episodeNumber}`
  return !!episodesProgressMap.value[key]?.completed || manualWatchedSet.value.has(key)
}

// Movie: manually marked as "déjà vu" (season=0, episode=0)
const isMovieManuallyWatched = computed(() => manualWatchedSet.value.has('S0_E0'))
const isMovieWatched = computed(() => isMovieManuallyWatched.value || !!latestProgress.value?.completed)

// Whole currently selected season already watched (real progress or manual marks)
const isSeasonFullyWatched = computed(() => {
  if (!sortedEpisodes.value.length) return false
  return sortedEpisodes.value.every(ep => isEpisodeWatched(ep))
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

  const s = Number(latest.season) || 0
  const e = Number(latest.episode) || 0
  const isMovie = media.value?.type !== 'Série' || (s === 0 && e === 0)
  const progSec = Number(latest.progress_seconds || latest.current_time || 0)
  const durSec = Number(latest.duration_seconds || latest.duration || 0)
  let percent = durSec > 0 
    ? Math.min(100, Math.round((progSec / durSec) * 100)) 
    : Number(latest.progress || 0)

  const completed = latest.completed || isMediaCompleted(progSec, durSec, isMovie) || percent >= 95
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

// Resume data exists but its exact season/episode (or the movie) was manually
// marked "déjà vu": keep the underlying watch_progress row untouched, just
// treat it as if there were no resume data for hero button/UI purposes.
const isLatestProgressManuallyWatched = computed(() => {
  if (!latestProgress.value) return false
  if (media.value?.type !== 'Série') return isMovieManuallyWatched.value
  return manualWatchedSet.value.has(`S${latestProgress.value.season}_E${latestProgress.value.episode}`)
})

// Dynamic Hero Play/Resume Button label
const heroPlayButtonText = computed(() => {
  if (!media.value) return 'Lecture'

  if (latestProgress.value && !isLatestProgressManuallyWatched.value) {
    if (media.value.type === 'Série') {
      if (!latestProgress.value.completed) {
        return `Reprendre S${latestProgress.value.season} E${latestProgress.value.episode}`
      } else {
        return `Regarder S${latestProgress.value.season} E${latestProgress.value.episode + 1}`
      }
    } else {
      return !latestProgress.value.completed ? 'Reprendre' : 'Recommencer'
    }
  }

  if (media.value.type === 'Série') {
    return `Regarder S${selectedSeason.value} E1`
  }

  return 'Lecture'
})

// "1:01:31" style remaining-time label shown next to the hero play/resume button text
function formatRemainingTime(totalSeconds) {
  const secs = Math.round(totalSeconds || 0)
  if (secs <= 0) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const heroPlayButtonTimeLabel = computed(() => {
  if (!latestProgress.value || latestProgress.value.completed || isLatestProgressManuallyWatched.value) return ''
  const remaining = (latestProgress.value.durationSeconds || 0) - (latestProgress.value.progressSeconds || 0)
  return formatRemainingTime(remaining)
})

// Texte d'annonce pour le prochain épisode attendu (ex: "L'épisode 7 saison 3 est prévu pour dimanche (dans 3 jours)")
const upcomingEpisodeInfo = computed(() => {
  if (!media.value || (media.value.type !== 'Série' && media.value.type !== 'tv')) return null

  const next = media.value.nextEpisode
  if (!next || !next.air_date) return null

  const airDate = new Date(next.air_date + 'T00:00:00')
  if (isNaN(airDate.getTime())) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDate = new Date(airDate)
  targetDate.setHours(0, 0, 0, 0)

  const diffDays = Math.round((targetDate - today) / (1000 * 60 * 60 * 24))

  let relativeTimeText = ''
  if (diffDays === 0) {
    relativeTimeText = "aujourd'hui"
  } else if (diffDays === 1) {
    relativeTimeText = 'demain'
  } else if (diffDays === 2) {
    relativeTimeText = 'après-demain'
  } else if (diffDays > 2 && diffDays <= 7) {
    const weekday = targetDate.toLocaleDateString('fr-FR', { weekday: 'long' })
    relativeTimeText = `${weekday} (dans ${diffDays} jours)`
  } else if (diffDays > 7) {
    const formatted = targetDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    relativeTimeText = `le ${formatted} (dans ${diffDays} jours)`
  } else {
    // Épisode diffusé tout récemment
    return null
  }

  const epTitle = next.name && !next.name.toLowerCase().startsWith('épisode') ? ` (« ${next.name} »)` : ''

  return {
    season: next.season_number,
    episode: next.episode_number,
    title: next.name || `Épisode ${next.episode_number}`,
    fullTitle: epTitle,
    airDateStr: targetDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
    relativeText: relativeTimeText,
    diffDays
  }
})

async function loadData(id) {
  isLoading.value = true
  try {
    const type = route.query.type || 'movie'
    const fullData = await getCoupledMediaDetails(id, type)
    if (fullData) {
      media.value = fullData
      if (media.value.type === 'Série' || media.value.type === 'tv') {
        activeTab.value = 'episodes'
        if (media.value.seasons && media.value.seasons.length > 0) {
          media.value.seasons = media.value.seasons.filter(s => s.season_number > 0)
          
          // 1. Si des flux vidéo existent dans Supabase, ne garder que ces saisons et ajuster le nombre d'épisodes
          if (media.value.videoStreams && media.value.videoStreams.length > 0) {
            const availableSeasons = new Set(media.value.videoStreams.map(v => Number(v.season)))
            const filteredSeasons = media.value.seasons.filter(s => availableSeasons.has(Number(s.season_number)))
            if (filteredSeasons.length > 0) {
              filteredSeasons.forEach(s => {
                const count = media.value.videoStreams.filter(v => Number(v.season) === Number(s.season_number)).length
                if (count > 0) s.episode_count = count
              })
              media.value.seasons = filteredSeasons
            }
          } else {
            // 2. Sinon, détecter en parallèle les saisons et épisodes réellement dispo sur les APIs
            const allSeasonNums = media.value.seasons.map(s => Number(s.season_number))
            const availMap = await getAvailableEpisodesMap(media.value.title, media.value.id, allSeasonNums)
            if (availMap && Object.keys(availMap).length > 0) {
              const activeSeasonNums = new Set(Object.keys(availMap).map(Number))
              const filteredSeasons = media.value.seasons.filter(s => activeSeasonNums.has(Number(s.season_number)))
              if (filteredSeasons.length > 0) {
                filteredSeasons.forEach(s => {
                  const epSet = availMap[Number(s.season_number)]
                  if (epSet && epSet.size > 0) {
                    s.episode_count = epSet.size
                  }
                })
                media.value.seasons = filteredSeasons
              }
            }
          }

          selectedSeason.value = media.value.seasons[0]?.season_number || 1
          await loadEpisodes(media.value.id, selectedSeason.value)
        }
      } else {
        activeTab.value = 'cast'
      }

      // Check Watchlist status & fetch Watch Progress
      await checkWatchlistStatus()
      await loadWatchProgress()
      await loadManualWatched()
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

    if (isLoggedIn.value && userId.value) {
      const { data, error } = await supabase
        .from('watch_progress')
        .select('*')
        .eq('user_id', String(userId.value))
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

async function loadManualWatched() {
  if (!media.value) return
  if (!isLoggedIn.value || !userId.value) {
    manualWatchedList.value = []
    return
  }
  const contentKey = media.value.supabaseContentId || media.value.id
  manualWatchedList.value = await getManualWatched(userId.value, contentKey)
}

async function toggleMovieWatched() {
  if (!isLoggedIn.value || !userId.value || !media.value) return
  const contentKey = media.value.supabaseContentId || media.value.id
  if (isMovieManuallyWatched.value) {
    await unmarkWatchedManual(userId.value, contentKey, 0, 0)
  } else {
    await markWatchedManual(userId.value, contentKey, 0, 0)
  }
  await loadManualWatched()
}

async function toggleEpisodeWatched(ep) {
  if (!isLoggedIn.value || !userId.value || !media.value) return
  const contentKey = media.value.supabaseContentId || media.value.id
  const s = selectedSeason.value
  const e = ep.episodeNumber
  if (manualWatchedSet.value.has(`S${s}_E${e}`)) {
    await unmarkWatchedManual(userId.value, contentKey, s, e)
  } else {
    await markWatchedManual(userId.value, contentKey, s, e)
  }
  await loadManualWatched()
}

async function toggleSeasonWatched() {
  if (!isLoggedIn.value || !userId.value || !media.value) return
  const contentKey = media.value.supabaseContentId || media.value.id
  const s = selectedSeason.value
  if (isSeasonFullyWatched.value) {
    await unmarkSeasonWatchedManual(userId.value, contentKey, s)
  } else {
    const epNumbers = sortedEpisodes.value.map(ep => ep.episodeNumber)
    await markSeasonWatchedManual(userId.value, contentKey, s, epNumbers)
  }
  await loadManualWatched()
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
  let rawList = eps || []

  // 1. Si des flux vidéo existent dans Supabase, ne garder que les épisodes ayant une source
  if (media.value?.videoStreams && media.value.videoStreams.length > 0) {
    const availableEpNumbers = new Set(
      media.value.videoStreams
        .filter(v => Number(v.season) === Number(seasonNum))
        .map(v => Number(v.episode))
    )
    if (availableEpNumbers.size > 0) {
      rawList = rawList.filter(ep => availableEpNumbers.has(Number(ep.episodeNumber)))
    }
  } else {
    // 2. Sinon, filtrer par les épisodes réellement disponibles détectés via API (avec cache)
    const availMap = await getAvailableEpisodesMap(media.value?.title, media.value?.id, seasonNum)
    if (availMap && availMap[seasonNum]) {
      const availableEpSet = availMap[seasonNum]
      if (availableEpSet.size > 0) {
        rawList = rawList.filter(ep => availableEpSet.has(Number(ep.episodeNumber)))
      }
    }
  }

  episodes.value = rawList

  // Mettre à jour en temps réel le nombre d'épisodes affiché dans le sélecteur de saison
  const targetSeason = media.value?.seasons?.find(s => Number(s.season_number) === Number(seasonNum))
  if (targetSeason && rawList.length > 0) {
    targetSeason.episode_count = rawList.length
  }
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
    if (prog && !prog.completed && !manualWatchedSet.value.has(key)) {
      startTime = prog.progressSeconds || 0
    }
  } else if (latestProgress.value && !isLatestProgressManuallyWatched.value) {
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
  router.push('/')
}

onMounted(() => {
  const main = document.querySelector('main')
  if (main) main.scrollTo({ top: 0, behavior: 'instant' })
  window.scrollTo(0, 0)
  loadData(route.params.id)
})

watch(() => route.params.id, (newId) => {
  if (newId) {
    const main = document.querySelector('main')
    if (main) main.scrollTo({ top: 0, behavior: 'instant' })
    window.scrollTo(0, 0)
    loadData(newId)
  }
})

watch([isLoggedIn, userId], () => {
  checkWatchlistStatus()
  loadWatchProgress()
  loadManualWatched()
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
    <div v-if="isLoading" class="flex flex-col gap-8 bg-black">
      <div class="relative w-full h-[560px] sm:h-[620px] lg:h-[680px] overflow-hidden bg-black border-b border-white/5">
        <div class="absolute inset-0 bg-black"></div>
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent"></div>
        <div class="absolute inset-0 px-6 sm:px-12 lg:px-16 flex flex-col justify-end pb-12 max-w-3xl gap-4 z-20">
          <Skeleton class="h-16 w-3/4 max-w-md rounded-2xl bg-white/[0.08] border-white/5" />
          <div class="flex items-center gap-3">
            <Skeleton class="h-5 w-12 rounded-md bg-white/[0.06] border-white/5" />
            <Skeleton class="h-5 w-24 rounded-md bg-white/[0.06] border-white/5" />
            <Skeleton class="h-5 w-20 rounded-md bg-white/[0.06] border-white/5" />
            <Skeleton class="h-5 w-16 rounded-md bg-white/[0.06] border-white/5" />
          </div>
          <Skeleton class="h-14 w-full rounded-xl bg-white/[0.04] border-white/5" />
          <div class="flex items-center gap-4 pt-2">
            <Skeleton class="h-12 w-44 rounded-full bg-cyan-500/20 border-cyan-500/10" />
            <Skeleton class="h-12 w-44 rounded-full bg-white/[0.05] border-white/5" />
          </div>
        </div>
      </div>
      <div class="px-6 sm:px-12 lg:px-16 flex flex-col gap-6 bg-black">
        <div class="flex items-center gap-3 border-b border-white/5 pb-4">
          <Skeleton class="h-8 w-32 rounded-full bg-white/[0.08] border-white/5" />
          <Skeleton class="h-8 w-40 rounded-full bg-white/[0.05] border-white/5" />
          <Skeleton class="h-8 w-32 rounded-full bg-white/[0.05] border-white/5" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="n in 8" :key="n" class="aspect-video rounded-2xl bg-[#080808] border border-white/5 p-4 flex flex-col justify-between overflow-hidden shadow-none">
            <div class="flex justify-end">
              <Skeleton class="h-3.5 w-10 rounded bg-white/[0.05] border-none" />
            </div>
            <div class="flex flex-col gap-2 items-center w-full px-2">
              <Skeleton class="h-4 w-3/5 rounded-lg bg-white/[0.08] border-none" />
              <Skeleton class="h-2 w-1/3 rounded-full bg-white/[0.04] border-none" />
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

      <!-- Cinematic Dark Overlays (lightened so the backdrop image actually reads through) -->
      <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-black/25 to-transparent"></div>
      <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent"></div>

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

        <!-- Real TMDB Metadata Line (dot separated) -->
        <div class="flex items-center gap-2 text-xs font-semibold text-white/90 flex-wrap">

          <!-- Age Badge -->
          <span class="px-1.5 py-0.5 rounded border border-white/40 text-[10px] font-bold">
            {{ !media?.age || media.age === 'TP' ? 'Tous Publics' : media.age }}
          </span>

          <!-- Real Runtime / Seasons count -->
          <template v-if="media?.runtimeStr">
            <span class="text-white/40">•</span>
            <span>{{ media.runtimeStr }}</span>
          </template>
          <template v-else-if="media?.numberOfSeasons">
            <span class="text-white/40">•</span>
            <span>{{ media.numberOfSeasons }} {{ media.numberOfSeasons > 1 ? 'Saisons' : 'Saison' }}</span>
          </template>

          <!-- Release Year -->
          <template v-if="media?.year">
            <span class="text-white/40">•</span>
            <span>{{ media.year }}</span>
          </template>

          <!-- Real Genres -->
          <template v-if="media?.genre">
            <span class="text-white/40">•</span>
            <span class="text-cyan-300">{{ media.genre }}</span>
          </template>

          <!-- Real Rating -->
          <template v-if="media?.rating">
            <span class="text-white/40">•</span>
            <span class="text-emerald-400 font-black text-xs flex items-center gap-1">
              <span>{{ media.rating }}</span>
              <span v-if="media.voteCount" class="text-[10px] text-white/40 font-normal">({{ media.voteCount }})</span>
            </span>
          </template>

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

        <!-- Prochain épisode attendu (Sous le synopsis) -->
        <div
          v-if="upcomingEpisodeInfo"
          class="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 backdrop-blur-md text-xs max-w-2xl shadow-lg"
        >
          <div class="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
            <IconCalendar :size="15" :stroke-width="2.5" />
          </div>
          <div class="flex flex-wrap items-center gap-1.5 flex-1">
            <span class="font-extrabold text-white">
              Épisode {{ upcomingEpisodeInfo.episode }} (Saison {{ upcomingEpisodeInfo.season }}){{ upcomingEpisodeInfo.fullTitle }} :
            </span>
            <span class="text-cyan-300 font-semibold">
              diffusion prévue <span class="font-black text-cyan-200 underline decoration-cyan-400/60">{{ upcomingEpisodeInfo.relativeText }}</span> (le {{ upcomingEpisodeInfo.airDateStr }}).
            </span>
          </div>
        </div>

        <!-- ACTION BUTTONS ROW: [ ▶ Reprendre S2 E3 ]  [ 🔄 Recommencer ]  [ + ]  [ 🎬 Bande-annonce ] -->
        <div class="flex flex-col gap-3 pt-2">
          <div id="detail-action-buttons" data-row="hero-actions" class="flex items-center gap-3 flex-wrap">
            
            <!-- Primary Solid Play/Resume Pill Button -->
            <button @click="playMedia()"
                    class="relative overflow-hidden flex items-center gap-2 px-7 py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-full shadow-2xl shadow-cyan-500/30 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105">
              <IconPlayerPlay :size="18" :stroke-width="3" class="fill-current" />
              <span class="font-black text-sm">{{ heroPlayButtonText }}</span>
              <template v-if="heroPlayButtonTimeLabel">
                <span class="text-slate-950/50 font-black text-sm">·</span>
                <span class="font-semibold text-sm">{{ heroPlayButtonTimeLabel }}</span>
              </template>

              <!-- Embedded progress bar along the bottom edge of the button -->
              <div v-if="latestProgress && latestProgress.percent > 0 && !latestProgress.completed && !isLatestProgressManuallyWatched"
                   class="absolute bottom-0 left-0 right-0 h-[3px] bg-black/15">
                <div class="h-full bg-black/40" :style="{ width: `${latestProgress.percent}%` }"></div>
              </div>
            </button>

            <!-- Recommencer Button (if progress exists and isn't hidden behind a "déjà vu" mark) -->
            <button v-if="latestProgress && !isLatestProgressManuallyWatched"
                    @click="playMedia(null, true)"
                    title="Recommencer depuis le début"
                    class="flex items-center gap-2 px-4 py-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 text-xs font-bold">
              <IconRotate2 :size="16" :stroke-width="2.5" />
              <span>Recommencer</span>
            </button>

            <!-- Add to My List -->
            <button @click="toggleList"
                    title="Ajouter à ma liste"
                    :class="[
                      'flex items-center gap-2 px-5 py-3 rounded-full border backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-lg text-xs font-bold',
                      isInList ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                    ]">
              <IconCheck v-if="isInList" :size="17" :stroke-width="2.5" />
              <IconPlus v-else :size="17" :stroke-width="2" />
              <span>{{ isInList ? 'Dans ma liste' : 'Ma liste' }}</span>
            </button>

            <!-- Mark Movie as "Déjà vu" (manual watched toggle, movies only) -->
            <button v-if="media?.type !== 'Série'"
                    @click="toggleMovieWatched"
                    :title="isMovieManuallyWatched ? 'Marquer comme non vu' : 'Marquer comme déjà vu'"
                    :class="[
                      'flex items-center gap-2 px-5 py-3 rounded-full border backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-lg text-xs font-bold',
                      isMovieManuallyWatched ? 'bg-emerald-500 text-slate-950 border-emerald-400' : 'bg-white/15 hover:bg-white/25 text-white border-white/25'
                    ]">
              <IconEyeCheck v-if="isMovieManuallyWatched" :size="17" :stroke-width="2.5" />
              <IconEye v-else :size="17" :stroke-width="2" />
              <span>{{ isMovieManuallyWatched ? 'Déjà vu' : 'Marquer vu' }}</span>
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
        </div>

      </div>

    </div>

    <!-- 2. NAVIGATION TABS (Pill Switcher) -->
    <div class="px-6 sm:px-12 lg:px-16 pt-6 flex flex-col gap-8">
      
      <!-- Pills Header -->
      <div id="detail-tabs" data-row="detail-tabs" class="flex items-center gap-3 border-b border-white/10 pb-4 overflow-x-auto">
        
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
        
        <!-- Season Selector & Filter By Order Row -->
        <div id="detail-season-controls" data-row="season-controls" class="flex items-center justify-between flex-wrap gap-4 relative">
          
          <div class="flex items-center gap-3 flex-wrap">
            <!-- 1. TV-Friendly Season Stepper + Dropdown Popover Trigger -->
            <div v-if="availableSeasons.length > 0" class="flex items-center gap-1.5 relative">
              <!-- Previous Season Button -->
              <button
                @click="prevSeasonAction"
                :disabled="!canGoPrevSeason"
                class="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-white cursor-pointer transition-all active:scale-95 shadow"
                title="Saison précédente"
                aria-label="Saison précédente"
              >
                <IconChevronLeft :size="18" :stroke-width="2.5" />
              </button>

              <!-- Season Pill (Opens Popover List) -->
              <button
                @click="showSeasonModal = !showSeasonModal"
                class="px-5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs flex items-center gap-2 cursor-pointer backdrop-blur-md transition-colors"
                title="Changer de saison"
                aria-label="Changer de saison"
              >
                <span>S{{ selectedSeason }} — {{ currentSeasonTitle }} <template v-if="currentSeasonObj?.episode_count">({{ currentSeasonObj.episode_count }} éps)</template></span>
                <IconChevronDown :size="15" :stroke-width="2.5" />
              </button>

              <!-- Next Season Button -->
              <button
                @click="nextSeasonAction"
                :disabled="!canGoNextSeason"
                class="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center text-white cursor-pointer transition-all active:scale-95 shadow"
                title="Saison suivante"
                aria-label="Saison suivante"
              >
                <IconChevronRight :size="18" :stroke-width="2.5" />
              </button>

              <!-- Season Popover Modal for TV Remote Navigation -->
              <transition name="fade">
                <div
                  v-if="showSeasonModal"
                  id="detail-season-modal"
                  class="absolute top-full mt-2 left-0 z-50 min-w-[240px] max-h-[300px] overflow-y-auto bg-black/95 border border-white/20 rounded-2xl p-2 flex flex-col gap-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-3xl"
                >
                  <div class="px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white/40 border-b border-white/10 flex items-center justify-between">
                    <span>Sélectionner une saison</span>
                    <button @click="showSeasonModal = false" class="text-white/60 hover:text-white cursor-pointer">
                      <IconX :size="16" />
                    </button>
                  </div>
                  <button
                    v-for="s in availableSeasons"
                    :key="s.season_number"
                    @click="onSeasonChange(Number(s.season_number)); showSeasonModal = false"
                    :class="[
                      'px-3.5 py-2.5 rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer',
                      Number(selectedSeason) === Number(s.season_number)
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-md'
                        : 'text-white/80 hover:bg-white/10'
                    ]"
                  >
                    <span>S{{ s.season_number }} — {{ s.name || `Saison ${s.season_number}` }}</span>
                    <div class="flex items-center gap-1.5">
                      <span v-if="s.episode_count" class="text-[10px] text-white/40">({{ s.episode_count }} éps)</span>
                      <IconCheck v-if="Number(selectedSeason) === Number(s.season_number)" :size="14" class="text-cyan-400" />
                    </div>
                  </button>
                </div>
              </transition>
            </div>

            <!-- 2. TV-Friendly Sort Order Cycle Button -->
            <button
              @click="cycleSortOrder"
              class="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-bold text-xs flex items-center gap-2 cursor-pointer backdrop-blur-md transition-colors"
              title="Changer l'ordre de tri"
            >
              <IconArrowsSort :size="14" :stroke-width="2.5" />
              <span>
                {{
                  sortOrder === 'asc'
                    ? 'Ordre croissant (1 → ' + episodes.length + ')'
                    : sortOrder === 'desc'
                    ? 'Ordre décroissant (' + episodes.length + ' → 1)'
                    : 'Mieux notés (★)'
                }}
              </span>
            </button>

            <!-- 3. Mark Whole Season as "Déjà vu" -->
            <button @click="toggleSeasonWatched"
                    :title="isSeasonFullyWatched ? 'Marquer la saison comme non vue' : 'Marquer la saison comme déjà vue'"
                    :class="[
                      'flex items-center gap-2 px-4 py-2.5 rounded-2xl border backdrop-blur-md transition-all cursor-pointer hover:scale-105 active:scale-95 text-xs font-bold',
                      isSeasonFullyWatched ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-white/10 hover:bg-white/15 text-white border-white/20'
                    ]">
              <IconEyeCheck v-if="isSeasonFullyWatched" :size="15" :stroke-width="2.5" />
              <IconEye v-else :size="15" :stroke-width="2" />
              <span>{{ isSeasonFullyWatched ? 'Saison vue' : 'Marquer la saison comme vue' }}</span>
            </button>
          </div>

          <!-- Total Episodes Count Badge -->
          <span class="text-xs font-mono text-white/40">
            {{ sortedEpisodes.length }} {{ sortedEpisodes.length > 1 ? 'épisodes disponibles' : 'épisode disponible' }}
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
              isEpisodeWatched(ep)
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

              <!-- Episode Thumbnail Bottom Progress Bar (hidden once marked "déjà vu") -->
              <div v-if="episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.percent > 0 && !isEpisodeWatched(ep)"
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
                <span v-if="isEpisodeWatched(ep)"
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

            <!-- Manual "Déjà vu" Toggle (independent of playback) -->
            <button @click.stop="toggleEpisodeWatched(ep)"
                    :title="isEpisodeWatched(ep) ? 'Marquer comme non vu' : 'Marquer comme déjà vu'"
                    :class="[
                      'shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all cursor-pointer hover:scale-105 active:scale-95 ml-auto lg:ml-0',
                      isEpisodeWatched(ep) ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-white/10 hover:bg-white/20 text-white/70 hover:text-white border-white/15'
                    ]">
              <IconEyeCheck v-if="isEpisodeWatched(ep)" :size="15" :stroke-width="2.5" />
              <IconEye v-else :size="15" :stroke-width="2" />
            </button>

            <!-- Right Action Play / Resume Button -->
            <div class="hidden lg:flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 group-hover/ep:bg-cyan-500 group-hover/ep:text-slate-950 text-white text-xs font-bold transition-all shrink-0 shadow">
              <IconPlayerPlay :size="14" :stroke-width="3" class="fill-current" />
              <span>{{ episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.percent > 0 && !episodesProgressMap[`S${selectedSeason}_E${ep.episodeNumber}`]?.completed && !isEpisodeWatched(ep) ? 'Reprendre' : 'Lire' }}</span>
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
