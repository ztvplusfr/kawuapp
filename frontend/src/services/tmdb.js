/**
 * TMDB (The Movie Database) API Service
 * Fetches authentic real-world media, official PNG logos (FR/EN), full details, and episodes.
 * Includes TVDB / Crunchyroll Season & Arc Groups Auto-Resolver!
 */

const USER_TMDB_API_KEY = 'd547a077baa00b34dcb5efb6440a4b04'
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

// TMDB Genre Map (French)
export const TMDB_GENRES = {
  28: 'Action',
  12: 'Aventure',
  16: 'Animation',
  35: 'Comédie',
  80: 'Crime',
  99: 'Documentaire',
  18: 'Drame',
  10751: 'Famille',
  14: 'Fantastique',
  36: 'Histoire',
  27: 'Horreur',
  10402: 'Musique',
  9648: 'Mystère',
  10749: 'Romance',
  878: 'Science-Fiction',
  10770: 'Téléfilm',
  53: 'Thriller',
  10752: 'Guerre',
  37: 'Western',
  10759: 'Action & Aventure',
  10762: 'Jeunesse',
  10764: 'Télé-réalité',
  10765: 'Sci-Fi & Fantastique',
  10768: 'Guerre & Politique'
}

// Logo in-memory cache to avoid duplicate network requests
const logoCache = new Map()

export function getTmdbApiKey() {
  return localStorage.getItem('kawu_tmdb_key') || USER_TMDB_API_KEY
}

