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
      .limit(30)

    if (error || !progressList || progressList.length === 0) {
      return []
    }

    // Items manually marked "déjà vu" keep their watch_progress row (so resume
    // data isn't lost if unmarked later), they're just hidden from this row.
    const { data: manualRows } = await supabase
      .from('watched_manual')
      .select('content_id, season, episode')
      .eq('user_id', String(userId))

    const manualSet = new Set(
      (manualRows || []).map(m => `${m.content_id}_S${Number(m.season) || 0}_E${Number(m.episode) || 0}`)
    )

    const visibleProgress = progressList
      .filter(item => !manualSet.has(`${item.content_id}_S${Number(item.season) || 0}_E${Number(item.episode) || 0}`))
      .slice(0, 10)

    if (visibleProgress.length === 0) return []

    const coupled = await Promise.all(
      visibleProgress.map(async item => {
        try {
          const targetId = item.content_id
          let tmdbId = targetId
          let itemType = item.season > 0 ? 'tv' : 'movie'

          // 1. If it's a Supabase content ID (UUID or string ID), lookup contents table
          if (typeof targetId === 'string' && !/^\d+$/.test(targetId)) {
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
 * Détermine si un contenu (film ou épisode) est considéré comme "déjà vu"
 * selon son type et sa durée réelle :
 * - Film (> 60 min) : considéré vu dès les crédits de fin (~5 à 7 min restantes, ou >= 92% de la durée).
 * - Moyen-métrage (40-60 min) : considéré vu dès qu'il reste <= 3 min ou >= 90%.
 * - Épisode de série standard (20-30 min / animé) : considéré vu dès qu'il reste <= 2 min (générique de fin) ou >= 88%.
 * - Format court (< 20 min) : considéré vu dès qu'il reste <= 1 min ou >= 85%.
 */
export function isMediaCompleted(progressSeconds = 0, durationSeconds = 0, isMovie = false) {
  const dur = Number(durationSeconds) || 0
  const prog = Number(progressSeconds) || 0
  if (dur <= 0 || prog <= 0) return false

  const remaining = dur - prog
  const percent = (prog / dur) * 100

  // Si on a atteint 95% ou plus, c'est vu dans tous les cas
  if (percent >= 95) return true

  if (isMovie || dur >= 3600) {
    // Film long (> 60 min) : générique de fin démarre souvent à 5-7 min de la fin
    // Considéré vu s'il reste moins de 300s (5 min) ET au moins 85% regardé, OU à partir de 91%
    return (remaining <= 360 && percent >= 85) || percent >= 91
  }

  if (dur >= 2400) {
    // Épisode long / format 45-60 min (séries TV live style HBO / Netflix)
    // Fin d'épisode / générique à 3 min de la fin
    return (remaining <= 200 && percent >= 85) || percent >= 90
  }

  if (dur >= 1000) {
    // Épisode classique 20-30 min (animé / comédie)
    // Le générique de fin (ED + preview) dure ~90 à 120 secondes
    // Considéré vu dès qu'il reste <= 110s ET qu'on a vu plus de 80%, OU >= 88%
    return (remaining <= 110 && percent >= 80) || percent >= 88
  }

  // Format court (< 15-20 min)
  return (remaining <= 60 && percent >= 80) || percent >= 85
}

/**
 * 2. SAVE OR UPDATE WATCH PROGRESS (in Supabase watch_progress & track)
 */
export async function saveProgress(userId, contentId, season = 0, episode = 0, progressSeconds = 0, durationSeconds = 0) {
  if (!userId || !contentId || String(userId) === 'undefined') return null
  try {
    const seasonValue = Number.isFinite(Number(season)) ? Number(season) : 0
    const episodeValue = Number.isFinite(Number(episode)) ? Number(episode) : 0
    const isMovie = seasonValue === 0 && episodeValue === 0
    const isCompleted = isMediaCompleted(progressSeconds, durationSeconds, isMovie)

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
          season: seasonValue,
          episode: episodeValue,
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
          season: seasonValue,
          episode: episodeValue,
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
      season: seasonValue,
      episode: episodeValue,
      seconds: Math.round(progressSeconds),
      created_at: new Date().toISOString()
    }).then(() => {}).catch(() => {})

    // 3. A real playback just happened for this exact episode/movie: clear any
    // manual "déjà vu" mark on it, since it's now tracked by real progress.
    supabase.from('watched_manual')
      .delete()
      .eq('user_id', String(userId))
      .eq('content_id', String(contentId))
      .eq('season', seasonValue)
      .eq('episode', episodeValue)
      .then(() => {}).catch(() => {})

    return res?.data || null
  } catch (err) {
    console.warn('[WatchService] saveProgress error:', err)
    return null
  }
}

/**
 * 5. MANUAL "MARK AS WATCHED" SYSTEM (déjà vu)
 * Independent from watch_progress. Lets a user manually mark an episode, a
 * whole season (one row per episode) or a movie as already watched, without
 * actually playing it. Playing that exact episode/movie for real clears its
 * manual mark (see the delete in saveProgress above).
 */
export async function getManualWatched(userId, contentId) {
  if (!userId || !contentId || String(userId) === 'undefined') return []
  try {
    const { data, error } = await supabase
      .from('watched_manual')
      .select('season, episode')
      .eq('user_id', String(userId))
      .eq('content_id', String(contentId))

    if (error || !data) return []
    return data
  } catch (err) {
    console.warn('[WatchService] getManualWatched error:', err)
    return []
  }
}

export async function markWatchedManual(userId, contentId, season = 0, episode = 0) {
  if (!userId || !contentId || String(userId) === 'undefined') return false
  try {
    await supabase.from('watched_manual').upsert({
      user_id: String(userId),
      content_id: String(contentId),
      season: Number(season) || 0,
      episode: Number(episode) || 0
    }, { onConflict: 'user_id,content_id,season,episode' })
    return true
  } catch (err) {
    console.warn('[WatchService] markWatchedManual error:', err)
    return false
  }
}

export async function unmarkWatchedManual(userId, contentId, season = 0, episode = 0) {
  if (!userId || !contentId || String(userId) === 'undefined') return false
  try {
    await supabase
      .from('watched_manual')
      .delete()
      .eq('user_id', String(userId))
      .eq('content_id', String(contentId))
      .eq('season', Number(season) || 0)
      .eq('episode', Number(episode) || 0)
    return true
  } catch (err) {
    console.warn('[WatchService] unmarkWatchedManual error:', err)
    return false
  }
}

// Marks every given episode number of a season as watched in one go (one row per episode),
// so that watching a single episode afterwards only clears that episode's mark.
export async function markSeasonWatchedManual(userId, contentId, season, episodeNumbers = []) {
  if (!userId || !contentId || String(userId) === 'undefined' || episodeNumbers.length === 0) return false
  try {
    const rows = episodeNumbers.map(ep => ({
      user_id: String(userId),
      content_id: String(contentId),
      season: Number(season) || 0,
      episode: Number(ep)
    }))
    await supabase.from('watched_manual').upsert(rows, { onConflict: 'user_id,content_id,season,episode' })
    return true
  } catch (err) {
    console.warn('[WatchService] markSeasonWatchedManual error:', err)
    return false
  }
}

export async function unmarkSeasonWatchedManual(userId, contentId, season) {
  if (!userId || !contentId || String(userId) === 'undefined') return false
  try {
    await supabase
      .from('watched_manual')
      .delete()
      .eq('user_id', String(userId))
      .eq('content_id', String(contentId))
      .eq('season', Number(season) || 0)
    return true
  } catch (err) {
    console.warn('[WatchService] unmarkSeasonWatchedManual error:', err)
    return false
  }
}

/**
 * 3. GET USER WATCHLIST (Coupled Supabase watchlist + TMDB)
 */
export async function getUserWatchlistCoupled(userId) {
  if (!userId || String(userId) === 'undefined') return []
  try {
    const userIds = [String(userId)]
    if (String(userId).startsWith('google_')) {
      userIds.push(String(userId).replace('google_', ''))
    } else {
      userIds.push(`google_${userId}`)
    }

    const { data: list, error } = await supabase
      .from('watchlist')
      .select('*')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })

    if (error || !list || list.length === 0) return []

    const coupled = await Promise.all(
      list.map(async item => {
        try {
          const targetId = item.content_id
          let tmdbId = targetId
          let itemType = item.media_type || (item.season > 0 ? 'tv' : 'movie')

          // 1. If it's a Supabase content ID (UUID or string ID), lookup contents table
          if (typeof targetId === 'string' && !/^\d+$/.test(targetId)) {
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
    const userIds = [String(userId)]
    if (String(userId).startsWith('google_')) {
      userIds.push(String(userId).replace('google_', ''))
    } else {
      userIds.push(`google_${userId}`)
    }

    const { data: list } = await supabase
      .from('watchlist')
      .select('id, content_id, user_id')
      .in('user_id', userIds)

    const existing = (list || []).find(item => 
      String(item.content_id) === String(contentId)
    )

    if (existing && existing.id) {
      await supabase.from('watchlist').delete().eq('id', existing.id)
      return false
    } else {
      // Auto-generated UUID by postgres
      const { error: insErr } = await supabase.from('watchlist').insert({
        user_id: String(userId),
        content_id: String(contentId),
        created_at: new Date().toISOString()
      })

      if (insErr) {
        console.warn('[WatchService] Primary insert failed, trying alternative userId format:', insErr)
        const fallbackId = String(userId).startsWith('google_')
          ? String(userId).replace('google_', '')
          : `google_${userId}`

        await supabase.from('watchlist').insert({
          user_id: fallbackId,
          content_id: String(contentId),
          created_at: new Date().toISOString()
        })
      }
      return true
    }
  } catch (err) {
    console.warn('[WatchService] toggleWatchlist error:', err)
    return false
  }
}
