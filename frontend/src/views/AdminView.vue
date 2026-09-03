<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconSearch,
  IconLink,
  IconCheck,
  IconLoader2,
  IconSparkles,
  IconArrowLeft,
  IconDatabaseImport,
  IconChartBar,
  IconCloudUpload,
  IconPencilPlus,
  IconMovie,
  IconDeviceTv,
  IconUsers,
  IconHeart,
  IconPlus
} from '@tabler/icons-vue'
import {
  searchTmdbCandidates,
  getTmdbMetadata,
  getAdminStats,
  ensureContentExists,
  addSingleVideo
} from '../services/api/adminImporter'
import { useAuth, ADMIN_EMAILS } from '../composables/useAuth'

const router = useRouter()

// ============ TABS ============
const activeTab = ref('stats') // 'stats' | 'import-api' | 'import-manual'
const TABS = [
  { id: 'stats', label: 'Statistiques', icon: IconChartBar },
  { id: 'import-api', label: 'Importer (API)', icon: IconCloudUpload },
  { id: 'import-manual', label: 'Ajout manuel', icon: IconPencilPlus }
]

// ============ STATS TAB ============
const adminStats = ref(null)
const isLoadingStats = ref(true)

async function loadAdminStats() {
  isLoadingStats.value = true
  try {
    adminStats.value = await getAdminStats()
  } catch (e) {
    console.error('[AdminView] getAdminStats error:', e)
  } finally {
    isLoadingStats.value = false
  }
}

const statsTiles = computed(() => {
  if (!adminStats.value) return []
  return [
    { icon: IconMovie, value: adminStats.value.totalMovies, label: 'Films' },
    { icon: IconDeviceTv, value: adminStats.value.totalSeries, label: 'Séries' },
    { icon: IconDatabaseImport, value: adminStats.value.totalVideos, label: 'Vidéos importées' },
    { icon: IconUsers, value: adminStats.value.totalUsers, label: 'Utilisateurs' },
    { icon: IconHeart, value: adminStats.value.totalWatchlist, label: 'Dans une watchlist' }
  ]
})

onMounted(loadAdminStats)

// ============ MANUAL ADD TAB ============
const manualQuery = ref('')
const isSearchingManual = ref(false)
const manualResults = ref([])
const manualSelected = ref(null)
const manualContentId = ref(null)

const manualVideoUrl = ref('')
const manualLang = ref('vf')
const manualSeason = ref(1)
const manualEpisode = ref(1)
const isAddingManual = ref(false)
const manualError = ref('')
const manualAddedLog = ref([]) // recent successful adds, newest first

const manualIsMovie = computed(() => {
  if (!manualSelected.value) return true
  return manualSelected.value.mediaType === 'movie' || manualSelected.value.category === 'Films'
})

async function handleSearchManual() {
  if (!manualQuery.value.trim()) return
  isSearchingManual.value = true
  try {
    manualResults.value = await searchTmdbCandidates(manualQuery.value)
  } catch (e) {
    console.error('TMDB Search Error:', e)
  } finally {
    isSearchingManual.value = false
  }
}

// Live search as you type, debounced — no need to press Enter
let manualSearchDebounce = null
watch(manualQuery, (q) => {
  if (manualSearchDebounce) clearTimeout(manualSearchDebounce)
  if (!q.trim()) {
    manualResults.value = []
    return
  }
  manualSearchDebounce = setTimeout(handleSearchManual, 350)
})

