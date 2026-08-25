import { ref, computed } from 'vue'
import { getHeroSlides, getCoupledRails } from '../services/api/mediaService'
import { searchTmdb } from '../services/tmdb'

const selectedCategory = ref('Tous')
const searchQuery = ref('')
const isLoading = ref(false)

const categories = ['Tous', 'Films', 'Animés', 'Séries']

// Reactive state for all Home rails
const heroSlides = ref([])
const recentAdditions = ref([])
const top10France = ref([])
const dramaSeries = ref([])
const animesRail = ref([])
const moviesRail = ref([])
const sciFiRail = ref([])
const comediesRail = ref([])
const topRatedRail = ref([])
const searchResults = ref([])

let isLoaded = false

/**
 * Load coupled Supabase Contents + TMDB Metadata & Trending
 */
async function loadCoupledCatalog() {
  if (isLoaded) return
  isLoading.value = true

  try {
    const [heroRes, railsRes] = await Promise.all([
      getHeroSlides(),
      getCoupledRails()
    ])

    if (heroRes && heroRes.length > 0) heroSlides.value = heroRes
    if (railsRes) {
      if (railsRes.recentAdditions?.length > 0) recentAdditions.value = railsRes.recentAdditions
      if (railsRes.top10France?.length > 0) top10France.value = railsRes.top10France
      if (railsRes.dramaSeries?.length > 0) dramaSeries.value = railsRes.dramaSeries
      if (railsRes.animesRail?.length > 0) animesRail.value = railsRes.animesRail
      if (railsRes.moviesRail?.length > 0) moviesRail.value = railsRes.moviesRail
      if (railsRes.sciFiRail?.length > 0) sciFiRail.value = railsRes.sciFiRail
      if (railsRes.comediesRail?.length > 0) comediesRail.value = railsRes.comediesRail
      if (railsRes.topRatedRail?.length > 0) topRatedRail.value = railsRes.topRatedRail
    }

    isLoaded = true
  } catch (err) {
    console.error('Error loading coupled Supabase & TMDB data:', err)
  } finally {
    isLoading.value = false
  }
}

export function useCatalog() {
  loadCoupledCatalog()

  const allMedia = computed(() => {
    return [
      ...recentAdditions.value,
      ...top10France.value,
      ...dramaSeries.value,
      ...animesRail.value,
      ...moviesRail.value,
      ...sciFiRail.value,
      ...comediesRail.value,
      ...topRatedRail.value
    ]
  })

  const filteredCatalog = computed(() => {
    let list = allMedia.value
    if (selectedCategory.value !== 'Tous') {
      list = list.filter(item => item.category === selectedCategory.value)
    }
    if (searchQuery.value.trim() !== '') {
      const q = searchQuery.value.toLowerCase().trim()
      list = list.filter(item => item.title.toLowerCase().includes(q) || (item.genre && item.genre.toLowerCase().includes(q)))
    }
    return list
  })

  async function performSearch(query) {
    searchQuery.value = query
    if (query && query.trim().length > 1) {
      const liveResults = await searchTmdb(query)
      if (liveResults && liveResults.length > 0) {
        searchResults.value = liveResults
      }
    }
  }

  function selectCategory(cat) {
    selectedCategory.value = cat
  }

  function getMediaById(id) {
    return allMedia.value.find(item => item.id === Number(id) || item.supabaseContentId === String(id))
  }

  return {
    heroSlides,
    recentAdditions,
    top10France,
    dramaSeries,
    animesRail,
    moviesRail,
    sciFiRail,
    comediesRail,
    topRatedRail,
    searchResults,
    allMedia,
    categories,
    selectedCategory,
    searchQuery,
    isLoading,
    filteredCatalog,
    performSearch,
    selectCategory,
    getMediaById,
    reloadCatalog: () => {
      isLoaded = false
      return loadCoupledCatalog()
    }
  }
}
