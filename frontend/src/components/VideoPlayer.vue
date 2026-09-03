<script setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import Hls from 'hls.js'
import { SetNowPlayingInfo, ClearNowPlayingInfo } from '../../wailsjs/go/main/App'
import {
  IconArrowLeft,
  IconRotate2,
  IconPlayerPlay,
  IconPlayerPause,
  IconLoader2,
  IconX,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconList,
  IconPlayerSkipForward,
  IconShareplay,
  IconCast,
  IconServer,
  IconLanguage,
  IconKeyboard
} from '@tabler/icons-vue'

const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  availableSources: {
    type: Array,
    default: () => []
  },
  title: {
    type: String,
    default: 'ONE PIECE'
  },
  subtitle: {
    type: String,
    default: ''
  },
  episodeLabel: {
    type: String,
    default: ''
  },
  poster: {
    type: String,
    default: ''
  },
  initialTime: {
    type: Number,
    default: 0
  },
  episodesList: {
    type: Array,
    default: () => []
  },
  episodesLoading: {
    type: Boolean,
    default: false
  },
  seasons: {
    type: Array,
    default: () => []
  },
  currentSeason: {
    type: Number,
    default: 1
  },
  currentEpisode: {
    type: Number,
    default: 1
  },
  allEpisodeStreams: {
    type: Array,
    default: () => []
  },
  resolvedAudioTracks: {
    type: Array,
    default: () => []
  },
  resolvedSubtitles: {
    type: Array,
    default: () => []
  },
  logo: {
    type: String,
    default: ''
  },
  skipIntro: {
    type: Object,
    default: null
  },
  skipOutro: {
    type: Object,
    default: null
  }
})

const emit = defineEmits([
  'back',
  'timeupdate',
  'progress',
  'ended',
  'selectEpisode',
  'selectSeason'
])

// References
const videoRef = ref(null)
const playerContainerRef = ref(null)
let hlsInstance = null

// Player State
const isPlaying = ref(false)
const isBuffering = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const bufferedEnd = ref(0)
const showControls = ref(true)
const isAirPlayActive = ref(false)
const showAudioSubModal = ref(false)
const audioSubView = ref('menu')
const showEpisodesPanel = ref(false)
const showSeasonDropdown = ref(false)

watch(showEpisodesPanel, (open) => {
  if (!open) showSeasonDropdown.value = false
})

function selectSeason(seasonNumber) {
  showSeasonDropdown.value = false
  if (seasonNumber === props.currentSeason) return
  emit('selectSeason', seasonNumber)
}

function openAudioSubModal() {
  audioSubView.value = 'menu'
  showAudioSubModal.value = true
}

function openAudioModal() {
  audioSubView.value = 'audio'
  showAudioSubModal.value = true
}

function openServersModal() {
  audioSubView.value = 'servers'
  showAudioSubModal.value = true
}

function openOptionsModal() {
  audioSubView.value = 'menu'
  showAudioSubModal.value = true
}
const logoError = ref(false)

const hasNextEpisode = computed(() => {
  if (!props.episodesList || props.episodesList.length === 0) return false
  const currentIndex = props.episodesList.findIndex(e => e.episodeNumber === props.currentEpisode)
  return currentIndex !== -1 && currentIndex < props.episodesList.length - 1
})

function goToNextEpisode() {
  if (!props.episodesList || props.episodesList.length === 0) return
  const currentIndex = props.episodesList.findIndex(e => e.episodeNumber === props.currentEpisode)
  if (currentIndex !== -1 && currentIndex < props.episodesList.length - 1) {
    const nextEp = props.episodesList[currentIndex + 1]
    emit('selectEpisode', nextEp)
  }
}

// Automatic Skip Intro / Outro Computations & Actions
// "Passer l'intro" temporarily hidden (masqué pour le moment)
const showSkipIntroButton = computed(() => false)

const showSkipOutroButton = computed(() => {
  // 1. If explicit outro timestamp from API exists
  if (props.skipOutro && typeof props.skipOutro.startTime === 'number' && props.skipOutro.startTime > 0) {
    return currentTime.value >= props.skipOutro.startTime
  }

  // 2. Automatic fallback for all series: show in the last 2 minutes (120s) of an episode
  const isSeries = !!props.episodeLabel || (props.episodesList && props.episodesList.length > 0)
  if (isSeries && duration.value > 120) {
    const timeRemaining = duration.value - currentTime.value
    return timeRemaining > 0 && timeRemaining <= 120
  }

  return false
})

// "Passer l'intro" (manual fallback) temporarily hidden (masqué pour le moment)
const showManualSkipIntroButton = computed(() => false)

function skipIntroAction() {
  const video = videoRef.value
  if (!video) return
  if (props.skipIntro?.endTime && props.skipIntro.endTime > 0) {
    video.currentTime = props.skipIntro.endTime
  } else {
    video.currentTime = 90
  }
  resetControlsTimer()
}

function skipOutroAction() {
  if (hasNextEpisode.value) {
    goToNextEpisode()
  } else if (props.skipOutro?.endTime) {
    const video = videoRef.value
    if (video) video.currentTime = props.skipOutro.endTime
  } else if (videoRef.value && duration.value > 0) {
    videoRef.value.currentTime = duration.value - 2
  }
}

function skipManual90sAction() {
  const video = videoRef.value
  if (!video) return
  
  // If an automatic end time exists, use it
  if (props.skipIntro?.endTime && props.skipIntro.endTime > 0) {
    video.currentTime = props.skipIntro.endTime
    resetControlsTimer()
    return
  }

  // Standard intro end is at 90s (1:30 mark).
  // If user clicks anywhere in the first 90s, set time directly to 90s (end of intro)
  if (currentTime.value <= 90) {
    video.currentTime = 90
  } else {
    // If intro starts later (cold open), advance 85s from current time or to duration end
    video.currentTime = Math.min(duration.value || 1440, currentTime.value + 85)
  }
  resetControlsTimer()
}

// OS Detection State
const isMac = ref(false)
const isWindows = ref(false)

function detectOS() {
  if (typeof navigator === 'undefined') return
  const ua = navigator.userAgent.toLowerCase()
  const platform = (navigator.platform || '').toLowerCase()
  isMac.value = platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os') || ua.includes('ipad') || ua.includes('iphone')
  isWindows.value = platform.includes('win') || ua.includes('windows')
}

import { resolveHlsStreamUrl } from '../services/api/playerService'
import { resolveStreamSource } from '../services/resolvers'
import { useUserPreferences } from '../composables/useUserPreferences'

const { preferredLanguage, preferredQuality } = useUserPreferences()

// Quality state (HLS Multi-Quality levels & always max HD/FHD)
const qualityLevels = ref([])
const selectedQualityIndex = ref(-1)

const currentQualityBadge = computed(() => {
  if (selectedQualityIndex.value >= 0 && qualityLevels.value[selectedQualityIndex.value]) {
    const q = qualityLevels.value[selectedQualityIndex.value]
    return q.tag || (q.height ? `${q.height}p` : 'HD')
  }
  return 'HD'
})

function selectQuality(idx) {
  if (!hlsInstance) return
  if (idx >= 0 && idx < qualityLevels.value.length) {
    hlsInstance.currentLevel = idx
    hlsInstance.loadLevel = idx
    hlsInstance.nextLevel = idx
    selectedQualityIndex.value = idx
    const q = qualityLevels.value[idx]
    triggerOsd(`Qualité : ${q.label || q.tag || 'HD'}`, '📺')
  }
}

function cycleQualityShortcut() {
  if (!qualityLevels.value || qualityLevels.value.length <= 1) {
    triggerOsd('Qualité : Source unique', '📺')
    return
  }
  const curIdx = selectedQualityIndex.value
  const nextIdx = (curIdx + 1) % qualityLevels.value.length
  selectQuality(nextIdx)
}

// Server / Video Source Mirror Switcher & Stream Switcher
const activeSourceUrl = ref('')
const currentSelectedSourceUrl = ref('')
const currentStreamSources = ref([])
const isSwitchingSource = ref('')
const selectedServerLangFilter = ref('all')

function isCurrentSourceActive(src) {
  if (!src || !src.url) return false
  if (currentSelectedSourceUrl.value && currentSelectedSourceUrl.value === src.url) return true
  const active = (activeSourceUrl.value || props.src || '').toLowerCase()
  const target = src.url.toLowerCase()
  if (active === target) return true
  return false
}

function getSourceQualityBadge(src) {
  if (!src) return 'HD'
  const low = `${src.url || ''} ${src.name || ''} ${src.quality || ''}`.toLowerCase()
  if (low.includes('1080') || low.includes('fhd') || low.includes('swiftflow') || low.includes('blinkflux')) return '1080p FHD'
  if (low.includes('vidara') || low.includes('720') || low.includes('s1q2105')) return '720p HD'
  if (low.includes('uqload')) return '1080p FHD'
  if (low.includes('ansembed') || low.includes('vidmoly')) return '1080p FHD'
  if (src.quality) return src.quality
  return 'HD'
}

async function changeStreamSource(rawUrl, preserveTime = true) {
  if (!rawUrl) return
  const video = videoRef.value
  const currentPos = preserveTime && video ? (video.currentTime || 0) : 0

  isSwitchingSource.value = rawUrl
  currentSelectedSourceUrl.value = rawUrl

  try {
    let streamToPlay = rawUrl
    try {
      const resolved = await resolveStreamSource(rawUrl)
      if (resolved && resolved.streamUrl) {
        streamToPlay = resolved.streamUrl
      }
    } catch (e) {}

    streamToPlay = await resolveHlsStreamUrl(streamToPlay)
    activeSourceUrl.value = streamToPlay

    await nextTick()
    loadVideoWithEngine(streamToPlay, currentPos)
  } finally {
    isSwitchingSource.value = ''
  }
}

async function switchVideoSource(sourceItem) {
  if (!sourceItem || !sourceItem.url) return
  await changeStreamSource(sourceItem.url, true)
}

// Native AirPlay (macOS WebKit) & Chromecast (Windows/Chrome) Engine Triggers
function triggerAirPlay() {
  const video = videoRef.value
  if (!video) return
  if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
    video.webkitShowPlaybackTargetPicker()
  } else if ('WebKitPlaybackTargetAvailabilityEvent' in window) {
    video.webkitShowPlaybackTargetPicker()
  } else {
    alert("AirPlay n'est pas disponible sur cet appareil ou navigateur.")
  }
}

async function triggerCast() {
  const video = videoRef.value
  if (!video) return

  // 1. Native Presentation API (Chromium / Windows Cast Dialog)
  if (window.PresentationRequest) {
    try {
      const srcUrl = props.src || video.currentSrc
      if (srcUrl) {
        const request = new PresentationRequest([srcUrl])
        request.start().then(connection => {
          console.log('[Cast] Connecté au récepteur de présentation:', connection)
        }).catch(err => {
          if (err.name !== 'NotFoundError' && err.name !== 'AbortError') {
            console.warn('[Cast] Erreur de présentation:', err)
          }
        })
        return
      }
    } catch (e) {
      console.warn('[Cast] PresentationRequest failed:', e)
    }
  }

  // 2. Fallback to WebKit AirPlay if available
  if (typeof video.webkitShowPlaybackTargetPicker === 'function') {
    video.webkitShowPlaybackTargetPicker()
    return
  }

  alert("Aucun récepteur Cast / Chromecast détecté sur le réseau local.")
}

