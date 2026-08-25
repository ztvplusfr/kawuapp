<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
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
  IconSettings,
  IconList,
  IconPlayerSkipForward,
  IconShareplay,
  IconCast
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
  'selectEpisode'
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
const showEpisodesPanel = ref(false)
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
const showSkipIntroButton = computed(() => {
  if (!props.skipIntro || typeof props.skipIntro.startTime !== 'number' || typeof props.skipIntro.endTime !== 'number') return false
  return currentTime.value >= props.skipIntro.startTime && currentTime.value < props.skipIntro.endTime
})

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

const showManualSkipIntroButton = computed(() => {
  if (showSkipIntroButton.value || showSkipOutroButton.value) return false
  const isSeries = !!props.episodeLabel || (props.episodesList && props.episodesList.length > 0)
  return isSeries && currentTime.value > 5 && currentTime.value < 180
})

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

// Server / Video Source Mirror Switcher
const activeSourceUrl = ref('')

async function switchVideoSource(sourceItem) {
  if (!sourceItem || !sourceItem.url) return
  const resolvedUrl = await resolveHlsStreamUrl(sourceItem.url)
  activeSourceUrl.value = resolvedUrl
  const video = videoRef.value
  if (!video) return
  const currentPos = video.currentTime || 0
  video.src = resolvedUrl
  video.load()
  video.currentTime = currentPos
  video.play().then(() => {
    isPlaying.value = true
  }).catch(() => {})
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
    // Line 2 (album) = episode info
    let mediaTitle = props.title || 'Kawu'
    let mediaAlbum = props.episodeLabel || props.subtitle || 'Kawu Streaming'

    navigator.mediaSession.metadata = new MediaMetadata({
      title: mediaTitle,
      artist: props.subtitle || props.title || 'Kawu',
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
    // Line 2 (album/artist) = episode info
    const mediaTitle = props.title || 'Kawu'
    const mediaSubtitle = props.episodeLabel || props.subtitle || 'Kawu Streaming'
    SetNowPlayingInfo(
      mediaTitle,
      mediaSubtitle,
      props.subtitle || mediaTitle,
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

// Dynamic real audio & subtitle tracks computed from Nakastream API or HLS manifest
const availableAudioTracks = computed(() => {
  if (props.resolvedAudioTracks && props.resolvedAudioTracks.length > 0) {
    return props.resolvedAudioTracks
  }
  if (audioTracks.value && audioTracks.value.length > 0) {
    return audioTracks.value.map(t => ({
      lang: t.lang || t.name,
      label: t.name || t.lang || 'Audio',
      default: !!t.default
    }))
  }
  return [
    { lang: 'fr', label: 'Français (VF)', default: true },
    { lang: 'ja', label: 'Japonais (VO)', default: false }
  ]
})

const availableSubtitles = computed(() => {
  if (props.resolvedSubtitles && props.resolvedSubtitles.length > 0) {
    return props.resolvedSubtitles
  }
  if (subtitleTracks.value && subtitleTracks.value.length > 0) {
    return subtitleTracks.value.map(s => ({
      lang: s.lang || s.name,
      label: s.name || s.lang || 'Sous-titre',
      url: s.url || '',
      default: !!s.default
    }))
  }
  return [
    { lang: 'fre', label: 'Français (Sous-titres FR)', url: '', default: true }
  ]
})

// Dynamic Pill buttons matching exact user request: "Français (VF)", "Japonais (Sous-titres FR)"
const dynamicLanguagePills = computed(() => {
  const audios = availableAudioTracks.value
  const subs = availableSubtitles.value
  const pills = []

  // Detect available streams from Supabase (DB) to know if we have a real VF track or only VOSTFR
  const streams = props.allEpisodeStreams || []
  // NB: "vostfr" contient "vf"/"fr", donc on exclut explicitement vost avant de matcher VF
  const hasVfStream = streams.some(s => {
    const lang = (s.lang || '').toLowerCase()
    if (lang.includes('vost')) return false
    return lang === 'vf' || lang === 'fr' || lang.includes('vf') || lang.includes('french')
  })
  const hasVostfrStream = streams.some(s => {
    const lang = (s.lang || '').toLowerCase()
    return lang === 'vostfr' || lang.includes('vost') || lang.includes('vo') || lang.includes('jap') || lang.includes('ja')
  })

  // If we have explicit Supabase streams, only show pills for those languages
  if (streams.length > 0) {
    if (hasVfStream) {
      const vfAudio = audios.find(a => (a.lang || a.label || '').toLowerCase().includes('fr')) || audios[0]
      pills.push({
        id: 'pill-vf',
        label: 'Français (VF)',
        audioIdx: vfAudio ? audios.indexOf(vfAudio) : 0,
        subIdx: -1
      })
    }
    if (hasVostfrStream) {
      const jaAudio = audios.find(a => (a.lang || a.label || '').toLowerCase().includes('ja') || (a.lang || a.label || '').toLowerCase().includes('vo')) || audios[1] || audios[0]
      const frSub = subs.find(s => (s.lang || s.label || '').toLowerCase().includes('fr')) || subs[0]
      pills.push({
        id: 'pill-vostfr',
        label: 'Japonais (Sous-titres FR)',
        audioIdx: jaAudio ? audios.indexOf(jaAudio) : 0,
        subIdx: frSub ? subs.indexOf(frSub) : 0
      })
    }
    return pills
  }

  // Fallback: show both pills based on HLS audio tracks
  const vfAudio = audios.find(a => (a.lang || a.label || '').toLowerCase().includes('fr')) || audios[0]
  pills.push({
    id: 'pill-vf',
    label: 'Français (VF)',
    audioIdx: vfAudio ? audios.indexOf(vfAudio) : 0,
    subIdx: -1
  })

  const jaAudio = audios.find(a => (a.lang || a.label || '').toLowerCase().includes('ja') || (a.lang || a.label || '').toLowerCase().includes('vo')) || audios[1] || audios[0]
  const frSub = subs.find(s => (s.lang || s.label || '').toLowerCase().includes('fr')) || subs[0]
  pills.push({
    id: 'pill-vostfr',
    label: 'Japonais (Sous-titres FR)',
    audioIdx: jaAudio ? audios.indexOf(jaAudio) : 0,
    subIdx: frSub ? subs.indexOf(frSub) : 0
  })

  return pills
})

const activeSubtitleBlobUrl = ref('')
const parsedCues = ref([])

function parseVttTime(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.trim().split(':')
  let seconds = 0
  if (parts.length === 3) {
    seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  } else if (parts.length === 2) {
    seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1])
  }
  return seconds
}

function parseVttCues(vttText) {
  if (!vttText) return []
  const lines = vttText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const cues = []
  let currentCue = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('WEBVTT') || line.startsWith('NOTE')) continue

    if (line.includes('-->')) {
      const parts = line.split('-->')
      const start = parseVttTime(parts[0])
      const end = parseVttTime(parts[1].split(' ')[0])
      currentCue = { start, end, text: '' }
      cues.push(currentCue)
    } else if (currentCue) {
      if (currentCue.text) currentCue.text += '\n' + line
      else currentCue.text = line
    }
  }
  return cues
}

