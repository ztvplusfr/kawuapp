/**
 * Service d'agrégation de sources de streaming vidéo multi-APIs (Movix & Frembed)
 * Interroge en parallèle les APIs :
 * 1. /api/links/movie/:tmdbId
 * 2. /api/tmdb/movie/:tmdbId (et /api/tmdb/tv/:id?season=:s&episode=:e)
 * 3. /api/fstream/movie/:tmdbId
 * 4. /api/wiflix/movie/:tmdbId
 * 5. /api/j1f/movie/:tmdbId
 * 6. /api/swiftflow/movie/:tmdbId
 * 7. frembed.casa/api/public/v1/movies/:tmdbId
 */

import { fetchFromTmdb } from '../tmdb.js'

const MOVIX_BASE = 'https://api.movix.fun'
const FREMBED_BASE = 'https://frembed.casa'

/**
 * Exécute une requête API sécurisée via le binding natif Go de Wails (sans CORS)
 * avec fallback sur fetch web standard.
 */
async function apiRequest(url, customOrigin = 'https://movix.fun', customReferer = 'https://movix.fun/') {
  try {
    // 1. Essayer le binding natif Go Wails
    if (typeof window !== 'undefined' && window.go?.main?.App?.FetchMovieAPI) {
      try {
        const rawJson = await window.go.main.App.FetchMovieAPI(url, customOrigin, customReferer)
        if (rawJson && typeof rawJson === 'string' && rawJson.trim().length > 0) {
          return JSON.parse(rawJson)
        }
      } catch (goErr) {
        // Fallback si échec
      }
    }

    // 2. Essayer FetchWebPageHTML
    if (typeof window !== 'undefined' && window.go?.main?.App?.FetchWebPageHTML) {
      try {
        const raw = await window.go.main.App.FetchWebPageHTML(url)
        if (raw && typeof raw === 'string' && (raw.startsWith('{') || raw.startsWith('['))) {
          return JSON.parse(raw)
        }
      } catch (e) {}
    }

    // 3. Fallback fetch standard
    const isFrembed = url.includes('frembed.casa')
    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'origin': customOrigin,
      'referer': customReferer,
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'
    }
    if (isFrembed) {
      headers['sec-fetch-site'] = 'cross-site'
    }

    const res = await fetch(url, { headers })
    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.warn(`[MovieSourcesService] Erreur requête sur ${url}:`, err.message || err)
    return null
  }
}

/**
 * Extrait le nom d'hôte lisible depuis une URL
 */
function getHostName(url) {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    return u.hostname.replace(/^www\./, '')
  } catch (e) {
    return 'Serveur'
  }
}

/**
 * Normalise la clé de langue (vf, vostfr, vff, vfq, vo)
 */
export function normalizeLanguage(lang) {
  if (!lang) return 'vf'
  const l = String(lang).toLowerCase().trim()
  if (l.includes('vostfr') || l.includes('vost') || l.includes('sub') || l.includes('sous-titre')) return 'vostfr'
  if (l.includes('vfq') || l.includes('québec') || l.includes('quebec')) return 'vfq'
  if (l.includes('vff') || l.includes('truefrench') || l.includes('vfi')) return 'vff'
  if (l.includes('vf') || l.includes('french') || l.includes('français') || l.includes('francais') || l.includes('fr')) return 'vf'
  if (l.includes('vo') || l.includes('en') || l.includes('eng') || l.includes('english') || l.includes('anglais')) return 'vo'
  if (l.includes('ja') || l.includes('jap') || l.includes('japonais')) return 'vostfr'
  return 'vf'
}

/**
 * Attribue un score de priorité selon le type de source et la capacité
 * d'extraction HLS/MP4 native en haute résolution (1080p / 720p).
 */
