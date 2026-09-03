import { supabase } from '../supabase'
import { searchTmdb, getMediaFullDetails } from '../tmdb'

/**
 * Searches TMDB for media candidates
 */
export async function searchTmdbCandidates(query) {
  if (!query || query.trim().length === 0) return []
  return await searchTmdb(query)
}

/**
 * Gets full details for a selected TMDB item
 */
export async function getTmdbMetadata(tmdbId, mediaType = 'tv') {
  return await getMediaFullDetails(tmdbId, mediaType)
}

/**
 * Adds (or updates) a single video source for one movie/episode without
 * touching the rest of the catalog — used by the Admin "Ajout manuel" tab.
 */
export async function addSingleVideo(contentId, { seasonNumber = 0, episodeNumber = 0, videoUrl, language = 'vostfr' }) {
  if (!contentId) throw new Error('contentId requis.')
  if (!videoUrl || !videoUrl.trim()) throw new Error('URL de la vidéo requise.')

  // `videos.id` is a uuid column with a gen_random_uuid() default — let
  // Postgres generate it instead of sending a non-uuid string.
  const row = {
    content_id: contentId,
    url: videoUrl.trim(),
    season: seasonNumber,
    episode: episodeNumber,
    number: episodeNumber,
    lang: (language || 'vostfr').toLowerCase(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase.from('videos').insert(row)
  if (error) throw new Error(`Erreur lors de l'ajout de la vidéo : ${error.message}`)
  return row
}

/**
 * Ensures a `contents` row exists for a given TMDB item (creating it if
 * needed) without inserting any video — used by both the "Importer (API)"
 * and "Ajout manuel" Admin tabs before attaching sources.
 */
export async function ensureContentExists(metadata) {
  if (!metadata) throw new Error('Métadonnées TMDB requises.')
  const tmdbIdNum = parseInt(metadata.id || metadata.tmdbId)

  const { data: existingContent } = await supabase
    .from('contents')
    .select('id')
    .eq('tmdb_id', tmdbIdNum)
    .maybeSingle()

  if (existingContent?.id) return existingContent.id

  // `contents.id` is a uuid column with a gen_random_uuid() default — let
  // Postgres generate it instead of sending a non-uuid string, then read it back.
  // `title` is NOT NULL, so it must be sent along with the other TMDB metadata.
  const contentRow = {
    tmdb_id: tmdbIdNum,
    type: metadata.mediaType || (metadata.category === 'Films' ? 'movie' : 'tv'),
    title: metadata.title || 'Titre inconnu',
    poster_url: metadata.posterUrl || metadata.poster || null,
    year: metadata.year ? parseInt(metadata.year) : null,
    overview: metadata.synopsis || metadata.overview || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  const { data, error } = await supabase.from('contents').insert(contentRow).select('id').single()
  if (error) throw new Error(`Erreur lors de la création du contenu : ${error.message}`)
  return data.id
}

/**
 * Global catalog/usage counts shown in the Admin "Statistiques" tab.
 */
export async function getAdminStats() {
  const count = async (table, filters = {}) => {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value)
    }
    const { count: n, error } = await query
    if (error) {
      console.warn(`[AdminImporter] getAdminStats count error on ${table}:`, error)
      return 0
    }
    return n || 0
  }

  const [totalContents, totalMovies, totalSeries, totalVideos, totalUsers, totalWatchlist] = await Promise.all([
    count('contents'),
    count('contents', { type: 'movie' }),
    count('contents', { type: 'tv' }),
    count('videos'),
    count('users'),
    count('watchlist')
  ])

  return { totalContents, totalMovies, totalSeries, totalVideos, totalUsers, totalWatchlist }
}
