/**
 * Resolver Vidzy Live / Vidzy Org
 * Extrait et déchiffre l'URL master HLS (.m3u8) à partir des embeds Vidzy
 */

/**
 * Décode la chaîne de caractères chiffrée en base64 de Vidzy
 * Algorithme : Base64 -> Reverse -> XOR bitwise avec clé dynamique basée sur le hostname
 */
export function decodeVidzySource(encodedStr, hostname = 'vidzy.live') {
  if (!encodedStr || typeof encodedStr !== 'string') return null

  try {
    let H = 0
    for (let j = 0; j < hostname.length; j++) {
      H = (H + hostname.charCodeAt(j)) & 255
    }

    // Base64 decode
    let binaryStr = ''
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      binaryStr = window.atob(encodedStr)
    } else {
      binaryStr = Buffer.from(encodedStr, 'base64').toString('binary')
    }

    // Reverse
    const reversed = binaryStr.split('').reverse().join('')

    // Bitwise XOR decode
    let result = ''
    for (let i = 0; i < reversed.length; i++) {
      const kk = (0x3d + i * 89 + H) & 255
      result += String.fromCharCode(reversed.charCodeAt(i) ^ kk)
    }

    if (/^https?:/.test(result)) {
      return result
    }
  } catch (err) {
    console.warn('[Vidzy Decoder Error]:', err)
  }

  return null
}

/**
 * Résout une source Vidzy à partir d'une URL d'embed ou d'un ID de fichier
 * Exemples supportés :
 * - https://vidzy.live/embed-nwunmfufj34i.html?autoplay=1
 * - https://vidzy.org/embed-nwunmfufj34i.html
 * - nwunmfufj34i
 */