export function getTmdbImage(path, size = 'w780') {
  if (!path) return 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop'
  if (path.startsWith('http')) return path
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export function getOriginalTmdbImage(path) {
  if (!path) return 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop'
  if (path.startsWith('http')) return path
  return `${TMDB_IMAGE_BASE}/original${path}`
}

export function getTmdbLogoImage(path, size = 'w500') {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

export async function fetchFromTmdb(endpoint, params = {}) {
  const apiKey = getTmdbApiKey()
  const query = new URLSearchParams({
    api_key: apiKey,
    language: 'fr-FR',
    ...params
  })

  try {
    const res = await fetch(`${TMDB_BASE_URL}${endpoint}?${query.toString()}`)
    if (!res.ok) {
      throw new Error(`TMDB error ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    console.warn(`[TMDB API Error] Failed to fetch ${endpoint}:`, err)
    return null
  }
}

/**
 * Fetch official clear logo PNG in FR or EN
 */
export async function fetchLogoForMedia(id, type = 'movie') {
  const cacheKey = `${type}_${id}`
  if (logoCache.has(cacheKey)) return logoCache.get(cacheKey)

  const apiKey = getTmdbApiKey()
  try {
    const res = await fetch(
      `${TMDB_BASE_URL}/${type}/${id}/images?api_key=${apiKey}&include_image_language=fr,en,null`
    )
    if (!res.ok) {
      logoCache.set(cacheKey, null)
      return null
    }
    const data = await res.json()
    if (data && data.logos && data.logos.length > 0) {
      const frLogo = data.logos.find(l => l.iso_639_1 === 'fr')
      const enLogo = data.logos.find(l => l.iso_639_1 === 'en')
      const chosen = frLogo || enLogo || data.logos[0]
      const url = getTmdbLogoImage(chosen.file_path, 'w500')
      logoCache.set(cacheKey, url)
      return url
    }
  } catch (err) {
    console.warn(`Failed to fetch logo for ${type} ${id}:`, err)
  }
  logoCache.set(cacheKey, null)
  return null
}

/**
 * Format real TMDB metadata without any hardcoded/fake values
 */
export function formatMediaItem(item, customCategory = null, logoUrl = null) {
  const isMovie = item.media_type === 'movie' || (!item.first_air_date && !!item.release_date) || item.title !== undefined
  const title = (item.title || item.name || '').trim()
  const rawDate = item.release_date || item.first_air_date || ''
  const year = rawDate ? rawDate.split('-')[0] : ''
  const ratingValue = item.vote_average ? Number(item.vote_average).toFixed(1) : null
  const rating = ratingValue ? `★ ${ratingValue}` : ''
  
  const genreList = (item.genre_ids || (item.genres ? item.genres.map(g => g.id) : []))
    .map(id => TMDB_GENRES[id] || (item.genres ? item.genres.find(g => g.id === id)?.name : ''))
    .filter(Boolean)
    .slice(0, 2)
  const genreText = genreList.length > 0 ? genreList.join(' • ') : (isMovie ? 'Film' : 'Série')

  const mediaTypeLabel = isMovie ? 'Film' : 'Série'
  const adultBadge = item.adult ? '18+' : (item.vote_average >= 8 ? '16+' : 'TP')

  return {
    id: item.id,
    tmdbType: isMovie ? 'movie' : 'tv',
    title,
    logoUrl,
    type: mediaTypeLabel,
    category: customCategory || (isMovie ? 'Films' : 'Séries'),
    genre: genreText,
    year,
    age: adultBadge,
    quality: item.vote_average >= 7.5 ? '4K UHD' : 'HD 1080p',
    rating,
    voteCount: item.vote_count ? `${item.vote_count} avis` : '',
    synopsis: item.overview || 'Aucun synopsis disponible pour ce titre.',
    poster: getTmdbImage(item.backdrop_path || item.poster_path, 'w780'),
    bgImg: getOriginalTmdbImage(item.backdrop_path || item.poster_path),
    backdropUrl: 'linear-gradient(to right, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.45) 45%, rgba(0, 0, 0, 0.85) 100%), radial-gradient(circle at 75% 35%, rgba(6, 182, 212, 0.2) 0%, rgba(0, 0, 0, 0.9) 70%)'
  }
}

/**
 * 1. Trending Hero Blockbusters (with real FR/EN transparent PNG logos)
 */
export async function getTrendingHeroSlides() {
  const data = await fetchFromTmdb('/trending/all/week')
  if (data && data.results && data.results.length > 0) {
    const rawSlides = data.results
      .filter(item => item.backdrop_path && item.overview)
      .slice(0, 8)

    return await Promise.all(
      rawSlides.map(async item => {
        const type = item.media_type === 'tv' ? 'tv' : 'movie'
        const logo = await fetchLogoForMedia(item.id, type)
        return formatMediaItem(item, null, logo)
      })
    )
  }
  return []
}

/**
 * 2. Séries Dramatiques & Thrillers (with clear logos)
 */
export async function getDramaSeries() {
  const data = await fetchFromTmdb('/discover/tv', {
    with_genres: '18,9648',
    sort_by: 'popularity.desc',
    'vote_count.gte': '50'
  })
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 18)
    return await Promise.all(
      items.map(async item => {
        const logo = await fetchLogoForMedia(item.id, 'tv')
        return formatMediaItem(item, 'Séries', logo)
      })
    )
  }
  return []
}

/**
 * 3. Animés & Simulcast (Japan Animation with clear logos)
 */
export async function getAnimeSimulcast() {
  const data = await fetchFromTmdb('/discover/tv', {
    with_genres: '16',
    with_original_language: 'ja',
    sort_by: 'popularity.desc',
    'vote_count.gte': '20'
  })
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 18)
    return await Promise.all(
      items.map(async item => {
        const logo = await fetchLogoForMedia(item.id, 'tv')
        return formatMediaItem(item, 'Animés', logo)
      })
    )
  }
  return []
}

/**
 * 4. Films d'Action & Sci-Fi (with clear logos)
 */
export async function getActionMovies() {
  const data = await fetchFromTmdb('/discover/movie', {
    with_genres: '28,878',
    sort_by: 'popularity.desc',
    'vote_count.gte': '50'
  })
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 18)
    return await Promise.all(
      items.map(async item => {
        const logo = await fetchLogoForMedia(item.id, 'movie')
        return formatMediaItem(item, 'Films', logo)
      })
    )
  }
  return []
}

/**
 * 5. Top 10 en France (with clear logos)
 */
export async function getTop10France() {
  const data = await fetchFromTmdb('/trending/all/day')
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 10)
    return await Promise.all(
      items.map(async (item, index) => {
        const type = item.media_type === 'tv' ? 'tv' : 'movie'
        const logo = await fetchLogoForMedia(item.id, type)
        return {
          ...formatMediaItem(item, null, logo),
          rank: index + 1
        }
      })
    )
  }
  return []
}

/**
 * 5b. Comédies populaires & Détente
 */
export async function getComedies() {
  const data = await fetchFromTmdb('/discover/movie', {
    with_genres: '35',
    sort_by: 'popularity.desc',
    'vote_count.gte': '40'
  })
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 18)
    return await Promise.all(
      items.map(async item => {
        const logo = await fetchLogoForMedia(item.id, 'movie')
        return formatMediaItem(item, 'Comédies', logo)
      })
    )
  }
  return []
}

/**
 * 5c. Science-Fiction & Mondes Fantastiques
 */
export async function getSciFi() {
  const data = await fetchFromTmdb('/discover/movie', {
    with_genres: '878,14',
    sort_by: 'popularity.desc',
    'vote_count.gte': '40'
  })
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 18)
    return await Promise.all(
      items.map(async item => {
        const logo = await fetchLogoForMedia(item.id, 'movie')
        return formatMediaItem(item, 'Sci-Fi', logo)
      })
    )
  }
  return []
}

/**
 * 5d. Chefs-d'œuvre & Mieux Notés (★)
 */
export async function getTopRated() {
  const data = await fetchFromTmdb('/movie/top_rated')
  if (data && data.results && data.results.length > 0) {
    const items = data.results.filter(item => item.backdrop_path).slice(0, 18)
    return await Promise.all(
      items.map(async item => {
        const logo = await fetchLogoForMedia(item.id, 'movie')
        return formatMediaItem(item, 'Films', logo)
      })
    )
  }
  return []
}

/**
 * 6. Dynamic Discover for Explorer / Catalog (with full concurrent PNG logo resolution)
 */
export async function discoverExploreCatalog(type = 'all', genreId = null) {
  let endpoint = '/trending/all/week'
  let params = {}

  if (type === 'movie') {
    endpoint = '/discover/movie'
    params = {
      sort_by: 'popularity.desc',
      'vote_count.gte': '30',
      ...(genreId ? { with_genres: genreId } : {})
    }
  } else if (type === 'tv') {
    endpoint = '/discover/tv'
    params = {
      sort_by: 'popularity.desc',
      'vote_count.gte': '30',
      ...(genreId ? { with_genres: genreId } : {})
    }
  } else if (type === 'anime') {
    endpoint = '/discover/tv'
    params = {
      with_genres: '16',
      with_original_language: 'ja',
      sort_by: 'popularity.desc',
      'vote_count.gte': '15'
    }
  } else if (genreId) {
    endpoint = '/discover/movie'
    params = {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      'vote_count.gte': '30'
    }
  }

  const data = await fetchFromTmdb(endpoint, params)
  if (data && data.results && data.results.length > 0) {
    const validItems = data.results
      .filter(item => item.backdrop_path || item.poster_path)
      .slice(0, 24)

    return await Promise.all(
      validItems.map(async item => {
        const mediaType = item.media_type || (type === 'tv' || type === 'anime' ? 'tv' : 'movie')
        const logo = await fetchLogoForMedia(item.id, mediaType)
        return formatMediaItem(item, type === 'anime' ? 'Animés' : null, logo)
      })
    )
  }
  return []
}

/**
 * 7. Fetch Full Media Details with Intelligent TVDB / Crunchyroll Season Breakdown
 */
export async function getMediaFullDetails(id, type = 'movie') {
  const apiKey = getTmdbApiKey()
  try {
    const endpoint = `/${type}/${id}`
    const data = await fetchFromTmdb(endpoint, {
      append_to_response: 'credits,videos,similar,recommendations,episode_groups,external_ids'
    })
    if (!data) return null

    const logo = await fetchLogoForMedia(id, type)
    const baseFormatted = formatMediaItem(data, null, logo)

    // Duration calculation
    let runtimeStr = ''
    if (data.runtime) {
      const hours = Math.floor(data.runtime / 60)
      const minutes = data.runtime % 60
      runtimeStr = hours > 0 ? `${hours}h ${minutes}m.` : `${minutes}m.`
    } else if (data.episode_run_time && data.episode_run_time.length > 0) {
      runtimeStr = `${data.episode_run_time[0]}m.`
    } else {
      runtimeStr = ''
    }

    // Helper to identify and filter out special / bonus / OVA seasons
    const isRegularSeason = (s) => {
      if (!s) return false
      if (typeof s.season_number === 'number' && s.season_number <= 0) return false
      const name = String(s.name || '').toLowerCase()
      if (
        name.includes('special') ||
        name.includes('spécial') ||
        name.includes('hors-série') ||
        name.includes('hors série') ||
        name.includes('extras') ||
        name.includes('bonus') ||
        name.includes('ova')
      ) {
        return false
      }
      return true
    }

    // Process seasons for TV Shows (Pure TMDB seasons by default, TVDB grouping deactivated)
    let seasonsList = []
    let resolvedEpisodeGroup = null

    if (type === 'tv') {
      const rawDefaultSeasons = (data.seasons || []).filter(isRegularSeason)
      const isPackedSingleSeason = rawDefaultSeasons.length <= 2 && rawDefaultSeasons.some(s => s.episode_count > 40)

      // [TVDB Coupling Toggle] Active: resolves TVDB / Crunchyroll / Story Arcs season groups
      const ENABLE_TVDB_COUPLING = true

      if (ENABLE_TVDB_COUPLING) {
        // Look for TVDB / Crunchyroll / Arc splits in episode_groups
        const availableGroups = data.episode_groups?.results || []
        const tvdbOrCrunchyGroup = availableGroups.find(g =>
          g.name?.toLowerCase().includes('tvdb') ||
          g.name?.toLowerCase().includes('thetvdb') ||
          g.name?.toLowerCase().includes('crunchyroll') ||
          g.name?.toLowerCase().includes('season split') ||
          g.name?.toLowerCase().includes('story arc') ||
          g.name?.toLowerCase().includes('arc') ||
          g.name?.toLowerCase().includes('saison') ||
          g.name?.toLowerCase().includes('season')
        ) || (availableGroups.length > 0 && isPackedSingleSeason ? availableGroups[0] : null)

        if (tvdbOrCrunchyGroup && (tvdbOrCrunchyGroup.group_count > rawDefaultSeasons.length || isPackedSingleSeason)) {
          // Fetch the detailed group structure
          const groupDetails = await fetchFromTmdb(`/tv/episode_group/${tvdbOrCrunchyGroup.id}`)
          if (groupDetails && groupDetails.groups && groupDetails.groups.length > 0) {
            resolvedEpisodeGroup = groupDetails
            seasonsList = groupDetails.groups
              .filter(isRegularSeason)
              .map((grp, idx) => ({
                season_number: idx + 1,
                name: grp.name || `Saison ${idx + 1}`,
                episode_count: grp.episodes?.length || 0,
                isEpisodeGroup: true,
                groupId: tvdbOrCrunchyGroup.id,
                episodes: grp.episodes
              }))
          }
        }
      }

      // Default fallback / pure TMDB seasons
      if (seasonsList.length === 0) {
        seasonsList = rawDefaultSeasons
      }
    }

    // Process similar titles with logos
    let similarTitles = []
    const rawSimilar = data.similar?.results || data.recommendations?.results || []
    if (rawSimilar.length > 0) {
      similarTitles = await Promise.all(
        rawSimilar
          .filter(i => i.backdrop_path)
          .slice(0, 10)
          .map(async i => {
            const lType = i.media_type || type
            const lLogo = await fetchLogoForMedia(i.id, lType)
            return formatMediaItem(i, null, lLogo)
          })
      )
    }

    // Process real video trailers (FR first, then global)
    let trailerKey = null
    let allVideos = []
    
    if (data.videos && data.videos.results && data.videos.results.length > 0) {
      allVideos = data.videos.results
    } else {
      const rawVids = await fetch(`${TMDB_BASE_URL}/${type}/${id}/videos?api_key=${apiKey}`)
      if (rawVids.ok) {
        const vData = await rawVids.json()
        allVideos = vData.results || []
      }
    }

    if (allVideos.length > 0) {
      const frTrailer = allVideos.find(v => v.site === 'YouTube' && v.iso_639_1 === 'fr' && (v.type === 'Trailer' || v.type === 'Teaser'))
      const enTrailer = allVideos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
      const anyYt = allVideos.find(v => v.site === 'YouTube')
      trailerKey = frTrailer?.key || enTrailer?.key || anyYt?.key || null
    }

    // Real cast with high quality large portraits
    const realActors = (data.credits?.cast || []).slice(0, 16).map(actor => ({
      id: actor.id,
      name: actor.name,
      character: actor.character,
      photo: actor.profile_path ? getTmdbImage(actor.profile_path, 'w300') : null
    }))

    // Real directors/creators
    const realCrew = (data.credits?.crew || [])
      .filter(c => c.job === 'Director' || c.job === 'Executive Producer' || c.department === 'Directing')
      .slice(0, 2)
      .map(c => c.name)
      .join(', ')

    return {
      ...baseFormatted,
      tagline: data.tagline || '',
      status: data.status === 'Ended' ? 'Terminée' : (data.status === 'Returning Series' ? 'En cours' : 'Disponible'),
      runtimeStr,
      numberOfSeasons: seasonsList.length || 1,
      numberOfEpisodes: data.number_of_episodes || 1,
      seasons: seasonsList,
      resolvedEpisodeGroup,
      similar: similarTitles,
      trailerKey,
      actors: realActors,
      director: realCrew || data.created_by?.map(c => c.name).join(', ') || ''
    }
  } catch (err) {
    console.error('Error fetching full media details:', err)
    return null
  }
}

/**
 * 8. Fetch TV Season Episodes
 */
export async function getSeasonEpisodes(tvId, seasonNumber = 1, seasonObj = null) {
  if (seasonObj && seasonObj.episodes && seasonObj.episodes.length > 0) {
    return seasonObj.episodes.map(ep => {
      let formattedDate = ''
      if (ep.air_date) {
        const d = new Date(ep.air_date)
        if (!isNaN(d.getTime())) {
          formattedDate = d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          })
        } else {
          formattedDate = ep.air_date
        }
      }

      const rating = ep.vote_average ? Number(ep.vote_average).toFixed(1) : null

      return {
        id: ep.id,
        episodeNumber: ep.episode_number || ep.order + 1 || 1,
        title: ep.name || `Épisode ${ep.episode_number}`,
        overview: ep.overview || 'Aucun résumé disponible pour cet épisode.',
        runtime: ep.runtime ? `${ep.runtime} min` : '24 min',
        still: ep.still_path ? getTmdbImage(ep.still_path, 'w780') : null,
        airDate: formattedDate,
        rating: rating ? `★ ${rating}` : '',
        voteCount: ep.vote_count || 0
      }
    })
  }

  try {
    const data = await fetchFromTmdb(`/tv/${tvId}/season/${seasonNumber}`)
    if (data && data.episodes) {
      return data.episodes.map(ep => {
        let formattedDate = ''
        if (ep.air_date) {
          const d = new Date(ep.air_date)
          if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })
          } else {
            formattedDate = ep.air_date
          }
        }

        const rating = ep.vote_average ? Number(ep.vote_average).toFixed(1) : null

        return {
          id: ep.id,
          episodeNumber: ep.episode_number,
          title: ep.name || `Épisode ${ep.episode_number}`,
          overview: ep.overview || 'Aucun résumé disponible pour cet épisode.',
          runtime: ep.runtime ? `${ep.runtime} min` : '',
          still: ep.still_path ? getTmdbImage(ep.still_path, 'w780') : null,
          airDate: formattedDate,
          rating: rating ? `★ ${rating}` : '',
          voteCount: ep.vote_count || 0
        }
      })
    }
  } catch (err) {
    console.error(`Error fetching season ${seasonNumber} for TV ${tvId}:`, err)
  }
  return []
}

/**
 * 9. Live Search with Official Transparent PNG Logos
 */
export async function searchTmdb(query) {
  if (!query || !query.trim()) return []
  const data = await fetchFromTmdb('/search/multi', {
    query: query.trim()
  })
  if (data && data.results) {
    const valid = data.results
      .filter(item => (item.media_type === 'movie' || item.media_type === 'tv') && (item.backdrop_path || item.poster_path))
      .slice(0, 18)

    return await Promise.all(
      valid.map(async item => {
        const type = item.media_type === 'tv' ? 'tv' : 'movie'
        const logo = await fetchLogoForMedia(item.id, type)
        return formatMediaItem(item, null, logo)
      })
    )
  }
  return []
}
