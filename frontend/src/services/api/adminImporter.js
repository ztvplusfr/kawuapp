import { supabase } from '../supabase'
import { searchTmdb, getMediaFullDetails } from '../tmdb'

/**
 * Helper to fetch web page content via Wails Go backend (bypassing CORS)
 */
async function fetchPageHTML(url) {
  if (window.go?.main?.App?.FetchWebPageHTML) {
    try {
      return await window.go.main.App.FetchWebPageHTML(url)
    } catch (e) {
      console.warn('[AdminImporter] Go FetchWebPageHTML error:', e)
    }
  }
  const resp = await fetch(url)
  return await resp.text()
}

/**
 * Clean & normalize catalog URL
 */
function cleanCatalogUrl(url) {
  let cleaned = String(url).trim()
  if (!cleaned.endsWith('/')) cleaned += '/'
  return cleaned
}

export function identifyServerKey(url) {
  if (!url) return 'other'
  const lower = url.toLowerCase()
  if (lower.includes('embed4me') || lower.includes('lpayer') || lower.includes('l4player')) return 'lplayer'
  if (lower.includes('sibnet')) return 'sibnet'
  if (lower.includes('sendvid')) return 'sendvid'
  if (lower.includes('ansembed')) return 'ansembed'
  if (lower.includes('vidhide') || lower.includes('streamhide')) return 'vidhide'
  if (lower.includes('uqload')) return 'uqload'
  if (lower.includes('vidzy')) return 'vidzy'
  if (lower.includes('myvi')) return 'myvi'
  return 'other'
}

export function getServerDisplayName(key) {
  switch (key) {
    case 'sibnet': return 'Sibnet'
    case 'sendvid': return 'Sendvid'
    case 'ansembed': return 'Ansembed'
    case 'vidhide': return 'Vidhide'
    case 'uqload': return 'Uqload'
    case 'vidzy': return 'Vidzy'
    case 'myvi': return 'MyVi'
    case 'lplayer': return 'Lplayer (Embed4me)'
    default: return 'Autre Serveur'
  }
}

/**
 * Step 1: Discovers all available Seasons / Arcs / Films & Server Hosters from Anime-Sama catalog page
 */
