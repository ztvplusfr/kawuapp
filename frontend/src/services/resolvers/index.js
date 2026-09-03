import { resolveNakastream } from './nakastream.js'
import { resolveVidzy } from './vidzy.js'
import { resolveUqload } from './uqload.js'
import { resolveAnsembed } from './ansembed.js'
import { resolveVidara } from './vidara.js'
import { fetchMediaSources, buildStreamsFromSources } from '../api/movieSourcesService.js'

export { resolveNakastream, resolveVidzy, resolveUqload, resolveAnsembed, resolveVidara }

/**
 * Registre central de résolveurs de sources de streaming
 */
const resolvers = [
  { name: 'vidara', resolve: resolveVidara },
  { name: 'vidzy', resolve: resolveVidzy },
  { name: 'uqload', resolve: resolveUqload },
  { name: 'ansembed', resolve: resolveAnsembed },
  { name: 'nakastream', resolve: resolveNakastream }
]

/**
 * Estime le score de qualité d'un flux résolu (1080 = FHD, 720 = HD, 360 = Basse qualité)
 */
export function estimateStreamQualityScore(streamUrl, tag = '') {
  if (!streamUrl) return 0
  const u = String(streamUrl).toLowerCase()

  // 1080p FHD
  if (u.includes('_o/') || u.includes('_h/') || u.includes(',l,n,h,o,') || u.includes(',l,n,h,') || u.includes('1080') || (tag && String(tag).includes('1080'))) {
    return 1080
  }

  // 720p HD
  if (u.includes('s1q2105.com') || u.includes('vidara.') || u.includes('1280x720') || u.includes('720p') || u.includes('_n,') || (tag && String(tag).includes('720'))) {
    return 720
  }

  // 360p Low SD (ex: Vidzy _n single variant ou Uqload _l)
  if (u.includes('_n/') || u.includes('_l/') || u.includes('_n.urlset') || u.includes('360p')) {
    return 360
  }

  return 720
}

/**
 * Résout une URL d'embed unitaire vers un flux direct
 */
export async function resolveSingleEmbedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null
  const clean = rawUrl.trim()

  if (clean.includes('vidara.') || clean.includes('mountainpages.')) {
    return await resolveVidara(clean)
  }
  if (clean.includes('uqload.') || clean.includes('uqload')) {
    return await resolveUqload(clean)
  }
  if (clean.includes('ansembed.') || clean.includes('vidmoly.')) {
    return await resolveAnsembed(clean)
  }
  if (clean.includes('vidzy.')) {
    return await resolveVidzy(clean)
  }
  if (clean.includes('.m3u8') || clean.includes('.mp4')) {
    return {
      streamUrl: clean,
      isHls: clean.includes('.m3u8'),
      subtitles: [],
      audioTracks: []
    }
  }
  return null
}

/**
 * Résout le lien HLS master ou le meilleur flux pour un média/URL donné
 */
export async function resolveStreamSource(mediaId, type = 'movie', season = null, episode = null, title = null) {
  const queryStr = String(mediaId || '').trim()
  if (!queryStr) return null

  // 1. Si c'est un ID TMDB numérique ou une recherche de média
  const isNakastreamUrl = queryStr.includes('nakastream')
  const isTmdbId = /^\d+$/.test(queryStr) || (!queryStr.startsWith('http://') && !queryStr.startsWith('https://'))

  if (isNakastreamUrl || isTmdbId) {
    // 1a. Essayer Nakastream
    try {
      const nakaResult = await resolveNakastream(mediaId, type, season, episode)
      if (nakaResult && nakaResult.streamUrl) {
        return nakaResult
      }
    } catch (e) {
      console.warn('[Resolver] Nakastream non disponible:', e)
    }

    // 1b. Si TMDB ID, interroger les APIs de sources vidéo (Movix, Frembed & Anime-Sama)
    if (isTmdbId) {
      try {
        const sNum = Number(season) || 1
        const eNum = Number(episode) || 1
        const sources = await fetchMediaSources(mediaId, type, sNum, eNum, title)

        if (sources && sources.length > 0) {
          const streamList = buildStreamsFromSources(sources, sNum, eNum)

          let bestResolved = null
          let bestScore = -1

          // Parcourir les sources et résoudre pour trouver la MEILLEURE qualité HD/FHD (1080p > 720p > 360p)
          for (const src of sources) {
            const rawUrl = src.url || ''
            if (!rawUrl) continue

            const res = await resolveSingleEmbedUrl(rawUrl)
            if (res && res.streamUrl) {
              const qualityScore = estimateStreamQualityScore(res.streamUrl, src.quality)
              console.log(`[Resolver] Source candidate "${src.name}" résolue avec qualité: ${qualityScore}p`)

              if (qualityScore > bestScore) {
                bestScore = qualityScore
                bestResolved = {
                  ...res,
                  quality: qualityScore >= 1080 ? '1080p' : (qualityScore >= 720 ? '720p' : '360p'),
                  availableSources: sources,
                  discoveredStreams: streamList
                }

                // Si on a déjà trouvé du 1080p Full HD, on s'arrête (qualité maximale atteinte)
                if (qualityScore >= 1080) {
                  break
                }
              }
            }
          }

          if (bestResolved) {
            console.log(`%c[Resolver] 🎯 Source optimale sélectionnée : ${bestResolved.quality || 'HD'}`, 'color: #10b981; font-weight: bold;')
            return bestResolved
          }

          // Si aucun résolveur direct n'a fonctionné, renvoyer la meilleure source
          const topSource = sources[0]
          return {
            streamUrl: topSource.url,
            isHls: topSource.url.includes('.m3u8'),
            subtitles: [],
            audioTracks: [],
            availableSources: sources,
            discoveredStreams: streamList
          }
        }
      } catch (err) {
        console.warn('[Resolver] Erreur récupération multi-sources:', err)
      }
    }
  }

  // 2. Détection d'un embed direct passé en paramètre
  const singleRes = await resolveSingleEmbedUrl(queryStr)
  if (singleRes && singleRes.streamUrl) return singleRes

  return null
}
