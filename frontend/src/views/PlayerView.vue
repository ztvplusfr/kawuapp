<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCoupledMediaDetails } from '../services/api/mediaService'
import { saveProgress, getUserContinueWatching } from '../services/api/watchService'
import { recordHistoryView, resolveHlsStreamUrl } from '../services/api/playerService'
import { fetchSkipIntervals } from '../services/api/skipService'
import { getSeasonEpisodes } from '../services/tmdb'
import { getAvailableEpisodesMap } from '../services/api/movieSourcesService'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../services/supabase'
import VideoPlayer from '../components/VideoPlayer.vue'
import { resolveStreamSource } from '../services/resolvers'
import { WindowFullscreen, WindowUnfullscreen } from '../../wailsjs/runtime/runtime'

const route = useRoute()
const router = useRouter()
const { userId, isLoggedIn } = useAuth()

const media = ref(null)
const isLoading = ref(true)
const activeStreamUrl = ref('')
const currentSeason = ref(Math.max(1, Number(route.query.season) || 1))
const currentEpisode = ref(Number(route.query.episode) || 1)
const episodesList = ref([])
const episodesLoading = ref(false)
const activeEpisodeData = ref(null)
const initialTime = ref(0)
const resolvedSourceData = ref(null)
const skipIntervals = ref(null)
const episodeSources = ref([])
const discoveredDynamicStreams = ref([])

// Computed Episode and Show labels matching user format (e.g. "S1 E1 — Titre Épisode")
const playerEpisodeLabel = computed(() => {
  if (media.value?.type === 'Série' || route.query.type === 'tv') {
    const s = currentSeason.value
    const e = currentEpisode.value
    const epTitle = activeEpisodeData.value?.title ? ` — ${activeEpisodeData.value.title}` : ''
    return `S${s} E${e}${epTitle}`
  }
  return ''
})

const playerTitle = computed(() => {
  return media.value?.title || 'Chargement...'
})

const isMovieMedia = computed(() => {
  const type = route.query.type || 'movie'
  return media.value?.type === 'Film' || media.value?.type === 'movie' || type === 'movie'
})

const playerSubtitle = computed(() => {
  if (media.value?.type === 'Série') {
    return media.value.title
  }
  return ''
})

async function loadSkipIntervals() {
  if (!media.value) return
  try {
    const title = media.value.title
    const epNum = currentEpisode.value
    const malId = media.value.mal_id || media.value.malId
    skipIntervals.value = await fetchSkipIntervals(title, epNum, 1440, malId)
  } catch (e) {
    console.warn('[PlayerView] Skip intervals fetch error:', e)
  }
}

async function fetchEpisodesForSeason(full, seasonNum) {
  const seasonObj = full.seasons?.find(s => s.season_number === seasonNum) || full.seasons?.[0]
  const eps = await getSeasonEpisodes(full.id, seasonNum, seasonObj)
  let rawList = eps || []

  if (full.videoStreams && full.videoStreams.length > 0) {
    const availableEpNumbers = new Set(
      full.videoStreams
        .filter(v => Number(v.season) === Number(seasonNum))
        .map(v => Number(v.episode))
    )
    if (availableEpNumbers.size > 0) {
      rawList = rawList.filter(e => availableEpNumbers.has(Number(e.episodeNumber)))
    }
  } else {
    const availMap = await getAvailableEpisodesMap(full.title, full.tmdb_id || full.id)
    if (availMap && availMap[seasonNum]) {
      const availableEpSet = availMap[seasonNum]
      if (availableEpSet.size > 0) {
        rawList = rawList.filter(e => availableEpSet.has(Number(e.episodeNumber)))
      }
    }
  }

  return rawList
}