export async function discoverCatalogSeasons(url) {
  const baseUrl = cleanCatalogUrl(url)
  const seasonsMap = new Map()
  const discoveredHostersSet = new Set()

  try {
    const html = await fetchPageHTML(baseUrl)

    const panneauRegex = /panneauAnime\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/gi
    let pMatch

    while ((pMatch = panneauRegex.exec(html)) !== null) {
      const labelName = pMatch[1].trim()
      const rawPath = pMatch[2].trim().toLowerCase()

      const pathParts = rawPath.split('/')
      const baseFolder = pathParts[0] || 'saison1'
      const seasonMatch = baseFolder.match(/saison\s*(\d+)/i) || labelName.match(/saison\s*(\d+)/i)
      const seasonNumber = seasonMatch ? parseInt(seasonMatch[1]) : 1

      if (!seasonsMap.has(baseFolder)) {
        seasonsMap.set(baseFolder, {
          folderKey: baseFolder,
          name: labelName.replace(/\s*\((?:vf|vostfr)\)/gi, ''),
          seasonNumber: seasonNumber,
          languages: []
        })
      }
    }

    if (seasonsMap.size === 0) {
      seasonsMap.set('saison1', {
        folderKey: 'saison1',
        name: 'Saison 1',
        seasonNumber: 1,
        languages: []
      })
    }

    const seasonList = Array.from(seasonsMap.values())

    for (const season of seasonList) {
      const availableLangs = []

      // Test VOSTFR
      try {
        const vostJs = await fetchPageHTML(`${baseUrl}${season.folderKey}/vostfr/episodes.js`)
        if (vostJs && !vostJs.includes('404 Not Found') && vostJs.includes('eps1')) {
          availableLangs.push('VOSTFR')
          // Extract sample URLs to identify hosters
          const matches = vostJs.match(/https?:\/\/[^'"]+/g) || []
          matches.forEach(u => discoveredHostersSet.add(identifyServerKey(u)))
        }
      } catch (e) {}

      // Test VF
      try {
        const vfJs = await fetchPageHTML(`${baseUrl}${season.folderKey}/vf/episodes.js`)
        if (vfJs && !vfJs.includes('404 Not Found') && vfJs.includes('eps1')) {
          availableLangs.push('VF')
          const matches = vfJs.match(/https?:\/\/[^'"]+/g) || []
          matches.forEach(u => discoveredHostersSet.add(identifyServerKey(u)))
        }
      } catch (e) {}

      season.languages = availableLangs.length > 0 ? availableLangs : ['VOSTFR']
    }

    const discoveredHosters = Array.from(discoveredHostersSet).map(key => ({
      key: key,
      name: getServerDisplayName(key),
      isDefaultSelected: key !== 'lplayer' // Lplayer excluded by default!
    }))

    return {
      seasons: seasonList,
      hosters: discoveredHosters
    }

  } catch (err) {
    console.error('[AdminImporter] discoverCatalogSeasons error:', err)
    return {
      seasons: [
        { folderKey: 'saison1', name: 'Saison 1', seasonNumber: 1, languages: ['VOSTFR', 'VF'] }
      ],
      hosters: [
        { key: 'sibnet', name: 'Sibnet', isDefaultSelected: true },
        { key: 'sendvid', name: 'Sendvid', isDefaultSelected: true },
        { key: 'ansembed', name: 'Ansembed', isDefaultSelected: true },
        { key: 'lplayer', name: 'Lplayer (Embed4me)', isDefaultSelected: false }
      ]
    }
  }
}

/**
 * Step 2: Fetches and parses episodes for a specific season folder, language, and selected server hoster keys
 */
export async function fetchEpisodesForSeasonAndLanguage(baseUrl, folderKey, seasonNumber, language, allowedServerKeys = null) {
  const cleanUrl = cleanCatalogUrl(baseUrl)
  const langFolder = language.toLowerCase()
  const epJsUrl = `${cleanUrl}${folderKey}/${langFolder}/episodes.js`
  const episodes = []

  // Default allowed servers exclude 'lplayer'
  const activeAllowedKeys = allowedServerKeys || ['sibnet', 'sendvid', 'ansembed', 'vidhide', 'uqload', 'vidzy', 'myvi', 'other']

  try {
    const jsContent = await fetchPageHTML(epJsUrl)
    if (!jsContent || jsContent.includes('404 Not Found')) return []

    const serverArrays = []
    const arrayRegex = /var\s+eps\d+\s*=\s*\[([\s\S]*?)\];/gi
    let arrMatch

    while ((arrMatch = arrayRegex.exec(jsContent)) !== null) {
      const rawArrayText = arrMatch[1]
      const urlMatches = rawArrayText.match(/['"](https?:\/\/[^'"]+)['"]/gi)
      if (urlMatches && urlMatches.length > 0) {
        const serverUrls = urlMatches.map(u => u.replace(/['"]/g, ''))
        serverArrays.push(serverUrls)
      }
    }

    if (serverArrays.length === 0) return []

    const episodeCount = Math.max(...serverArrays.map(arr => arr.length))

    for (let i = 0; i < episodeCount; i++) {
      const sources = []
      serverArrays.forEach((serv, sIdx) => {
        if (serv[i] && serv[i].startsWith('http')) {
          const rawUrl = serv[i]
          const serverKey = identifyServerKey(rawUrl)

          // EXCLUDE server if key is not in activeAllowedKeys!
          if (activeAllowedKeys.includes(serverKey)) {
            let name = getServerDisplayName(serverKey) + ` (${sIdx + 1})`
            sources.push({
              name: name,
              url: rawUrl,
              serverKey: serverKey
            })
          }
        }
      })

      if (sources.length === 0) continue

      episodes.push({
        seasonNumber: seasonNumber,
        episodeNumber: i + 1,
        title: `Épisode ${i + 1}`,
        videoUrl: sources[0].url, // Primary URL from the first non-excluded server!
        sources: sources,
        language: language,
        source: 'Anime-Sama'
      })
    }

  } catch (e) {
    console.warn(`[AdminImporter] Could not load ${epJsUrl}:`, e)
  }

  return episodes
}

/**
 * Scrapes an Anime-Sama catalog URL automatically (All seasons & selected languages)
 */
export async function scrapeAnimeSamaCatalog(url) {
  const seasons = await discoverCatalogSeasons(url)
  let allEpisodes = []

  for (const s of seasons) {
    for (const lang of s.languages) {
      const eps = await fetchEpisodesForSeasonAndLanguage(url, s.folderKey, s.seasonNumber, lang)
      allEpisodes = [...allEpisodes, ...eps]
    }
  }

  return allEpisodes
}

/**
 * Searches TMDB for media candidates
 */
export async function searchTmdbCandidates(query) {
  if (!query || query.trim().length === 0) return []
  return await searchTmdb(query)
}

/**
 * Gets full details for a selected TMDB item
 */
export async function getTmdbMetadata(tmdbId, mediaType = 'tv') {
  return await getMediaFullDetails(tmdbId, mediaType)
}

/**
 * Inserts content and all mapped episodes into Supabase DB
 */
export async function importToSupabase(metadata, episodesList) {
  if (!metadata) throw new Error('Métadonnées TMDB requises.')

  const tmdbIdNum = parseInt(metadata.id || metadata.tmdbId)

  // 1. Check if content with this TMDB ID already exists to prevent duplicate entries
  const { data: existingContent } = await supabase
    .from('contents')
    .select('id')
    .eq('tmdb_id', tmdbIdNum)
    .maybeSingle()

  const contentId = existingContent?.id || `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  const category = metadata.mediaType === 'tv'
    ? (metadata.genres?.toLowerCase().includes('animation') ? 'Animés' : 'Séries')
    : 'Films'

  // 2. Insert or Update Content Row into Supabase `contents` table
  const contentRow = {
    id: contentId,
    tmdb_id: tmdbIdNum,
    type: metadata.mediaType || (metadata.category === 'Films' ? 'movie' : 'tv'),
    updated_at: new Date().toISOString()
  }
  if (!existingContent) {
    contentRow.created_at = new Date().toISOString()
  }

  const { error: contentErr } = await supabase
    .from('contents')
    .upsert(contentRow)

  if (contentErr) {
    console.error('[AdminImporter] Error inserting contents row:', contentErr)
    throw new Error(`Erreur lors de la création du contenu : ${contentErr.message}`)
  }

  // 2. Insert Episode Video Rows into Supabase `videos` table
  let insertedEpisodesCount = 0

  if (episodesList && episodesList.length > 0) {
    const videoRows = episodesList.map((ep, idx) => ({
      id: `v_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      content_id: contentId,
      url: ep.videoUrl,
      season: ep.seasonNumber || 1,
      episode: ep.episodeNumber || (idx + 1),
      number: ep.episodeNumber || (idx + 1),
      lang: (ep.language || 'vostfr').toLowerCase(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }))

    const { error: videoErr } = await supabase
      .from('videos')
      .upsert(videoRows)

    if (videoErr) {
      console.warn('[AdminImporter] Error inserting videos (will retry individually):', videoErr)
      for (const row of videoRows) {
        try {
          await supabase.from('videos').upsert(row)
          insertedEpisodesCount++
        } catch (e) {
          console.warn('[AdminImporter] Individual video insert error:', e)
        }
      }
    } else {
      insertedEpisodesCount = videoRows.length
    }
  }

  return {
    contentId,
    content: contentRow,
    episodesCount: insertedEpisodesCount
  }
}
