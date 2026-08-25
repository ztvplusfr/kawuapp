<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getCoupledMediaDetails } from '../services/api/mediaService'
import { saveProgress, getUserContinueWatching } from '../services/api/watchService'
import { recordHistoryView, resolveHlsStreamUrl } from '../services/api/playerService'
import { fetchSkipIntervals } from '../services/api/skipService'
import { getSeasonEpisodes } from '../services/tmdb'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../services/supabase'
import VideoPlayer from '../components/VideoPlayer.vue'

import { resolveStreamSource } from '../services/resolvers'

const route = useRoute()
const router = useRouter()
const { userId, isLoggedIn } = useAuth()

const media = ref(null)
const isLoading = ref(true)
const activeStreamUrl = ref('')
const currentSeason = ref(Math.max(1, Number(route.query.season) || 1))
const currentEpisode = ref(Number(route.query.episode) || 1)
const episodesList = ref([])
const activeEpisodeData = ref(null)
const initialTime = ref(0)
const resolvedSourceData = ref(null)
const skipIntervals = ref(null)
const episodeSources = ref([])

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

async function loadPlayerData() {
  isLoading.value = true
  try {
    const id = route.params.id
    const type = route.query.type || 'movie'
    const full = await getCoupledMediaDetails(id, type)
    
    if (full) {
      media.value = full

      // 1. If TV series, fetch episodes for season
      if (full.type === 'Série' || type === 'tv') {
        const seasonObj = full.seasons?.find(s => s.season_number === currentSeason.value) || full.seasons?.[0]
        const eps = await getSeasonEpisodes(full.id, currentSeason.value, seasonObj)
        episodesList.value = eps || []
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
            .eq('season', currentSeason.value)
            .eq('episode', currentEpisode.value)
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
      if (full.videoStreams && full.videoStreams.length > 0) {
        const st = full.videoStreams.find(v => 
          Number(v.season) === currentSeason.value && Number(v.episode) === currentEpisode.value
        ) || full.videoStreams[0]
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

      // 5. Prioritize Supabase DB candidateUrl, fallback to Nakastream API only if DB is empty
      // First, try to resolve the candidate URL (it may be a nakastream API URL that needs to be resolved)
      let resolved = null
      if (candidateUrl) {
        // Try to resolve the candidateUrl through the stream resolvers (nakastream API URL → real m3u8)
        resolved = await resolveStreamSource(
          candidateUrl,
          type === 'tv' || full.type === 'Série' ? 'tv' : 'movie',
          currentSeason.value,
          currentEpisode.value
        )
        if (!resolved || !resolved.streamUrl) {
          // Fallback: treat candidateUrl as direct m3u8
          activeStreamUrl.value = await resolveHlsStreamUrl(candidateUrl)
        }
      } else {
        const resolveQuery = full.tmdb_id || id
        resolved = await resolveStreamSource(
          resolveQuery,
          type === 'tv' || full.type === 'Série' ? 'tv' : 'movie',
          currentSeason.value,
          currentEpisode.value
        )
      }

      if (resolved && resolved.streamUrl) {
        resolvedSourceData.value = resolved
        activeStreamUrl.value = await resolveHlsStreamUrl(resolved.streamUrl)
      } else if (!activeStreamUrl.value) {
        // High quality HLS demonstration stream fallback
        activeStreamUrl.value = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
      }

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

function handleTimeUpdate({ currentTime, duration }) {
  // Periodically save progress to Supabase watch_progress (throttled to once every 10 seconds)
  if (isLoggedIn.value && userId.value && media.value?.supabaseContentId && duration > 0) {
    const sec = Math.floor(currentTime)
    if (sec % 10 === 0 && sec !== lastSavedSecond) {
      lastSavedSecond = sec
      saveProgress(
        userId.value,
        media.value.supabaseContentId,
        currentSeason.value,
        currentEpisode.value,
        currentTime,
        duration
      )
    }
  }
}

async function handleSelectEpisode(ep) {
  currentEpisode.value = ep.episodeNumber
  activeEpisodeData.value = ep
  lastSavedSecond = -1

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
      v.season === currentSeason.value && v.episode === currentEpisode.value
    )
    candidateUrl = stream?.url
  }

  // 3. Resolve stream URL dynamically for new episode
  const type = route.query.type || (media.value?.type === 'Série' ? 'tv' : 'movie')
  const resolveQuery = candidateUrl || media.value?.tmdb_id || route.params.id

  try {
    const resolved = await resolveStreamSource(
      resolveQuery,
      type,
      currentSeason.value,
      currentEpisode.value
    )

    if (resolved && resolved.streamUrl) {
      resolvedSourceData.value = resolved
      activeStreamUrl.value = resolved.streamUrl
    } else if (candidateUrl && candidateUrl.includes('.m3u8')) {
      activeStreamUrl.value = candidateUrl
    }
  } catch (err) {
    console.warn('[PlayerView] Error resolving new episode stream:', err)
  }

  // 4. Record in Supabase History table
  if (isLoggedIn.value && userId.value && media.value?.supabaseContentId) {
    recordHistoryView(userId.value, media.value.supabaseContentId, currentSeason.value, currentEpisode.value)
  }
}

function handleBack() {
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
  loadPlayerData()
})

watch(() => route.params.id, () => {
  loadPlayerData()
})
const currentEpisodeStreams = computed(() => {
  if (!media.value || !media.value.videoStreams) return []
  return media.value.videoStreams.filter(v => 
    Number(v.season) === currentSeason.value && Number(v.episode) === currentEpisode.value
  )
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
      :current-season="currentSeason"
      :current-episode="currentEpisode"
      :resolved-audio-tracks="resolvedSourceData?.audioTracks"
      :resolved-subtitles="resolvedSourceData?.subtitles"
      @back="handleBack"
      @timeupdate="handleTimeUpdate"
      @select-episode="handleSelectEpisode"
    />

  </div>
</template>
