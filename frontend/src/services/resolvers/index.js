import { resolveNakastream } from './nakastream.js'
import { resolveVidzy } from './vidzy.js'
import { resolveUqload } from './uqload.js'
import { resolveAnsembed } from './ansembed.js'

export { resolveNakastream, resolveVidzy, resolveUqload, resolveAnsembed }

/**
 * Registre central de résolveurs de sources de streaming
 */
const resolvers = [
  { name: 'vidzy', resolve: resolveVidzy },
  { name: 'uqload', resolve: resolveUqload },
  { name: 'ansembed', resolve: resolveAnsembed },
  { name: 'nakastream', resolve: resolveNakastream }
]

/**
 * Résout le lien HLS master pour un média donné
 */
export async function resolveStreamSource(mediaId, type = 'movie', season = null, episode = null) {
  const queryStr = String(mediaId || '')

  // 1. Détection Uqload
  if (queryStr.includes('uqload.') || queryStr.includes('uqload')) {
    const uqRes = await resolveUqload(mediaId)
    if (uqRes && uqRes.streamUrl) return uqRes
  }

  // 2. Détection Ansembed
  if (queryStr.includes('ansembed.') || queryStr.includes('ansembed')) {
    const ansRes = await resolveAnsembed(mediaId)
    if (ansRes && ansRes.streamUrl) return ansRes
  }

  // 3. Détection Vidzy
  if (queryStr.includes('vidzy.')) {
    const vidzyRes = await resolveVidzy(mediaId)
    if (vidzyRes && vidzyRes.streamUrl) return vidzyRes
  }

  // 4. Résolveur Nakastream (par ID TMDB)
  const nakaResult = await resolveNakastream(mediaId, type, season, episode)
  if (nakaResult && nakaResult.streamUrl) {
    return nakaResult
  }

  // 5. Fallbacks universels
  const fallbackUq = await resolveUqload(mediaId)
  if (fallbackUq && fallbackUq.streamUrl) return fallbackUq

  const fallbackAns = await resolveAnsembed(mediaId)
  if (fallbackAns && fallbackAns.streamUrl) return fallbackAns

  const fallbackVidzy = await resolveVidzy(mediaId)
  if (fallbackVidzy && fallbackVidzy.streamUrl) return fallbackVidzy

  return null
}