async function loadPlayerData() {
  isLoading.value = true
  try {
    const id = route.params.id
    const type = route.query.type || 'movie'
    const full = await getCoupledMediaDetails(id, type)
    
    if (full) {
      media.value = full

      // 1. If TV series, fetch episodes for season
      if (full.type === 'Série' || full.type === 'tv' || type === 'tv') {
        episodesList.value = await fetchEpisodesForSeason(full, currentSeason.value)
        activeEpisodeData.value = episodesList.value.find(e => e.episodeNumber === currentEpisode.value) || episodesList.value[0]
      }

      // 2. Fetch Skip Intro / Outro Timestamps from AniSkip & Anime-Skip
      await loadSkipIntervals()

      // 3. Resolve initial playback start position (initialTime)
      if (route.query.t && !isNaN(Number(route.query.t))) {
        initialTime.value = Number(route.query.t)
      } else if (isLoggedIn.value && userId.value && full.supabaseContentId) {
        try {
          const { data: prog } = await supabase
            .from('watch_progress')
            .select('progress_seconds, duration_seconds')
            .eq('user_id', String(userId.value))
            .eq('content_id', String(full.supabaseContentId))
            .eq('season', isMovieMedia.value ? 0 : currentSeason.value)
            .eq('episode', isMovieMedia.value ? 0 : currentEpisode.value)
            .maybeSingle()

          if (prog && prog.progress_seconds > 0 && (!prog.duration_seconds || prog.progress_seconds < prog.duration_seconds * 0.95)) {
            initialTime.value = prog.progress_seconds
          }
        } catch (e) {
          console.warn('[PlayerView] Watch progress fetch error:', e)
        }
      }

      // 4. Extract candidateUrl & video_sources from Supabase Database
      let candidateUrl = null
      const isMovie = full.type === 'Film' || full.type === 'movie' || type === 'movie'
      if (full.videoStreams && full.videoStreams.length > 0) {
        let st = null
        if (isMovie) {
          st = full.videoStreams[0]
        } else {
          st = full.videoStreams.find(v => 
            Number(v.season) === currentSeason.value && Number(v.episode) === currentEpisode.value
          ) || full.videoStreams[0]
        }
        candidateUrl = st?.url
        if (st && st.video_sources) {
          try {
            episodeSources.value = typeof st.video_sources === 'string' ? JSON.parse(st.video_sources) : st.video_sources
          } catch (e) {
            episodeSources.value = []
          }
        } else {
          episodeSources.value = []
        }
      }

      // 5. Prioritize Full TMDB Multi-APIs resolution to guarantee Maximum Quality (1080p/720p)
      let resolved = null
      const tmdbIdToQuery = full.tmdb_id || full.tmdbId || full.id || (/^\d+$/.test(String(id)) ? id : null)
      const resolveQuery = tmdbIdToQuery || candidateUrl

      console.log(`[PlayerView] Résolution du flux haute qualité pour: ${full.title} (TMDB ID: ${tmdbIdToQuery}, Query: ${resolveQuery})`)

      resolved = await resolveStreamSource(
        resolveQuery,
        type === 'tv' || full.type === 'Série' || full.type === 'tv' ? 'tv' : 'movie',
        currentSeason.value,
        currentEpisode.value,
        full.title
      )

      if (resolved && resolved.streamUrl) {
        resolvedSourceData.value = resolved
        activeStreamUrl.value = await resolveHlsStreamUrl(resolved.streamUrl)
        if (resolved.availableSources?.length > 0) {
          episodeSources.value = resolved.availableSources
        }
        if (resolved.discoveredStreams?.length > 0) {
          discoveredDynamicStreams.value = resolved.discoveredStreams
        }
      } else if (candidateUrl) {
        activeStreamUrl.value = await resolveHlsStreamUrl(candidateUrl)
      } else if (!activeStreamUrl.value) {
        activeStreamUrl.value = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
      }

      // Console output: Display Supabase video details and URLs
      console.log('%c[SUPABASE VIDEO INFO]', 'background: #06b6d4; color: black; font-weight: bold; padding: 2px 6px; border-radius: 4px;')
      console.log('📌 Média:', full.title, `(ID: ${full.id} | TMDB: ${full.tmdb_id || 'N/A'})`)
      console.log('📦 Contenu Supabase ID:', full.supabaseContentId || 'Non enregistré')
      console.log('📹 Flux Supabase trouvés dans la base:', full.videoStreams || [])
      console.log(`🎬 Épisode actuel (S${currentSeason.value} E${currentEpisode.value}) flux disponibles:`, currentEpisodeStreams.value)
      console.log('🎯 URL sélectionnée depuis Supabase (candidateUrl):', candidateUrl)
      console.log('▶️ URL finale active envoyée au lecteur:', activeStreamUrl.value)

      // 5. Record in Supabase History table
      if (isLoggedIn.value && userId.value && full.supabaseContentId) {
        recordHistoryView(userId.value, full.supabaseContentId, currentSeason.value, currentEpisode.value)
      }
    }
  } catch (err) {
    console.warn('[PlayerView] Error loading player media:', err)
  } finally {
    isLoading.value = false
  }
}