const activeCueText = computed(() => {
  if (!parsedCues.value || parsedCues.value.length === 0) return ''
  const t = currentTime.value
  const cue = parsedCues.value.find(c => t >= c.start && t <= c.end)
  return cue ? cue.text : ''
})

async function selectPill(pill) {
  if (!pill) return
  activePillId.value = pill.id

  // 1. Switch video stream URL for VF vs VOSTFR if separate entries exist in DB
  const targetLang = pill.id === 'pill-vf' ? 'vf' : 'vostfr'

  if (props.allEpisodeStreams && props.allEpisodeStreams.length > 0) {
    const matchingStream = props.allEpisodeStreams.find(s => 
      (s.lang || '').toLowerCase() === targetLang ||
      (targetLang === 'vf' && (s.lang || '').toLowerCase().includes('vf')) ||
      (targetLang === 'vostfr' && (s.lang || '').toLowerCase().includes('vost'))
    )

    if (matchingStream && matchingStream.url) {
      console.log(`[VideoPlayer] Switching video stream source to [${targetLang.toUpperCase()}]:`, matchingStream.url)
      const resolvedUrl = await resolveHlsStreamUrl(matchingStream.url)
      const video = videoRef.value
      if (video) {
        const currentPos = video.currentTime || 0
        video.src = resolvedUrl
        video.load()
        video.currentTime = currentPos
        video.play().then(() => {
          isPlaying.value = true
        }).catch(() => {})
      }
      return
    }
  }

  // 2. Fallback to native HLS audio/sub tracks
  activeAudioIndex.value = pill.audioIdx
  activeSubtitleIndex.value = pill.subIdx
  applyTrackSelection(pill.audioIdx, pill.subIdx)
}

