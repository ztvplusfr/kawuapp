import { ref, watch } from 'vue'

const STORAGE_KEY = 'kawu_preferences'

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch (e) {}
  return {}
}

const stored = loadPrefs()

// 'vf' | 'vostfr' — default language preference used to auto-select the
// matching audio/subtitle pill when a title has multiple language sources.
const preferredLanguage = ref(stored.preferredLanguage === 'vostfr' ? 'vostfr' : 'vf')

// 'highest' | '1080p' | '720p' — always force highest HD/FHD quality instead of auto
const preferredQuality = ref(stored.preferredQuality || 'highest')

watch(preferredLanguage, (val) => {
  try {
    const current = loadPrefs()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, preferredLanguage: val }))
  } catch (e) {
    console.warn('[useUserPreferences] Unable to persist preferences:', e)
  }
})

watch(preferredQuality, (val) => {
  try {
    const current = loadPrefs()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, preferredQuality: val }))
  } catch (e) {
    console.warn('[useUserPreferences] Unable to persist preferences:', e)
  }
})

export function useUserPreferences() {
  return { preferredLanguage, preferredQuality }
}
