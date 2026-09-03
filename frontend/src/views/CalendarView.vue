<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconFilter,
  IconLayoutGrid,
  IconListDetails,
  IconX,
  IconLoader2
} from '@tabler/icons-vue'
import { fetchFromTmdb, getOriginalTmdbImage } from '../services/tmdb'
import { supabase } from '../services/supabase'

const router = useRouter()

const DAY_LABELS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const MONTH_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

const TYPE_META = {
  anime: { accent: 'bg-violet-400', pill: 'bg-violet-500/15 text-violet-100 border border-violet-500/25', label: 'Animés' },
  tv: { accent: 'bg-sky-400', pill: 'bg-sky-500/15 text-sky-100 border border-sky-500/25', label: 'Séries TV' },
  movie: { accent: 'bg-red-500', pill: 'bg-red-500/15 text-red-100 border border-red-500/25', label: 'Films' }
}

const today = new Date()
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth()) // 0-11
const viewMode = ref('agenda') // 'agenda' | 'month'
const searchQuery = ref('')
const activeTypes = ref(new Set(Object.keys(TYPE_META)))
const showFilters = ref(false)
const isLoadingCalendar = ref(false)

// Cache des événements réels TMDB indexés par date "YYYY-MM-DD"
const realEventsByDate = ref({})

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/**
 * Charge les vraies sorties en direct depuis TMDB pour le mois affiché
 */
