/**
 * Resolver Uqload (.is, .to, .cc, .com, .vc)
 * Extrait et déchiffre les flux vidéo HLS/MP4 à partir des embeds Uqload
 */

export function unpackDeanEdwards(code) {
  if (!code || typeof code !== 'string') return null
  const evalMatch = code.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\(['\x27"]\|['\x27"]\)\)\)/)
  if (!evalMatch) return null

  try {
    const script = evalMatch[0]
    const evalFunc = new Function('return ' + script.substring(4))
    return evalFunc()
  } catch (err) {
    console.warn('[DeanEdwards Unpacker Error]:', err)
    return null
  }
}

/**
 * Résout une source Uqload à partir d'une URL d'embed ou d'un ID de fichier
 * Exemples :
 * - https://uqload.is/embed-rqbf6nyb7l7b.html
 * - https://uqload.to/rqbf6nyb7l7b.html
 * - rqbf6nyb7l7b
 */
export async function resolveUqload(urlOrId) {
  try {
    let rawInput = String(urlOrId || '').trim()
    if (!rawInput) return null

    let targetUrl = rawInput
    if (rawInput.startsWith('http://') || rawInput.startsWith('https://')) {
      targetUrl = rawInput
    } else {
      const cleanId = rawInput.replace('embed-', '').replace('.html', '')
      targetUrl = `https://uqload.is/embed-${cleanId}.html`
    }

    let html = null

    // 1. Essayer le binding natif Go de Wails (Bypass CORS & anti-embed restrictions)
    if (typeof window !== 'undefined' && window.go?.main?.App?.FetchUqloadSource) {
      try {
        html = await window.go.main.App.FetchUqloadSource(targetUrl)
      } catch (goErr) {
        console.warn('[Uqload Go Fetch Warning]:', goErr)
      }
    }

    // 2. Fallback fetch HTTP Web standard sans Referer (impératif pour Uqload)
    if (!html) {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      if (response.ok) {
        html = await response.text()
      }
    }

    if (!html) return null

    // 3. Essayer le dépaquetage Dean Edwards JS
    let streamUrl = null
    let poster = ''
    const unpacked = unpackDeanEdwards(html)

    if (unpacked) {
      const fileMatch = unpacked.match(/sources:\[\{file:\"([^\"]+)\"/) || unpacked.match(/file:\s*["']([^"']+)["']/)
      if (fileMatch && fileMatch[1]) {
        streamUrl = fileMatch[1]
      }
      const imageMatch = unpacked.match(/image:\s*["']([^"']+)["']/)
      if (imageMatch && imageMatch[1]) {
        poster = imageMatch[1]
      }
    }

    // 4. Fallback extraction directe dans le HTML
    if (!streamUrl) {
      const directMatch = html.match(/sources:\s*\[\{\s*file:\s*["']([^"']+)["']/) || html.match(/file:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/)
      if (directMatch && directMatch[1]) {
        streamUrl = directMatch[1]
      }
    }

    if (!streamUrl) {
      console.warn('[Uqload Resolver] Aucun flux vidéo trouvé dans l\'embed')
      return null
    }

    const isHls = streamUrl.includes('.m3u8')

    return {
      streamUrl,
      isHls,
      poster,
      subtitles: [],
      audioTracks: [],
      raw: {
        embedUrl: targetUrl
      }
    }
  } catch (err) {
    console.error('[Uqload Resolver Error]:', err)
    return null
  }
}