function getSourcePriority(url, name = '', quality = '') {
  const low = `${url} ${name} ${quality}`.toLowerCase()
  let score = 40

  if (low.includes('vidara') || low.includes('mountainpages') || low.includes('s1q2105')) score = 100
  else if (low.includes('uqload')) score = 98
  else if (low.includes('swiftflow') || low.includes('blinkflux')) score = 96
  else if (low.includes('ansembed') || low.includes('vidmoly')) score = 94
  else if (low.includes('vidzy')) score = 90
  else if (low.includes('.m3u8')) score = 85
  else if (low.includes('.mp4')) score = 80
  else if (low.includes('lulustream') || low.includes('luluvdo')) score = 70
  else if (low.includes('voe.sx') || low.includes('voe') || low.includes('kakaflix')) score = 65
  else if (low.includes('frembed')) score = 62
  else if (low.includes('upn') || low.includes('flemmix') || low.includes('serix') || low.includes('coflix') || low.includes('totocoutouno')) score = 52
  else if (low.includes('dsvplay') || low.includes('morencius') || low.includes('streamhg') || low.includes('savefiles') || low.includes('playmogo')) score = 48

  if (low.includes('1080') || low.includes('fhd') || low.includes('truefrench')) {
    score += 5
  }
  return score
}

/**
 * Récupère et agrège toutes les sources disponibles pour un FILM (TMDB ID)
 */