let lastSavedSecond = -1
let lastKnownTime = 0
let lastKnownDuration = 0

function handleTimeUpdate({ currentTime, duration }) {
  lastKnownTime = currentTime
  lastKnownDuration = duration

  // Periodically save progress to Supabase watch_progress (throttled to once every 10 seconds)
  if (isLoggedIn.value && userId.value && media.value?.supabaseContentId && duration > 0) {
    const sec = Math.floor(currentTime)
    if (sec % 10 === 0 && sec !== lastSavedSecond) {
      lastSavedSecond = sec
      saveProgress(
        userId.value,
        media.value.supabaseContentId,
        isMovieMedia.value ? 0 : currentSeason.value,
        isMovieMedia.value ? 0 : currentEpisode.value,
        currentTime,
        duration
      )
    }
  }
}

// Flush the exact current playback position immediately, bypassing the 10s throttle.
// Called whenever the player is about to leave the current title/episode (back, unmount, episode switch)
// so the "reprendre" position always matches the instant the user actually stopped watching.
function flushProgress() {
  if (isLoggedIn.value && userId.value && media.value?.supabaseContentId && lastKnownDuration > 0) {
    saveProgress(
      userId.value,
      media.value.supabaseContentId,
      isMovieMedia.value ? 0 : currentSeason.value,
      isMovieMedia.value ? 0 : currentEpisode.value,
      lastKnownTime,
      lastKnownDuration
    )
  }
}

function handleEnded() {
  if (isLoggedIn.value && userId.value && media.value?.supabaseContentId && lastKnownDuration > 0) {
    // Marquer explicitement comme terminé à 100%
    saveProgress(
      userId.value,
      media.value.supabaseContentId,
      isMovieMedia.value ? 0 : currentSeason.value,
      isMovieMedia.value ? 0 : currentEpisode.value,
      lastKnownDuration,
      lastKnownDuration
    )
  }
}

async function handleSelectEpisode(ep) {
  flushProgress()
  currentEpisode.value = ep.episodeNumber
  activeEpisodeData.value = ep
  lastSavedSecond = -1
  lastKnownTime = 0
  lastKnownDuration = 0

  // Update query params without reloading
  router.replace({
    path: route.path,
    query: {
      ...route.query,
      season: currentSeason.value,
      episode: currentEpisode.value
    }
  })

  // 1. Fetch skip timestamps for new episode
  loadSkipIntervals()

  // 2. Check direct stream in Supabase videoStreams
  let candidateUrl = null
  if (media.value?.videoStreams && media.value.videoStreams.length > 0) {
    const stream = media.value.videoStreams.find(v => 
      Number(v.season) === currentSeason.value && Number(v.episode) === currentEpisode.value
    )
    candidateUrl = stream?.url
    if (stream && stream.video_sources) {
      try {
        episodeSources.value = typeof stream.video_sources === 'string' ? JSON.parse(stream.video_sources) : stream.video_sources
      } catch (e) {
        episodeSources.value = []
      }
    } else {
      episodeSources.value = []
    }
  }

  // 3. Resolve stream URL dynamically for new episode
  const type = route.query.type || (media.value?.type === 'Série' || media.value?.type === 'tv' ? 'tv' : 'movie')
  const tmdbIdToQuery = media.value?.tmdb_id || media.value?.tmdbId || media.value?.id || (/^\d+$/.test(String(route.params.id)) ? route.params.id : null)
  const resolveQuery = candidateUrl || tmdbIdToQuery

  try {
    const resolved = await resolveStreamSource(
      resolveQuery,
      type,
      currentSeason.value,
      currentEpisode.value
    )

    if (resolved && resolved.streamUrl) {
      resolvedSourceData.value = resolved
      activeStreamUrl.value = await resolveHlsStreamUrl(resolved.streamUrl)
      if (episodeSources.value.length === 0 && resolved.availableSources?.length > 0) {
        episodeSources.value = resolved.availableSources
      }
      if (resolved.discoveredStreams?.length > 0) {
        discoveredDynamicStreams.value = resolved.discoveredStreams
      }
    } else if (candidateUrl) {
      resolvedSourceData.value = null
      activeStreamUrl.value = await resolveHlsStreamUrl(candidateUrl)
    }

    console.log(`%c[EPISODE S${currentSeason.value} E${currentEpisode.value}]`, 'background: #10b981; color: black; font-weight: bold; padding: 2px 6px; border-radius: 4px;')
    console.log('🎯 URL Épisode Supabase:', candidateUrl)
    console.log('▶️ URL Finale active:', activeStreamUrl.value)
  } catch (err) {
    console.warn('[PlayerView] Error resolving new episode stream:', err)
  }

  // 4. Record in Supabase History table
  if (isLoggedIn.value && userId.value && media.value?.supabaseContentId) {
    recordHistoryView(userId.value, media.value.supabaseContentId, currentSeason.value, currentEpisode.value)
  }
}

