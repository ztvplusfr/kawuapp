import { supabase } from '../supabase'
import {
  fetchFromTmdb,
  fetchLogoForMedia,
  formatMediaItem,
  getMediaFullDetails,
  getTrendingHeroSlides as getTmdbTrending,
  getDramaSeries as getTmdbDrama,
  getAnimeSimulcast as getTmdbAnime,
  getActionMovies as getTmdbMovies,
  getTop10France as getTmdbTop10,
  getComedies as getTmdbComedies,
  getSciFi as getTmdbSciFi,
  getTopRated as getTmdbTopRated
} from '../tmdb'

/**
 * Couple a list of Supabase contents records with full TMDB metadata & logos
 */
async function coupleSupabaseItems(list) {
  if (!list || list.length === 0) return []
  const results = await Promise.all(
    list.map(async item => {
      try {
        const itemType = item.type || 'movie'
        const data = await fetchFromTmdb(`/${itemType}/${item.tmdb_id}`)
        if (data) {
          const logo = await fetchLogoForMedia(item.tmdb_id, itemType)
          const formatted = formatMediaItem(data, null, logo)
          return {
            ...formatted,
            supabaseContentId: item.id,
            isSupabaseHosted: true,
            createdAt: item.created_at
          }
        }
      } catch (e) {
        console.warn(`[MediaService] Erreur couplage Supabase item ${item.id}:`, e)
      }
      return null
    })
  )
  return results.filter(Boolean)
}

/**
 * 1. COUPLED HERO SLIDES
 * Fetches latest featured contents from Supabase, enriches each with TMDB (transparent logos, 4K artwork, metadata),
 * and complements with TMDB Trending so the slider is always vibrant and complete.
 */
export async function getHeroSlides() {
  try {
    const { data: dbContents, error } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(6)

    let coupledSlides = []

    if (!error && dbContents && dbContents.length > 0) {
      coupledSlides = await coupleSupabaseItems(dbContents)
    }

    // Complement with TMDB trending if needed
    if (coupledSlides.length < 5) {
      const trending = await getTmdbTrending()
      const existingIds = new Set(coupledSlides.map(s => String(s.id)))
      const extra = (trending || []).filter(t => !existingIds.has(String(t.id)))
      coupledSlides = [...coupledSlides, ...extra].slice(0, 8)
    }

    return coupledSlides
  } catch (err) {
    console.error('[MediaService] getHeroSlides error:', err)
    return await getTmdbTrending()
  }
}

/**
 * 2. ALL COUPLED HOME RAILS
 * Merges Supabase contents into each category and fetches diverse TMDB sections
 */
export async function getCoupledRails() {
  try {
    // 1. Fetch all contents from Supabase
    const { data: allContents } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })

    const rawContents = allContents || []
    const supabaseMovies = rawContents.filter(c => c.type === 'movie')
    const supabaseSeries = rawContents.filter(c => c.type === 'tv')

    // 2. Fetch TMDB rails in parallel
    const [
      allCoupledDb,
      coupledDbMovies,
      coupledDbSeries,
      tmdbTop10,
      tmdbDrama,
      tmdbAnime,
      tmdbAction,
      tmdbComedies,
      tmdbSciFi,
      tmdbTopRated
    ] = await Promise.all([
      coupleSupabaseItems(rawContents),
      coupleSupabaseItems(supabaseMovies),
      coupleSupabaseItems(supabaseSeries),
      getTmdbTop10(),
      getTmdbDrama(),
      getTmdbAnime(),
      getTmdbMovies(),
      getTmdbComedies(),
      getTmdbSciFi(),
      getTmdbTopRated()
    ])

    // Categorize Supabase coupled items by genre and type
    const supabaseAnime = allCoupledDb.filter(item => 
      (item.genre && (item.genre.toLowerCase().includes('anim') || item.genre.toLowerCase().includes('manga'))) ||
      item.category === 'Animés'
    )
    const supabaseSciFi = allCoupledDb.filter(item => 
      item.genre && (item.genre.toLowerCase().includes('sci-fi') || item.genre.toLowerCase().includes('fantastique') || item.genre.toLowerCase().includes('aventure'))
    )
    const supabaseComedies = allCoupledDb.filter(item => 
      item.genre && (item.genre.toLowerCase().includes('comédie') || item.genre.toLowerCase().includes('humour'))
    )
    const supabaseTopRated = [...allCoupledDb].sort((a, b) => {
      const rA = parseFloat(a.rating?.replace(/[^\d.]/g, '') || 0)
      const rB = parseFloat(b.rating?.replace(/[^\d.]/g, '') || 0)
      return rB - rA
    })

    // Helper to merge Supabase items cleanly at the front of a rail
    const mergeRail = (dbItems, tmdbItems) => {
      const validDbItems = dbItems || []
      const dbIds = new Set(validDbItems.map(i => String(i.id)))
      const filteredTmdb = (tmdbItems || []).filter(i => !dbIds.has(String(i.id)))
      return [...validDbItems, ...filteredTmdb]
    }

    // Top 10: Merges Supabase contents at the top + TMDB Trending France, ranked 1 to 10
    const top10Merged = mergeRail(allCoupledDb, tmdbTop10 || []).slice(0, 10).map((item, index) => ({
      ...item,
      rank: index + 1
    }))

    return {
      // 1. Nouveautés & Ajouts Récents (All Supabase items coupled with TMDB)
      recentAdditions: allCoupledDb,

      // 2. Top 10 (Supabase Contents + TMDB Trending France)
      top10France: top10Merged,

      // 3. Séries & Thrillers (Supabase TV in priority + TMDB)
      dramaSeries: mergeRail(coupledDbSeries, tmdbDrama),

      // 4. Animés en Simulcast & Manga (Supabase Animés in priority + TMDB)
      animesRail: mergeRail(supabaseAnime, tmdbAnime),

      // 5. Films d'action & Blockbusters (Supabase Movies in priority + TMDB)
      moviesRail: mergeRail(coupledDbMovies, tmdbAction),

      // 6. Science-Fiction & Mondes Fantastiques (Supabase Sci-Fi in priority + TMDB)
      sciFiRail: mergeRail(supabaseSciFi, tmdbSciFi),

      // 7. Comédies populaires & Détente (Supabase Comedies in priority + TMDB)
      comediesRail: mergeRail(supabaseComedies, tmdbComedies),

      // 8. Chefs-d'œuvre & Mieux Notés (Supabase Top Rated in priority + TMDB)
      topRatedRail: mergeRail(supabaseTopRated, tmdbTopRated)
    }
  } catch (err) {
    console.error('[MediaService] getCoupledRails error:', err)
    return {
      recentAdditions: [],
      top10France: await getTmdbTop10(),
      dramaSeries: await getTmdbDrama(),
      animesRail: await getTmdbAnime(),
      moviesRail: await getTmdbMovies(),
      sciFiRail: await getTmdbSciFi(),
      comediesRail: await getTmdbComedies(),
      topRatedRail: await getTmdbTopRated()
    }
  }
}

