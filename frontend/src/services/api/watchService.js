import { supabase } from '../supabase'
import { fetchFromTmdb, fetchLogoForMedia, formatMediaItem } from '../tmdb'

/**
 * 1. GET USER CONTINUE WATCHING (Coupled Supabase watch_progress + TMDB)
 */
export async function getUserContinueWatching(userId) {
  if (!userId || String(userId) === 'undefined') return []
  try {
    const { data: progressList, error } = await supabase
      .from('watch_progress')
      .select('*')
      .eq('user_id', String(userId))
      .order('updated_at', { ascending: false })
      .limit(10)

    if (error || !progressList || progressList.length === 0) {
      return []
    }

    const coupled = await Promise.all(
      progressList.map(async item => {
        try {
          const targetId = item.content_id
          let tmdbId = targetId
          let itemType = item.season > 0 ? 'tv' : 'movie'

          // 1. If it's a Supabase content ID (c_...), lookup contents table
          if (typeof targetId === 'string' && targetId.startsWith('c_')) {
            const { data: content } = await supabase
              .from('contents')
              .select('*')
              .eq('id', targetId)
              .maybeSingle()

            if (content && content.tmdb_id) {
              tmdbId = content.tmdb_id
              itemType = content.type || itemType
            }
          }

          // 2. Fetch TMDB data
          let tmdbData = await fetchFromTmdb(`/${itemType}/${tmdbId}`)
          if (!tmdbData && itemType === 'movie') {
            tmdbData = await fetchFromTmdb(`/tv/${tmdbId}`)
            if (tmdbData) itemType = 'tv'
          } else if (!tmdbData && itemType === 'tv') {
            tmdbData = await fetchFromTmdb(`/movie/${tmdbId}`)
            if (tmdbData) itemType = 'movie'
          }

          if (tmdbData) {
            const logo = await fetchLogoForMedia(tmdbId, itemType)
            const formatted = formatMediaItem(tmdbData, null, logo)
            
            const percent = item.duration_seconds > 0 
              ? Math.round((item.progress_seconds / item.duration_seconds) * 100) 
              : 50

            const minutesLeft = item.duration_seconds > item.progress_seconds
              ? Math.round((item.duration_seconds - item.progress_seconds) / 60)
              : 15

            return {
              ...formatted,
              supabaseContentId: item.content_id,
              season: item.season,
              episode: item.episode,
              genre: item.season > 0 ? `S${item.season} • Épisode ${item.episode}` : formatted.genre,
              progress: percent,
              timeLeft: `${minutesLeft} min restantes`
            }
          }
        } catch (e) {
          console.warn('[WatchService] Error coupling progress item:', e)
        }
        return null
      })
    )

    return coupled.filter(Boolean)
  } catch (err) {
    console.error('[WatchService] getUserContinueWatching error:', err)
    return []
  }
}

/**
 * 2. SAVE OR UPDATE WATCH PROGRESS (in Supabase watch_progress & track)
 */
export async function saveProgress(userId, contentId, season = 1, episode = 1, progressSeconds = 0, durationSeconds = 0) {
  if (!userId || !contentId || String(userId) === 'undefined') return null
  try {
    const isCompleted = durationSeconds > 0 && progressSeconds >= durationSeconds * 0.9

    // 1. Check if watch_progress entry exists for user + content
    const { data: existing } = await supabase
      .from('watch_progress')
      .select('id')
      .eq('user_id', String(userId))
      .eq('content_id', String(contentId))
      .maybeSingle()

    let res
    if (existing && existing.id) {
      res = await supabase
        .from('watch_progress')
        .update({
          season: Number(season) || 1,
          episode: Number(episode) || 1,
          progress_seconds: Math.round(progressSeconds),
          duration_seconds: Math.round(durationSeconds),
          completed: isCompleted,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
    } else {
      res = await supabase
        .from('watch_progress')
        .insert({
          user_id: String(userId),
          content_id: String(contentId),
          season: Number(season) || 1,
          episode: Number(episode) || 1,
          progress_seconds: Math.round(progressSeconds),
          duration_seconds: Math.round(durationSeconds),
          completed: isCompleted,
          updated_at: new Date().toISOString()
        })
    }

    // 2. Insert tracking entry in track table
    supabase.from('track').insert({
      user_id: String(userId),
      content_id: String(contentId),
      season: Number(season) || 1,
      episode: Number(episode) || 1,
      seconds: Math.round(progressSeconds),
      created_at: new Date().toISOString()
    }).then(() => {}).catch(() => {})

    return res?.data || null
  } catch (err) {
    console.warn('[WatchService] saveProgress error:', err)
    return null
  }
}

/**
 * 3. GET USER WATCHLIST (Coupled Supabase watchlist + TMDB)
 */
export async function getUserWatchlistCoupled(userId) {
  if (!userId || String(userId) === 'undefined') return []
  try {
    const { data: list, error } = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', String(userId))
      .order('created_at', { ascending: false })

    if (error || !list || list.length === 0) return []

    const coupled = await Promise.all(
      list.map(async item => {
        try {
          const targetId = item.content_id
          let tmdbId = targetId
          let itemType = item.media_type || (item.season > 0 ? 'tv' : 'movie')

          // 1. If it's a Supabase content ID (c_...), lookup contents table
          if (typeof targetId === 'string' && targetId.startsWith('c_')) {
            const { data: content } = await supabase
              .from('contents')
              .select('*')
              .eq('id', targetId)
              .maybeSingle()

            if (content && content.tmdb_id) {
              tmdbId = content.tmdb_id
              itemType = content.type || itemType
            }
          }

          // 2. Fetch TMDB data
          let tmdbData = await fetchFromTmdb(`/${itemType}/${tmdbId}`)
          if (!tmdbData && itemType === 'movie') {
            tmdbData = await fetchFromTmdb(`/tv/${tmdbId}`)
            if (tmdbData) itemType = 'tv'
          } else if (!tmdbData && itemType === 'tv') {
            tmdbData = await fetchFromTmdb(`/movie/${tmdbId}`)
            if (tmdbData) itemType = 'movie'
          }

          if (tmdbData) {
            const logo = await fetchLogoForMedia(tmdbId, itemType)
            return {
              ...formatMediaItem(tmdbData, itemType, logo),
              supabaseContentId: targetId,
              type: itemType
            }
          }
        } catch (e) {
          console.warn('[WatchService] Error coupling watchlist item:', e)
        }
        return null
      })
    )

    return coupled.filter(Boolean)
  } catch (err) {
    console.error('[WatchService] getUserWatchlistCoupled error:', err)
    return []
  }
}

/**
 * 4. TOGGLE WATCHLIST
 */
export async function toggleWatchlist(userId, contentId) {
  if (!userId || !contentId || String(userId) === 'undefined') return false
  try {
    const { data: list } = await supabase
      .from('watchlist')
      .select('id, content_id')
      .eq('user_id', String(userId))

    const existing = (list || []).find(item => 
      String(item.content_id) === String(contentId)
    )

    if (existing && existing.id) {
      await supabase.from('watchlist').delete().eq('id', existing.id)
      return false
    } else {
      const generatedId = `w_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
      await supabase.from('watchlist').insert({
        id: generatedId,
        user_id: String(userId),
        content_id: String(contentId),
        created_at: new Date().toISOString()
      })
      return true
    }
  } catch (err) {
    console.warn('[WatchService] toggleWatchlist error:', err)
    return false
  }
}