async function applyTrackSelection(audioIdx, subIdx) {
  const video = videoRef.value
  if (!video) return

  // 1. SWITCH AUDIO TRACK (HLS.js + Native macOS WebKit AVPlayer)
  if (hlsInstance && hlsInstance.audioTracks && hlsInstance.audioTracks[audioIdx]) {
    hlsInstance.audioTrack = audioIdx
  }
  if (video.audioTracks && video.audioTracks.length > 0) {
    for (let i = 0; i < video.audioTracks.length; i++) {
      video.audioTracks[i].enabled = (i === audioIdx)
    }
  }

  // 2. SWITCH SUBTITLE TRACK & LOAD VTT
  if (subIdx === -1) {
    parsedCues.value = []
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
  if (!targetSub || !targetSub.url) return

  try {
    let vttText = ''
    if (window.go?.main?.App?.FetchNakastreamSubtitle) {
      vttText = await window.go.main.App.FetchNakastreamSubtitle(targetSub.url)
    }
    if (!vttText) {
      const res = await fetch(targetSub.url)
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
            video.textTracks[i].mode = 'showing'
          }
        }
      }, 100)
    }
  } catch (err) {
    console.warn('[VideoPlayer] Subtitle load error:', err)
  }
}

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
function initVideoEngine() {
  const video = videoRef.value
  if (!video) return

  if (hlsInstance) {
    hlsInstance.destroy()
    hlsInstance = null
  }

  const streamUrl = props.src || ''
  const isHls = streamUrl.includes('.m3u8') || streamUrl.includes('/hls')
  // Force HLS.js for cross-origin providers (WebKit native blocks CORS segments)
  // BUT keep native for AirPlay compatibility (HLS.js doesn't support AirPlay routing)
  const forceHlsJs = !isAirPlayActive.value && (streamUrl.includes('nakastream') || streamUrl.includes('media.nakastream'))

  // Case A: macOS WebKit Native AVPlayer HLS engine (only for same-origin or CORS-friendly streams)
  if (isHls && !forceHlsJs && video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl
    video.load()
    if (props.initialTime > 0) video.currentTime = props.initialTime
    video.play().then(() => {
      isPlaying.value = true
    }).catch(() => {
      isPlaying.value = false
    })
  }
  // Case B: HLS.js Engine (for cross-origin or unsupported native)
  else if (isHls && Hls.isSupported()) {
    // For nakastream provider, proxy all requests through Go backend to bypass CORS
    const isNakastream = streamUrl.includes('nakastream')

    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      xhrSetup: (xhr) => {
        if (!isNakastream) {
          xhr.setRequestHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')
        }
      }
    })
    hlsInstance.loadSource(streamUrl)
    hlsInstance.attachMedia(video)

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      audioTracks.value = hlsInstance.audioTracks || []
      subtitleTracks.value = hlsInstance.subtitleTracks || []
      if (props.initialTime > 0) video.currentTime = props.initialTime
      video.play().then(() => {
        isPlaying.value = true
      }).catch(() => {
        isPlaying.value = false
      })
    })
  }
  // Case C: Standard Video URL
  else if (streamUrl) {
    video.src = streamUrl
    video.load()
    if (props.initialTime > 0) video.currentTime = props.initialTime
    video.play().then(() => {
      isPlaying.value = true
    }).catch(() => {
      isPlaying.value = false
    })
  }
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
  resetControlsTimer()
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