async function loadRealCalendarData(year, month) {
  isLoadingCalendar.value = true
  try {
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`

    // 1. Récupérer d'abord les contenus TV de la base Supabase Kawu pour être certain qu'ils figurent au calendrier
    const { data: dbSeries } = await supabase
      .from('contents')
      .select('tmdb_id, type')
      .eq('type', 'tv')

    const dbTmdbIds = (dbSeries || []).map(s => Number(s.tmdb_id)).filter(Boolean)

    // 2. Découverte TMDB (Animés japonais + Séries TV internationales + Films)
    const [animePage1, animePage2, tvDiscover, movieDiscover] = await Promise.all([
      fetchFromTmdb('/discover/tv', {
        with_genres: '16',
        with_origin_country: 'JP',
        'air_date.gte': startDate,
        'air_date.lte': endDate,
        sort_by: 'popularity.desc',
        page: '1'
      }),
      fetchFromTmdb('/discover/tv', {
        with_genres: '16',
        with_origin_country: 'JP',
        'air_date.gte': startDate,
        'air_date.lte': endDate,
        sort_by: 'popularity.desc',
        page: '2'
      }),
      fetchFromTmdb('/discover/tv', {
        without_genres: '16',
        'air_date.gte': startDate,
        'air_date.lte': endDate,
        sort_by: 'popularity.desc',
        page: '1'
      }),
      fetchFromTmdb('/discover/movie', {
        'primary_release_date.gte': startDate,
        'primary_release_date.lte': endDate,
        sort_by: 'popularity.desc',
        page: '1'
      })
    ])

    const dateMap = {}

    // A. Traitement des films avec date de sortie
    if (movieDiscover?.results) {
      movieDiscover.results.forEach(movie => {
        const release = movie.release_date
        if (release && release >= startDate && release <= endDate) {
          if (!dateMap[release]) dateMap[release] = []
          dateMap[release].push({
            id: `movie-${movie.id}`,
            tmdbId: movie.id,
            title: movie.title,
            subtitle: 'Sortie cinéma / streaming',
            poster: movie.poster_path ? getOriginalTmdbImage(movie.poster_path) : null,
            type: 'movie',
            date: new Date(release)
          })
        }
      })
    }

    // B. Récupération des épisodes réels pour les animés du mois (+ vos animés en DB dont Clevatess)
    const combinedAnimeList = [...(animePage1?.results || []), ...(animePage2?.results || [])]
    const animeIdsSet = new Set(combinedAnimeList.map(a => a.id))
    dbTmdbIds.forEach(id => animeIdsSet.add(id))

    const animesToFetch = Array.from(animeIdsSet).slice(0, 30)

    await Promise.all(
      animesToFetch.map(async showId => {
        try {
          const show = await fetchFromTmdb(`/tv/${showId}`)
          if (!show) return

          const isAnime = show.genres?.some(g => g.id === 16) || show.origin_country?.includes('JP')
          const showType = isAnime ? 'anime' : 'tv'

          // Récupérer la dernière saison en cours
          const activeSeason = (show.seasons || []).filter(s => s.season_number > 0).pop()
          if (!activeSeason) return

          const seasonData = await fetchFromTmdb(`/tv/${showId}/season/${activeSeason.season_number}`)
          if (seasonData?.episodes && Array.isArray(seasonData.episodes)) {
            seasonData.episodes.forEach(ep => {
              if (ep?.air_date && ep.air_date >= startDate && ep.air_date <= endDate) {
                const dKey = ep.air_date
                if (!dateMap[dKey]) dateMap[dKey] = []
                const epLabel = `S${activeSeason.season_number}E${ep.episode_number}` + (ep.name ? ` · ${ep.name}` : '')
                dateMap[dKey].push({
                  id: `${showType}-${show.id}-${ep.id || ep.air_date}`,
                  tmdbId: show.id,
                  title: show.name,
                  subtitle: epLabel,
                  poster: ep.still_path ? getOriginalTmdbImage(ep.still_path) : (show.poster_path ? getOriginalTmdbImage(show.poster_path) : null),
                  type: showType,
                  date: new Date(dKey)
                })
              }
            })
          }
        } catch (err) {
          console.warn(`[CalendarView] Erreur épisodes show ${showId}:`, err)
        }
      })
    )

    // C. Récupération des épisodes réels pour les séries TV du mois
    const topSeries = (tvDiscover?.results || []).slice(0, 12)
    await Promise.all(
      topSeries.map(async s => {
        try {
          const show = await fetchFromTmdb(`/tv/${s.id}`)
          if (!show) return

          const activeSeason = (show.seasons || []).filter(s => s.season_number > 0).pop()
          if (!activeSeason) return

          const seasonData = await fetchFromTmdb(`/tv/${s.id}/season/${activeSeason.season_number}`)
          if (seasonData?.episodes && Array.isArray(seasonData.episodes)) {
            seasonData.episodes.forEach(ep => {
              if (ep?.air_date && ep.air_date >= startDate && ep.air_date <= endDate) {
                const dKey = ep.air_date
                if (!dateMap[dKey]) dateMap[dKey] = []
                const epLabel = `S${activeSeason.season_number}E${ep.episode_number}` + (ep.name ? ` · ${ep.name}` : '')
                dateMap[dKey].push({
                  id: `tv-${show.id}-${ep.id || ep.air_date}`,
                  tmdbId: show.id,
                  title: show.name,
                  subtitle: epLabel,
                  poster: ep.still_path ? getOriginalTmdbImage(ep.still_path) : (show.poster_path ? getOriginalTmdbImage(show.poster_path) : null),
                  type: 'tv',
                  date: new Date(dKey)
                })
              }
            })
          }
        } catch (err) {
          console.warn(`[CalendarView] Erreur épisodes série ${s.id}:`, err)
        }
      })
    )

    realEventsByDate.value = dateMap
  } catch (err) {
    console.warn('[CalendarView] Erreur lors du chargement des sorties TMDB:', err)
  } finally {
    isLoadingCalendar.value = false
  }
}

function getEventsForDay(date) {
  const key = dateKey(date)
  return realEventsByDate.value[key] || []
}

// Monday-first 6-week (42 day) grid for the displayed month
const monthGridCells = computed(() => {
  const year = viewYear.value
  const month = viewMonth.value
  const firstOfMonth = new Date(year, month, 1)
  const startWeekday = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells = []
  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true })
  }
  let nextDay = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false })
    nextDay++
  }

  return cells.map(c => ({ ...c, events: getEventsForDay(c.date) }))
})

const filteredMonthGridCells = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return monthGridCells.value.map(cell => ({
    ...cell,
    events: cell.events.filter(ev =>
      activeTypes.value.has(ev.type) && (!q || ev.title.toLowerCase().includes(q))
    )
  }))
})

// Agenda view: only "in month" days, each with its events, grouped/sorted chronologically
const agendaDays = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return monthGridCells.value
    .filter(c => c.inMonth)
    .map(c => ({
      date: c.date,
      events: c.events.filter(ev => activeTypes.value.has(ev.type) && (!q || ev.title.toLowerCase().includes(q)))
    }))
    .filter(d => d.events.length > 0)
})

function dayHeaderLabel(date) {
  if (isSameDay(date, today)) return "Aujourd'hui"
  const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' })
  const label = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date.getDate()} ${MONTH_LABELS[date.getMonth()]}`
  return label
}

// Stats en direct relatives aux vraies données TMDB
const statsToday = computed(() => getEventsForDay(today).length)

const statsWeek = computed(() => {
  const startOfWeek = new Date(today)
  const weekday = (today.getDay() + 6) % 7
  startOfWeek.setDate(today.getDate() - weekday)
  let total = 0
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    total += getEventsForDay(d).length
  }
  return total
})

