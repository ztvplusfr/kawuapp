import { supabase } from '../supabase.js'
import {
  fetchFromTmdb,
  fetchLogoForMedia,
  fetchTextlessPoster,
  formatMediaItem,
  getMediaFullDetails
} from '../tmdb.js'

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
          const [logo, textlessPoster] = await Promise.all([
            fetchLogoForMedia(item.tmdb_id, itemType),
            fetchTextlessPoster(item.tmdb_id, itemType)
          ])
          const formatted = formatMediaItem(data, null, logo)
          return {
            ...formatted,
            tmdb_id: item.tmdb_id,
            tmdbId: item.tmdb_id,
            posterUrl: textlessPoster || formatted.posterUrl,
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
 * Group coupled items by their real TMDB genre names (item.genre is a
 * "Genre1 • Genre2" string). One rail per genre actually present in the
 * catalog — never a fake/keyword-guessed category, and never empty since a
 * genre only exists in the map if at least one item carries it.
 */
function buildGenreRails(items) {
  const map = new Map()
  items.forEach(item => {
    if (!item.genre) return
    const genres = item.genre.split('•').map(g => g.trim()).filter(Boolean)
    genres.forEach(g => {
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(item)
    })
  })
  return Array.from(map.entries())
    .map(([genre, genreItems]) => ({ genre, items: genreItems }))
    .filter(r => r.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length)
}

/**
 * 1. COUPLED HERO SLIDES
 * Fetches latest featured contents from Supabase and enriches each with TMDB
 * (transparent logos, 4K artwork, metadata). Only Supabase-hosted titles are shown.
 */
export async function getHeroSlides() {
  try {
    const { data: dbContents, error } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8)

    if (error || !dbContents || dbContents.length === 0) return []

    return await coupleSupabaseItems(dbContents)
  } catch (err) {
    console.error('[MediaService] getHeroSlides error:', err)
    return []
  }
}

/**
 * 2. ALL COUPLED HOME RAILS
 * Every rail is built exclusively from Supabase contents (no TMDB-only filler),
 * enriched with TMDB metadata/artwork for display.
 */
export async function getCoupledRails() {
  try {
    // 1. Fetch all contents from Supabase FIRST
    const { data: allContents } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })

    const rawContents = allContents || []
    const supabaseMovies = rawContents.filter(c => c.type === 'movie')
    const supabaseSeries = rawContents.filter(c => c.type === 'tv')

    // 2. Couple Supabase items with their TMDB metadata (enrichment, not a separate source)
    const [allCoupledDb, coupledDbMovies, coupledDbSeries] = await Promise.all([
      coupleSupabaseItems(rawContents),
      coupleSupabaseItems(supabaseMovies),
      coupleSupabaseItems(supabaseSeries)
    ])

    // One rail per real TMDB genre actually present in the catalog (no fake/guessed categories)
    const genreRails = buildGenreRails(allCoupledDb)

    const supabaseTopRated = [...allCoupledDb].sort((a, b) => {
      const rA = parseFloat(a.rating?.replace(/[^\d.]/g, '') || 0)
      const rB = parseFloat(b.rating?.replace(/[^\d.]/g, '') || 0)
      return rB - rA
    })

    // Top 10: Supabase contents only, ranked 1 to 10
    const top10Merged = allCoupledDb.slice(0, 10).map((item, index) => ({
      ...item,
      rank: index + 1
    }))

    return {
      // 1. Nouveautés & Ajouts Récents (All Supabase items coupled with TMDB)
      recentAdditions: allCoupledDb,

      // 2. Top 10 (Supabase Contents only)
      top10France: top10Merged,

      // 3. Films (Supabase Movies only)
      moviesRail: coupledDbMovies,

      // 4. Séries (Supabase TV only)
      seriesRail: coupledDbSeries,

      // 5. Chefs-d'œuvre & Mieux Notés (Supabase Top Rated only)
      topRatedRail: supabaseTopRated,

      // 6. One real rail per genre actually present in the catalog
      genreRails
    }
  } catch (err) {
    console.error('[MediaService] getCoupledRails error:', err)
    return {
      recentAdditions: [],
      top10France: [],
      moviesRail: [],
      seriesRail: [],
      topRatedRail: [],
      genreRails: []
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
    }

    const { data: dbContents, error } = await query
    if (error || !dbContents || dbContents.length === 0) return []

    const coupled = await coupleSupabaseItems(dbContents)

    if (genreId) {
      const targetGenreName = TMDB_GENRES[genreId]?.toLowerCase()
      if (targetGenreName) {
        return coupled.filter(item => item.genre && item.genre.toLowerCase().includes(targetGenreName))
      }
    }

    return coupled
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

    const cleanInput = String(id || '').trim()
    const isNumeric = /^\d+$/.test(cleanInput)

    if (!isNumeric) {
      // It's a Supabase UUID or custom string ID
      const { data: content } = await supabase
        .from('contents')
        .select('*')
        .eq('id', cleanInput)
        .maybeSingle()

      if (content) {
        tmdbId = content.tmdb_id
        supabaseContentId = content.id
        supabaseType = content.type || type
        allContentIds = [content.id]
      }
    } else {
      tmdbId = Number(cleanInput)
      const { data: contents } = await supabase
        .from('contents')
        .select('*')
        .eq('tmdb_id', tmdbId)
        .order('created_at', { ascending: false })

      if (contents && contents.length > 0) {
        const content = contents[0]
        supabaseContentId = content.id
        supabaseType = content.type || type
        allContentIds = [content.id]
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
        .order('created_at', { ascending: false })

      videoStreams = videos || []
    }

    // 2. Fetch & Couple Similar / Recommended titles — Supabase-hosted matches only (no TMDB filler)
    let coupledSimilar = []
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

          coupledSimilar = strictlyMatchingDb.slice(0, 12)
        }
      }
    } catch (e) {
      console.warn('[MediaService] Erreur couplage similar titles:', e)
    }

    return {
      ...fullDetails,
      tmdb_id: tmdbId,
      tmdbId: tmdbId,
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