/**
 * 3. COUPLED EXPLORE CATALOG
 * Returns only Supabase contents, enriched with TMDB metadata
 */
export async function getCoupledExploreCatalog(type = 'all', genreId = null) {
  try {
    let query = supabase.from('contents').select('*').order('created_at', { ascending: false })
    if (type === 'movie' || type === 'tv') {
      query = query.eq('type', type)
    } else if (type === 'anime') {
      query = query.eq('type', 'tv')
    }
    const { data: dbItems } = await query

    if (dbItems && dbItems.length > 0) {
      const validDb = await coupleSupabaseItems(dbItems)
      const seen = new Set()
      return validDb.filter(item => {
        const key = String(item.id)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }

    return []
  } catch (err) {
    console.error('[MediaService] getCoupledExploreCatalog error:', err)
    return []
  }
}

/**
 * 4. COUPLED FULL MEDIA DETAILS (with Supabase Video Streams)
 */
export async function getCoupledMediaDetails(id, type = 'movie') {
  try {
    let tmdbId = id
    let supabaseContentId = null
    let supabaseType = type
    let allContentIds = []

    if (typeof id === 'string' && id.startsWith('c_')) {
      const { data: content } = await supabase
        .from('contents')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (content) {
        tmdbId = content.tmdb_id
        supabaseContentId = content.id
        supabaseType = content.type || type
        allContentIds = [content.id]
      }
    } else {
      const { data: contents } = await supabase
        .from('contents')
        .select('*')
        .eq('tmdb_id', Number(id))
        .order('created_at', { ascending: false })

      if (contents && contents.length > 0) {
        const content = contents[0]
        supabaseContentId = content.id
        supabaseType = content.type || type
        allContentIds = contents.map(c => c.id)
      }
    }

    const fullDetails = await getMediaFullDetails(tmdbId, supabaseType)
    if (!fullDetails) return null

    // 1. Fetch native Supabase video streams for all matching content IDs
    let videoStreams = []
    if (allContentIds.length > 0) {
      const { data: videos } = await supabase
        .from('videos')
        .select('*')
        .in('content_id', allContentIds)
        .order('season', { ascending: true })
        .order('episode', { ascending: true })

      videoStreams = videos || []
    }

    // 2. Fetch & Couple Similar / Recommended titles (Strict relevance match)
    let coupledSimilar = fullDetails.similar || []
    try {
      const { data: dbContents } = await supabase
        .from('contents')
        .select('*')
        .order('created_at', { ascending: false })

      if (dbContents && dbContents.length > 0) {
        // Exclude current item
        const otherDb = dbContents.filter(c => c.id !== supabaseContentId && String(c.tmdb_id) !== String(tmdbId))
        const coupledDb = await coupleSupabaseItems(otherDb)

        if (coupledDb.length > 0) {
          const currentGenres = (fullDetails.genre || '').toLowerCase().split(',').map(g => g.trim()).filter(Boolean)
          
          // STRICT MATCH: Must share type AND at least one genre, or match TMDB similar list
          const tmdbSimilarIds = new Set((fullDetails.similar || []).map(s => String(s.id)))

          const strictlyMatchingDb = coupledDb.filter(item => {
            const isSameType = item.type === fullDetails.type
            const itemGenres = (item.genre || '').toLowerCase().split(',').map(g => g.trim())
            const sharesGenre = currentGenres.some(g => itemGenres.includes(g))
            const isTmdbRecommended = tmdbSimilarIds.has(String(item.id)) || tmdbSimilarIds.has(String(item.tmdb_id))

            return isTmdbRecommended || (isSameType && sharesGenre)
          })

          const matchingDbIds = new Set(strictlyMatchingDb.map(i => String(i.id)))
          const extraTmdb = (fullDetails.similar || []).filter(s => !matchingDbIds.has(String(s.id)))

          // Place strictly matching Supabase items first, then genuine TMDB similar items
          coupledSimilar = [...strictlyMatchingDb, ...extraTmdb].slice(0, 12)
        }
      }
    } catch (e) {
      console.warn('[MediaService] Erreur couplage similar titles:', e)
    }

    return {
      ...fullDetails,
      supabaseContentId,
      videoStreams,
      similar: coupledSimilar,
      hasNativeStream: videoStreams.length > 0
    }
  } catch (err) {
    console.error('[MediaService] getCoupledMediaDetails error:', err)
    return await getMediaFullDetails(id, type)
  }
}
