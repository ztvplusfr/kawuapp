/**
 * Resolver Ansembed (.net, .com)
 * Extrait les flux vidéo HLS master (.m3u8) à partir des embeds Ansembed
 */

/**
 * Résout une source Ansembed à partir d'une URL d'embed ou d'un ID de fichier
 * Exemples :
 * - https://ansembed.net/embed-tu2j74nxdvr1.html
 * - tu2j74nxdvr1
 */
export async function resolveAnsembed(urlOrId) {
  try {
    let rawInput = String(urlOrId || '').trim()
    if (!rawInput) return null

    let targetUrl = rawInput
    if (rawInput.startsWith('http://') || rawInput.startsWith('https://')) {
      targetUrl = rawInput
    } else {
      const cleanId = rawInput.replace('embed-', '').replace('.html', '')
      targetUrl = `https://ansembed.net/embed-${cleanId}.html`
    }

    let html = null

    // 1. Essayer le binding natif Go de Wails (Bypass CORS)
    if (typeof window !== 'undefined' && window.go?.main?.App?.FetchAnsembedSource) {
      try {
        html = await window.go.main.App.FetchAnsembedSource(targetUrl)
      } catch (goErr) {
        console.warn('[Ansembed Go Fetch Warning]:', goErr)
      }
    }

    // 2. Fallback fetch HTTP Web standard
    if (!html) {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://ansembed.net/'
        }
      })
      if (response.ok) {
        html = await response.text()
      }
    }

    if (!html) return null

    // 3. Extraction du lien HLS master dans sources: [{ file: 'https://...' }]
    let streamUrl = null
    const sourceMatch = html.match(/sources:\s*\[\{\s*file:\s*['"]([^'"]+)['"]/) || html.match(/file:\s*['"]([^'"]+\.(?:m3u8|mp4)[^'']*)['"]/)

    if (sourceMatch && sourceMatch[1]) {
      streamUrl = sourceMatch[1]
    }

    if (!streamUrl) {
      console.warn('[Ansembed Resolver] Aucun flux vidéo trouvé dans l\'embed')
      return null
    }

    // 4. Extraction optionnelle de l'affiche/poster
    let poster = ''
    const posterMatch = html.match(/url=([^&"'\s]+\.(?:jpg|png|jpeg))/)
    if (posterMatch && posterMatch[1]) {
      try {
        poster = decodeURIComponent(posterMatch[1])
      } catch (e) {
        poster = posterMatch[1]
      }
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
    console.error('[Ansembed Resolver Error]:', err)
    return null
  }
}
