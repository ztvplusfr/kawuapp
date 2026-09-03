/**
 * Resolver Vidara (vidara.to, vidara.so, mountainpages.cc)
 * Extrait le flux HLS (.m3u8) et les sous-titres à partir des liens d'embed Vidara
 */

/**
 * Extrait le filecode Vidara depuis une URL ou un code brut
 * Exemples supportés :
 * - https://vidara.to/e/GYpEYefBZTUW
 * - https://vidara.so/e/GYpEYefBZTUW
 * - https://vidara.to/embed-GYpEYefBZTUW.html
 * - https://mountainpages.cc/e/GYpEYefBZTUW
 * - GYpEYefBZTUW
 */
export function extractVidaraFilecode(urlOrCode) {
  if (!urlOrCode || typeof urlOrCode !== 'string') return null
  const clean = urlOrCode.trim()

  // Si c'est déjà un code simple sans slash (ex: GYpEYefBZTUW)
  if (/^[A-Za-z0-9_-]+$/.test(clean) && !clean.includes('.') && !clean.includes('/')) {
    return clean
  }

  try {
    const url = new URL(clean.startsWith('http') ? clean : `https://${clean}`)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length > 0) {
      let last = parts[parts.length - 1]
      last = last.replace('embed-', '').replace('.html', '')
      return last
    }
  } catch (e) {
    const match = clean.match(/(?:e\/|embed-|\/)([A-Za-z0-9_-]+)(?:\.html)?$/)
    if (match && match[1]) return match[1]
  }

  return clean
}

/**
 * Résout une source Vidara vers une URL de streaming directe (.m3u8)
 */
export async function resolveVidara(urlOrCode) {
  try {
    const rawInput = String(urlOrCode || '').trim()
    if (!rawInput) return null

    const filecode = extractVidaraFilecode(rawInput)
    if (!filecode) {
      console.warn('[Vidara Resolver] Impossible d\'extraire le filecode de:', urlOrCode)
      return null
    }

    // Déterminer l'hôte d'origine
    let baseOrigin = 'https://vidara.to'
    if (rawInput.includes('vidara.so')) baseOrigin = 'https://vidara.so'
    else if (rawInput.includes('mountainpages.cc')) baseOrigin = 'https://mountainpages.cc'

    const apiURL = `${baseOrigin}/api/stream`
    let data = null

    // 1. Essayer le binding natif Go Wails (Bypass total CORS)
    if (typeof window !== 'undefined' && window.go?.main?.App?.FetchVidaraStream) {
      try {
        const rawJson = await window.go.main.App.FetchVidaraStream(apiURL, filecode)
        if (rawJson) {
          data = JSON.parse(rawJson)
        }
      } catch (goErr) {
        console.warn('[Vidara Go Fetch Warning]:', goErr)
      }
    }

    // 2. Fallback fetch HTTP standard
    if (!data) {
      const response = await fetch(apiURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Referer': `${baseOrigin}/e/${filecode}`,
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({ filecode, device: 'web' })
      })

      if (response.ok) {
        data = await response.json()
      }
    }

    if (!data || !data.streaming_url) {
      console.warn('[Vidara Resolver] Réponse API invalide ou flux manquant:', data)
      return null
    }

    // 3. Formater les sous-titres s'ils existent
    const formattedSubtitles = []
    if (Array.isArray(data.subtitles)) {
      const defaultLang = (data.default_sub_lang || '').toLowerCase()
      data.subtitles.forEach((s) => {
        if (s.file_path) {
          const lang = s.language || 'Sous-titre'
          formattedSubtitles.push({
            lang: lang.toLowerCase(),
            label: lang,
            url: s.file_path,
            default: defaultLang ? lang.toLowerCase().includes(defaultLang) : false
          })
        }
      })
    }

    return {
      streamUrl: data.streaming_url,
      isHls: true,
      title: data.title || '',
      poster: data.thumbnail || '',
      subtitles: formattedSubtitles,
      audioTracks: [],
      raw: {
        filecode,
        apiURL,
        ...data
      }
    }
  } catch (err) {
    console.error('[Vidara Resolver Error]:', err)
    return null
  }
}