async function selectManualMedia(item) {
  manualError.value = ''
  manualAddedLog.value = []
  manualContentId.value = null
  try {
    const details = await getTmdbMetadata(item.id, item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie'))
    manualSelected.value = details || item
  } catch (e) {
    manualSelected.value = item
  }
  try {
    manualContentId.value = await ensureContentExists(manualSelected.value)
  } catch (e) {
    manualError.value = e.message
  }
}

async function submitManualMovie() {
  if (!manualContentId.value) return
  isAddingManual.value = true
  manualError.value = ''
  try {
    await addSingleVideo(manualContentId.value, {
      seasonNumber: 0,
      episodeNumber: 0,
      videoUrl: manualVideoUrl.value,
      language: manualLang.value
    })
    manualAddedLog.value.unshift({ label: 'Film', lang: manualLang.value, url: manualVideoUrl.value })
    manualVideoUrl.value = ''
  } catch (e) {
    manualError.value = e.message
  } finally {
    isAddingManual.value = false
  }
}

async function submitManualEpisode() {
  if (!manualContentId.value) return
  isAddingManual.value = true
  manualError.value = ''
  try {
    await addSingleVideo(manualContentId.value, {
      seasonNumber: Number(manualSeason.value) || 1,
      episodeNumber: Number(manualEpisode.value) || 1,
      videoUrl: manualVideoUrl.value,
      language: manualLang.value
    })
    manualAddedLog.value.unshift({
      label: `S${manualSeason.value}E${manualEpisode.value}`,
      lang: manualLang.value,
      url: manualVideoUrl.value
    })
    manualVideoUrl.value = ''
    manualEpisode.value = Number(manualEpisode.value) + 1
  } catch (e) {
    manualError.value = e.message
  } finally {
    isAddingManual.value = false
  }
}

function resetManualSelection() {
  manualSelected.value = null
  manualContentId.value = null
  manualResults.value = []
  manualQuery.value = ''
  manualAddedLog.value = []
  manualError.value = ''
}

// ============ IMPORTER (API) TAB ============
// Just search TMDB, pick a result, click "Importer" — creates the catalog
// entry (metadata only). Video sources are then added via "Ajout manuel".
const apiQuery = ref('')
const isSearchingApi = ref(false)
const apiResults = ref([])
const apiSelected = ref(null)
const isImportingApi = ref(false)
const apiImportSuccess = ref(null)
const apiImportError = ref('')

async function handleSearchApi() {
  if (!apiQuery.value.trim()) return
  isSearchingApi.value = true
  try {
    apiResults.value = await searchTmdbCandidates(apiQuery.value)
  } catch (e) {
    console.error('TMDB Search Error:', e)
  } finally {
    isSearchingApi.value = false
  }
}

// Live search as you type, debounced — no need to press Enter
let apiSearchDebounce = null
watch(apiQuery, (q) => {
  if (apiSearchDebounce) clearTimeout(apiSearchDebounce)
  if (!q.trim()) {
    apiResults.value = []
    return
  }
  apiSearchDebounce = setTimeout(handleSearchApi, 350)
})

async function selectApiMedia(item) {
  apiImportSuccess.value = null
  apiImportError.value = ''
  try {
    const details = await getTmdbMetadata(item.id, item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie'))
    apiSelected.value = details || item
  } catch (e) {
    apiSelected.value = item
  }
}

async function submitApiImport() {
  if (!apiSelected.value) return
  isImportingApi.value = true
  apiImportError.value = ''
  apiImportSuccess.value = null
  try {
    const contentId = await ensureContentExists(apiSelected.value)
    apiImportSuccess.value = { contentId, title: apiSelected.value.title }
  } catch (e) {
    apiImportError.value = e.message || 'Erreur lors de l\'importation vers Supabase.'
  } finally {
    isImportingApi.value = false
  }
}

function resetApiSelection() {
  apiSelected.value = null
  apiResults.value = []
  apiQuery.value = ''
  apiImportSuccess.value = null
  apiImportError.value = ''
}

const { isAdmin, userEmail } = useAuth()

onMounted(() => {
  if (!isAdmin.value && !ADMIN_EMAILS.includes((userEmail.value || '').toLowerCase())) {
    const raw = localStorage.getItem('kawu_user_session')
    let hasAdmin = false
    if (raw) {
      try {
        const d = JSON.parse(raw)
        const role = (d.role || d.profile?.role || d.user?.role || '').toLowerCase()
        const email = (d.email || d.profile?.email || d.user?.email || '').toLowerCase()
        hasAdmin = role === 'admin' || ADMIN_EMAILS.includes(email)
      } catch (_) {}
    }
    if (!hasAdmin) {
      router.replace('/home')
      return
    }
  }
  loadAdminStats()
})
</script>

<template>
  <div class="relative w-full min-h-screen bg-[#000000] text-white pb-28 pt-20 px-6 sm:px-12 lg:px-16 flex flex-col gap-8 max-w-6xl mx-auto overflow-x-hidden">

    <!-- HEADER -->
    <div class="flex items-center justify-between border-b border-white/10 pb-4">
      <div class="flex items-center gap-3">
        <button @click="router.back()" class="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all cursor-pointer">
          <IconArrowLeft :size="20" />
        </button>
        <div class="flex flex-col">
          <h1 class="text-xl sm:text-2xl font-black text-cyan-400 flex items-center gap-2">
            <IconDatabaseImport :size="24" />
            <span>Panneau Admin</span>
          </h1>
          <p class="text-xs text-white/50">Statistiques, import guidé (TMDB + Anime-Sama) et ajout manuel de sources vidéo.</p>
        </div>
      </div>
    </div>

    <div class="flex flex-col md:flex-row gap-8">

      <!-- SIDEBAR TABS -->
      <nav class="flex md:flex-col gap-1 md:w-52 shrink-0 overflow-x-auto md:overflow-visible">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="[
            'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors cursor-pointer whitespace-nowrap',
            activeTab === tab.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
          ]"
        >
          <component :is="tab.icon" :size="18" :stroke-width="1.75" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>

      <div class="flex-1 min-w-0">

    <!-- ============ STATISTIQUES TAB ============ -->
    <div v-if="activeTab === 'stats'" class="flex flex-col gap-5">
      <h2 class="text-base font-black text-white">Vue d'ensemble du catalogue</h2>
      <div v-if="isLoadingStats" class="text-xs text-white/40">Chargement des statistiques...</div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          v-for="tile in statsTiles"
          :key="tile.label"
          class="flex flex-col items-center gap-2 rounded-2xl bg-white/[0.03] border border-white/10 py-6 px-2"
        >
          <component :is="tile.icon" :size="22" :stroke-width="1.75" class="text-cyan-400" />
          <span class="text-2xl font-black text-white">{{ tile.value }}</span>
          <span class="text-[10px] font-semibold uppercase tracking-wider text-white/40 text-center">{{ tile.label }}</span>
        </div>
      </div>
    </div>

    <!-- ============ AJOUT MANUEL TAB ============ -->
    <div v-else-if="activeTab === 'import-manual'" class="flex flex-col gap-5">
      <h2 class="text-base font-black text-white">Ajout manuel de vidéo</h2>
      <p class="text-xs text-white/50 -mt-3">Cherche le titre sur TMDB, puis colle l'URL de la vidéo. C'est tout.</p>

      <!-- Title search -->
      <div v-if="!manualSelected" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <input
              v-model="manualQuery"
              @keyup.enter="handleSearchManual"
              type="text"
              placeholder="Ex: Spider-Man, Breaking Bad..."
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-all"
            />
            <IconSearch :size="16" class="absolute left-3.5 top-3 text-white/40" />
          </div>
          <button
            @click="handleSearchManual"
            :disabled="isSearchingManual"
            class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <IconLoader2 v-if="isSearchingManual" :size="16" class="animate-spin" />
            <span v-else>Rechercher</span>
          </button>
        </div>

        <div v-if="manualResults.length > 0" class="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          <div
            v-for="item in manualResults"
            :key="item.id"
            @click="selectManualMedia(item)"
            class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/60 hover:bg-white/[0.08] cursor-pointer transition-all p-2"
          >
            <img :src="item.poster" :alt="item.title" class="w-10 aspect-[2/3] object-cover rounded-lg shrink-0" />
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-bold text-white truncate">{{ item.title }}</span>
              <span class="text-[10px] text-white/50">{{ item.year }} • {{ item.category }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected title + simple add form -->
      <div v-else class="flex flex-col gap-5">
        <div class="flex items-center gap-4 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
          <img :src="manualSelected.poster" class="w-16 aspect-[2/3] object-cover rounded-xl shadow-md shrink-0" />
          <div class="flex flex-col gap-0.5 text-xs flex-1 min-w-0">
            <span class="font-black text-cyan-300 text-sm truncate">{{ manualSelected.title }}</span>
            <span class="text-white/50">{{ manualIsMovie ? 'Film' : 'Série' }} • ID TMDB {{ manualSelected.id }}</span>
          </div>
          <button
            @click="resetManualSelection"
            class="text-xs font-bold text-white/50 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            Changer
          </button>
        </div>

        <div v-if="manualError" class="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold">
          ⚠️ {{ manualError }}
        </div>

        <!-- MOVIE: single URL -->
        <div v-if="manualIsMovie" class="flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/10">
          <label class="text-xs text-white/60 font-semibold">URL de la vidéo :</label>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <input
                v-model="manualVideoUrl"
                @keyup.enter="submitManualMovie"
                type="text"
                placeholder="https://..."
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-all font-mono select-text"
              />
              <IconLink :size="16" class="absolute left-3.5 top-3 text-white/40" />
            </div>
            <select
              v-model="manualLang"
              class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="vf" class="bg-slate-900">VF</option>
              <option value="vostfr" class="bg-slate-900">VOSTFR</option>
            </select>
            <button
              @click="submitManualMovie"
              :disabled="isAddingManual || !manualVideoUrl.trim()"
              class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <IconLoader2 v-if="isAddingManual" :size="16" class="animate-spin" />
              <IconPlus v-else :size="16" />
              <span>Ajouter</span>
            </button>
          </div>
        </div>

        <!-- SERIES: season/episode + URL, add one at a time -->
        <div v-else class="flex flex-col gap-3 p-5 rounded-2xl bg-white/[0.02] border border-white/10">
          <label class="text-xs text-white/60 font-semibold">Ajouter un épisode :</label>
          <div class="flex items-center gap-2 flex-wrap">
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-white/40 font-bold">S</span>
              <input v-model.number="manualSeason" type="number" min="1" class="w-14 px-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-cyan-400 text-center" />
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] text-white/40 font-bold">É</span>
              <input v-model.number="manualEpisode" type="number" min="1" class="w-14 px-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-cyan-400 text-center" />
            </div>
            <div class="relative flex-1 min-w-[160px]">
              <input
                v-model="manualVideoUrl"
                @keyup.enter="submitManualEpisode"
                type="text"
                placeholder="https://..."
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-all font-mono select-text"
              />
              <IconLink :size="16" class="absolute left-3.5 top-3 text-white/40" />
            </div>
            <select
              v-model="manualLang"
              class="px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white outline-none focus:border-cyan-400 cursor-pointer"
            >
              <option value="vf" class="bg-slate-900">VF</option>
              <option value="vostfr" class="bg-slate-900">VOSTFR</option>
            </select>
            <button
              @click="submitManualEpisode"
              :disabled="isAddingManual || !manualVideoUrl.trim()"
              class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <IconLoader2 v-if="isAddingManual" :size="16" class="animate-spin" />
              <IconPlus v-else :size="16" />
              <span>Ajouter</span>
            </button>
          </div>
          <p class="text-[10px] text-white/30">Le numéro d'épisode s'incrémente automatiquement après chaque ajout.</p>
        </div>

        <!-- Recently added log -->
        <div v-if="manualAddedLog.length > 0" class="flex flex-col gap-1.5">
          <span class="text-xs font-bold text-white/60">Ajoutés cette session :</span>
          <div class="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
            <div
              v-for="(row, idx) in manualAddedLog"
              :key="idx"
              class="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs"
            >
              <IconCheck :size="13" class="text-emerald-400 shrink-0" />
              <span class="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold shrink-0">{{ row.label }}</span>
              <span class="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold uppercase shrink-0">{{ row.lang }}</span>
              <span class="text-white/50 font-mono text-[10px] truncate">{{ row.url }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ IMPORTER (API) TAB ============ -->
    <div v-else-if="activeTab === 'import-api'" class="flex flex-col gap-5 max-w-xl">
      <h2 class="text-base font-black text-white">Importer depuis TMDB</h2>
      <p class="text-xs text-white/50 -mt-3">Cherche un titre, sélectionne-le, clique sur Importer. C'est tout.</p>

      <!-- SUCCESS NOTIFICATION -->
      <div v-if="apiImportSuccess" class="p-5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between shadow-xl">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
            <IconCheck :size="20" :stroke-width="3" />
          </div>
          <div class="flex flex-col">
            <span class="font-bold text-sm">« {{ apiImportSuccess.title }} » importé !</span>
            <span class="text-xs text-emerald-200">Ajoute maintenant ses sources vidéo dans l'onglet Ajout manuel.</span>
          </div>
        </div>
        <button @click="router.push(`/detail/${apiImportSuccess.contentId}`)" class="px-4 py-2 bg-emerald-400 text-slate-950 font-black text-xs rounded-xl hover:bg-emerald-300 transition-all cursor-pointer shrink-0">
          Voir la fiche
        </button>
      </div>

      <!-- ERROR NOTIFICATION -->
      <div v-if="apiImportError" class="p-4 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold shadow-xl">
        ⚠️ {{ apiImportError }}
      </div>

      <!-- Search Bar -->
      <div v-if="!apiSelected" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <input
              v-model="apiQuery"
              @keyup.enter="handleSearchApi"
              type="text"
              placeholder="Ex: Spider-Man, Breaking Bad..."
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-all"
            />
            <IconSearch :size="16" class="absolute left-3.5 top-3 text-white/40" />
          </div>
          <button
            @click="handleSearchApi"
            :disabled="isSearchingApi"
            class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <IconLoader2 v-if="isSearchingApi" :size="16" class="animate-spin" />
            <span v-else>Rechercher</span>
          </button>
        </div>

        <div v-if="apiResults.length > 0" class="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
          <div
            v-for="item in apiResults"
            :key="item.id"
            @click="selectApiMedia(item)"
            class="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/60 hover:bg-white/[0.08] cursor-pointer transition-all p-2"
          >
            <img :src="item.poster" :alt="item.title" class="w-10 aspect-[2/3] object-cover rounded-lg shrink-0" />
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-bold text-white truncate">{{ item.title }}</span>
              <span class="text-[10px] text-white/50">{{ item.year }} • {{ item.category }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Selected Item + Importer button -->
      <div v-else class="flex flex-col gap-4">
        <div class="flex items-center gap-4 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
          <img :src="apiSelected.poster" class="w-16 aspect-[2/3] object-cover rounded-xl shadow-md shrink-0" />
          <div class="flex flex-col gap-0.5 text-xs flex-1 min-w-0">
            <span class="font-black text-cyan-300 text-sm truncate">{{ apiSelected.title }}</span>
            <span class="text-white/50">ID TMDB {{ apiSelected.id }} • {{ apiSelected.category || apiSelected.mediaType }}</span>
          </div>
          <button
            @click="resetApiSelection"
            class="text-xs font-bold text-white/50 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            Changer
          </button>
        </div>

        <button
          @click="submitApiImport"
          :disabled="isImportingApi"
          class="w-full py-3.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
        >
          <IconLoader2 v-if="isImportingApi" :size="18" class="animate-spin" />
          <IconSparkles v-else :size="18" />
          <span>Importer</span>
        </button>
      </div>
    </div>

      </div>

    </div>

  </div>
</template>