function handleKeyDown(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  switch (e.key.toLowerCase()) {
    case ' ':
    case 'k':
      e.preventDefault()
      togglePlay()
      break
    case 'arrowleft':
    case 'j':
      e.preventDefault()
      seekRelative(-10)
      break
    case 'arrowright':
    case 'l':
      e.preventDefault()
      seekRelative(10)
      break
    case 'escape':
      if (showAudioSubModal.value) showAudioSubModal.value = false
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

  // Select default language pill based on available streams
  // If we have explicit DB streams, prefer the first one matching; otherwise default to VF if available
  if (dynamicLanguagePills.value.length > 0) {
    const streams = props.allEpisodeStreams || []
    let defaultPill = null
    if (streams.length > 0) {
      const firstStream = streams[0]
      const firstLang = (firstStream.lang || '').toLowerCase()
      if (firstLang.includes('vost') || firstLang.includes('vo') || firstLang.includes('ja')) {
        defaultPill = dynamicLanguagePills.value.find(p => p.id === 'pill-vostfr') || dynamicLanguagePills.value[0]
      } else {
        defaultPill = dynamicLanguagePills.value.find(p => p.id === 'pill-vf') || dynamicLanguagePills.value[0]
      }
    } else {
      defaultPill = dynamicLanguagePills.value.find(p => p.id === 'pill-vf') || dynamicLanguagePills.value[0]
    }
    selectPill(defaultPill)
  }
})

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

