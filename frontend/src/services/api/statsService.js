import { supabase } from '../supabase'

// A "session" is a contiguous run of `track` ticks (recorded every ~10s of actual
// playback) for the same content/season/episode. If two ticks for the same title
// are more than 20 minutes apart, they belong to two separate watching sessions.
const SESSION_GAP_MS = 20 * 60 * 1000

function groupIntoSessions(trackRows) {
  const sessions = []
  let current = null

  trackRows.forEach(row => {
    const groupKey = `${row.content_id}_S${row.season}_E${row.episode}`
    const gapOk = current && current.groupKey === groupKey &&
      (new Date(row.created_at) - new Date(current.lastCreatedAt)) <= SESSION_GAP_MS

    if (gapOk) {
      current.count += 1
      current.lastCreatedAt = row.created_at
    } else {
      if (current) sessions.push(current)
      current = {
        groupKey,
        contentId: row.content_id,
        season: Number(row.season) || 0,
        episode: Number(row.episode) || 0,
        count: 1,
        startedAt: row.created_at,
        lastCreatedAt: row.created_at
      }
    }
  })
  if (current) sessions.push(current)
  return sessions
}

function formatMonthKey(dateStr) {
  return (dateStr || '').slice(0, 7)
}

/**
 * Computes real usage statistics for a user from the existing `track` (playback
 * ticks) and `watch_progress` (completion) tables — no separate session
 * instrumentation needed, it's derived from data already recorded during playback.
 */
export async function getUserStats(userId) {
  if (!userId) return null
  try {
    const uid = String(userId)
    const [{ data: trackRows }, { data: progressRows }, { data: contentRows }] = await Promise.all([
      supabase.from('track').select('*').eq('user_id', uid).order('created_at', { ascending: true }),
      supabase.from('watch_progress').select('*').eq('user_id', uid),
      supabase.from('contents').select('id, title, poster_url, type, year')
    ])

    const contentMap = new Map((contentRows || []).map(c => [String(c.id), c]))
    const progressMap = new Map(
      (progressRows || []).map(p => [`${p.content_id}_S${p.season}_E${p.episode}`, p])
    )

    const rawSessions = groupIntoSessions(trackRows || [])

    const sessions = rawSessions.map(s => {
      const content = contentMap.get(String(s.contentId))
      const progress = progressMap.get(s.groupKey)
      const mediaType = s.season > 0 ? 'tv' : 'movie'
      return {
        contentId: s.contentId,
        title: content?.title || 'Titre inconnu',
        poster: content?.poster_url || '',
        mediaType,
        season: s.season,
        episode: s.episode,
        durationSeconds: s.count * 10,
        startedAt: s.startedAt,
        completed: !!progress?.completed,
        groupKey: s.groupKey
      }
    })

    const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0)
    const movieSessions = sessions.filter(s => s.mediaType === 'movie')
    const tvSessions = sessions.filter(s => s.mediaType === 'tv')

    // Consistent with episodesWatched: count anything with at least one session,
    // whether or not it was watched all the way to completion.
    const moviesWatched = new Set(movieSessions.map(s => s.contentId)).size
    const episodesWatched = new Set(tvSessions.map(s => s.groupKey)).size

    const avgSessionSeconds = sessions.length > 0 ? Math.round(totalSeconds / sessions.length) : 0
    const completedCount = sessions.filter(s => s.completed).length
    const completionRate = sessions.length > 0 ? Math.round((completedCount / sessions.length) * 100) : 0

    // Streak: consecutive days (counting back from today) with at least one session
    const daysWithActivity = new Set(sessions.map(s => new Date(s.startedAt).toISOString().slice(0, 10)))
    let streak = 0
    const cursor = new Date()
    while (daysWithActivity.has(cursor.toISOString().slice(0, 10))) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
    }

    const filmsPct = sessions.length > 0 ? Math.round((movieSessions.length / sessions.length) * 100) : 0
    const seriesPct = sessions.length > 0 ? 100 - filmsPct : 0

    // Top 3 most-watched series by cumulative watch time
    const seriesTotals = new Map()
    tvSessions.forEach(s => {
      const entry = seriesTotals.get(s.contentId) || {
        contentId: s.contentId,
        title: s.title,
        poster: s.poster,
        totalSeconds: 0,
        episodeKeys: new Set()
      }
      entry.totalSeconds += s.durationSeconds
      entry.episodeKeys.add(s.groupKey)
      seriesTotals.set(s.contentId, entry)
    })
    const topSeries = Array.from(seriesTotals.values())
      .map(e => ({ ...e, episodeCount: e.episodeKeys.size }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .slice(0, 3)

    // This month
    const monthKey = formatMonthKey(new Date().toISOString())
    const monthSessions = sessions.filter(s => formatMonthKey(s.startedAt) === monthKey)
    const monthMovies = new Set(monthSessions.filter(s => s.mediaType === 'movie').map(s => s.contentId)).size
    const monthEpisodes = new Set(monthSessions.filter(s => s.mediaType === 'tv').map(s => s.groupKey)).size

    const history = [...sessions].sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))

    return {
      totalSeconds,
      moviesWatched,
      episodesWatched,
      avgSessionSeconds,
      completionRate,
      streak,
      filmsPct,
      seriesPct,
      topSeries,
      monthMovies,
      monthEpisodes,
      history
    }
  } catch (err) {
    console.error('[StatsService] getUserStats error:', err)
    return null
  }
}
