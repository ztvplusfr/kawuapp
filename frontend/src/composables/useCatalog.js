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
const moviesRail = ref([])
const seriesRail = ref([])
const topRatedRail = ref([])
const genreRails = ref([])
const searchResults = ref([])

let isLoaded = false

/**
 * Load coupled Supabase Contents + TMDB Metadata & Trending
 */
async function loadCoupledCatalog() {
  if (isLoaded) return
  isLoading.value = true

  try {
    // Supabase-backed fetches run first (each resolves its own Supabase data before
    // falling back to / complementing with TMDB), then rails follow.
    const heroRes = await getHeroSlides()
    const railsRes = await getCoupledRails()

    if (heroRes && heroRes.length > 0) heroSlides.value = heroRes
    if (railsRes) {
      if (railsRes.recentAdditions?.length > 0) recentAdditions.value = railsRes.recentAdditions
      if (railsRes.top10France?.length > 0) top10France.value = railsRes.top10France
      if (railsRes.moviesRail?.length > 0) moviesRail.value = railsRes.moviesRail
      if (railsRes.seriesRail?.length > 0) seriesRail.value = railsRes.seriesRail
      if (railsRes.topRatedRail?.length > 0) topRatedRail.value = railsRes.topRatedRail
      if (railsRes.genreRails?.length > 0) genreRails.value = railsRes.genreRails
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
    // recentAdditions already contains every Supabase-coupled item once;
    // the other rails are just re-groupings of that same set.
    return recentAdditions.value
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
    moviesRail,
    seriesRail,
    topRatedRail,
    genreRails,
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
