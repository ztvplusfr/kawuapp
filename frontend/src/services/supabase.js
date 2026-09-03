import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://lsynxnfgvrbnjcuhxehb.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzeW54bmZndnJibmpjdWh4ZWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzcwMDUsImV4cCI6MjEwMDkxMzAwNX0.IU5k2a5e1_xmYGLxc_yUlPvWfIMNaYgOrB6BiG9KLuk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

/**
 * 1. USER & AUTH HELPERS
 */
const ADMIN_EMAILS = [
  'enriixk.glss@gmail.com'
]

export async function syncUserProfile(user) {
  if (!user || (!user.id && !user.email)) return null
  try {
    const isEmailAdmin = ADMIN_EMAILS.includes((user.email || '').toLowerCase())

    // 1. Check if user already exists by email or id
    if (user.email) {
      const { data: existingByEmail } = await supabase
        .from('users')
        .select('*')
        .eq('email', user.email)
        .maybeSingle()

      if (existingByEmail) {
        const updatePayload = {
          name: user.name || existingByEmail.name,
          picture: user.picture || existingByEmail.picture,
          updated_at: new Date().toISOString()
        }
        if (isEmailAdmin && existingByEmail.role !== 'admin') {
          updatePayload.role = 'admin'
        }

        const { data: updated } = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', existingByEmail.id)
          .select()
          .maybeSingle()

        return updated || existingByEmail
      }
    }

    // 2. Otherwise insert new user
    const insertPayload = {
      id: String(user.id),
      email: user.email,
      name: user.name,
      picture: user.picture,
      updated_at: new Date().toISOString()
    }
    if (isEmailAdmin) {
      insertPayload.role = 'admin'
    }

    const { data, error } = await supabase
      .from('users')
      .upsert(insertPayload)
      .select()
      .maybeSingle()

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
    if (userId) {
      const userIds = [String(userId)]
      if (String(userId).startsWith('google_')) {
        userIds.push(String(userId).replace('google_', ''))
      } else {
        userIds.push(`google_${userId}`)
      }
      query = query.in('user_id', userIds)
    }
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
    const { data, error } = await supabase
      .from('watchlist')
      .insert({
        user_id: String(userId),
        content_id: String(mediaItem.id || mediaItem.supabaseContentId),
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

export async function removeFromWatchlist(userId, contentId) {
  try {
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .match({ user_id: userId, content_id: String(contentId) })

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
    const durationSeconds = Math.round(duration || 0)
    const progressSeconds = Math.round(currentTime || 0)
    const { data, error } = await supabase
      .from('watch_progress')
      .upsert({
        user_id: userId,
        content_id: String(mediaItem.id),
        season: seasonNum || 0,
        episode: episodeNum || 0,
        progress_seconds: progressSeconds,
        duration_seconds: durationSeconds,
        completed: durationSeconds > 0 && progressSeconds >= durationSeconds * 0.9,
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
    let query = supabase.from('history').select('*').order('watched_at', { ascending: false })
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

export async function getVideosForMedia(contentId) {
  try {
    const { data, error } = await supabase.from('videos').select('*').eq('content_id', String(contentId))
    if (error) throw error
    return data || []
  } catch (err) {
    console.warn('[Supabase] getVideosForMedia error:', err)
    return []
  }
}