// HTML5 MediaSession API (macOS Control Center / Windows OSD Media / Lock Screen / System Controls)
function setupMediaSession() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

  try {
    const artwork = []
    if (props.poster) {
      artwork.push(
        { src: props.poster, sizes: '512x512', type: 'image/jpeg' },
        { src: props.poster, sizes: '192x192', type: 'image/jpeg' }
      )
    }

    // For AirPlay compatibility with Samsung TVs (2 lines on Now Playing)
    // Line 1 (title) = show/movie name
    // Line 2 (album) = episode info for series, just "Kawu" for movies
    let mediaTitle = props.title || 'Kawu'
    let mediaAlbum = props.episodeLabel || 'Kawu'

    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediaTitle,
      artist: mediaAlbum,
      album: mediaAlbum,
      artwork: artwork
    })

    // Action Handlers for System / Keyboard / AirPlay / OS Media Controls
    navigator.mediaSession.setActionHandler('play', () => {
      const video = videoRef.value
      if (video) {
        video.play()
        isPlaying.value = true
      }
    })

    navigator.mediaSession.setActionHandler('pause', () => {
      const video = videoRef.value
      if (video) {
        video.pause()
        isPlaying.value = false
      }
    })

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const skipTime = details.seekOffset || 10
      seekRelative(-skipTime)
    })

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const skipTime = details.seekOffset || 10
      seekRelative(skipTime)
    })

    if (hasNextEpisode.value) {
      navigator.mediaSession.setActionHandler('nextepisode', () => {
        goToNextEpisode()
      })
    } else {
      try { navigator.mediaSession.setActionHandler('nextepisode', null) } catch (e) {}
    }

    if (props.episodesList && props.episodesList.length > 0) {
      const currentIndex = props.episodesList.findIndex(e => e.episodeNumber === props.currentEpisode)
      if (currentIndex > 0) {
        navigator.mediaSession.setActionHandler('previousepisode', () => {
          const prevEp = props.episodesList[currentIndex - 1]
          emit('selectEpisode', prevEp)
        })
      } else {
        try { navigator.mediaSession.setActionHandler('previousepisode', null) } catch (e) {}
      }
    }

    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined && videoRef.value) {
          videoRef.value.currentTime = details.seekTime
        }
      })
    } catch (e) {}

    // Native macOS Now Playing (AirPlay / Control Center / TV displays)
    updateMediaSessionPositionState()

  } catch (e) {
    console.warn('[MediaSession] Error initializing MediaSession API:', e)
  }
}

function updateMediaSessionPositionState() {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  if ('setPositionState' in navigator.mediaSession && duration.value > 0 && !isNaN(duration.value)) {
    try {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration.value),
        playbackRate: videoRef.value?.playbackRate || 1,
        position: Math.min(Math.max(0, currentTime.value), duration.value)
      })
    } catch (e) {}
  }

  // Update native macOS Now Playing info (used by AirPlay / Control Center on TV)
  try {
    // Line 1 (title) = show name
    // Line 2 shown by macOS Control Center = MPMediaItemPropertyArtist (3rd arg below),
    // NOT album — episode info for series, just "Kawu" for movies
    const mediaTitle = props.title || 'Kawu'
    const mediaSubtitle = props.episodeLabel || 'Kawu'
    SetNowPlayingInfo(
      mediaTitle,
      mediaSubtitle,
      mediaSubtitle,
      'Kawu Streaming',
      Math.max(0, duration.value),
      Math.min(Math.max(0, currentTime.value), duration.value),
      videoRef.value?.playbackRate || (isPlaying.value ? 1 : 0)
    )
  } catch (e) {}
}

// Web Audio API DSP Equalizer & Spatial Atmos Pipeline
const activeAudioDSP = ref('standard')
let audioCtx = null
let mediaSourceNode = null
let voiceFilterNode = null
let compressorNode = null
let pannerNode = null

function initWebAudioDSP() {
  const video = videoRef.value
  if (!video || audioCtx) return

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    audioCtx = new AudioCtx()

    mediaSourceNode = audioCtx.createMediaElementSource(video)

    // Voice Peaking Filter (Boost speech frequencies around 2kHz)
    voiceFilterNode = audioCtx.createBiquadFilter()
    voiceFilterNode.type = 'peaking'
    voiceFilterNode.frequency.value = 2000
    voiceFilterNode.Q.value = 1.2
    voiceFilterNode.gain.value = 0

    // Dynamics Compressor Node (Limiter for explosions / quiet speech normalization)
    compressorNode = audioCtx.createDynamicsCompressor()
    compressorNode.threshold.value = -24
    compressorNode.knee.value = 30
    compressorNode.ratio.value = 12
    compressorNode.attack.value = 0.003
    compressorNode.release.value = 0.25

    // 3D Spatial Panner Node (HRTF Head-Related Transfer Function spatializer)
    pannerNode = audioCtx.createPanner()
    pannerNode.panningModel = 'HRTF'
    pannerNode.distanceModel = 'inverse'
    pannerNode.positionX.value = 0
    pannerNode.positionY.value = 0
    pannerNode.positionZ.value = 0

    // Pipeline: MediaSource -> VoiceFilter -> Compressor -> Panner -> Destination
    mediaSourceNode.connect(voiceFilterNode)
    voiceFilterNode.connect(compressorNode)
    compressorNode.connect(pannerNode)
    pannerNode.connect(audioCtx.destination)
  } catch (e) {
    console.warn('[WebAudio] AudioContext init notice:', e)
  }
}

