const NAKASTREAM_BASE_URL = 'https://nakastream.tv'

// Clés d'authentification et cookies Cloudflare par défaut pour Nakastream
export const NAKASTREAM_CONFIG = {
  authHeader: 'Bearer oat_MTE3ODQxMQ.Vk5lM1hlNTUxeUx1dzVhS1hsV193dnFnd2FkMmpPODE5M25GeUY4NzI0NjIxODg5ODA',
  profileId: '22236',
  cookie: 'cf_clearance=atVmPWzGmPbjY3a_MkSPfZgD5lNyyqLLc13.OoS7vUI-1785783785-1.2.1.1-7lBqBVGwYFCv5QbkTHgXLfhEJM_dQdlHMswtfasDBHvfB4x53EBAGIdKdsu7k0QKGrJaign9Xvv3GyBVst9GNE0OplnzvDgFKwupNow.ft_kCnGUr66DxanHjcSAxHoHCyuRlCUkjoWwKh4E8ZmcD8KHlAecms2fDxxkQSn6koy2BEY3VFvRn.7DMiUrzaUzox_z7Q3PDR3OPtUYeULkK3JqZowHrjj62XPP9.wZg_uOMt054thPcImohnUZUaLrXaE6ud1DL4J26lgIqU6RoJznvL87.a.e483nP3E8kHNxwHD0DNuriu9hDc7tvjLnPT4jQHEeyHB7IU13TwMqbr1dGxJ1QsKcQGriVmo8gRw; cf_clearance=oFLmB0ZcPAAD4hAU5CXALC9pa1F._e9HbmEksDe3VSE-1787556197-1.2.1.1-95BeozDDv6Nwf9Aptpfd8ZZycWyRToYerPjs6s2VsVMXMz4RPw5koV_XMCLNJW3OiRA._Gw38LiNAlF6d4cDzjNIPgTBPIJqcQnKWSEavclc9Wa1VAVfDf5NIcFF6CQ1fyJzovWPJhjLj75231d4uRiNbrnAqMa5yQrws6zxm4zp_isu.BnNq17lryo3xLs7RrIVqC.MJ7xcFdFofcVHebVv44jymA4kch0Lc9gwbXWHD2jXc7ETH4zbZgGBgEPLcjVIH4B56S_T50cW5gzHO811JOaHr.ymsZpQpwUlyzTOaRIuZHHfZplG9AhLdubV9wh2vq3LP5IsbgnKmlS2poxZUtTF1W5Qn3IknCv1T_I'
}

/**
 * Resolver Nakastream API
 * Appelle l'API /api/v1/streaming/sources/{id} et extrait l'URL .m3u8 HLS master réelle
 */
export async function resolveNakastream(mediaId, type = 'movie', season = null, episode = null) {
  try {
    let targetId = String(mediaId || '')
    let targetType = type || 'movie'

    // Extraire l'ID propre si mediaId est une URL d'API complète (ex: https://nakastream.tv/api/v1/streaming/sources/1161?type=movie)
    if (targetId.includes('/streaming/sources/')) {
      const idMatch = targetId.match(/\/streaming\/sources\/([^\?\/]+)/)
      if (idMatch && idMatch[1]) {
        targetId = idMatch[1]
      }
      if (targetId.includes('type=')) {
        const typeMatch = targetId.match(/type=([^&]+)/)
        if (typeMatch && typeMatch[1]) {
          targetType = typeMatch[1]
        }
      }
    }

    let data = null

    // 1. Essayer le binding natif Go de Wails (Bypass 100% CORS & Origin policies)
    if (window.go?.main?.App?.FetchNakastreamSource) {
      try {
        const rawJson = await window.go.main.App.FetchNakastreamSource(
          targetId,
          targetType,
          Number(season) || 0,
          Number(episode) || 0
        )
        if (rawJson && typeof rawJson === 'string' && rawJson.trim().length > 0) {
          try {
            data = JSON.parse(rawJson)
          } catch (parseErr) {
            console.warn('[Nakastream Go JSON parse error]:', parseErr, 'Raw:', rawJson.substring(0, 100))
          }
        }
      } catch (goErr) {
        console.warn('[Nakastream Go Binding Warning]:', goErr)
      }
    }

    // 2. Fallback fetch HTTP Web (si hors Wails)
    if (!data) {
      let endpoint = `${NAKASTREAM_BASE_URL}/api/v1/streaming/sources/${targetId}?type=${targetType}`
      if (targetType === 'tv' && season && episode) {
        endpoint += `&season=${season}&episode=${episode}`
      }

      const headers = {
        'accept': 'application/json',
        'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
        'authorization': NAKASTREAM_CONFIG.authHeader,
        'cookie': NAKASTREAM_CONFIG.cookie,
        'priority': 'u=1, i',
        'referer': `${NAKASTREAM_BASE_URL}/player?id=${targetId}&type=${targetType}`,
        'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        'x-profile-id': NAKASTREAM_CONFIG.profileId
      }

      const response = await fetch(endpoint, { method: 'GET', headers })
      if (!response.ok) {
        throw new Error(`Nakastream API returned ${response.status}`)
      }

      data = await response.json()
    }

    if (!data || !data.sources || data.sources.length === 0) {
      return null
    }

    // Récupération de la meilleure source d'encodage HLS (.m3u8)
    const primarySource = data.sources.find(s => s.isHls) || data.sources[0]
    let hlsMasterUrl = primarySource.url

    // Si l'URL est relative, préfixer par NAKASTREAM_BASE_URL
    if (hlsMasterUrl.startsWith('/')) {
      hlsMasterUrl = `${NAKASTREAM_BASE_URL}${hlsMasterUrl}`
    }

    // Formater les sous-titres avec URLs absolues
    const subtitles = (primarySource.subtitles || []).map(sub => ({
      lang: sub.lang,
      label: sub.label,
      url: sub.url.startsWith('/') ? `${NAKASTREAM_BASE_URL}${sub.url}` : sub.url,
      default: !!sub.default,
      forced: !!sub.forced
    }))

    // Formater les pistes audio
    const audioTracks = (primarySource.audioTracks || []).map(a => ({
      lang: a.lang,
      label: a.label,
      default: !!a.default
    }))

    return {
      streamUrl: hlsMasterUrl,
      isHls: true,
      maxQuality: primarySource.maxQuality || '1080p',
      subtitles,
      audioTracks,
      tmdbId: data.tmdbId || targetId,
      raw: data
    }
  } catch (error) {
    console.warn('[Nakastream Resolver Error]:', error)
    return null
  }
}