const statsMonth = computed(() =>
  monthGridCells.value.filter(c => c.inMonth).reduce((sum, c) => sum + c.events.length, 0)
)

function prevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
}

function nextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
}

function goToday() {
  viewYear.value = today.getFullYear()
  viewMonth.value = today.getMonth()
}

function toggleType(type) {
  const set = new Set(activeTypes.value)
  if (set.has(type)) {
    if (set.size > 1) set.delete(type)
  } else {
    set.add(type)
  }
  activeTypes.value = set
}

function goBack() {
  router.back()
}

function goToDetail(ev) {
  if (ev?.tmdbId) {
    const targetType = ev.type === 'movie' ? 'movie' : 'tv'
    router.push({
      path: `/detail/${ev.tmdbId}`,
      query: { type: targetType }
    })
  }
}

onMounted(() => {
  loadRealCalendarData(viewYear.value, viewMonth.value)
})

watch([viewYear, viewMonth], ([newYear, newMonth]) => {
  loadRealCalendarData(newYear, newMonth)
})
</script>

<template>
  <div class="min-h-screen bg-black px-4 pb-20 pt-24 md:px-8 text-white">
    <div class="mx-auto max-w-7xl flex flex-col gap-6">

      <!-- HEADER: Back + Icon + Title + Subtitle + Ajouter -->
      <div class="flex flex-wrap items-center gap-4">
        <button
          @click="goBack"
          class="h-10 w-10 rounded-lg border border-white/10 bg-transparent text-white hover:bg-white/10 flex items-center justify-center transition-all cursor-pointer"
        >
          <IconArrowLeft :size="20" />
        </button>

        <div class="h-11 w-11 rounded-xl bg-red-600/15 border border-red-500/30 text-red-500 flex items-center justify-center shrink-0">
          <IconCalendarEvent :size="22" :stroke-width="2" />
        </div>

        <div class="flex flex-col">
          <h1 class="text-xl sm:text-2xl font-black text-white">Calendrier</h1>
          <span class="text-xs sm:text-sm text-white/50 flex items-center gap-2">
            <span v-if="isLoadingCalendar" class="flex items-center gap-1 text-cyan-400">
              <IconLoader2 :size="13" class="animate-spin" />
              Actualisation des sorties en direct...
            </span>
            <span v-else>{{ statsMonth }} sorties programmées ce mois-ci</span>
          </span>
        </div>

        <button
          @click="goToday"
          class="ml-auto flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-all cursor-pointer active:scale-95 shadow-lg shadow-red-600/20"
        >
          <IconCalendarEvent :size="16" :stroke-width="2.5" />
          <span>Aujourd'hui</span>
        </button>
      </div>

      <!-- STATS ROW -->
      <div class="flex flex-wrap items-center gap-6 rounded-2xl border border-white/10 bg-[#0a0d14] px-6 py-4">
        <div class="flex flex-col">
          <span class="text-2xl font-black text-red-500">{{ statsToday }}</span>
          <span class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Aujourd'hui</span>
        </div>
        <div class="w-px h-8 bg-white/10"></div>
        <div class="flex flex-col">
          <span class="text-2xl font-black text-white">{{ statsWeek }}</span>
          <span class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Cette semaine</span>
        </div>
        <div class="w-px h-8 bg-white/10"></div>
        <div class="flex flex-col">
          <span class="text-2xl font-black text-white">{{ statsMonth }}</span>
          <span class="text-[11px] font-semibold uppercase tracking-wider text-white/40">Ce mois-ci</span>
        </div>
      </div>

      <!-- TOOLBAR: Month nav, search, filters, view toggle -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a0d14] px-2 py-1.5">
          <button @click="prevMonth" class="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer">
            <IconChevronLeft :size="18" />
          </button>
          <span class="px-2 text-sm font-bold text-white whitespace-nowrap min-w-[140px] text-center">
            {{ MONTH_LABELS[viewMonth] }} {{ viewYear }}
          </span>
          <button @click="nextMonth" class="p-1 rounded-md hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer">
            <IconChevronRight :size="18" />
          </button>
        </div>

        <div class="relative flex-1 min-w-[180px]">
          <IconSearch :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Rechercher dans le calendrier..."
            class="w-full pl-9 pr-3 py-2 rounded-lg border border-white/10 bg-[#0a0d14] text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
          >
            <IconX :size="14" />
          </button>
        </div>

        <!-- Filter pills toggle -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <button
            v-for="(meta, typeKey) in TYPE_META"
            :key="typeKey"
            @click="toggleType(typeKey)"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border',
              activeTypes.has(typeKey)
                ? meta.pill
                : 'border-white/10 bg-transparent text-white/40 hover:text-white/70'
            ]"
          >
            {{ meta.label }}
          </button>
        </div>

        <!-- View mode toggle -->
        <div class="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0a0d14] p-1 ml-auto">
          <button
            @click="viewMode = 'month'"
            :class="[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer',
              viewMode === 'month' ? 'bg-red-600 text-white' : 'text-white/60 hover:text-white'
            ]"
          >
            <IconLayoutGrid :size="14" />
            <span>Mois</span>
          </button>
          <button
            @click="viewMode = 'agenda'"
            :class="[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer',
              viewMode === 'agenda' ? 'bg-red-600 text-white' : 'text-white/60 hover:text-white'
            ]"
          >
            <IconListDetails :size="14" />
            <span>Agenda</span>
          </button>
        </div>
      </div>

      <!-- AGENDA VIEW -->
      <div v-if="viewMode === 'agenda'" class="flex flex-col gap-8">
        <div v-if="isLoadingCalendar" class="text-center text-white/50 text-sm py-16 flex flex-col items-center gap-3">
          <IconLoader2 :size="28" class="animate-spin text-red-500" />
          <span>Chargement du calendrier en direct depuis TMDB...</span>
        </div>
        <div v-else-if="agendaDays.length === 0" class="text-center text-white/40 text-sm py-16">
          Aucune sortie ne correspond à ta recherche pour ce mois.
        </div>
        <div v-else v-for="day in agendaDays" :key="dateKey(day.date)" class="flex flex-col gap-3">
          <h3
            :class="[
              'text-sm font-black uppercase tracking-wide',
              isSameDay(day.date, today) ? 'text-red-500' : 'text-white/70'
            ]"
          >
            {{ dayHeaderLabel(day.date) }}
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div
              v-for="ev in day.events"
              :key="ev.id"
              @click="goToDetail(ev)"
              class="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#0a0d14] p-3 text-left transition-all duration-200 hover:border-cyan-400/50 hover:bg-white/[0.08] hover:scale-[1.01] cursor-pointer"
            >
              <span :class="['h-10 w-1 shrink-0 rounded-full', TYPE_META[ev.type]?.accent || 'bg-white/40']"></span>
              <img
                v-if="ev.poster"
                :src="ev.poster"
                alt=""
                class="shrink-0 rounded-md bg-white/[0.06] object-cover h-16 w-11 shadow-md"
              />
              <div v-else class="shrink-0 rounded-md bg-white/[0.06] h-16 w-11"></div>
              <div class="min-w-0 flex-1">
                <span class="block truncate font-bold text-white text-sm hover:text-cyan-300 transition-colors">{{ ev.title }}</span>
                <span class="block truncate text-xs text-white/50">{{ ev.subtitle }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- MONTH GRID VIEW -->
      <div v-else class="rounded-2xl border border-white/10 overflow-hidden bg-black">
        <div class="grid grid-cols-7 border-b border-white/10">
          <div
            v-for="lbl in DAY_LABELS"
            :key="lbl"
            class="px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white/40"
          >
            {{ lbl }}
          </div>
        </div>
        <div class="grid grid-cols-7">
          <div
            v-for="(cell, idx) in filteredMonthGridCells"
            :key="idx"
            :class="[
              'group relative min-h-[104px] border-b border-r border-white/[0.06] p-2 text-left align-top transition-colors hover:bg-white/[0.04]',
              (idx + 1) % 7 === 0 ? 'border-r-0' : ''
            ]"
          >
            <span
              :class="[
                'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                isSameDay(cell.date, today) ? 'bg-red-600 text-white' : (cell.inMonth ? 'text-white/70' : 'text-white/25')
              ]"
            >
              {{ cell.date.getDate() }}
            </span>
            <div class="mt-1.5 space-y-1">
              <div
                v-for="ev in cell.events.slice(0, 3)"
                :key="ev.id"
                @click="goToDetail(ev)"
                :title="`${ev.title} — ${ev.subtitle}`"
                :class="['truncate rounded-md px-1.5 py-1 text-[11px] font-medium cursor-pointer transition-all hover:scale-105', TYPE_META[ev.type]?.pill || 'bg-white/10 text-white']"
              >
                {{ ev.title }}
              </div>
              <div v-if="cell.events.length > 3" class="px-1.5 text-[11px] font-medium text-white/40">
                +{{ cell.events.length - 3 }} autres
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