function setAudioDSPMode(mode) {
  activeAudioDSP.value = mode
  if (!audioCtx && videoRef.value) {
    initWebAudioDSP()
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  if (voiceFilterNode) {
    if (mode === 'voice') {
      voiceFilterNode.gain.value = 7.5 // +7.5dB Speech Boost!
    } else if (mode === 'spatial') {
      voiceFilterNode.gain.value = 3.5
    } else {
      voiceFilterNode.gain.value = 0
    }
  }

  if (compressorNode) {
    if (mode === 'night') {
      compressorNode.threshold.value = -32
      compressorNode.ratio.value = 16
    } else {
      compressorNode.threshold.value = -24
      compressorNode.ratio.value = 4
    }
  }

  if (pannerNode) {
    if (mode === 'spatial') {
      pannerNode.positionZ.value = -1.8 // Deep 3D cinema soundfield!
    } else {
      pannerNode.positionZ.value = 0 // Standard stereo
    }
  }
}

// Track state
const audioTracks = ref([])
const subtitleTracks = ref([])
const activeAudioIndex = ref(0)
const activeSubtitleIndex = ref(-1)
const activePillId = ref('')

let controlsTimeout = null

// Clock
const currentClockTime = ref('')
let clockInterval = null
let airPlayCheckInterval = null

function updateClock() {
  const now = new Date()
  currentClockTime.value = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
  }
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

const progressPercent = computed(() => {
  if (!duration.value || duration.value === 0) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})

const bufferedPercent = computed(() => {
  if (!duration.value || duration.value === 0) return 0
  return Math.min(100, Math.max(0, (bufferedEnd.value / duration.value) * 100))
})

const isHoveringScrubber = ref(false)
const scrubberHoverTime = ref(0)
const scrubberHoverPercent = ref(0)
const scrubberHoverPixelX = ref(0)

function onScrubberMouseMove(e) {
  if (!duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  scrubberHoverPixelX.value = relX
  scrubberHoverPercent.value = (relX / rect.width) * 100
  scrubberHoverTime.value = (relX / rect.width) * duration.value
}

const isNakastreamVideo = computed(() => {
  const currentUrl = (activeSourceUrl.value || props.src || '').toLowerCase()
  return currentUrl.includes('nakastream') || currentUrl.includes('media.nakastream') || (props.resolvedAudioTracks && props.resolvedAudioTracks.length > 0)
})

function formatLangLabel(lang, title = '') {
  if (!lang) return 'Version Standard'
  const clean = String(lang).trim().toLowerCase()
  if (clean === 'vf' || clean === 'fr' || clean === 'french') return 'Français (VF)'
  if (clean === 'vostfr' || clean === 'vost') {
    const isAnime = title && (
      title.toLowerCase().includes('piece') ||
      title.toLowerCase().includes('naruto') ||
      title.toLowerCase().includes('dragon') ||
      title.toLowerCase().includes('jujutsu') ||
      title.toLowerCase().includes('hero') ||
      title.toLowerCase().includes('titan') ||
      title.toLowerCase().includes('bleach') ||
      title.toLowerCase().includes('hunter') ||
      title.toLowerCase().includes('slayer')
    )
    return isAnime ? 'Japonais (VOSTFR)' : 'VOSTFR (Sous-titres FR)'
  }
  if (clean === 'vo') return 'Version Originale (VO)'
  if (clean === 'va' || clean === 'en' || clean === 'eng' || clean === 'english') return 'Anglais (VA)'
  if (clean === 'jap' || clean === 'jp' || clean === 'jpn' || clean === 'japanese') return 'Japonais (VO)'
  if (clean === 'es' || clean === 'spa' || clean === 'spanish') return 'Espagnol'
  if (clean === 'de' || clean === 'ger' || clean === 'german') return 'Allemand'
  if (clean === 'it' || clean === 'ita' || clean === 'italian') return 'Italien'
  if (clean === 'ko' || clean === 'kor' || clean === 'korean') return 'Coréen'
  return clean.toUpperCase()
}

function getCleanAudioLabel(langCode, rawLabel) {
  const code = (langCode || rawLabel || '').toLowerCase()
  if (code.includes('fr') || code.includes('fra') || code.includes('fre') || code.includes('french')) return 'Français (VF)'
  if (code.includes('en') || code.includes('eng') || code.includes('english')) return 'Anglais (VO)'
  if (code.includes('ja') || code.includes('jpn') || code.includes('jap') || code.includes('japanese')) return 'Japonais (VO)'
  if (code.includes('es') || code.includes('spa') || code.includes('spanish')) return 'Espagnol'
  if (code.includes('de') || code.includes('ger') || code.includes('deu') || code.includes('german')) return 'Allemand'
  if (code.includes('it') || code.includes('ita') || code.includes('italian')) return 'Italien'
  if (code.includes('ko') || code.includes('kor') || code.includes('korean')) return 'Coréen'
  return rawLabel || langCode || 'Piste Audio'
}

// Real multi-audio tracks: ONLY for Nakastream (all other video sources use single audio with stream lang)
const availableAudioTracks = computed(() => {
  if (!isNakastreamVideo.value) {
    return []
  }
  if (props.resolvedAudioTracks && props.resolvedAudioTracks.length > 0) {
    return props.resolvedAudioTracks
  }
  if (audioTracks.value && audioTracks.value.length > 0) {
    return audioTracks.value.map(t => ({
      lang: t.lang || t.name,
      label: getCleanAudioLabel(t.lang, t.name),
      default: !!t.default
    }))
  }
  return []
})

const availableSubtitles = computed(() => {
  if (props.resolvedSubtitles && props.resolvedSubtitles.length > 0) {
    return props.resolvedSubtitles
  }
  if (isNakastreamVideo.value && subtitleTracks.value && subtitleTracks.value.length > 0) {
    return subtitleTracks.value.map(s => ({
      lang: s.lang || s.name,
      label: s.name || s.lang || 'Sous-titre',
      url: s.url || '',
      default: !!s.default
    }))
  }
  return []
})

// Dynamic Language Quick Pills
const dynamicLanguagePills = computed(() => {
  // 1. For all videos EXCEPT Nakastream: Extract just `lang` from video streams
  if (!isNakastreamVideo.value) {
    const streams = props.allEpisodeStreams || []
    if (streams.length > 0) {
      const seenLangs = new Set()
      const pills = []

      streams.forEach((st) => {
        const rawLang = (st.lang || 'vostfr').trim()
        const langKey = rawLang.toLowerCase()
        if (!seenLangs.has(langKey)) {
          seenLangs.add(langKey)
          pills.push({
            id: `pill-lang-${langKey}`,
            lang: langKey,
            label: formatLangLabel(rawLang, props.title),
            stream: st,
            url: st.url,
            isStreamSwitch: true
          })
        }
      })

      if (pills.length > 0) return pills
    }
    return []
  }

  // 2. ONLY FOR NAKASTREAM: Use real multi-audio tracks and subtitles
  const audios = availableAudioTracks.value
  const subs = availableSubtitles.value
  const pills = []

  if (audios.length > 0) {
    audios.forEach((audio, idx) => {
      const rawCode = (audio.lang || audio.label || '').toLowerCase()
      const isFrench = rawCode.includes('fr') || rawCode.includes('french')
      const hasFrenchSub = subs.length > 0 && subs.some(s => (s.lang || s.label || '').toLowerCase().includes('fr'))

      let label = audio.label || getCleanAudioLabel(audio.lang, audio.label)
      let subIdx = -1

      if (!isFrench && hasFrenchSub) {
        const isAnime = props.title && (
          props.title.toLowerCase().includes('piece') ||
          props.title.toLowerCase().includes('naruto') ||
          props.title.toLowerCase().includes('dragon')
        )
        label = (rawCode.includes('ja') ? 'Japonais' : rawCode.includes('en') ? 'Anglais' : 'VO') + ' (Sous-titres FR)'
        subIdx = 0
      }

      pills.push({
        id: `pill-audio-${idx}`,
        label: label,
        audioIdx: idx,
        subIdx: subIdx,
        isStreamSwitch: false
      })
    })
    return pills
  }

  return []
})

const currentActiveLanguageLabel = computed(() => {
  if (dynamicLanguagePills.value && dynamicLanguagePills.value.length > 0) {
    const active = dynamicLanguagePills.value.find(p => p.id === activePillId.value)
    if (active) return active.label
    return dynamicLanguagePills.value[0].label
  }
  return 'Langue'
})

// Non-Nakastream sources are single-language mirrors (Vidmoly, Uqload, ...): the
// currently playing one, used to collapse "Langue" + "Sources" into one button.
const currentActiveSource = computed(() => {
  const sources = allAvailableSourcesList.value
  if (!sources || sources.length === 0) return null
  return sources.find(s => isCurrentSourceActive(s)) || sources[0]
})

const currentSourceLangLabel = computed(() => {
  const src = currentActiveSource.value
  if (!src) return currentActiveLanguageLabel.value
  const name = src.name || 'Source'
  const lang = (src.lang || 'vf').toUpperCase()
  return `${name} — ${lang}`
})

const activeSubtitleBlobUrl = ref('')
const parsedCues = ref([])
const activeCueTextFromTrack = ref('')

function parseVttTime(timeStr) {
  if (!timeStr) return 0
  const clean = timeStr.trim().split(/\s+/)[0]
  const parts = clean.split(':')
  let seconds = 0
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return isNaN(seconds) ? 0 : seconds
}

function parseVttCues(vttText) {
  if (!vttText) return []
  const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const cues = []
  let currentCue = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim()
    if (!rawLine || rawLine.startsWith('WEBVTT') || rawLine.startsWith('NOTE')) continue

    if (rawLine.includes('-->')) {
      const parts = rawLine.split('-->')
      const start = parseVttTime(parts[0])
      const end = parseVttTime(parts[1])
      currentCue = { start, end, text: '' }
      cues.push(currentCue)
    } else if (currentCue) {
      const cleanLine = rawLine.replace(/<\/?[^>]+(>|$)/g, '').trim()
      if (cleanLine) {
        if (currentCue.text) currentCue.text += '\n' + cleanLine
        else currentCue.text = cleanLine
      }
    }
  }
  return cues
}

const activeCueText = computed(() => {
  if (activeCueTextFromTrack.value) return activeCueTextFromTrack.value
  if (!parsedCues.value || parsedCues.value.length === 0) return ''
  const t = currentTime.value
  const cue = parsedCues.value.find(c => t >= c.start && t <= c.end)
  return cue ? cue.text : ''
})

async function selectPill(pill) {
  if (!pill) return
  activePillId.value = pill.id

  // 1. Non-Nakastream: Switch video stream based on extracted `lang`
  if (pill.isStreamSwitch || !isNakastreamVideo.value) {
    const streams = props.allEpisodeStreams || []
    const stream = pill.stream || streams.find(s => (s.lang || '').toLowerCase() === (pill.lang || '').toLowerCase())
    if (stream && stream.url) {
      console.log(`[VideoPlayer] Switching video stream for lang [${pill.lang}]:`, stream.url)

      if (stream.video_sources) {
        try {
          const parsed = typeof stream.video_sources === 'string' ? JSON.parse(stream.video_sources) : stream.video_sources
          if (Array.isArray(parsed) && parsed.length > 0) {
            filteredSources.value = parsed
          }
        } catch (e) {}
      }

      activeSourceUrl.value = stream.url
      loadVideoWithEngine(stream.url, currentTime.value || 0)
    }
    return
  }

  // 2. Nakastream: Switch audio and subtitle tracks within the master HLS
  activeAudioIndex.value = pill.audioIdx
  activeSubtitleIndex.value = pill.subIdx
  applyTrackSelection(pill.audioIdx, pill.subIdx)
}

async function loadAndApplySubtitle(subIdx) {
  const video = videoRef.value
  if (!video) return

  if (subIdx === -1) {
    parsedCues.value = []
    activeCueTextFromTrack.value = ''
    if (activeSubtitleBlobUrl.value) {
      URL.revokeObjectURL(activeSubtitleBlobUrl.value)
      activeSubtitleBlobUrl.value = ''
    }
    if (hlsInstance) hlsInstance.subtitleTrack = -1
    if (video.textTracks && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = 'disabled'
      }
    }
    return
  }

  const subs = availableSubtitles.value
  const targetSub = subs[subIdx]
  const subUrl = targetSub?.url || targetSub?.src
  if (!subUrl) return

  try {
    let vttText = ''
    if (window.go?.main?.App?.ProxyHlsContent) {
      try {
        vttText = await window.go.main.App.ProxyHlsContent(subUrl)
      } catch (e) {}
    }
    if (!vttText && window.go?.main?.App?.FetchNakastreamSubtitle) {
      try {
        vttText = await window.go.main.App.FetchNakastreamSubtitle(subUrl)
      } catch (e) {}
    }
    if (!vttText) {
      const res = await fetch(subUrl)
      if (res.ok) vttText = await res.text()
    }

    if (vttText) {
      parsedCues.value = parseVttCues(vttText)
      const blob = new Blob([vttText], { type: 'text/vtt' })
      if (activeSubtitleBlobUrl.value) {
        URL.revokeObjectURL(activeSubtitleBlobUrl.value)
      }
      activeSubtitleBlobUrl.value = URL.createObjectURL(blob)

      setTimeout(() => {
        if (video.textTracks && video.textTracks.length > 0) {
          for (let i = 0; i < video.textTracks.length; i++) {
            const track = video.textTracks[i]
            track.mode = 'hidden'
            track.oncuechange = () => {
              if (track.activeCues && track.activeCues.length > 0) {
                const cueTexts = []
                for (let j = 0; j < track.activeCues.length; j++) {
                  const txt = track.activeCues[j].text || ''
                  cueTexts.push(txt.replace(/<\/?[^>]+(>|$)/g, '').trim())
                }
                activeCueTextFromTrack.value = cueTexts.filter(Boolean).join('\n')
              } else {
                activeCueTextFromTrack.value = ''
              }
            }
          }
        }
      }, 100)
    }
  } catch (err) {
    console.warn('[VideoPlayer] Subtitle load error:', err)
  }
}

async function applyTrackSelection(audioIdx, subIdx) {
  const video = videoRef.value
  if (!video) return

  // 1. SWITCH AUDIO TRACK (HLS.js + Native macOS WebKit AVPlayer) - Nakastream only
  if (audioIdx !== -1 && hlsInstance && hlsInstance.audioTracks && hlsInstance.audioTracks[audioIdx]) {
    hlsInstance.audioTrack = audioIdx
  }
  if (audioIdx !== -1 && video.audioTracks && video.audioTracks.length > 0) {
    for (let i = 0; i < video.audioTracks.length; i++) {
      video.audioTracks[i].enabled = (i === audioIdx)
    }
  }

  // 2. SWITCH SUBTITLE TRACK & LOAD VTT
  activeSubtitleIndex.value = subIdx
  await loadAndApplySubtitle(subIdx)
}

// Auto-enable VOSTFR subtitles by default whenever subtitles become available
watch(availableSubtitles, (subs) => {
  if (subs && subs.length > 0) {
    const frIdx = subs.findIndex(s => s.default || s.lang?.includes('fr') || s.label?.toLowerCase().includes('fr'))
    const targetIdx = frIdx !== -1 ? frIdx : 0
    activeSubtitleIndex.value = targetIdx
    loadAndApplySubtitle(targetIdx)
  }
}, { immediate: true, deep: true })

function resetControlsTimer() {
  showControls.value = true
  if (controlsTimeout) clearTimeout(controlsTimeout)
  if (isPlaying.value && !showAudioSubModal.value && !showEpisodesPanel.value) {
    controlsTimeout = setTimeout(() => {
      showControls.value = false
    }, 3500)
  }
}

function onContainerClick(e) {
  if (e.target.closest('button') || e.target.closest('.controls-interactive') || showAudioSubModal.value || showEpisodesPanel.value) {
    return
  }
  togglePlay()
}

