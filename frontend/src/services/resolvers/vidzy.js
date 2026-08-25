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

    // 3. Extraction du snippet de sources chiffré
    // Match pattern: sources: [{src: (function(s){...})("BASE64_PAYLOAD"), type: "application/x-mpegURL"}]
    const sourceMatch = html.match(/sources:\s*\[\{\s*src:\s*\(function\(s\)\{[\s\S]*?\}\)\("([^"]+)"\)/)
    if (!sourceMatch || !sourceMatch[1]) {
      console.warn('[Vidzy Resolver] Aucun flux chiffré trouvé dans le HTML')
      return null
    }

    const encodedPayload = sourceMatch[1]

    // 4. Décodage du flux HLS master (.m3u8)
    let streamUrl = decodeVidzySource(encodedPayload, hostname)

    // Si le premier essai avec le hostname échoue, essayer avec vidzy.live puis vidzy.org
    if (!streamUrl && hostname !== 'vidzy.live') {
      streamUrl = decodeVidzySource(encodedPayload, 'vidzy.live')
    }
    if (!streamUrl && hostname !== 'vidzy.org') {
      streamUrl = decodeVidzySource(encodedPayload, 'vidzy.org')
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

    return {
      streamUrl,
      isHls: true,
      title,
      poster,
      subtitles: [],
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