export async function fetchMovieSources(tmdbId) {
  const cleanId = String(tmdbId || '').trim()
  if (!cleanId) return []

  console.log(`%c[MovieSources] Recherche multi-sources pour Film TMDB: ${cleanId}`, 'background: #06b6d4; color: black; font-weight: bold; padding: 2px 6px; border-radius: 4px;')

  // Appels parallèles sur les 7 APIs fournies
  const [
    linksRes,
    tmdbRes,
    fstreamRes,
    wiflixRes,
    j1fRes,
    swiftflowRes,
    frembedRes
  ] = await Promise.allSettled([
    apiRequest(`${MOVIX_BASE}/api/links/movie/${cleanId}`),
    apiRequest(`${MOVIX_BASE}/api/tmdb/movie/${cleanId}`),
    apiRequest(`${MOVIX_BASE}/api/fstream/movie/${cleanId}`),
    apiRequest(`${MOVIX_BASE}/api/wiflix/movie/${cleanId}`),
    apiRequest(`${MOVIX_BASE}/api/j1f/movie/${cleanId}`),
    apiRequest(`${MOVIX_BASE}/api/swiftflow/movie/${cleanId}`),
    apiRequest(`${FREMBED_BASE}/api/public/v1/movies/${cleanId}`, 'https://movix.fun', 'https://movix.fun/')
  ])

  const linksData = linksRes.status === 'fulfilled' ? linksRes.value : null
  const tmdbData = tmdbRes.status === 'fulfilled' ? tmdbRes.value : null
  const fstreamData = fstreamRes.status === 'fulfilled' ? fstreamRes.value : null
  const wiflixData = wiflixRes.status === 'fulfilled' ? wiflixRes.value : null
  const j1fData = j1fRes.status === 'fulfilled' ? j1fRes.value : null
  const swiftflowData = swiftflowRes.status === 'fulfilled' ? swiftflowRes.value : null
  const frembedData = frembedRes.status === 'fulfilled' ? frembedRes.value : null

  const rawSources = []

  // 1. API: /api/links/movie/:id
  if (linksData?.data?.links && Array.isArray(linksData.data.links)) {
    linksData.data.links.forEach((item, idx) => {
      const url = typeof item === 'string' ? item : item?.url
      if (url && typeof url === 'string') {
        const host = getHostName(url)
        rawSources.push({
          url: url.trim(),
          name: `${host} (Lien ${idx + 1})`,
          lang: 'vf',
          provider: 'Movix Links',
          quality: 'HD'
        })
      }
    })
  }

  // 2. API: /api/tmdb/movie/:id
  if (tmdbData?.player_links && Array.isArray(tmdbData.player_links)) {
    tmdbData.player_links.forEach(item => {
      const url = item.decoded_url || item.url
      if (url && typeof url === 'string') {
        const lang = normalizeLanguage(item.language)
        const host = getHostName(url)
        rawSources.push({
          url: url.trim(),
          name: `${host} (${lang.toUpperCase()})`,
          lang,
          provider: 'Movix TMDB',
          quality: item.quality?.includes('HD') ? '1080p' : (item.quality || 'HD')
        })
      }
      if (item.clone_url && typeof item.clone_url === 'string') {
        const host = getHostName(item.clone_url)
        rawSources.push({
          url: item.clone_url.trim(),
          name: `${host} (Miroir)`,
          lang: normalizeLanguage(item.language),
          provider: 'Movix TMDB',
          quality: 'HD'
        })
      }
    })
  }
  if (tmdbData?.iframe_src && typeof tmdbData.iframe_src === 'string') {
    rawSources.push({
      url: tmdbData.iframe_src.trim(),
      name: 'Lecteur Video VIP (VF)',
      lang: 'vf',
      provider: 'Movix TMDB VIP',
      quality: '1080p'
    })
  }

  // 3. API: /api/fstream/movie/:id
  if (fstreamData?.players && typeof fstreamData.players === 'object') {
    Object.entries(fstreamData.players).forEach(([langKey, playerList]) => {
      if (Array.isArray(playerList)) {
        const lang = normalizeLanguage(langKey)
        playerList.forEach(item => {
          if (item?.url && typeof item.url === 'string') {
            const host = item.player || getHostName(item.url)
            rawSources.push({
              url: item.url.trim(),
              name: `${host} (${langKey})`,
              lang,
              provider: 'FStream',
              quality: item.quality || 'HD'
            })
          }
        })
      }
    })
  }

  // 4. API: /api/wiflix/movie/:id
  if (wiflixData?.players && typeof wiflixData.players === 'object') {
    Object.entries(wiflixData.players).forEach(([langKey, playerList]) => {
      if (Array.isArray(playerList)) {
        const lang = normalizeLanguage(langKey)
        playerList.forEach(item => {
          if (item?.url && typeof item.url === 'string') {
            const host = item.name || getHostName(item.url)
            rawSources.push({
              url: item.url.trim(),
              name: `${host} (${lang.toUpperCase()})`,
              lang,
              provider: 'Wiflix',
              quality: 'HD'
            })
          }
        })
      }
    })
  }

  // 5. API: /api/j1f/movie/:id
  if (j1fData?.players && typeof j1fData.players === 'object') {
    Object.entries(j1fData.players).forEach(([langKey, playerList]) => {
      if (Array.isArray(playerList)) {
        const lang = normalizeLanguage(langKey)
        playerList.forEach(item => {
          if (item?.url && typeof item.url === 'string') {
            const host = item.name || getHostName(item.url)
            rawSources.push({
              url: item.url.trim(),
              name: `${host} (${lang.toUpperCase()})`,
              lang,
              provider: '1Jour1Film',
              quality: 'HD'
            })
          }
        })
      }
    })
  }

  // 6. API: /api/swiftflow/movie/:id
  if (swiftflowData?.players && typeof swiftflowData.players === 'object') {
    Object.entries(swiftflowData.players).forEach(([langKey, playerList]) => {
      if (Array.isArray(playerList)) {
        const lang = normalizeLanguage(langKey)
        playerList.forEach(item => {
          if (item?.url && typeof item.url === 'string') {
            rawSources.push({
              url: item.url.trim(),
              name: `SwiftFlow (${lang.toUpperCase()}${item.label ? ' - ' + item.label : ''})`,
              lang,
              provider: 'SwiftFlow',
              quality: '1080p'
            })
          }
        })
      }
    })
  }

  // 7. API: frembed.casa
  if (frembedData?.result?.items && Array.isArray(frembedData.result.items)) {
    frembedData.result.items.forEach(item => {
      if (item?.link && typeof item.link === 'string') {
        const lang = normalizeLanguage(item.version)
        rawSources.push({
          url: item.link.trim(),
          name: `Frembed (${item.version || 'VF'} - ${item.quality || 'HD'})`,
          lang,
          provider: 'Frembed',
          quality: item.quality || 'HD'
        })
      }
    })
  }

  // Déduplication stricte par URL
  const seenUrls = new Set()
  const uniqueSources = []

  for (const src of rawSources) {
    const cleanUrl = src.url.trim()
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl)
      uniqueSources.push({
        ...src,
        priority: getSourcePriority(cleanUrl, src.name, src.quality)
      })
    }
  }

  // Tri par priorité décroissante
  uniqueSources.sort((a, b) => b.priority - a.priority)

  console.log(`%c[MovieSources] ${uniqueSources.length} sources uniques trouvées pour TMDB ${cleanId}`, 'color: #10b981; font-weight: bold;')
  return uniqueSources
}

