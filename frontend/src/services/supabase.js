import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://lsynxnfgvrbnjcuhxehb.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzeW54bmZndnJibmpjdWh4ZWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzcwMDUsImV4cCI6MjEwMDkxMzAwNX0.IU5k2a5e1_xmYGLxc_yUlPvWfIMNaYgOrB6BiG9KLuk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * 1. USER & AUTH HELPERS
 */
export async function syncUserProfile(user) {
  if (!user || !user.id) return null
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert({
        id: String(user.id),
        email: user.email,
        name: user.name,
        picture: user.picture,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.warn('[Supabase] syncUserProfile error:', err)
    return null
  }
}

/**
 * 2. WATCHLIST (Ma Liste)
 */
export async function getWatchlist(userId) {
  try {
    let query = supabase.from('watchlist').select('*').order('created_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Supabase] getWatchlist error:', err)
    return []
  }
}

export async function addToWatchlist(userId, mediaItem) {
  try {
    const generatedId = `w_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const { data, error } = await supabase
      .from('watchlist')
      .upsert({
        id: generatedId,
        user_id: userId,
        content_id: String(mediaItem.id),
        created_at: new Date().toISOString()
      })
      .select()
      .maybeSingle()

    if (error) throw error
    return data
  } catch (err) {
    console.warn('[Supabase] addToWatchlist error:', err)
    return null
  }
}

export async function removeFromWatchlist(userId, mediaId) {
  try {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .match({ user_id: userId, media_id: String(mediaId) })

    if (error) throw error
    return true
  } catch (err) {
    console.warn('[Supabase] removeFromWatchlist error:', err)
    return false
  }
}

/**
 * 3. WATCH PROGRESS & HISTORY (Reprendre la lecture & Historique)
 */
export async function getWatchProgress(userId) {
  try {
    let query = supabase.from('watch_progress').select('*').order('updated_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Supabase] getWatchProgress error:', err)
    return []
  }
}

export async function saveWatchProgress(userId, mediaItem, progressPercent, currentTime, duration, seasonNum = null, episodeNum = null) {
  try {
    const { data, error } = await supabase
      .from('watch_progress')
      .upsert({
        user_id: userId,
        media_id: String(mediaItem.id),
        media_type: mediaItem.tmdbType || mediaItem.type || 'movie',
        title: mediaItem.title,
        poster: mediaItem.poster || mediaItem.bgImg,
        progress: Math.round(progressPercent),
        current_time: currentTime,
        duration: duration,
        season_number: seasonNum,
        episode_number: episodeNum,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error
    return data
  } catch (err) {
    console.warn('[Supabase] saveWatchProgress error:', err)
    return null
  }
}

export async function getHistory(userId) {
  try {
    let query = supabase.from('history').select('*').order('viewed_at', { ascending: false })
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Supabase] getHistory error:', err)
    return []
  }
}

/**
 * 4. CONTENTS & VIDEOS (Catalogue & Liens flux)
 */
export async function getCustomContents() {
  try {
    const { data, error } = await supabase.from('contents').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Supabase] getCustomContents error:', err)
    return []
  }
}

export async function getVideosForMedia(mediaId) {
  try {
    const { data, error } = await supabase.from('videos').select('*').eq('media_id', String(mediaId))
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Supabase] getVideosForMedia error:', err)
    return []
  }
}
