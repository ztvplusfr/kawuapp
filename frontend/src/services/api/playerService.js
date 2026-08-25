import { supabase } from '../supabase'
import { FetchAnsembedSource, FetchWebPageHTML } from '../../../wailsjs/go/main/App'

/**
 * 1. GET VIDEO STREAM SOURCES FOR A MEDIA
 */
export async function getVideoStreams(contentId, season = 1, episode = 1) {
  if (!contentId) return []
  try {
    let query = supabase
      .from('videos')
      .select('*')
      .eq('content_id', String(contentId))

    if (season) query = query.eq('season', Number(season))
    if (episode) query = query.eq('episode', Number(episode))

    const { data: videos, error } = await query

    if (error) throw error
    return videos || []
  } catch (err) {
    console.warn('[PlayerService] getVideoStreams error:', err)
    return []
  }
}

/**
 * 2. RECORD VIEW IN HISTORY TABLE
 */
export async function recordHistoryView(userId, contentId, season = 0, episode = 0) {
  if (!userId || !contentId) return null
  try {
    const { data, error } = await supabase
      .from('history')
      .upsert({
        user_id: String(userId),
        content_id: String(contentId),
        season: Number(season) || 0,
        episode: Number(episode) || 0,
        watched_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id, content_id' })
      .select()
      .maybeSingle()

    if (error) {
      // Fallback simple insert if onConflict target is different
      const { data: fallbackData } = await supabase
        .from('history')
        .insert({
          user_id: String(userId),
          content_id: String(contentId),
          season: Number(season) || 0,
          episode: Number(episode) || 0,
          watched_at: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
      return fallbackData
    }
    return data
  } catch (err) {
    console.warn('[PlayerService] recordHistoryView error:', err)
    return null
  }
}
/**
 * 3. RESOLVE HIGH-QUALITY DIRECT STREAMS (.m3u8 / .mp4) FOR ALL EMBED HOSTERS
 */
export async function resolveHlsStreamUrl(url) {
  if (!url || typeof url !== 'string') return url

  // 1. Ansembed & Vidmoly (1080p Full HD HLS Extraction)
  if (url.includes('ansembed') || url.includes('vidmoly')) {
    try {
      let html = ''
      try {
        html = await FetchAnsembedSource(url)
      } catch (e) {
        if (window.go?.main?.App?.FetchWebPageHTML) {
          html = await window.go.main.App.FetchWebPageHTML(url)
        } else {
          const res = await fetch(url)
          html = await res.text()
        }
      }

      const fileMatch = html.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*['"]([^'"]+)['"]/i) ||
                        html.match(/file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i)

      if (fileMatch && fileMatch[1]) {
        const masterM3u8Url = fileMatch[1].replace(/\\/g, '')
        console.log('[Ansembed Resolver] Master HLS found via Go backend:', masterM3u8Url)

        try {
          let m3u8Content = ''
          try {
            m3u8Content = await FetchWebPageHTML(masterM3u8Url)
          } catch (e) {
            const mRes = await fetch(masterM3u8Url)
            m3u8Content = await mRes.text()
          }

          const lines = m3u8Content.split(/\r?\n/)
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim()
            if (line.includes('RESOLUTION=1920x1080') || line.includes('1080')) {
              for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j].trim()
                if (nextLine && !nextLine.startsWith('#')) {
                  const absoluteUrl = nextLine.startsWith('http')
                    ? nextLine
                    : new URL(nextLine, masterM3u8Url).href

                  console.log('[Ansembed Resolver] FORCING 1080p FULL HD STREAM:', absoluteUrl)
                  return absoluteUrl
                }
              }
            }
          }
        } catch (e) {
          console.warn('[Ansembed Resolver] Error parsing master.m3u8:', e)
        }

        return masterM3u8Url
      }
    } catch (err) {
      console.warn('[Ansembed Resolver] Failed to resolve embed:', err)
    }
  }

  // 2. Sibnet Direct MP4 Stream Extraction
  if (url.includes('sibnet.ru')) {
    try {
      let html = ''
      if (window.go?.main?.App?.FetchWebPageHTML) {
        html = await window.go.main.App.FetchWebPageHTML(url)
      } else {
        const res = await fetch(url)
        html = await res.text()
      }

      const match = html.match(/player\.src\(\[\s*\{\s*src\s*:\s*['"]([^'"]+)['"]/i) ||
                    html.match(/src\s*:\s*['"](\/v\/[^'"]+\.mp4)['"]/i)

      if (match && match[1]) {
        let mp4Path = match[1]
        if (mp4Path.startsWith('/')) {
          mp4Path = 'https://video.sibnet.ru' + mp4Path
        }
        console.log('[Sibnet Resolver] Direct MP4 Stream:', mp4Path)
        return mp4Path
      }
    } catch (err) {
      console.warn('[Sibnet Resolver] Error:', err)
    }
  }

  // 3. Sendvid Direct MP4 Stream Extraction
  if (url.includes('sendvid.com')) {
    try {
      let html = ''
      if (window.go?.main?.App?.FetchWebPageHTML) {
        html = await window.go.main.App.FetchWebPageHTML(url)
      } else {
        const res = await fetch(url)
        html = await res.text()
      }

      const match = html.match(/var\s+video_source\s*=\s*['"]([^'"]+)['"]/i) ||
                    html.match(/<source\s+src=['"]([^'"]+)['"]/i)

      if (match && match[1]) {
        console.log('[Sendvid Resolver] Direct MP4 Stream:', match[1])
        return match[1]
      }
    } catch (err) {
      console.warn('[Sendvid Resolver] Error:', err)
    }
  }

  // 4. Uqload Direct Stream Extraction
  if (url.includes('uqload')) {
    try {
      let html = ''
      if (window.go?.main?.App?.FetchWebPageHTML) {
        html = await window.go.main.App.FetchWebPageHTML(url)
      } else {
        const res = await fetch(url)
        html = await res.text()
      }

      const match = html.match(/sources\s*:\s*\[\s*['"]([^'"]+)['"]/i)
      if (match && match[1]) {
        console.log('[Uqload Resolver] Direct MP4 Stream:', match[1])
        return match[1]
      }
    } catch (err) {
      console.warn('[Uqload Resolver] Error:', err)
    }
  }

  // 5. Vidzy Direct Stream Extraction
  if (url.includes('vidzy')) {
    try {
      let html = ''
      if (window.go?.main?.App?.FetchWebPageHTML) {
        html = await window.go.main.App.FetchWebPageHTML(url)
      } else {
        const res = await fetch(url)
        html = await res.text()
      }

      const match = html.match(/file\s*:\s*['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i)
      if (match && match[1]) {
        console.log('[Vidzy Resolver] Direct HLS Stream:', match[1])
        return match[1]
      }
    } catch (err) {
      console.warn('[Vidzy Resolver] Error:', err)
    }
  }

  return url
}