// Native Mac HLS & HLS.JS Engine Initialization
function loadVideoWithEngine(streamUrl, startTime = 0) {
  if (isIframeEmbed.value) {
    if (hlsInstance) {
      hlsInstance.destroy()
      hlsInstance = null
    }
    const video = videoRef.value
    if (video) {
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
    isPlaying.value = true
    return
  }

  const video = videoRef.value
  if (!video) return

  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }

  video.pause()
  video.removeAttribute('src')

  if (!streamUrl) return

  const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('/hls')
  const isNaka = streamUrl.includes('nakastream') || streamUrl.includes('media.nakastream')
  // Force HLS.js for cross-origin providers (WebKit native blocks CORS segments)
  // BUT keep native for AirPlay compatibility (HLS.js doesn't support AirPlay routing)
  const forceHlsJs = !isAirPlayActive.value && isNaka

  // Case A: macOS WebKit Native AVPlayer HLS engine (only for same-origin or CORS-friendly streams)
  if (isHls && !forceHlsJs && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl
    video.load()
    if (startTime > 0) video.currentTime = startTime
    video.play().then(() => {
      isPlaying.value = true
    }).catch(() => {
      isPlaying.value = false
    })
  }
  // Case B: HLS.js Engine (for cross-origin or unsupported native)
  else if (isHls && Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      xhrSetup: (xhr) => {
        if (!isNaka) {
          xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')
        }
      }
    })
    hlsInstance.loadSource(streamUrl)
    hlsInstance.attachMedia(video)

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      // 1. Extraire et forcer TOUJOURS la plus haute qualité disponible (HD / FHD 1080p, 720p)
      const rawLevels = hlsInstance.levels || []
      if (rawLevels.length > 0) {
        const parsed = rawLevels.map((lvl, idx) => {
          const h = lvl.height || 0
          const w = lvl.width || 0
          const br = lvl.bitrate || 0
          let label = `${h}p`
          let tag = 'HD'
          if (h >= 1080 || w >= 1920) {
            label = '1080p Full HD'
            tag = 'FHD'
          } else if (h >= 720 || w >= 1280) {
            label = '720p HD'
            tag = 'HD'
          } else if (h >= 480) {
            label = '480p SD'
            tag = 'SD'
          } else if (h > 0) {
            label = `${h}p`
            tag = 'SD'
          } else if (lvl.name) {
            label = lvl.name
          }
          return {
            index: idx,
            height: h,
            width: w,
            bitrate: br,
            label,
            tag,
            resolution: (w > 0 && h > 0) ? `${w}x${h}` : '',
            score: h * 10000000 + br
          }
        })
        qualityLevels.value = parsed

        // Trouver l'index de la qualité maximale (FHD / HD)
        let maxIndex = 0
        let maxScore = -1
        parsed.forEach(p => {
          if (p.score > maxScore) {
            maxScore = p.score
            maxIndex = p.index
          }
        })

        // VERROUILLER LE NIVEAU SUR LA PLUS HAUTE QUALITÉ AU LIEU DU MODE AUTO
        hlsInstance.currentLevel = maxIndex
        hlsInstance.loadLevel = maxIndex
        hlsInstance.nextLevel = maxIndex
        selectedQualityIndex.value = maxIndex
        console.log(`[VideoPlayer] 🚀 Qualité HLS forcée au maximum : ${parsed[maxIndex]?.label} (${parsed[maxIndex]?.resolution || ''})`)
      } else {
        qualityLevels.value = []
        selectedQualityIndex.value = -1
      }

      // ONLY extract audio tracks and subtitles from HLS if it's Nakastream!
      if (isNaka) {
        audioTracks.value = hlsInstance.audioTracks || []
        subtitleTracks.value = hlsInstance.subtitleTracks || []
      } else {
        audioTracks.value = []
        subtitleTracks.value = []
      }
      if (startTime > 0) video.currentTime = startTime
      video.play().then(() => {
        isPlaying.value = true
      }).catch(() => {
        isPlaying.value = false
      })
    })

    hlsInstance.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
      if (data && typeof data.level === 'number' && data.level >= 0) {
        selectedQualityIndex.value = data.level
      }
    })
  }
  // Case C: Standard Video URL (MP4, direct stream)
  else {
    video.src = streamUrl
    video.load()
    if (startTime > 0) video.currentTime = startTime
    video.play().then(() => {
      isPlaying.value = true
    }).catch(() => {
      isPlaying.value = false
    })
  }
}

function initVideoEngine() {
  const streamUrl = activeSourceUrl.value || props.src || ''
  loadVideoWithEngine(streamUrl, props.initialTime || 0)
}

function handleLoadedData() {
  const video = videoRef.value
  if (!video) return
  if (video.paused && props.src) {
    video.play().then(() => {
      isPlaying.value = true
    }).catch(() => {
      isPlaying.value = false
    })
  }
}

function handleCanPlay() {
  const video = videoRef.value
  if (!video) return
  if (video.paused && props.src) {
    video.play().then(() => {
      isPlaying.value = true
    }).catch(() => {
      isPlaying.value = false
    })
  }
}

function handlePlaying() {
  const video = videoRef.value
  if (video) {
    // Unmute after autoplay starts so user has sound
    video.muted = false
  }
}

function togglePlay() {
  const video = videoRef.value
  if (!video) return
  if (video.paused) {
    video.play()
    isPlaying.value = true
  } else {
    video.pause()
    isPlaying.value = false
  }
  resetControlsTimer()
}

function seekRelative(seconds) {
  const video = videoRef.value
  if (!video) return
  video.currentTime = Math.max(0, Math.min(duration.value, video.currentTime + seconds))
}

function restartVideo() {
  const video = videoRef.value
  if (!video) return
  video.currentTime = 0
  video.play()
  isPlaying.value = true
  resetControlsTimer()
}

function handleScrub(e) {
  const video = videoRef.value
  if (!video || !duration.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  video.currentTime = pos * duration.value
  currentTime.value = video.currentTime
}

const showShortcutsHelp = ref(false)
const osdToast = ref({ visible: false, text: '', icon: '' })
let osdTimeout = null

function triggerOsd(text, icon = '') {
  if (osdTimeout) clearTimeout(osdTimeout)
  osdToast.value = { visible: true, text, icon }
  osdTimeout = setTimeout(() => {
    osdToast.value.visible = false
  }, 1400)
}

function changeVolume(delta) {
  const video = videoRef.value
  if (!video) return
  video.muted = false
  const newVol = Math.max(0, Math.min(1, Math.round((video.volume + delta) * 100) / 100))
  video.volume = newVol
  const pct = Math.round(newVol * 100)
  triggerOsd(`Volume : ${pct}%`, newVol === 0 ? '🔇' : (newVol < 0.5 ? '🔉' : '🔊'))
  resetControlsTimer()
}

function toggleMute() {
  const video = videoRef.value
  if (!video) return
  video.muted = !video.muted
  triggerOsd(video.muted ? 'Son coupé (Muet)' : `Volume : ${Math.round(video.volume * 100)}%`, video.muted ? '🔇' : '🔊')
  resetControlsTimer()
}

const speedRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
function changeSpeed(step) {
  const video = videoRef.value
  if (!video) return
  const currentRate = video.playbackRate || 1
  let nextRate = currentRate
  if (step > 0) {
    nextRate = speedRates.find(r => r > currentRate + 0.05) || 2
  } else {
    nextRate = [...speedRates].reverse().find(r => r < currentRate - 0.05) || 0.5
  }
  video.playbackRate = nextRate
  triggerOsd(`Vitesse : ${nextRate}x`, '⚡')
  resetControlsTimer()
}

function toggleFullscreen() {
  const container = playerContainerRef.value || document.documentElement
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen().catch(() => {})
    } else if (container.webkitRequestFullscreen) {
      container.webkitRequestFullscreen()
    }
    triggerOsd('Plein écran', '⛶')
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    }
    triggerOsd('Fenêtré', '🗗')
  }
}

function togglePiP() {
  const video = videoRef.value
  if (!video) return
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {})
    triggerOsd('PiP désactivé', '📺')
  } else if (video.requestPictureInPicture) {
    video.requestPictureInPicture().catch(() => {})
    triggerOsd('PiP activé', '📺')
  }
}

function toggleSubtitlesShortcut() {
  if (selectedSubtitle.value) {
    selectSubtitle(null)
    triggerOsd('Sous-titres : Désactivés', '💬')
  } else {
    const defaultSub = availableSubtitles.value.find(s => s.language === 'fr' || s.label?.toLowerCase().includes('fr')) || availableSubtitles.value[0]
    if (defaultSub) {
      selectSubtitle(defaultSub)
      triggerOsd(`Sous-titres : ${defaultSub.label || 'Activés'}`, '💬')
    } else {
      triggerOsd('Aucun sous-titre disponible', '💬')
    }
  }
}

function cycleAudioTracksShortcut() {
  if (availableAudioTracks.value.length > 1) {
    const curIdx = availableAudioTracks.value.findIndex(t => t.id === selectedAudioTrack.value?.id)
    const nextIdx = (curIdx + 1) % availableAudioTracks.value.length
    const nextTrack = availableAudioTracks.value[nextIdx]
    selectAudioTrack(nextTrack)
    triggerOsd(`Audio : ${nextTrack.label || nextTrack.language || 'Piste ' + (nextIdx + 1)}`, '🌐')
  } else if (availableAudioSources.value.length > 1) {
    const curIdx = availableAudioSources.value.findIndex(s => s.id === activeAudioSource.value?.id)
    const nextIdx = (curIdx + 1) % availableAudioSources.value.length
    const nextSrc = availableAudioSources.value[nextIdx]
    selectAudioSource(nextSrc)
    triggerOsd(`Audio : ${nextSrc.language || nextSrc.label}`, '🌐')
  } else {
    triggerOsd('Audio : Piste unique', '🌐')
  }
}

function goToPreviousEpisode() {
  if (!props.episodesList || props.episodesList.length === 0) return
  const currentIndex = props.episodesList.findIndex(e => e.episodeNumber === props.currentEpisode)
  if (currentIndex > 0) {
    const prevEp = props.episodesList[currentIndex - 1]
    triggerOsd(`Épisode ${prevEp.episodeNumber}`, '⏮️')
    emit('selectEpisode', prevEp)
  }
}

function jumpToPercent(pct) {
  const video = videoRef.value
  if (!video || !duration.value) return
  video.currentTime = duration.value * (pct / 100)
  triggerOsd(`Position : ${pct}%`, '⏱️')
  resetControlsTimer()
}

function handleKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

  // 0 - 9 percentage jump
  if (/^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    jumpToPercent(parseInt(e.key, 10) * 10)
    return
  }

  const key = e.key.toLowerCase()

  switch (key) {
    case ' ':
    case 'k':
      e.preventDefault()
      togglePlay()
      triggerOsd(isPlaying.value ? 'Lecture' : 'Pause', isPlaying.value ? '▶️' : '⏸️')
      break

    case 'arrowleft':
    case 'j':
      e.preventDefault()
      const seekBack = e.shiftKey ? -30 : -10
      seekRelative(seekBack)
      triggerOsd(`${seekBack}s`, '⏪')
      break

    case 'arrowright':
    case 'l':
      e.preventDefault()
      const seekFwd = e.shiftKey ? 30 : 10
      seekRelative(seekFwd)
      triggerOsd(`+${seekFwd}s`, '⏩')
      break

    case '[':
      e.preventDefault()
      seekRelative(-30)
      triggerOsd('-30s', '⏪')
      break

    case ']':
      e.preventDefault()
      seekRelative(30)
      triggerOsd('+30s', '⏩')
      break

    case 'arrowup':
      e.preventDefault()
      changeVolume(0.05)
      break

    case 'arrowdown':
      e.preventDefault()
      changeVolume(-0.05)
      break

    case 'm':
      e.preventDefault()
      toggleMute()
      break

    case 'f':
      e.preventDefault()
      toggleFullscreen()
      break

    case 'i':
      e.preventDefault()
      togglePiP()
      break

    case '>':
    case '.':
      e.preventDefault()
      changeSpeed(1)
      break

    case '<':
    case ',':
      e.preventDefault()
      changeSpeed(-1)
      break

    case 'c':
      e.preventDefault()
      toggleSubtitlesShortcut()
      break

    case 'v':
    case 'a':
      e.preventDefault()
      cycleAudioTracksShortcut()
      break

    case 'q':
      e.preventDefault()
      cycleQualityShortcut()
      break

    case 'e':
      e.preventDefault()
      showEpisodesPanel.value = !showEpisodesPanel.value
      break

    case 'o':
      e.preventDefault()
      showAudioSubModal.value = !showAudioSubModal.value
      if (showAudioSubModal.value) audioSubView.value = 'menu'
      break

    case 's':
      e.preventDefault()
      if (showSkipIntroButton.value || showManualSkipIntroButton.value) {
        skipIntroAction()
        triggerOsd('Intro passée', '⏭️')
      } else if (showSkipOutroButton.value) {
        skipOutroAction()
        triggerOsd('Outro passée', '⏭️')
      }
      break

    case 'n':
      e.preventDefault()
      if (hasNextEpisode.value) {
        goToNextEpisode()
        triggerOsd('Épisode suivant', '⏭️')
      }
      break

    case 'p':
      e.preventDefault()
      goToPreviousEpisode()
      break

    case 'home':
      e.preventDefault()
      jumpToPercent(0)
      break

    case 'end':
      e.preventDefault()
      if (videoRef.value && duration.value > 0) {
        videoRef.value.currentTime = duration.value - 2
      }
      break

    case '?':
    case 'h':
      e.preventDefault()
      showShortcutsHelp.value = !showShortcutsHelp.value
      break

    case 'escape':
      if (showShortcutsHelp.value) showShortcutsHelp.value = false
      else if (showAudioSubModal.value) showAudioSubModal.value = false
      else if (showEpisodesPanel.value) showEpisodesPanel.value = false
      else emit('back')
      break
  }
}

function onTimeUpdate() {
  const video = videoRef.value
  if (!video) return
  currentTime.value = video.currentTime
  duration.value = video.duration || 0
  if (video.buffered && video.buffered.length > 0) {
    bufferedEnd.value = video.buffered.end(video.buffered.length - 1)
  }
  updateMediaSessionPositionState()
  emit('timeupdate', {
    currentTime: currentTime.value,
    duration: duration.value,
    progressPercent: progressPercent.value
  })
}

onMounted(() => {
  detectOS()
  updateClock()
  clockInterval = setInterval(updateClock, 1000)
  window.addEventListener('keydown', handleKeyDown)
  initVideoEngine()
  setupMediaSession()

  // Detect AirPlay state changes - HLS.js doesn't support AirPlay routing
  const video = videoRef.value
  let prevAirPlayActive = false
  if (video) {
    video.addEventListener('webkitplaybacktargetavailabilitychanged', (e) => {
      // Reinitialize engine when AirPlay device is selected (picker shown)
      if (e.availability === 'available') {
        // Picker was shown - don't reinit here, wait for user selection
      }
    })
    // Poll AirPlay state and reinitialize engine on change
    airPlayCheckInterval = setInterval(() => {
      const isWireless = video.webkitCurrentPlaybackTargetIsWireless
      const currentlyActive = !!isWireless
      if (currentlyActive !== prevAirPlayActive) {
        prevAirPlayActive = currentlyActive
        isAirPlayActive.value = currentlyActive
        // Reinitialize engine when AirPlay state changes
        // For AirPlay active: use native AVPlayer (supports AirPlay)
        // For AirPlay inactive + nakastream: use HLS.js (CORS)
        initVideoEngine()
        // When AirPlay activates, give native WebKit a moment to route to the device then play
        if (currentlyActive) {
          setTimeout(() => {
            video.play().then(() => {
              isPlaying.value = true
            }).catch(() => {})
          }, 500)
        }
      }
    }, 1000)
  }

  // Select default language pill based on available streams or Nakastream
  syncDefaultPill()
})

function syncDefaultPill() {
  if (dynamicLanguagePills.value.length === 0) return

  if (!isNakastreamVideo.value) {
    const currentUrl = (activeSourceUrl.value || props.src || '').toLowerCase()
    let matchingPill = dynamicLanguagePills.value.find(p => p.url && currentUrl.includes(p.url.toLowerCase()))
    if (!matchingPill) {
      const otherLang = preferredLanguage.value === 'vf' ? 'vostfr' : 'vf'
      matchingPill = dynamicLanguagePills.value.find(p => p.lang === preferredLanguage.value) ||
                     dynamicLanguagePills.value.find(p => p.lang === otherLang) ||
                     dynamicLanguagePills.value[0]
    }
    if (matchingPill) {
      activePillId.value = matchingPill.id
    }
  } else {
    const defaultPill = dynamicLanguagePills.value.find(p => p.label.includes('Français')) || dynamicLanguagePills.value[0]
    if (defaultPill) {
      activePillId.value = defaultPill.id
    }
  }
}

onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
  if (controlsTimeout) clearTimeout(controlsTimeout)
  if (airPlayCheckInterval) clearInterval(airPlayCheckInterval)
  window.removeEventListener('keydown', handleKeyDown)
  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }
  // Clear native macOS Now Playing info
  try { ClearNowPlayingInfo() } catch (e) {}
})

watch(dynamicLanguagePills, (pills) => {
  if (pills.length > 0 && (!activePillId.value || !pills.some(p => p.id === activePillId.value))) {
    syncDefaultPill()
  }
})

watch(() => props.src, (newSrc) => {
  if (newSrc) {
    activeSourceUrl.value = ''
    currentStreamSources.value = []
    initVideoEngine()
    setupMediaSession()
    syncDefaultPill()
    // Force autoplay after a small delay if not playing yet
    setTimeout(() => {
      const video = videoRef.value
      if (video && video.paused && props.src) {
        video.muted = true
        video.play().then(() => {
          isPlaying.value = true
        }).catch(() => {
          isPlaying.value = false
        })
      }
    }, 800)
  }
})

