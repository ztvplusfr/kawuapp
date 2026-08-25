/**
 * SKIP SERVICE - Automatic Intro & Outro Timestamps Service
 * Integrates AniSkip API & Anime-Skip API (GraphQL) with automatic MAL/AniList resolution
 */

const ANIME_SKIP_CLIENT_ID = 'o52sDjPI5HvoP6Mqx3A8uGzI1GulQWxx'
const malIdCache = {}

// Custom skip overrides for shows with extended recaps / intros
const CUSTOM_SKIP_OVERRIDES = {
  "seven deadly sins": {
    1: { intro: null },
    2: { intro: { startTime: 10, endTime: 261 } }, // Exact 4m21s for S1E2!
    3: { intro: { startTime: 10, endTime: 230 } },
    4: { intro: { startTime: 10, endTime: 180 } },
    5: { intro: { startTime: 10, endTime: 180 } },
    10: { intro: { startTime: 123, endTime: 210 } }
  },
  "nanatsu no taizai": {
    1: { intro: null },
    2: { intro: { startTime: 10, endTime: 261 } }, // Exact 4m21s for S1E2!
    3: { intro: { startTime: 10, endTime: 230 } },
    4: { intro: { startTime: 10, endTime: 180 } },
    5: { intro: { startTime: 10, endTime: 180 } },
    10: { intro: { startTime: 123, endTime: 210 } }
  }
}

/**
 * Resolve MAL ID from Show / Anime Title via AniList GraphQL
 */
export async function getMalIdForMedia(title) {
  if (!title || typeof title !== 'string' || !title.trim()) return null
  const cleanTitle = title.trim().toLowerCase()
  if (malIdCache[cleanTitle]) return malIdCache[cleanTitle]

  try {
    const query = `
      query ($search: String) {
        Media (search: $search, type: ANIME) {
          id
          idMal
        }
      }
    `
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { search: cleanTitle } })
    })

    if (res.ok) {
      const json = await res.json()
      const malId = json.data?.Media?.idMal || json.data?.Media?.id
      if (malId) {
        malIdCache[cleanTitle] = malId
        return malId
      }
    }
  } catch (e) {
    console.warn('[SkipService] AniList search error:', e)
  }

  return null
}

/**
 * Fetch Skip Intervals (Intro & Outro) for a given show & episode
 */
export async function fetchSkipIntervals(title, episodeNumber = 1, durationSeconds = 1440, inputMalId = null) {
  if (!title && !inputMalId) return null

  // 0. Check custom overrides first (e.g. Seven Deadly Sins S1E2 -> 4m21s / 261s)
  if (title) {
    const cleanTitle = title.trim().toLowerCase()
    for (const key of Object.keys(CUSTOM_SKIP_OVERRIDES)) {
      if (cleanTitle.includes(key)) {
        const epData = CUSTOM_SKIP_OVERRIDES[key][episodeNumber]
        if (epData) {
          return epData
        }
      }
    }
  }

  let malId = inputMalId || (title ? await getMalIdForMedia(title) : null)
  
  // 1. Primary Source: AniSkip API
  if (malId) {
    try {
      const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types=op&types=ed&types=recap&episodeLength=${Math.round(durationSeconds || 1440)}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (data && data.found && Array.isArray(data.results) && data.results.length > 0) {
          const op = data.results.find(r => r.skipType === 'op')
          const ed = data.results.find(r => r.skipType === 'ed')

          return {
            intro: op ? { startTime: op.interval.startTime, endTime: op.interval.endTime } : null,
            outro: ed ? { startTime: ed.interval.startTime, endTime: ed.interval.endTime } : null,
            source: 'AniSkip'
          }
        }
      }
    } catch (e) {
      console.warn('[SkipService] AniSkip fetch error:', e)
    }
  }

  // 2. Secondary Source: Anime-Skip GraphQL API
  if (title && typeof title === 'string' && title.trim() && ANIME_SKIP_CLIENT_ID) {
    try {
      const query = `
        query GetShow($search: String) {
          searchShows(search: $search) {
            id
            name
          }
        }
      `
      const res = await fetch('https://api.anime-skip.com/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': ANIME_SKIP_CLIENT_ID
        },
        body: JSON.stringify({ query, variables: { search: title.trim() } })
      })

      if (res.ok) {
        const json = await res.json()
        const shows = json.data?.searchShows
        if (shows && shows.length > 0) {
          const showId = shows[0].id
          const epQuery = `
            query GetEp($showId: String!) {
              findEpisodesByShowId(showId: $showId) {
                number
                timestamps {
                  at
                  type { name }
                }
              }
            }
          `
          const epRes = await fetch('https://api.anime-skip.com/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Client-ID': ANIME_SKIP_CLIENT_ID
            },
            body: JSON.stringify({ query: epQuery, variables: { showId } })
          })

          if (epRes.ok) {
            const epJson = await epRes.json()
            const eps = epJson.data?.findEpisodesByShowId || []
            const targetEp = eps.find(e => String(e.number) === String(episodeNumber))
            if (targetEp && targetEp.timestamps && targetEp.timestamps.length > 0) {
              const introTs = targetEp.timestamps.find(t => t.type.name === 'Intro')
              if (introTs) {
                const endTs = targetEp.timestamps.find(t => t.at > introTs.at && (t.type.name === 'Canon' || t.type.name === 'Title Card' || t.type.name === 'Episode')) || targetEp.timestamps.find(t => t.at > introTs.at)
                const startTime = introTs.at
                const endTime = endTs ? endTs.at : startTime + 85
                return {
                  intro: { startTime, endTime },
                  outro: null,
                  source: 'Anime-Skip'
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SkipService] Anime-Skip fetch error:', e)
    }
  }

  return null
}