/**
 * Parse les résultats de l'API /anime/search/ (Anime-Sama via Movix)
 */
function parseAnimeSearchResults(animeList, targetSeason = 1, targetEpisode = 1) {
  if (!Array.isArray(animeList) || animeList.length === 0) return []
  const sources = []

  for (const item of animeList) {
    if (!item.seasons || !Array.isArray(item.seasons)) continue

    let matchedSeason = item.seasons.find(s => {
      const match = s.name?.match(/(\d+)/)
      return match ? parseInt(match[1]) === Number(targetSeason) : false
    })

    if (!matchedSeason && item.seasons.length >= targetSeason) {
      matchedSeason = item.seasons[targetSeason - 1]
    }
    if (!matchedSeason) matchedSeason = item.seasons[0]

    if (!matchedSeason || !matchedSeason.episodes) continue

    const matchedEp = matchedSeason.episodes.find(ep => {
      if (ep.index !== undefined && Number(ep.index) === Number(targetEpisode)) return true
      const match = ep.name?.match(/(\d+)/)
      return match ? parseInt(match[1]) === Number(targetEpisode) : false
    })

    if (!matchedEp || !matchedEp.streaming_links) continue

    for (const link of matchedEp.streaming_links) {
      const lang = normalizeLanguage(link.language || 'vostfr')
      if (!link.players || !Array.isArray(link.players)) continue

      link.players.forEach((pUrl, pIdx) => {
        if (!pUrl || typeof pUrl !== 'string') return
        const cleanUrl = pUrl.trim()
        const hostName = getHostName(cleanUrl)

        sources.push({
          url: cleanUrl,
          name: `${hostName} (${lang.toUpperCase()})`,
          lang: lang,
          provider: 'Anime-Sama (Movix API)',
          quality: cleanUrl.includes('.mp4') ? '1080p' : 'HD'
        })
      })
    }
  }

  return sources
}

/**
 * Récupère et agrège les sources disponibles pour une SÉRIE TV ou ANIMÉ (TMDB ID, saison, épisode, titre)
 * Interroge en parallèle les 8 APIs de séries :
 * 1. /api/purstream/tv/:id/stream?season=:s&episode=:e
 * 2. /api/fstream/tv/:id/season/:s?episode=:e
 * 3. /api/wiflix/tv/:id/:s?episode=:e
 * 4. /api/swiftflow/tv/:id/season/:s?episode=:e
 * 5. /api/j1f/tv/:id/season/:s?episode=:e
 * 6. frembed.casa/api/public/v1/tv/:id?sa=:s&epi=:e
 * 7. /api/tmdb/tv/:id?season=:s&episode=:e
 * 8. /api/links/tv/:id?season=:s&episode=:e
 * + /anime/search/:title (Anime-Sama)
 */