export async function resolveVidzy(urlOrId) {
  try {
    let rawInput = String(urlOrId || '').trim()
    if (!rawInput) return null

    // Extraire le hostname et l'URL cible
    let targetUrl = rawInput
    let hostname = 'vidzy.live'

    if (rawInput.startsWith('http://') || rawInput.startsWith('https://')) {
      try {
        const parsedUrl = new URL(rawInput)
        hostname = parsedUrl.hostname || 'vidzy.live'
        targetUrl = rawInput
      } catch (e) {}
    } else {
      // Si c'est juste un ID (ex: nwunmfufj34i ou embed-nwunmfufj34i)
      const cleanId = rawInput.replace('embed-', '').replace('.html', '')
      targetUrl = `https://vidzy.live/embed-${cleanId}.html`
      hostname = 'vidzy.live'
    }

    let html = null

    // 1. Essayer le binding natif Go de Wails (Bypass CORS & Cloudflare)
    if (typeof window !== 'undefined' && window.go?.main?.App?.FetchVidzySource) {
      try {
        html = await window.go.main.App.FetchVidzySource(targetUrl)
      } catch (goErr) {
        console.warn('[Vidzy Go Fetch Warning]:', goErr)
      }
    }

    // 2. Fallback fetch HTTP Web standard
    if (!html) {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': `https://${hostname}/`
        }
      })
      if (response.ok) {
        html = await response.text()
      }
    }

    if (!html) return null

    // 2b. Si c'est un wrapper ou une page de série (ex: https://vidzy.org/serie/230050/1/11) contenant un iframe
    const iframeMatch = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']*vidzy\.[^"']+)["']/i)
    if (iframeMatch && iframeMatch[1]) {
      const nestedUrl = iframeMatch[1]
      try {
        const nestedParsed = new URL(nestedUrl)
        hostname = nestedParsed.hostname || hostname
        targetUrl = nestedUrl

        let nestedHtml = null
        if (typeof window !== 'undefined' && window.go?.main?.App?.FetchVidzySource) {
          try {
            nestedHtml = await window.go.main.App.FetchVidzySource(targetUrl)
          } catch (e) {}
        }
        if (!nestedHtml) {
          const res2 = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': `https://${hostname}/`
            }
          })
          if (res2.ok) nestedHtml = await res2.text()
        }
        if (nestedHtml) {
          html = nestedHtml
        }
      } catch (e) {
        console.warn('[Vidzy Resolver] Erreur suivi iframe imbriqué:', e)
      }
    }

    // 3. Extraction du snippet de sources chiffré
    const sourceMatch = html.match(/sources:\s*\[\{\s*src:\s*\(function\(s\)\{[\s\S]*?\}\)\("([^"]+)"\)/)
    if (!sourceMatch || !sourceMatch[1]) {
      console.warn('[Vidzy Resolver] Aucun flux chiffré trouvé dans le HTML')
      return null
    }

    const encodedPayload = sourceMatch[1]

    // 4. Décodage du flux HLS master (.m3u8) en testant tous les hostnames Vidzy possibles
    const candidateHosts = [hostname, 'vidzy.cc', 'vidzy.org', 'vidzy.live', 'vidzy.online', 'vidzy.pro', 'vidzy.to']
    let streamUrl = null
    for (const h of candidateHosts) {
      const decoded = decodeVidzySource(encodedPayload, h)
      if (decoded && /^https?:/.test(decoded)) {
        streamUrl = decoded
        break
      }
    }

    if (!streamUrl) {
      console.warn('[Vidzy Resolver] Échec du déchiffrement du lien HLS')
      return null
    }

    // 5. Extraction des métadonnées optionnelles (titre, poster, sous-titres)
    let title = ''
    const titleMatch = html.match(/title:\s*["']([^"']+)["']/)
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1]
    }

    let poster = ''
    const posterMatch = html.match(/metaThumbnail:\s*["']([^"']+)["']/) || html.match(/player\.poster\(['"]([^'"]+)['"]\)/)
    if (posterMatch && posterMatch[1]) {
      poster = posterMatch[1]
    }

    // Helper pour convertir les URLs srtproxy en URLs directes CDN
    function convertVidzySrtProxy(proxyUrl) {
      if (!proxyUrl) return proxyUrl
      try {
        const urlObj = new URL(proxyUrl)
        const dx = urlObj.searchParams.get('dx')
        const srv = urlObj.searchParams.get('srv')
        const disk = urlObj.searchParams.get('disk')
        const filename = urlObj.pathname.split('/').pop()
        if (dx && srv && disk && filename) {
          return `https://${srv}.vidzy.live/vtt/${disk}/${dx}/${filename}`
        }
      } catch (e) {}
      return proxyUrl
    }

    // Extraction des sous-titres si disponibles
    const subtitles = []
    const subMatches = html.matchAll(/kind:\s*['"]subtitles['"][^}]*?srclang:\s*['"]([^'"]+)['"][^}]*?label:\s*['"]([^'"]+)['"][^}]*?['"](https?:\/\/[^'"]+(?:\.vtt|srtproxy)[^'"]*)['"]/gi)
    for (const match of subMatches) {
      const rawLang = match[1] || 'fr'
      const rawLabel = match[2] || 'Français'
      const rawUrl = convertVidzySrtProxy(match[3])

      subtitles.push({
        label: rawLabel === 'French' ? 'Français' : rawLabel,
        language: rawLang.startsWith('fr') ? 'fr' : rawLang,
        lang: rawLang.startsWith('fr') ? 'fr' : rawLang,
        url: rawUrl,
        src: rawUrl,
        default: true
      })
    }

    // Fallback pattern : direct srtproxy / vtt link dans le script
    if (subtitles.length === 0) {
      const vttMatch = html.match(/['"](https?:\/\/[^'"]*(?:srtproxy|\.vtt)[^'"]*)['"]/)
      if (vttMatch && vttMatch[1]) {
        const directUrl = convertVidzySrtProxy(vttMatch[1])
        subtitles.push({
          label: 'Français',
          language: 'fr',
          lang: 'fr',
          url: directUrl,
          src: directUrl,
          default: true
        })
      }
    }

    return {
      streamUrl,
      isHls: true,
      title,
      poster,
      subtitles,
      audioTracks: [],
      raw: {
        embedUrl: targetUrl,
        hostname
      }
    }
  } catch (err) {
    console.error('[Vidzy Resolver Error]:', err)
    return null
  }
}