watch(showEpisodesPanel, (open) => {
  if (open) {
    nextTick(() => {
      const activeEp = document.querySelector('[data-current-episode="true"]')
      if (activeEp) {
        activeEp.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  }
})

watch(() => props.currentEpisode, () => {
  currentTime.value = 0
  activeSourceUrl.value = ''
  currentStreamSources.value = []
  initVideoEngine()
  setupMediaSession()
  syncDefaultPill()
})

watch([() => props.title, () => props.episodeLabel, () => props.poster], () => {
  setupMediaSession()
})

const allAvailableSourcesList = computed(() => {
  const sources = currentStreamSources.value.length > 0 ? currentStreamSources.value : (props.availableSources || [])
  return sources.filter(s => {
    const url = (s.url || '').toLowerCase()
    const name = (s.name || '').toLowerCase()
    return !url.includes('nakastream') && !name.includes('nakastream')
  })
})

const availableServerLanguages = computed(() => {
  const sources = allAvailableSourcesList.value
  if (!sources || sources.length === 0) return []
  const langs = new Set()
  sources.forEach(s => {
    const l = (s.lang || 'vf').toLowerCase()
    langs.add(l)
  })
  return ['all', ...Array.from(langs)]
})

const displayServersList = computed(() => {
  let sources = allAvailableSourcesList.value
  if (!sources || sources.length === 0) return []
  if (selectedServerLangFilter.value !== 'all') {
    sources = sources.filter(s => (s.lang || 'vf').toLowerCase() === selectedServerLangFilter.value)
  }
  return sources
})

const filteredSources = displayServersList

const isIframeEmbed = computed(() => {
  const currentUrl = (activeSourceUrl.value || props.src || '').toLowerCase()
  if (!currentUrl) return false
  if (currentUrl.includes('.m3u8') || currentUrl.includes('.mp4') || currentUrl.includes('nakastream')) {
    return false
  }
  return (
    currentUrl.includes('embed') ||
    currentUrl.includes('/e/') ||
    currentUrl.includes('/v/') ||
    currentUrl.includes('#') ||
    currentUrl.includes('seeks.cloud') ||
    currentUrl.includes('embedseek') ||
    currentUrl.includes('sibnet.ru') ||
    currentUrl.includes('sendvid.com') ||
    currentUrl.includes('myvi.tv') ||
    currentUrl.includes('myvi.ru') ||
    currentUrl.includes('uqload') ||
    currentUrl.includes('vidhide') ||
    currentUrl.includes('streamhide') ||
    currentUrl.includes('lplayer') ||
    currentUrl.includes('embed4me') ||
    currentUrl.includes('lecteurvideo') ||
    currentUrl.includes('frembed') ||
    currentUrl.includes('blinkflux') ||
    currentUrl.includes('swiftflow') ||
    currentUrl.includes('luluvdo') ||
    currentUrl.includes('lulustream') ||
    currentUrl.includes('voe.sx') ||
    currentUrl.includes('voe.') ||
    currentUrl.includes('veev.to') ||
    currentUrl.includes('upn') ||
    currentUrl.includes('rpmlive') ||
    currentUrl.includes('bysebuho') ||
    currentUrl.includes('morencius') ||
    currentUrl.includes('dsvplay') ||
    currentUrl.includes('streamhg') ||
    currentUrl.includes('kakaflix') ||
    currentUrl.includes('mixdrop') ||
    currentUrl.includes('playmogo') ||
    currentUrl.includes('savefiles') ||
    currentUrl.includes('waaw') ||
    currentUrl.startsWith('http://') ||
    currentUrl.startsWith('https://')
  )
})

watch(() => props.logo, () => {
  logoError.value = false
})
</script>

<template>
  <div
    ref="playerContainerRef"
    @mousemove="resetControlsTimer"
    @click="onContainerClick"
    class="relative w-full h-full bg-black overflow-hidden select-none font-sans cursor-default"
    :class="{ 'cursor-none': !showControls && isPlaying }"
  >
    
    <!-- IFRAME EMBED PLAYER (For web embeds like seeks.cloud, embed4me, etc.) -->
    <iframe
      v-if="isIframeEmbed"
      :key="activeSourceUrl || props.src"
      :src="activeSourceUrl || props.src"
      class="w-full h-full border-0 bg-black"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    />

    <!-- NATIVE VIDEO ENGINE (For HLS .m3u8 and MP4 streams) -->
    <video
      v-else
      ref="videoRef"
      autoplay
      muted
      x-webkit-airplay="allow"
      airplay="allow"
      webkit-playsinline
      playsinline
      preload="auto"
      @timeupdate="onTimeUpdate"
      @waiting="isBuffering = true"
      @playing="isBuffering = false; isPlaying = true; handlePlaying()"
      @pause="isPlaying = false"
      @ended="isPlaying = false; emit('ended')"
      @loadeddata="handleLoadedData"
      @canplay="handleCanPlay"
      class="w-full h-full object-contain bg-black"
    >
      <!-- Real Subtitle Track VTT rendering via Blob URL -->
      <track
        v-if="activeSubtitleBlobUrl"
        :key="activeSubtitleBlobUrl"
        :src="activeSubtitleBlobUrl"
        kind="subtitles"
        srclang="fr"
        label="Sous-titres"
        default
      />
    </video>

    <!-- DYNAMIC DUAL-POSITION SUBTITLES OVERLAY -->
    <div
      v-if="activeCueText"
      class="absolute inset-x-0 z-40 flex justify-center pointer-events-none transition-all duration-300 ease-out px-8"
      :class="showControls ? 'bottom-52 sm:bottom-56 md:bottom-60' : 'bottom-16 sm:bottom-20 md:bottom-24'"
    >
      <div class="bg-black/85 text-white font-semibold text-lg sm:text-xl md:text-2xl px-6 py-3 rounded-2xl text-center leading-snug tracking-wide shadow-[0_10px_30px_rgba(0,0,0,0.9)] border border-white/15 backdrop-blur-md max-w-3xl whitespace-pre-line drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
        {{ activeCueText }}
      </div>
    </div>

    <!-- BUFFERS & SPINNERS -->
    <div
      v-if="isBuffering"
      class="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
    >
      <IconLoader2 :size="48" class="text-white/80 animate-spin" />
    </div>

    <!-- MACOS WINDOW DRAG BAR -->
    <div
      class="absolute top-0 inset-x-0 h-16 z-30 pointer-events-auto"
      style="--wails-draggable: drag; -webkit-app-region: drag;"
    />

    <!-- 2. TOP OVERLAY -->
    <!-- Top-Left: Minimalist Icon Buttons Bar (Back, Options, AirPlay, Cast, Episodes, Skip Ep) -->
    <div
      class="absolute top-8 sm:top-10 left-8 sm:left-12 z-40 flex items-center gap-3 transition-opacity duration-300 pointer-events-auto"
      :class="{ 'opacity-100': showControls, 'opacity-0 pointer-events-none': !showControls }"
      style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
    >
      <!-- Back Arrow Icon Button -->
      <button
        @click="emit('back')"
        class="text-white hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="Retour"
      >
        <IconArrowLeft :size="28" :stroke-width="2.5" />
      </button>

      <!-- macOS Native AirPlay Icon Button (Only on Mac/Apple) -->
      <button
        v-if="isMac"
        @click.stop="triggerAirPlay"
        class="text-white/90 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="AirPlay (macOS / Apple TV)"
      >
        <IconShareplay :size="25" :stroke-width="2.2" />
      </button>

      <!-- Windows / Chrome Native Chromecast Icon Button (Only on Windows / PC) -->
      <button
        v-if="!isMac"
        @click.stop="triggerCast"
        class="text-white/90 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="Caster (Chromecast / Écran)"
      >
        <IconCast :size="25" :stroke-width="2.2" />
      </button>

      <!-- Episode List Side Panel Icon Button (TV Shows) -->
      <button
        v-if="episodesList && episodesList.length > 0"
        @click="showEpisodesPanel = true"
        class="text-white/90 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="Liste des épisodes"
      >
        <IconList :size="26" :stroke-width="2.2" />
      </button>

      <!-- Skip to Next Episode Icon Button -->
      <button
        v-if="hasNextEpisode"
        @click="goToNextEpisode"
        class="text-white/90 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="Épisode suivant"
      >
        <IconPlayerSkipForward :size="26" :stroke-width="2.2" />
      </button>

      <!-- Keyboard Shortcuts Help Icon Button -->
      <button
        @click="showShortcutsHelp = true"
        class="text-white/90 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="Raccourcis clavier (?)"
      >
        <IconKeyboard :size="24" :stroke-width="2.2" />
      </button>
    </div>

    <!-- Top-Right: Movie/Show 4K PNG Logo & Episode Info -->
    <div
      class="absolute top-8 sm:top-10 right-8 sm:right-12 z-40 flex flex-col items-end text-right transition-opacity duration-300 pointer-events-auto"
      :class="{ 'opacity-100': showControls, 'opacity-0 pointer-events-none': !showControls }"
      style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
    >
      <!-- 4K Transparent PNG Logo Image -->
      <img
        v-if="logo && !logoError"
        :src="logo"
        :alt="title"
        @error="logoError = true"
        class="max-h-14 sm:max-h-20 max-w-[240px] sm:max-w-[340px] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
      />
      <h1
        v-else
        class="text-lg sm:text-xl md:text-2xl font-black text-white tracking-wider uppercase drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] leading-tight"
      >
        {{ title }}
      </h1>

      <!-- Episode Info (e.g. "S1 E1 — Titre Épisode") -->
      <p v-if="episodeLabel" class="text-xs sm:text-sm font-bold text-cyan-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] mt-1 tracking-wide">
        {{ episodeLabel }}
      </p>
    </div>

    <!-- 2.5 FLOATING SKIP INTRO / OUTRO BUTTON (Netflix Official Square White Style) -->
    <div
      v-if="showSkipIntroButton || showSkipOutroButton || showManualSkipIntroButton"
      class="absolute right-8 sm:right-12 z-50 transition-all duration-300 pointer-events-auto"
      :class="showControls ? 'bottom-36 sm:bottom-44' : 'bottom-10 sm:bottom-12'"
    >
      <!-- Automatic Skip Intro Button (Netflix Square White Style) -->
      <button
        v-if="showSkipIntroButton"
        @click.stop="skipIntroAction"
        class="flex items-center gap-2.5 px-6 py-3 bg-white hover:bg-slate-200 text-black border-2 border-white rounded-none shadow-2xl transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 text-xs sm:text-sm font-black tracking-widest uppercase group/skip"
      >
        <span>PASSER L'INTRO</span>
        <IconPlayerSkipForward :size="16" :stroke-width="3" class="group-hover/skip:translate-x-0.5 transition-transform" />
      </button>

      <!-- Automatic Skip Outro / Next Ep Button (Netflix Square White Style) -->
      <button
        v-else-if="showSkipOutroButton"
        @click.stop="skipOutroAction"
        class="flex items-center gap-2.5 px-6 py-3 bg-white hover:bg-slate-200 text-black border-2 border-white rounded-none shadow-2xl transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 text-xs sm:text-sm font-black tracking-widest uppercase group/skip"
      >
        <span>{{ hasNextEpisode ? 'ÉPISODE SUIVANT' : 'PASSER LE GÉNÉRIQUE' }}</span>
        <IconPlayerSkipForward :size="16" :stroke-width="3" class="group-hover/skip:translate-x-0.5 transition-transform" />
      </button>

      <!-- Manual Skip Intro Button (Netflix Square White Style Fallback) -->
      <button
        v-else-if="showManualSkipIntroButton"
        @click.stop="skipManual90sAction"
        class="flex items-center gap-2.5 px-6 py-3 bg-white hover:bg-slate-200 text-black border-2 border-white rounded-none shadow-2xl transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95 text-xs sm:text-sm font-black tracking-widest uppercase group/skip"
      >
        <span>PASSER L'INTRO</span>
        <IconPlayerSkipForward :size="16" :stroke-width="3" class="group-hover/skip:translate-x-0.5 transition-transform" />
      </button>
    </div>

    <!-- 3. BOTTOM OVERLAY (1:1 match to screenshot) -->
    <div
      class="absolute bottom-8 sm:bottom-10 inset-x-8 sm:inset-x-12 z-40 flex flex-col gap-4 transition-opacity duration-300 pointer-events-auto controls-interactive"
      :class="{ 'opacity-100': showControls, 'opacity-0 pointer-events-none': !showControls }"
    >
      
      <!-- Row 1: Play/Pause Button, Current Time, Red Progress Bar, Duration Time -->
      <div class="flex items-center gap-3.5 w-full">
        
        <!-- Big White Circle Play/Pause Button with Black Icon (matching screenshot) -->
        <button
          @click.stop="togglePlay"
          class="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          <IconPlayerPause v-if="isPlaying" :size="24" :stroke-width="3" class="fill-current" />
          <IconPlayerPlay v-else :size="24" :stroke-width="3" class="fill-current ml-0.5" />
        </button>

        <!-- Current Time (e.g. "01:33") -->
        <span class="shrink-0 text-sm sm:text-base font-bold text-white tracking-wide font-sans drop-shadow">
          {{ formatTime(currentTime) }}
        </span>

        <!-- Scrubber Bar Container with Hover Tooltip -->
        <div
          class="relative flex-1 py-3 cursor-pointer group/scrubber flex items-center"
          @click.stop="handleScrub"
          @mouseenter="isHoveringScrubber = true"
          @mouseleave="isHoveringScrubber = false"
          @mousemove="onScrubberMouseMove"
        >
          <!-- FLOATING TIME TOOLTIP (xx:xx) -->
          <transition name="tooltip-fade">
            <div
              v-if="isHoveringScrubber && duration > 0"
              class="absolute bottom-full mb-1.5 pointer-events-none z-50 transform -translate-x-1/2"
              :style="{ left: `${scrubberHoverPixelX}px` }"
            >
              <div class="px-2.5 py-1 rounded-lg bg-black/90 border border-white/20 text-white font-bold text-xs shadow-2xl backdrop-blur-2xl tracking-wider select-none font-mono flex items-center justify-center">
                <span>{{ formatTime(scrubberHoverTime) }}</span>
              </div>
            </div>
          </transition>

          <!-- Track Bar -->
          <div class="relative w-full h-[4px] group-hover/scrubber:h-[7px] bg-white/25 rounded-full transition-all overflow-hidden">
            <!-- Buffered Track -->
            <div
              class="absolute inset-y-0 left-0 bg-cyan-400/30 rounded-full"
              :style="{ width: bufferedPercent + '%' }"
            />
            <!-- Hover Preview Track -->
            <div
              v-if="isHoveringScrubber"
              class="absolute inset-y-0 left-0 bg-white/20 rounded-full pointer-events-none"
              :style="{ width: scrubberHoverPercent + '%' }"
            />
            <!-- Progress Fill (Cyan to Blue Gradient) -->
            <div
              class="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.6)]"
              :style="{ width: progressPercent + '%' }"
            />
          </div>
        </div>

        <!-- Total Duration Time (e.g. "48:59") -->
        <span class="shrink-0 text-sm sm:text-base font-bold text-white tracking-wide font-sans drop-shadow">
          {{ formatTime(duration) }}
        </span>

      </div>

      <!-- Row 2: Bottom Action Buttons: Langue, Sources, Options -->
      <div class="flex items-center justify-center gap-2.5 flex-wrap pt-1">
        
        <!-- Nakastream: separate Langue (real audio tracks) + Sources (mirrors) buttons -->
        <template v-if="isNakastreamVideo">
          <!-- 1. Unique Language Button (opens audio/language sub-page) -->
          <button
            @click.stop="openAudioModal"
            class="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-black/60 hover:bg-black/75 text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <IconLanguage :size="15" :stroke-width="2" />
            <span>{{ currentActiveLanguageLabel }}</span>
          </button>

          <!-- 2. Direct Sources Button (opens sources/mirrors sub-page) -->
          <button
            v-if="allAvailableSourcesList.length > 0"
            @click.stop="openServersModal"
            class="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 border border-cyan-500/40 backdrop-blur-md transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <IconServer :size="14" :stroke-width="2.5" />
            <span>Sources ({{ allAvailableSourcesList.length }})</span>
          </button>
        </template>

        <!-- Non-Nakastream: single combined "Source — Lang" button (e.g. "Vidmoly — VF") -->
        <button
          v-else-if="allAvailableSourcesList.length > 0"
          @click.stop="openServersModal"
          class="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 border border-cyan-500/40 backdrop-blur-md transition-all cursor-pointer shadow-md flex items-center gap-1.5"
        >
          <IconServer :size="14" :stroke-width="2.5" />
          <span>{{ currentSourceLangLabel }}</span>
        </button>

        <!-- Fallback: no mirror list at all, keep the language button -->
        <button
          v-else
          @click.stop="openAudioModal"
          class="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-black/60 hover:bg-black/75 text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer shadow-md flex items-center gap-1.5"
        >
          <IconLanguage :size="15" :stroke-width="2" />
          <span>{{ currentActiveLanguageLabel }}</span>
        </button>

        <!-- 3. More Options Button ("Options ...") -->
        <button
          @click.stop="openOptionsModal"
          class="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-black/60 hover:bg-black/75 text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer shadow-md"
        >
          Options ...
        </button>

      </div>

    </div>

    <!-- 4. AUDIO & SUBTITLES MODAL -->
    <div v-if="showAudioSubModal" class="absolute inset-0 z-50">
      <!-- Invisible click-away catcher -->
      <div class="absolute inset-0" @click="showAudioSubModal = false"></div>

      <!-- Popover anchored just above the language pills row -->
      <div
        @click.stop
        class="absolute bottom-24 sm:bottom-28 inset-x-8 sm:inset-x-12 flex justify-center pointer-events-none"
      >
        <div
          class="pointer-events-auto w-full max-w-md max-h-[65vh] overflow-y-auto bg-black/80 border border-white/15 rounded-2xl p-6 flex flex-col gap-5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.95)]"
          style="backdrop-filter: blur(40px) saturate(1.5); -webkit-backdrop-filter: blur(40px) saturate(1.5);"
        >
        <!-- MENU (top level) -->
        <template v-if="audioSubView === 'menu'">
          <div class="flex items-center justify-between pb-1">
            <h3 class="text-base font-bold text-white">Options</h3>
            <button @click="showAudioSubModal = false" class="text-white/60 hover:text-white cursor-pointer">
              <IconX :size="20" />
            </button>
          </div>

          <div class="flex flex-col -mx-6">
            <button
              v-if="(isNakastreamVideo && availableAudioTracks.length > 0) || (!isNakastreamVideo && dynamicLanguagePills.length > 0)"
              @click="audioSubView = 'audio'"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold text-white hover:bg-white/5 transition-colors cursor-pointer border-b border-white/10"
            >
              <span>Piste audio</span>
              <IconChevronRight :size="18" class="text-white/40" />
            </button>

            <button
              v-if="availableSubtitles && availableSubtitles.length > 0"
              @click="audioSubView = 'subtitles'"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold text-white hover:bg-white/5 transition-colors cursor-pointer border-b border-white/10"
            >
              <span>Sous-titres</span>
              <IconChevronRight :size="18" class="text-white/40" />
            </button>

            <button
              @click="audioSubView = 'dsp'"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold text-white hover:bg-white/5 transition-colors cursor-pointer border-b border-white/10"
            >
              <span>Audio spatial</span>
              <IconChevronRight :size="18" class="text-white/40" />
            </button>

            <button
              v-if="qualityLevels && qualityLevels.length > 0"
              @click="audioSubView = 'quality'"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold text-white hover:bg-white/5 transition-colors cursor-pointer border-b border-white/10"
            >
              <div class="flex items-center gap-2">
                <span>Qualité vidéo</span>
                <span class="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  {{ currentQualityBadge }}
                </span>
              </div>
              <IconChevronRight :size="18" class="text-white/40" />
            </button>

            <button
              v-if="filteredSources && filteredSources.length > 0"
              @click="audioSubView = 'servers'"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span>Serveurs & Miroirs</span>
              <IconChevronRight :size="18" class="text-white/40" />
            </button>
          </div>
        </template>

        <!-- SUB-PAGE: Piste audio -->
        <template v-else-if="audioSubView === 'audio'">
          <div class="flex items-center gap-3 pb-1">
            <button @click="audioSubView = 'menu'" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer">
              <IconChevronLeft :size="18" :stroke-width="2.5" />
            </button>
            <h3 class="text-base font-bold text-white">Piste audio</h3>
          </div>

          <div class="flex flex-col -mx-6">
            <template v-if="isNakastreamVideo">
              <button
                v-for="(audio, idx) in availableAudioTracks"
                :key="idx"
                @click="activeAudioIndex = idx; applyTrackSelection(idx, activeSubtitleIndex)"
                class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold transition-colors cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5"
                :class="activeAudioIndex === idx ? 'text-white' : 'text-white/50'"
              >
                <span>{{ audio.label || audio.lang }}</span>
                <IconCheck v-if="activeAudioIndex === idx" :size="18" class="text-cyan-400" />
              </button>
            </template>
            <template v-else>
              <button
                v-for="pill in dynamicLanguagePills"
                :key="pill.id"
                @click="selectPill(pill)"
                class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold transition-colors cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5"
                :class="activePillId === pill.id ? 'text-white' : 'text-white/50'"
              >
                <span>{{ pill.label }}</span>
                <IconCheck v-if="activePillId === pill.id" :size="18" class="text-cyan-400" />
              </button>
            </template>
          </div>
        </template>

        <!-- SUB-PAGE: Sous-titres -->
        <template v-else-if="audioSubView === 'subtitles'">
          <div class="flex items-center gap-3 pb-1">
            <button @click="audioSubView = 'menu'" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer">
              <IconChevronLeft :size="18" :stroke-width="2.5" />
            </button>
            <h3 class="text-base font-bold text-white">Sous-titres</h3>
          </div>

          <div class="flex flex-col -mx-6">
            <button
              @click="activeSubtitleIndex = -1; applyTrackSelection(activeAudioIndex, -1)"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold transition-colors cursor-pointer border-b border-white/10 hover:bg-white/5"
              :class="activeSubtitleIndex === -1 ? 'text-white' : 'text-white/50'"
            >
              <span>Désactivé</span>
              <IconCheck v-if="activeSubtitleIndex === -1" :size="18" class="text-cyan-400" />
            </button>
            <button
              v-for="(sub, idx) in availableSubtitles"
              :key="idx"
              @click="activeSubtitleIndex = idx; applyTrackSelection(activeAudioIndex, idx)"
              class="flex items-center justify-between px-6 py-3.5 text-left text-sm sm:text-base font-semibold transition-colors cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5"
              :class="activeSubtitleIndex === idx ? 'text-white' : 'text-white/50'"
            >
              <span>{{ sub.label || sub.lang }}</span>
              <IconCheck v-if="activeSubtitleIndex === idx" :size="18" class="text-cyan-400" />
            </button>
          </div>
        </template>

        <!-- SUB-PAGE: Audio spatial (DSP) -->
        <template v-else-if="audioSubView === 'dsp'">
          <div class="flex items-center gap-3 pb-1">
            <button @click="audioSubView = 'menu'" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer">
              <IconChevronLeft :size="18" :stroke-width="2.5" />
            </button>
            <h3 class="text-base font-bold text-white">Audio spatial</h3>
          </div>

          <div class="flex flex-col -mx-6">
            <button
              v-for="mode in [
                { id: 'standard', label: 'Stéréo Standard', desc: 'Audio d\'origine' },
                { id: 'voice', label: 'Boost Voix / Dialogues', desc: 'Clarté des répliques (+7.5dB)' },
                { id: 'night', label: 'Mode Nuit', desc: 'Atténue les explosions' },
                { id: 'spatial', label: 'Dolby Atmos 3D', desc: 'Audio Spatial immersif' }
              ]"
              :key="mode.id"
              @click="setAudioDSPMode(mode.id)"
              class="flex items-center justify-between px-6 py-3.5 text-left transition-colors cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5"
            >
              <span class="flex flex-col">
                <span class="text-sm sm:text-base font-semibold" :class="activeAudioDSP === mode.id ? 'text-white' : 'text-white/50'">{{ mode.label }}</span>
                <span class="text-xs text-white/40">{{ mode.desc }}</span>
              </span>
              <IconCheck v-if="activeAudioDSP === mode.id" :size="18" class="text-cyan-400 shrink-0" />
            </button>
          </div>
        </template>

        <!-- SUB-PAGE: Qualité vidéo -->
        <template v-else-if="audioSubView === 'quality'">
          <div class="flex items-center justify-between pb-1">
            <div class="flex items-center gap-3">
              <button @click="audioSubView = 'menu'" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer">
                <IconChevronLeft :size="18" :stroke-width="2.5" />
              </button>
              <h3 class="text-base font-bold text-white">Qualité vidéo</h3>
            </div>
            <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
              Toujours Max (HD/FHD)
            </span>
          </div>

          <div class="flex flex-col -mx-6 max-h-[50vh] overflow-y-auto">
            <button
              v-for="q in qualityLevels"
              :key="q.index"
              @click="selectQuality(q.index)"
              class="flex items-center justify-between px-6 py-3.5 text-left transition-colors cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5"
              :class="selectedQualityIndex === q.index ? 'bg-cyan-500/10 text-white' : 'text-white/60'"
            >
              <div class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-sm sm:text-base font-semibold" :class="selectedQualityIndex === q.index ? 'text-cyan-300 font-bold' : 'text-white'">
                    {{ q.label }}
                  </span>
                  <span v-if="q.tag" class="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-bold uppercase">
                    {{ q.tag }}
                  </span>
                </div>
                <span v-if="q.resolution || q.bitrate" class="text-xs text-white/40">
                  {{ q.resolution }} {{ q.bitrate > 0 ? `• ${(q.bitrate / 1000).toFixed(0)} kbps` : '' }}
                </span>
              </div>
              <IconCheck v-if="selectedQualityIndex === q.index" :size="18" class="text-cyan-400" :stroke-width="2.5" />
            </button>
          </div>
        </template>

        <!-- SUB-PAGE: Serveurs & Miroirs -->
        <template v-else-if="audioSubView === 'servers'">
          <div class="flex items-center justify-between pb-1">
            <div class="flex items-center gap-3">
              <button @click="audioSubView = 'menu'" class="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer">
                <IconChevronLeft :size="18" :stroke-width="2.5" />
              </button>
              <div class="flex items-center gap-2">
                <h3 class="text-base font-bold text-white">Serveurs & Miroirs</h3>
                <span class="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  {{ displayServersList.length }}
                </span>
              </div>
            </div>
            <button @click="showAudioSubModal = false" class="text-white/60 hover:text-white cursor-pointer">
              <IconX :size="20" />
            </button>
          </div>

          <!-- Language Tabs Filter (if multiple languages exist) -->
          <div v-if="availableServerLanguages.length > 2" class="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-none">
            <button
              v-for="lang in availableServerLanguages"
              :key="lang"
              @click="selectedServerLangFilter = lang"
              :class="[
                'px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all cursor-pointer',
                selectedServerLangFilter === lang
                  ? 'bg-cyan-400 text-black font-bold shadow-md'
                  : 'bg-white/10 hover:bg-white/15 text-white/70'
              ]"
            >
              {{ lang === 'all' ? 'Tous' : lang.toUpperCase() }}
            </button>
          </div>

          <div class="flex flex-col -mx-6 max-h-[50vh] overflow-y-auto pr-1">
            <button
              v-for="(src, idx) in displayServersList"
              :key="idx"
              @click="switchVideoSource(src)"
              :disabled="isSwitchingSource === src.url"
              class="flex items-center justify-between px-6 py-3 text-left transition-colors cursor-pointer border-b border-white/10 last:border-b-0 hover:bg-white/5 disabled:opacity-50"
              :class="isCurrentSourceActive(src) ? 'bg-cyan-500/10 text-white' : 'text-white/70'"
            >
              <div class="flex flex-col gap-0.5 overflow-hidden pr-3">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-semibold truncate" :class="isCurrentSourceActive(src) ? 'text-cyan-300 font-bold' : 'text-white'">
                    {{ src.name || `Serveur ${idx + 1}` }}
                  </span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase" :class="getSourceQualityBadge(src).includes('1080') ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-white/10 text-white/80'">
                    {{ getSourceQualityBadge(src) }}
                  </span>
                </div>
                <div class="flex items-center gap-2 text-[11px] text-white/40">
                  <span v-if="src.provider" class="text-cyan-400/80 font-medium">{{ src.provider }}</span>
                  <span v-if="src.lang" class="uppercase font-semibold text-white/60">[{{ (src.lang || 'vf').toUpperCase() }}]</span>
                </div>
              </div>

              <div class="flex items-center shrink-0">
                <IconLoader2 v-if="isSwitchingSource === src.url" :size="18" class="animate-spin text-cyan-400" />
                <IconCheck v-else-if="isCurrentSourceActive(src)" :size="18" class="text-cyan-400" :stroke-width="2.5" />
              </div>
            </button>
          </div>
        </template>
        </div>
      </div>
    </div>

    <!-- 5. FULL-SCREEN EPISODES OVERLAY (Netflix-style grid) -->
    <transition name="fade">
      <div
        v-if="showEpisodesPanel"
        @click.stop="showSeasonDropdown = false"
        class="absolute inset-0 z-50 bg-black/92 flex flex-col p-8 sm:p-10 pointer-events-auto"
        style="backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);"
      >
        <!-- Header: Season selector + Close -->
        <div class="flex items-center justify-between mb-8 shrink-0">
          <div class="relative">
            <button
              v-if="seasons.length > 1"
              @click.stop="showSeasonDropdown = !showSeasonDropdown"
              aria-label="Changer de saison"
              class="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/15 hover:bg-white/20 text-white font-bold text-sm sm:text-base transition-colors cursor-pointer"
            >
              Saison {{ currentSeason }}
              <IconChevronDown :size="17" :stroke-width="2.5" class="transition-transform duration-200" :class="showSeasonDropdown ? 'rotate-180' : ''" />
            </button>
            <span v-else class="px-5 py-2.5 rounded-full bg-white/15 text-white font-bold text-sm sm:text-base">
              Saison {{ currentSeason }}
            </span>

            <!-- Season Dropdown Panel (custom-built: stays on-theme & works with the remote's D-pad, unlike a native <select>) -->
            <transition name="fade">
              <div
                v-if="showSeasonDropdown"
                @click.stop
                class="absolute left-0 top-full mt-2 w-72 max-h-96 overflow-y-auto rounded-2xl bg-zinc-900/98 border border-white/15 shadow-[0_20px_50px_rgba(0,0,0,0.9)] z-10 py-2"
                style="backdrop-filter: blur(30px); -webkit-backdrop-filter: blur(30px);"
              >
                <button
                  v-for="s in seasons"
                  :key="s.season_number"
                  @click="selectSeason(s.season_number)"
                  :aria-label="'Saison ' + s.season_number"
                  class="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer hover:bg-cyan-500/10"
                  :class="s.season_number === currentSeason ? 'bg-cyan-500/10 text-cyan-300' : 'text-white/80'"
                >
                  <span class="text-sm font-semibold truncate">
                    S{{ s.season_number }} — {{ s.name || `Saison ${s.season_number}` }}
                  </span>
                  <IconCheck v-if="s.season_number === currentSeason" :size="16" class="text-cyan-400 shrink-0" :stroke-width="2.5" />
                </button>
              </div>
            </transition>
          </div>

          <button
            @click="showEpisodesPanel = false"
            aria-label="Fermer la liste des épisodes"
            class="text-white/70 hover:text-white transition-colors cursor-pointer p-1.5 rounded-full hover:bg-white/10 active:scale-90"
          >
            <IconX :size="26" />
          </button>
        </div>

        <!-- Episodes Grid -->
        <div class="flex-1 overflow-y-auto overflow-x-hidden pr-1">
          <div v-if="episodesLoading" class="flex items-center justify-center py-24">
            <IconLoader2 :size="40" class="text-cyan-400 animate-spin" />
          </div>
          <div v-else-if="episodesList.length === 0" class="flex items-center justify-center py-24 text-white/50 text-sm">
            Aucun épisode disponible pour cette saison
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-8">
            <div
              v-for="ep in episodesList"
              :key="ep.id || ep.episodeNumber"
              @click="emit('selectEpisode', ep); showEpisodesPanel = false"
              :data-current-episode="ep.episodeNumber === currentEpisode ? 'true' : undefined"
              class="group/ep flex flex-col cursor-pointer p-1.5 rounded-2xl transition-all duration-200"
            >
              <!-- 16:9 Landscape Thumbnail with Play Overlay -->
              <div class="relative w-full aspect-video rounded-lg overflow-hidden bg-black/60 mb-2.5">
                <img
                  v-if="ep.still || poster"
                  :src="ep.still || poster"
                  :alt="ep.title"
                  class="w-full h-full object-cover group-hover/ep:scale-105 transition-transform duration-500"
                />
                <div class="absolute inset-0 bg-black/25 group-hover/ep:bg-black/40 transition-colors flex items-center justify-center">
                  <div
                    :class="[
                      'w-11 h-11 rounded-full flex items-center justify-center border-2 backdrop-blur-md transition-all shadow-md',
                      ep.episodeNumber === currentEpisode ? 'bg-cyan-500 border-cyan-400 text-black' : 'bg-black/40 border-white/70 text-white group-hover/ep:scale-110'
                    ]"
                  >
                    <IconPlayerPlay :size="17" :stroke-width="2.5" class="fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              <!-- Title -->
              <h4
                :class="[
                  'text-sm sm:text-base font-bold leading-snug transition-colors',
                  ep.episodeNumber === currentEpisode ? 'text-cyan-400' : 'text-white group-hover/ep:text-cyan-300'
                ]"
              >
                {{ ep.episodeNumber }}. {{ ep.title || 'Épisode ' + ep.episodeNumber }}
              </h4>

              <!-- Duration -->
              <span v-if="ep.runtime" class="text-xs text-white/40 mt-1">{{ ep.runtime }}</span>

              <!-- Synopsis -->
              <p v-if="ep.overview" class="text-xs text-white/50 line-clamp-3 leading-relaxed mt-1.5">
                {{ ep.overview }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- OSD KEYBOARD SHORTCUT HUD TOAST -->
    <transition name="osd-hud">
      <div
        v-if="osdToast.visible"
        class="absolute top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none px-5 py-2.5 rounded-full bg-black/85 border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.95),inset_0_1px_0_0_rgba(255,255,255,0.2)] text-white text-sm font-bold flex items-center gap-2.5 select-none"
        style="backdrop-filter: blur(40px) saturate(1.8); -webkit-backdrop-filter: blur(40px) saturate(1.8);"
      >
        <span v-if="osdToast.icon" class="text-base">{{ osdToast.icon }}</span>
        <span>{{ osdToast.text }}</span>
      </div>
    </transition>

    <!-- KEYBOARD SHORTCUTS HELP MODAL (Noir Glass) -->
    <transition name="fade">
      <div
        v-if="showShortcutsHelp"
        @click.self="showShortcutsHelp = false"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-md select-none"
      >
        <div
          class="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-black/90 border border-white/20 rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-[0_30px_70px_rgba(0,0,0,0.98),inset_0_1px_0_0_rgba(255,255,255,0.25)]"
          style="backdrop-filter: blur(50px) saturate(2.0); -webkit-backdrop-filter: blur(50px) saturate(2.0);"
        >
          <!-- Header -->
          <div class="flex items-center justify-between border-b border-white/10 pb-4">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <IconKeyboard :size="22" :stroke-width="2.2" />
              </div>
              <div>
                <h3 class="text-lg sm:text-xl font-black text-white tracking-tight">Raccourcis Clavier</h3>
                <p class="text-xs text-white/50">Contrôlez le lecteur vidéo directement au clavier</p>
              </div>
            </div>
            <button
              @click="showShortcutsHelp = false"
              class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <IconX :size="18" :stroke-width="2.5" />
            </button>
          </div>

          <!-- Grid of shortcuts -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
            <!-- Col 1: Lecture & Navigation -->
            <div class="flex flex-col gap-3">
              <h4 class="text-xs font-black uppercase tracking-wider text-cyan-400">⏯️ Lecture & Défilement</h4>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Lecture / Pause</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">Espace</kbd>
                    <span class="text-white/40">ou</span>
                    <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">K</kbd>
                  </div>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Reculer / Avancer 10s</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">←</kbd>
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">→</kbd>
                  </div>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Reculer / Avancer 30s</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">[</kbd>
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">]</kbd>
                  </div>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Positionner à 0% ... 90%</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">0 - 9</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Vitesse (±0.25x)</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">&lt;</kbd>
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">&gt;</kbd>
                  </div>
                </div>

                <div class="flex items-center justify-between py-1">
                  <span class="text-white/80 font-medium">Passer Intro / Outro</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">S</kbd>
                </div>
              </div>
            </div>

            <!-- Col 2: Audio, Affichage & Épisodes -->
            <div class="flex flex-col gap-3">
              <h4 class="text-xs font-black uppercase tracking-wider text-cyan-400">🔊 Audio & Affichage</h4>
              <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Volume (±5%)</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">↑</kbd>
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">↓</kbd>
                  </div>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Muet (Mute)</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">M</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Plein écran</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">F</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Picture-in-Picture (PiP)</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">I</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Sous-titres On / Off</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">C</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Piste audio (VF / VO...)</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">A / V</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Qualité vidéo (1080p / 720p...)</span>
                  <kbd class="px-2 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">Q</kbd>
                </div>

                <div class="flex items-center justify-between py-1 border-b border-white/5">
                  <span class="text-white/80 font-medium">Épisode Suivant / Précédent</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">N</kbd>
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">P</kbd>
                  </div>
                </div>

                <div class="flex items-center justify-between py-1">
                  <span class="text-white/80 font-medium">Panneau Épisodes / Options</span>
                  <div class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">E</kbd>
                    <kbd class="px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-mono font-bold text-xs">O</kbd>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="border-t border-white/10 pt-3 flex items-center justify-between text-xs text-white/40">
            <span>Appuyez sur <kbd class="px-1.5 py-0.5 rounded bg-white/10 text-white font-mono text-[10px]">?</kbd> pour réafficher cette aide à tout moment.</span>
            <button
              @click="showShortcutsHelp = false"
              class="px-4 py-1.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all cursor-pointer"
            >
              Fermer (Échap)
            </button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.osd-hud-enter-active,
.osd-hud-leave-active {
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.osd-hud-enter-from,
.osd-hud-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px) scale(0.95);
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}

.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 4px) scale(0.95);
}

video::cue {
  visibility: hidden !important;
  opacity: 0 !important;
  font-size: 0 !important;
}
</style>