export async function fetchTvSources(tmdbId, season = 1, episode = 1, title = null) {
  const cleanId = String(tmdbId || '').trim()
  const s = Number(season) || 1
  const e = Number(episode) || 1

  console.log(`%c[TvSources] Recherche multi-APIs pour Série TMDB: ${cleanId || title} (S${s}E${e})`, 'background: #06b6d4; color: black; font-weight: bold; padding: 2px 6px; border-radius: 4px;')

  let titleToSearch = title
  if (!titleToSearch && cleanId && /^\d+$/.test(cleanId)) {
    try {
      const tmdbData = await fetchFromTmdb(`/tv/${cleanId}`)
      titleToSearch = tmdbData?.name || tmdbData?.original_name
    } catch (err) {}
  }

  const calls = []
  const hasId = cleanId && /^\d+$/.test(cleanId)

  // 1. Purstream TV (Direct Master HLS 1080p Multi)
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/purstream/tv/${cleanId}/stream?season=${s}&episode=${e}`) : Promise.resolve(null))

  // 2. FStream TV
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/fstream/tv/${cleanId}/season/${s}?episode=${e}`) : Promise.resolve(null))

  // 3. Wiflix TV
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/wiflix/tv/${cleanId}/${s}?episode=${e}`) : Promise.resolve(null))

  // 4. SwiftFlow TV
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/swiftflow/tv/${cleanId}/season/${s}?episode=${e}`) : Promise.resolve(null))

  // 5. J1F TV (1Jour1Film)
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/j1f/tv/${cleanId}/season/${s}?episode=${e}`) : Promise.resolve(null))

  // 6. Frembed TV
  calls.push(hasId ? apiRequest(`${FREMBED_BASE}/api/public/v1/tv/${cleanId}?sa=${s}&epi=${e}`) : Promise.resolve(null))

  // 7. TMDB TV
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/tmdb/tv/${cleanId}?season=${s}&episode=${e}`) : Promise.resolve(null))

  // 8. Links TV
  calls.push(hasId ? apiRequest(`${MOVIX_BASE}/api/links/tv/${cleanId}?season=${s}&episode=${e}`) : Promise.resolve(null))

  // 9. Anime Search / Anime-Sama
  if (titleToSearch) {
    const encodedTitle = encodeURIComponent(titleToSearch.trim())
    calls.push(apiRequest(`${MOVIX_BASE}/anime/search/${encodedTitle}?includeSeasons=true&includeEpisodes=true&season=${s}&episode=${e}`))
  } else {
    calls.push(Promise.resolve(null))
  }

  const [
    purstreamRes,
    fstreamRes,
    wiflixRes,
    swiftRes,
    j1fRes,
    frembedRes,
    tmdbRes,
    linksRes,
    animeRes
  ] = await Promise.allSettled(calls)

  const rawSources = []

  // 1. Purstream TV
  const purstreamData = purstreamRes.status === 'fulfilled' ? purstreamRes.value : null
  if (purstreamData?.sources && Array.isArray(purstreamData.sources)) {
    purstreamData.sources.forEach((item, idx) => {
      if (item?.url) {
        rawSources.push({
          url: item.url.trim(),
          name: item.name || `Purstream HLS (${idx + 1})`,
          lang: 'vf',
          provider: 'Purstream TV',
          quality: '1080p'
        })
      }
    })
  }

  // 2. FStream TV
  const fstreamData = fstreamRes.status === 'fulfilled' ? fstreamRes.value : null
  const fstreamSources = fstreamData?.sources || fstreamData?.episodes?.[String(e)]?.sources || fstreamData?.episodes?.[e]?.sources
  if (fstreamSources && typeof fstreamSources === 'object') {
    for (const [langKey, players] of Object.entries(fstreamSources)) {
      if (Array.isArray(players)) {
        const lang = normalizeLanguage(langKey)
        players.forEach(p => {
          const url = p?.url || (typeof p === 'string' ? p : null)
          if (url) {
            const host = p?.player || getHostName(url)
            rawSources.push({
              url: url.trim(),
              name: `${host} (${lang.toUpperCase()})`,
              lang,
              provider: 'FStream TV',
              quality: p?.quality || 'HD'
            })
          }
        })
      }
    }
  }

  // 3. Wiflix TV
  const wiflixData = wiflixRes.status === 'fulfilled' ? wiflixRes.value : null
  const wiflixEp = wiflixData?.episodes?.[String(e)] || wiflixData?.episodes?.[e]
  if (wiflixEp && typeof wiflixEp === 'object') {
    for (const [langKey, links] of Object.entries(wiflixEp)) {
      if (Array.isArray(links)) {
        const lang = normalizeLanguage(langKey)
        links.forEach(item => {
          const url = item?.url || (typeof item === 'string' ? item : null)
          if (url) {
            const host = item?.name || getHostName(url)
            rawSources.push({
              url: url.trim(),
              name: `${host} (${lang.toUpperCase()})`,
              lang,
              provider: 'Wiflix TV',
              quality: 'HD'
            })
          }
        })
      }
    }
  }

  // 4. SwiftFlow TV
  const swiftData = swiftRes.status === 'fulfilled' ? swiftRes.value : null
  const swiftEp = swiftData?.episodes?.[String(e)] || swiftData?.episodes?.[e]
  if (swiftEp && typeof swiftEp === 'object') {
    for (const [langKey, links] of Object.entries(swiftEp)) {
      if (Array.isArray(links)) {
        const lang = normalizeLanguage(langKey)
        links.forEach(item => {
          const url = item?.url || (typeof item === 'string' ? item : null)
          if (url) {
            rawSources.push({
              url: url.trim(),
              name: `SwiftFlow (${lang.toUpperCase()})`,
              lang,
              provider: 'SwiftFlow TV',
              quality: '1080p'
            })
          }
        })
      }
    }
  }

  // 5. J1F TV
  const j1fData = j1fRes.status === 'fulfilled' ? j1fRes.value : null
  const j1fEp = j1fData?.episodes?.[String(e)] || j1fData?.episodes?.[e] || j1fData?.sources
  if (j1fEp && typeof j1fEp === 'object') {
    for (const [langKey, links] of Object.entries(j1fEp)) {
      if (Array.isArray(links)) {
        const lang = normalizeLanguage(langKey)
        links.forEach(item => {
          const url = item?.url || (typeof item === 'string' ? item : null)
          if (url) {
            const host = item?.name || getHostName(url)
            rawSources.push({
              url: url.trim(),
              name: `${host} (${lang.toUpperCase()})`,
              lang,
              provider: '1Jour1Film TV',
              quality: 'HD'
            })
          }
        })
      }
    }
  }

  // 6. Frembed TV
  const frembedData = frembedRes.status === 'fulfilled' ? frembedRes.value : null
  if (frembedData?.result?.items && Array.isArray(frembedData.result.items)) {
    frembedData.result.items.forEach(item => {
      if (item?.link) {
        const lang = normalizeLanguage(item.version || 'vf')
        rawSources.push({
          url: item.link.trim(),
          name: `Frembed (${lang.toUpperCase()})`,
          lang,
          provider: 'Frembed TV',
          quality: '1080p'
        })
      }
    })
  }

  // 7. TMDB TV Current Episode
  const tmdbData = tmdbRes.status === 'fulfilled' ? tmdbRes.value : null
  const currentEp = tmdbData?.current_episode
  if (currentEp?.player_links && Array.isArray(currentEp.player_links)) {
    currentEp.player_links.forEach(item => {
      const url = item.decoded_url || item.url
      if (url && typeof url === 'string') {
        const lang = normalizeLanguage(item.language)
        const host = getHostName(url)
        rawSources.push({
          url: url.trim(),
          name: `${host} (${lang.toUpperCase()})`,
          lang,
          provider: 'Movix TMDB TV',
          quality: item.quality?.includes('HD') ? '1080p' : (item.quality || 'HD')
        })
      }
      if (item.clone_url && typeof item.clone_url === 'string') {
        const host = getHostName(item.clone_url)
        rawSources.push({
          url: item.clone_url.trim(),
          name: `${host} (Miroir)`,
          lang: normalizeLanguage(item.language),
          provider: 'Movix TMDB TV',
          quality: 'HD'
        })
      }
    })
  }
  if (currentEp?.iframe_src && typeof currentEp.iframe_src === 'string') {
    rawSources.push({
      url: currentEp.iframe_src.trim(),
      name: 'Lecteur TV VIP (VF)',
      lang: 'vf',
      provider: 'Movix TMDB TV VIP',
      quality: '1080p'
    })
  }

  // 8. Links TV
  const linksData = linksRes.status === 'fulfilled' ? linksRes.value : null
  const epData = linksData?.data?.find(d => Number(d.season_number) === s && Number(d.episode_number) === e) || linksData?.data?.[0]
  if (epData?.links && Array.isArray(epData.links)) {
    epData.links.forEach((item, idx) => {
      const url = typeof item === 'string' ? item : item?.url
      if (url && typeof url === 'string') {
        const host = getHostName(url)
        rawSources.push({
          url: url.trim(),
          name: `${host} (Lien ${idx + 1})`,
          lang: 'vf',
          provider: 'Movix Links TV',
          quality: 'HD'
        })
      }
    })
  }

  // 9. Anime-Sama / Anime Search API
  const animeData = animeRes.status === 'fulfilled' ? animeRes.value : null
  if (animeData) {
    const animeSources = parseAnimeSearchResults(animeData, s, e)
    if (animeSources.length > 0) {
      rawSources.push(...animeSources)
    }
  }

  const seenUrls = new Set()
  const uniqueSources = []

  for (const src of rawSources) {
    const cleanUrl = src.url.trim()
    if (!seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl)
      uniqueSources.push({
        ...src,
        priority: getSourcePriority(cleanUrl, src.name, src.quality)
      })
    }
  }

  uniqueSources.sort((a, b) => b.priority - a.priority)
  return uniqueSources
}