watch(() => props.src, (newSrc) => {
  if (newSrc) {
    initVideoEngine()
    setupMediaSession()
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

watch(() => props.currentEpisode, () => {
  currentTime.value = 0
  initVideoEngine()
  setupMediaSession()
})

watch([() => props.title, () => props.episodeLabel, () => props.poster], () => {
  setupMediaSession()
})

const filteredSources = computed(() => {
  if (!props.availableSources || props.availableSources.length === 0) return []
  return props.availableSources.filter(s => {
    const url = (s.url || '').toLowerCase()
    const name = (s.name || '').toLowerCase()
    return !url.includes('nakastream') && !name.includes('nakastream')
  })
})

const isIframeEmbed = computed(() => {
  const currentUrl = activeSourceUrl.value || props.src
  if (!currentUrl) return false
  const lower = currentUrl.toLowerCase()
  return (
    lower.includes('embed') ||
    lower.includes('sibnet.ru') ||
    lower.includes('sendvid.com') ||
    lower.includes('myvi.tv') ||
    lower.includes('uqload') ||
    lower.includes('vidhide')
  ) && !lower.includes('.m3u8') && !lower.includes('.mp4')
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
    
    <!-- 1. NATIVE VIDEO ENGINE (For HLS .m3u8 and MP4 streams) -->
    <video
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
      class="absolute inset-x-0 z-40 flex justify-center pointer-events-none transition-all duration-300 px-8"
      :class="showControls ? 'bottom-36 sm:bottom-40' : 'bottom-10 sm:bottom-12'"
    >
      <div class="bg-black/80 text-white font-semibold text-lg sm:text-xl md:text-2xl px-5 py-2.5 rounded-2xl text-center leading-snug tracking-wide shadow-2xl border border-white/10 backdrop-blur-md max-w-3xl whitespace-pre-line drop-shadow-lg">
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

      <!-- Audio & Subtitle Options Icon Button -->
      <button
        @click.stop="showAudioSubModal = true"
        class="text-white/90 hover:text-cyan-300 transition-all active:scale-90 cursor-pointer drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] p-1.5 rounded-full hover:bg-white/10"
        title="Options Audio & Sous-titres"
      >
        <IconSettings :size="26" :stroke-width="2.2" />
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

        <!-- Scrubber Bar with RED Watched Fill (matching screenshot) -->
        <div
          @click.stop="handleScrub"
          class="relative flex-1 h-[4px] hover:h-[7px] bg-white/30 rounded-full cursor-pointer transition-all overflow-hidden"
        >
          <!-- Buffered Track -->
          <div
            class="absolute inset-y-0 left-0 bg-cyan-400/30 rounded-full"
            :style="{ width: bufferedPercent + '%' }"
          />
          <!-- Progress Fill (RED #ef4444 matching screenshot) -->
          <div
            class="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full shadow-[0_0_10px_rgba(34,211,238,0.6)]"
            :style="{ width: progressPercent + '%' }"
          />
        </div>

        <!-- Total Duration Time (e.g. "48:59") -->
        <span class="shrink-0 text-sm sm:text-base font-bold text-white tracking-wide font-sans drop-shadow">
          {{ formatTime(duration) }}
        </span>

      </div>

      <!-- Row 2: REAL Audio & Subtitle Language Quick Pills (matching screenshot) -->
      <div class="flex items-center justify-center gap-2.5 flex-wrap pt-1">
        
        <!-- Dynamic Pill Buttons created from REAL API tracks -->
        <button
          v-for="pill in dynamicLanguagePills"
          :key="pill.id"
          @click.stop="selectPill(pill)"
          :class="[
            'px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-md flex items-center gap-1.5',
            activePillId === pill.id
              ? 'bg-white text-black font-bold'
              : 'bg-white/20 hover:bg-white/30 text-white border border-white/10 backdrop-blur-md'
          ]"
        >
          <IconCheck v-if="activePillId === pill.id" :size="14" :stroke-width="3" />
          <span>{{ pill.label }}</span>
        </button>

        <!-- More Options Pill ("Autres ...") -->
        <button
          @click.stop="showAudioSubModal = true"
          class="px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold bg-white/20 hover:bg-white/30 text-white border border-white/10 backdrop-blur-md transition-all cursor-pointer shadow-md"
        >
          Autres ...
        </button>

      </div>

    </div>

    <!-- 4. AUDIO & SUBTITLES MODAL -->
    <div
      v-if="showAudioSubModal"
      @click.stop
      class="absolute inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-6"
    >
      <div class="w-full max-w-md bg-[#12161f] border border-white/15 rounded-3xl p-6 flex flex-col gap-5 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 class="text-base font-bold text-white">Audio & Sous-titres</h3>
          <button @click="showAudioSubModal = false" class="text-white/60 hover:text-white cursor-pointer">
            <IconX :size="20" />
          </button>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <!-- REAL Audio Tracks -->
          <div class="flex flex-col gap-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-red-400">Audio</h4>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="(audio, idx) in availableAudioTracks"
                :key="idx"
                @click="activeAudioIndex = idx; applyTrackSelection(idx, activeSubtitleIndex)"
                :class="[
                  'px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between',
                  activeAudioIndex === idx ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'
                ]"
              >
                <span>{{ audio.label || audio.lang }}</span>
                <IconCheck v-if="activeAudioIndex === idx" :size="16" />
              </button>
            </div>
          </div>

          <!-- REAL Subtitle Tracks -->
          <div class="flex flex-col gap-2">
            <h4 class="text-xs font-bold uppercase tracking-wider text-red-400">Sous-titres</h4>
            <div class="flex flex-col gap-1.5">
              <button
                @click="activeSubtitleIndex = -1; applyTrackSelection(activeAudioIndex, -1)"
                :class="[
                  'px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between',
                  activeSubtitleIndex === -1 ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'
                ]"
              >
                <span>Désactivé</span>
                <IconCheck v-if="activeSubtitleIndex === -1" :size="16" />
              </button>
              <button
                v-for="(sub, idx) in availableSubtitles"
                :key="idx"
                @click="activeSubtitleIndex = idx; applyTrackSelection(activeAudioIndex, idx)"
                :class="[
                  'px-3 py-2 rounded-xl text-left text-xs font-bold transition-all cursor-pointer flex items-center justify-between',
                  activeSubtitleIndex === idx ? 'bg-white text-black' : 'bg-white/5 text-white hover:bg-white/10'
                ]"
              >
                <span>{{ sub.label || sub.lang }}</span>
                <IconCheck v-if="activeSubtitleIndex === idx" :size="16" />
              </button>
            </div>
          </div>
        </div>

        <!-- DSP Equalizer & Spatial Audio Modes -->
        <div class="flex flex-col gap-2 border-t border-white/10 pt-4">
          <h4 class="text-xs font-bold uppercase tracking-wider text-cyan-400">Égaliseur & Traitement Audio (DSP)</h4>
          <div class="grid grid-cols-2 gap-2">
            <button
              v-for="mode in [
                { id: 'standard', label: 'Stéréo Standard', desc: 'Audio d\'origine' },
                { id: 'voice', label: '🗣️ Boost Voix / Dialogues', desc: 'Clarté des répliques (+7.5dB)' },
                { id: 'night', label: '🌙 Mode Nuit', desc: 'Atténue les explosions' },
                { id: 'spatial', label: '🌌 Dolby Atmos 3D', desc: 'Audio Spatial immersif' }
              ]"
              :key="mode.id"
              @click="setAudioDSPMode(mode.id)"
              :class="[
                'p-2.5 rounded-xl text-left transition-all cursor-pointer border flex flex-col gap-0.5',
                activeAudioDSP === mode.id
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md'
                  : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
              ]"
            >
              <span class="text-xs font-bold flex items-center justify-between">
                <span>{{ mode.label }}</span>
                <IconCheck v-if="activeAudioDSP === mode.id" :size="14" class="text-cyan-400" />
              </span>
              <span class="text-[10px] text-white/50">{{ mode.desc }}</span>
            </button>
          </div>
        </div>

        <!-- Serveurs & Miroirs vidéo (Sibnet, Sendvid, MyVi, Vidhide, Lplayer, etc.) -->
        <div v-if="filteredSources && filteredSources.length > 0" class="flex flex-col gap-2 border-t border-white/10 pt-4">
          <h4 class="text-xs font-bold uppercase tracking-wider text-emerald-400">Serveurs Vidéo & Miroirs</h4>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="(src, idx) in filteredSources"
              :key="idx"
              @click="switchVideoSource(src)"
              :class="[
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5',
                (activeSourceUrl || props.src) === src.url
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md'
                  : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
              ]"
            >
              <IconCheck v-if="(activeSourceUrl || props.src) === src.url" :size="13" />
              <span>{{ src.name || `Serveur ${idx + 1}` }}</span>
            </button>
          </div>
        </div>

        <button
          @click="showAudioSubModal = false"
          class="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl transition-all cursor-pointer mt-2 shadow-lg"
        >
          Valider
        </button>
      </div>
    </div>

    <!-- 5. LEFT SIDE PANEL DRAWER FOR EPISODES (DetailView Theme) -->
    <transition name="slide-left">
      <div
        v-if="showEpisodesPanel"
        @click.stop
        class="absolute inset-y-0 left-0 w-80 sm:w-96 md:w-[420px] bg-[#000000]/95 border-r border-white/10 backdrop-blur-2xl z-50 flex flex-col p-6 shadow-[20px_0_60px_rgba(0,0,0,0.95)] pointer-events-auto"
      >
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-4 shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center">
              <IconList :size="18" :stroke-width="2.5" />
            </div>
            <div class="flex flex-col">
              <h3 class="text-base font-black text-white tracking-wide">Épisodes</h3>
              <span v-if="episodesList && episodesList.length > 0" class="text-xs text-white/50">
                {{ episodesList.length }} épisodes disponibles
              </span>
            </div>
          </div>

          <button
            @click="showEpisodesPanel = false"
            class="text-white/60 hover:text-white transition-colors cursor-pointer p-1.5 rounded-full hover:bg-white/10 active:scale-90"
          >
            <IconX :size="20" />
          </button>
        </div>

        <!-- Episodes List matching DetailView cards -->
        <div class="flex-1 overflow-y-auto pr-1 flex flex-col gap-3">
          <div
            v-for="ep in episodesList"
            :key="ep.id || ep.episodeNumber"
            @click="emit('selectEpisode', ep); showEpisodesPanel = false"
            :class="[
              'group/ep p-3 rounded-2xl border backdrop-blur-xl transition-all duration-300 cursor-pointer flex items-center gap-3.5 shadow-lg',
              ep.episodeNumber === currentEpisode
                ? 'bg-cyan-500/15 border-cyan-400 text-cyan-300 shadow-cyan-950/50'
                : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/10 hover:border-cyan-400/50 text-white'
            ]"
          >
            <!-- Episode Index -->
            <span
              :class="[
                'text-lg font-black shrink-0 w-6 text-center transition-colors',
                ep.episodeNumber === currentEpisode ? 'text-cyan-400' : 'text-white/30 group-hover/ep:text-cyan-400'
              ]"
            >
              {{ ep.episodeNumber }}
            </span>

            <!-- 16:9 Thumbnail with Play Overlay -->
            <div class="relative w-28 sm:w-32 aspect-video shrink-0 rounded-xl overflow-hidden bg-black/60 shadow-md">
              <img
                v-if="ep.still || poster"
                :src="ep.still || poster"
                :alt="ep.title"
                class="w-full h-full object-cover group-hover/ep:scale-105 transition-transform duration-500"
              />
              <div class="absolute inset-0 bg-black/40 group-hover/ep:bg-black/20 transition-colors flex items-center justify-center">
                <div
                  :class="[
                    'w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-md',
                    ep.episodeNumber === currentEpisode ? 'bg-cyan-500 text-black' : 'bg-white/20 group-hover/ep:bg-cyan-500 text-white group-hover/ep:text-black'
                  ]"
                >
                  <IconPlayerPlay :size="12" :stroke-width="3" class="fill-current ml-0.5" />
                </div>
              </div>
              <span v-if="ep.runtime" class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-mono text-white/90 backdrop-blur-md">
                {{ ep.runtime }}
              </span>
            </div>

            <!-- Episode Info -->
            <div class="flex flex-col gap-1 flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2">
                <h4
                  :class="[
                    'text-xs sm:text-sm font-bold line-clamp-1 transition-colors',
                    ep.episodeNumber === currentEpisode ? 'text-cyan-300' : 'text-white group-hover/ep:text-cyan-300'
                  ]"
                >
                  S{{ currentSeason }} E{{ ep.episodeNumber }} — {{ ep.title || 'Épisode ' + ep.episodeNumber }}
                </h4>
                <span v-if="ep.rating" class="text-[10px] font-bold text-emerald-400 shrink-0">
                  {{ ep.rating }}
                </span>
              </div>

              <p v-if="ep.overview" class="text-[11px] text-white/50 line-clamp-2 leading-relaxed">
                {{ ep.overview }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}

.slide-left-enter-from,
.slide-left-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