async function handleSelectSeason(seasonNumber) {
  if (!media.value || seasonNumber === currentSeason.value) return
  flushProgress()

  currentSeason.value = seasonNumber
  episodesLoading.value = true
  try {
    episodesList.value = await fetchEpisodesForSeason(media.value, seasonNumber)
  } finally {
    episodesLoading.value = false
  }

  const firstEp = episodesList.value[0] || { episodeNumber: 1 }
  await handleSelectEpisode(firstEp)
}

const isWindows = typeof navigator !== 'undefined' && (
  (navigator.platform || '').toLowerCase().includes('win') || 
  navigator.userAgent.toLowerCase().includes('windows')
)

function handleBack() {
  flushProgress()
  if (isWindows) {
    try {
      WindowUnfullscreen()
    } catch (e) {}
  }
  if (media.value?.id) {
    router.push({
      path: `/detail/${media.value.supabaseContentId || media.value.id}`,
      query: { type: media.value.tmdbType || (media.value.type === 'Série' ? 'tv' : 'movie') }
    })
  } else {
    router.back()
  }
}

onMounted(() => {
  if (isWindows) {
    try {
      WindowFullscreen()
    } catch (e) {}
  }
  loadPlayerData()
})

onUnmounted(() => {
  flushProgress()
  if (isWindows) {
    try {
      WindowUnfullscreen()
    } catch (e) {}
  }
})

watch(() => route.params.id, () => {
  loadPlayerData()
})
const currentEpisodeStreams = computed(() => {
  if (media.value?.videoStreams && media.value.videoStreams.length > 0) {
    const isMovie = media.value.type === 'Film' || media.value.type === 'movie' || route.query.type === 'movie'
    if (isMovie) {
      return media.value.videoStreams
    }
    const filtered = media.value.videoStreams.filter(v => 
      Number(v.season) === currentSeason.value && Number(v.episode) === currentEpisode.value
    )
    if (filtered.length > 0) return filtered
  }
  return discoveredDynamicStreams.value || []
})
</script>

<template>
  <div class="fixed inset-0 w-full h-full bg-black z-50 overflow-hidden select-none">
    
    <!-- Native Mac HLS Video Player -->
    <VideoPlayer
      :src="activeStreamUrl"
      :available-sources="episodeSources"
      :all-episode-streams="currentEpisodeStreams"
      :title="playerTitle"
      :subtitle="playerSubtitle"
      :episode-label="playerEpisodeLabel"
      :logo="media?.logoUrl || media?.logo"
      :poster="media?.bgImg || media?.poster"
      :initial-time="initialTime"
      :skip-intro="skipIntervals?.intro"
      :skip-outro="skipIntervals?.outro"
      :episodes-list="episodesList"
      :episodes-loading="episodesLoading"
      :seasons="media?.seasons || []"
      :current-season="currentSeason"
      :current-episode="currentEpisode"
      :resolved-audio-tracks="resolvedSourceData?.audioTracks"
      :resolved-subtitles="resolvedSourceData?.subtitles"
      @back="handleBack"
      @timeupdate="handleTimeUpdate"
      @ended="handleEnded"
      @select-episode="handleSelectEpisode"
      @select-season="handleSelectSeason"
    />

  </div>
</template>