/**
 * Fonction universelle d'accès aux sources selon le type (film ou série)
 */
export async function fetchMediaSources(mediaId, type = 'movie', season = 1, episode = 1, title = null) {
  const isTv = type === 'tv' || type === 'Série' || type === 'serie'
  if (isTv) {
    return await fetchTvSources(mediaId, season, episode, title)
  }
  return await fetchMovieSources(mediaId)
}

/**
 * Construit une liste de flux d'épisodes (compatible avec allEpisodeStreams & dynamicLanguagePills)
 * à partir de la liste brute de sources agrégées.
 */
export function buildStreamsFromSources(sources, season = 1, episode = 1) {
  if (!sources || sources.length === 0) return []

  // Grouper par langue principale pour créer les flux de langue (VF, VOSTFR, VFF, VFQ, etc.)
  const byLang = new Map()

  sources.forEach(src => {
    const langKey = normalizeLanguage(src.lang)
    if (!byLang.has(langKey)) {
      byLang.set(langKey, [])
    }
    byLang.get(langKey).push(src)
  })

  const streams = []

  // Priorité d'ordre des langues : vf d'abord, puis vostfr, vff, vfq, vo
  const langOrder = ['vf', 'vostfr', 'vff', 'vfq', 'vo']
  const sortedLangs = Array.from(byLang.keys()).sort((a, b) => {
    const iA = langOrder.indexOf(a) !== -1 ? langOrder.indexOf(a) : 99
    const iB = langOrder.indexOf(b) !== -1 ? langOrder.indexOf(b) : 99
    return iA - iB
  })

  sortedLangs.forEach(langKey => {
    const langSources = byLang.get(langKey)
    if (langSources && langSources.length > 0) {
      // La première source de chaque langue est celle de plus haute priorité
      const primary = langSources[0]
      streams.push({
        id: `stream-${langKey}-${season}-${episode}`,
        season: Number(season) || 0,
        episode: Number(episode) || 0,
        lang: langKey,
        url: primary.url,
        video_sources: langSources
      })
    }
  })

  return streams
}

const availableEpisodesCache = new Map()

/**
 * Détecte les épisodes et saisons réellement disponibles via les sources streaming
 * (Fstream, Wiflix, SwiftFlow et Anime-Sama) avec mise en cache mémoire.
 * Retourne un objet: { [seasonNumber]: Set<episodeNumber> } ou null si non applicable.
 */
export async function getAvailableEpisodesMap(title, tmdbId = null, targetSeason = null) {
  const cacheKey = String(tmdbId || title || '').trim().toLowerCase()
  if (!cacheKey) return null

  if (availableEpisodesCache.has(cacheKey)) {
    const cached = availableEpisodesCache.get(cacheKey)
    if (!targetSeason || cached[targetSeason]) {
      return cached
    }
  }

  const existingMap = availableEpisodesCache.get(cacheKey) || {}

  // 1. Si on a un tmdbId numérique, interroger en direct les APIs de séries (Fstream, Wiflix, Swiftflow)
  const cleanNumId = tmdbId && /^\d+$/.test(String(tmdbId).trim()) ? Number(tmdbId) : null
  if (cleanNumId) {
    let seasonsToCheck = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    if (Array.isArray(targetSeason)) {
      seasonsToCheck = targetSeason.map(Number).filter(n => n > 0)
    } else if (targetSeason && !isNaN(Number(targetSeason))) {
      seasonsToCheck = [Number(targetSeason)]
    }
    try {
      await Promise.all(
        seasonsToCheck.map(async (s) => {
          if (existingMap[s] && existingMap[s].size > 0) return

          const [fstream, wiflix, swiftflow] = await Promise.allSettled([
            apiRequest(`${MOVIX_BASE}/api/fstream/tv/${cleanNumId}/season/${s}`),
            apiRequest(`${MOVIX_BASE}/api/wiflix/tv/${cleanNumId}/${s}`),
            apiRequest(`${MOVIX_BASE}/api/swiftflow/tv/${cleanNumId}/season/${s}`)
          ])

          const epSet = new Set()
          const addKeys = (res) => {
            const data = res.status === 'fulfilled' ? res.value : null
            if (!data?.episodes) return
            const keys = Array.isArray(data.episodes)
              ? data.episodes.map(e => e.episode || e.number || e)
              : Object.keys(data.episodes)
            keys.forEach(k => {
              const n = parseInt(k, 10)
              if (!isNaN(n) && n > 0) epSet.add(n)
            })
          }

          addKeys(fstream)
          addKeys(wiflix)
          addKeys(swiftflow)

          if (epSet.size > 0) {
            existingMap[s] = epSet
          }
        })
      )

      if (Object.keys(existingMap).length > 0) {
        availableEpisodesCache.set(cacheKey, existingMap)
        return existingMap
      }
    } catch (apiErr) {
      console.warn('[MovieSourcesService] Erreur interrogation direct TV:', apiErr)
    }
  }

  // 2. Fallback via Anime-Sama / recherche par titre
  try {
    const searchTitle = (title || '').trim()
    if (!searchTitle) return Object.keys(existingMap).length > 0 ? existingMap : null

    const encoded = encodeURIComponent(searchTitle)
    const url = `${MOVIX_BASE}/anime/search/${encoded}?includeSeasons=true&includeEpisodes=true`
    const results = await apiRequest(url)

    if (Array.isArray(results) && results.length > 0) {
      const match = results.find(item => {
        const itemTitle = (item.title || item.name || '').toLowerCase()
        return itemTitle === searchTitle.toLowerCase() || itemTitle.includes(searchTitle.toLowerCase())
      }) || results[0]

      if (match?.seasons && Array.isArray(match.seasons)) {
        match.seasons.forEach((seasonObj, idx) => {
          let sNum = idx + 1
          const matchNum = seasonObj.name?.match(/(\d+)/)
          if (matchNum) {
            sNum = parseInt(matchNum[1], 10)
          }

          const epSet = new Set()
          if (Array.isArray(seasonObj.episodes)) {
            seasonObj.episodes.forEach(ep => {
              if (ep.index !== undefined && !isNaN(Number(ep.index))) {
                epSet.add(Number(ep.index))
              } else {
                const epMatch = ep.name?.match(/(\d+)/)
                if (epMatch) {
                  epSet.add(parseInt(epMatch[1], 10))
                }
              }
            })
          }

          if (epSet.size > 0) {
            existingMap[sNum] = epSet
          }
        })

        if (Object.keys(existingMap).length > 0) {
          availableEpisodesCache.set(cacheKey, existingMap)
          if (tmdbId) availableEpisodesCache.set(String(tmdbId), existingMap)
          return existingMap
        }
      }
    }
  } catch (err) {
    console.warn('[MovieSourcesService] Erreur détection épisodes disponibles:', err)
  }

  return Object.keys(existingMap).length > 0 ? existingMap : null
}

