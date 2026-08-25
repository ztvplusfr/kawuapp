<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconSearch,
  IconLink,
  IconCheck,
  IconLoader2,
  IconSparkles,
  IconArrowLeft,
  IconDatabaseImport,
  IconTrash,
  IconFolder,
  IconLanguage
} from '@tabler/icons-vue'
import {
  searchTmdbCandidates,
  getTmdbMetadata,
  discoverCatalogSeasons,
  fetchEpisodesForSeasonAndLanguage,
  importToSupabase
} from '../services/api/adminImporter'

const router = useRouter()

// Form & Search States
const searchQuery = ref('')
const isSearchingTmdb = ref(false)
const tmdbResults = ref([])
const selectedTmdbItem = ref(null)

// Step 2: Catalog Scraper & Discovery States
const catalogUrl = ref('')
const isDiscoveringSeasons = ref(false)
const discoveredSeasons = ref([]) // Array of { folderKey, name, seasonNumber, languages: ['VOSTFR', 'VF'] }
const discoveredHosters = ref([]) // Array of { key, name, isDefaultSelected }
const selectedSeasonKeys = ref([])
const selectedLanguages = ref({}) // Map of folderKey -> Array of selected languages e.g. { saison1: ['VOSTFR', 'VF'] }
const selectedServerKeys = ref([]) // Array of selected server keys e.g. ['sibnet', 'sendvid', 'ansembed']

// Step 3: Episodes State
const isLoadingEpisodes = ref(false)
const scrapedEpisodes = ref([])

// Import Status
const isImporting = ref(false)
const importSuccess = ref(null)
const importError = ref('')

async function handleSearchTmdb() {
  if (!searchQuery.value.trim()) return
  isSearchingTmdb.value = true
  try {
    tmdbResults.value = await searchTmdbCandidates(searchQuery.value)
  } catch (e) {
    console.error('TMDB Search Error:', e)
  } finally {
    isSearchingTmdb.value = false
  }
}

async function selectTmdbMedia(item) {
  try {
    const details = await getTmdbMetadata(item.id, item.tmdbType || (item.category === 'Séries' || item.category === 'Animés' ? 'tv' : 'movie'))
    selectedTmdbItem.value = details || item
  } catch (e) {
    selectedTmdbItem.value = item
  }
}

async function handleDiscoverSeasons() {
  if (!catalogUrl.value.trim()) return
  isDiscoveringSeasons.value = true
  importError.value = ''
  discoveredSeasons.value = []
  discoveredHosters.value = []
  selectedSeasonKeys.value = []
  selectedLanguages.value = {}
  selectedServerKeys.value = []
  scrapedEpisodes.value = []

  try {
    const res = await discoverCatalogSeasons(catalogUrl.value)
    discoveredSeasons.value = res.seasons || []
    discoveredHosters.value = res.hosters || []

    // Auto-select all non-lplayer server hosters by default!
    selectedServerKeys.value = (res.hosters || [])
      .filter(h => h.isDefaultSelected)
      .map(h => h.key)

    // Auto-select all seasons and available languages by default
    (res.seasons || []).forEach(s => {
      selectedSeasonKeys.value.push(s.folderKey)
      selectedLanguages.value[s.folderKey] = [...s.languages]
    })

    // Automatically load episodes preview
    await loadEpisodesForSelectedSeasons()
  } catch (e) {
    importError.value = `Erreur d'exploration : ${e.message}`
  } finally {
    isDiscoveringSeasons.value = false
  }
}

function toggleSeasonSelection(folderKey) {
  const idx = selectedSeasonKeys.value.indexOf(folderKey)
  if (idx > -1) {
    selectedSeasonKeys.value.splice(idx, 1)
  } else {
    selectedSeasonKeys.value.push(folderKey)
  }
  loadEpisodesForSelectedSeasons()
}

function toggleLanguageSelection(folderKey, lang) {
  if (!selectedLanguages.value[folderKey]) {
    selectedLanguages.value[folderKey] = []
  }
  const list = selectedLanguages.value[folderKey]
  const idx = list.indexOf(lang)
  if (idx > -1) {
    list.splice(idx, 1)
  } else {
    list.push(lang)
  }
  loadEpisodesForSelectedSeasons()
}

function toggleServerKeySelection(key) {
  const idx = selectedServerKeys.value.indexOf(key)
  if (idx > -1) {
    selectedServerKeys.value.splice(idx, 1)
  } else {
    selectedServerKeys.value.push(key)
  }
  loadEpisodesForSelectedSeasons()
}

async function loadEpisodesForSelectedSeasons() {
  if (!catalogUrl.value || selectedSeasonKeys.value.length === 0 || selectedServerKeys.value.length === 0) {
    scrapedEpisodes.value = []
    return
  }

  isLoadingEpisodes.value = true
  let allEps = []

  try {
    for (const folderKey of selectedSeasonKeys.value) {
      const seasonObj = discoveredSeasons.value.find(s => s.folderKey === folderKey)
      const seasonNumber = seasonObj ? seasonObj.seasonNumber : 1
      const langs = selectedLanguages.value[folderKey] || ['VOSTFR']

      for (const lang of langs) {
        const eps = await fetchEpisodesForSeasonAndLanguage(
          catalogUrl.value,
          folderKey,
          seasonNumber,
          lang,
          selectedServerKeys.value
        )
        allEps = [...allEps, ...eps]
      }
    }
    scrapedEpisodes.value = allEps
  } catch (e) {
    console.error('Error loading episodes:', e)
  } finally {
    isLoadingEpisodes.value = false
  }
}

function removeEpisode(index) {
  scrapedEpisodes.value.splice(index, 1)
}

async function executeBatchImport() {
  if (!selectedTmdbItem.value) {
    importError.value = 'Veuillez sélectionner un titre TMDB.'
    return
  }
  if (scrapedEpisodes.value.length === 0) {
    importError.value = 'Aucun épisode à importer.'
    return
  }

  isImporting.value = true
  importError.value = ''
  importSuccess.value = null

  try {
    const res = await importToSupabase(selectedTmdbItem.value, scrapedEpisodes.value)
    importSuccess.value = res
  } catch (e) {
    importError.value = e.message || 'Erreur lors de l\'importation vers Supabase.'
  } finally {
    isImporting.value = false
  }
}
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
            <span>Panneau Admin — Importation Guidée (TMDB + Anime-Sama)</span>
          </h1>
          <p class="text-xs text-white/50">Recherchez la fiche TMDB, explorez les Saisons & Langues (VOSTFR/VF) et importez tout sur Supabase.</p>
        </div>
      </div>
    </div>

    <!-- SUCCESS NOTIFICATION -->
    <div v-if="importSuccess" class="p-5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-between shadow-xl">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center font-black">
          <IconCheck :size="20" :stroke-width="3" />
        </div>
        <div class="flex flex-col">
          <span class="font-bold text-sm">Importation réussie avec succès !</span>
          <span class="text-xs text-emerald-200">
            Contenu créé (ID: {{ importSuccess.contentId }}) — {{ importSuccess.episodesCount }} épisodes insérés dans Supabase.
          </span>
        </div>
      </div>
      <button @click="router.push(`/detail/${importSuccess.contentId}`)" class="px-4 py-2 bg-emerald-400 text-slate-950 font-black text-xs rounded-xl hover:bg-emerald-300 transition-all cursor-pointer">
        Voir la fiche
      </button>
    </div>

    <!-- ERROR NOTIFICATION -->
    <div v-if="importError" class="p-4 rounded-2xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold shadow-xl">
      ⚠️ {{ importError }}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      <!-- STEP 1: TMDB SEARCH & METADATA -->
      <div class="flex flex-col gap-5 p-6 rounded-3xl bg-white/[0.02] border border-white/10 shadow-xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 class="text-base font-black text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center">1</span>
            <span>1. Recherche & Fiche TMDB</span>
          </h2>
          <span v-if="selectedTmdbItem" class="text-xs text-emerald-400 font-bold flex items-center gap-1">
            <IconCheck :size="14" /> {{ selectedTmdbItem.title }}
          </span>
        </div>

        <!-- Search Bar -->
        <div class="flex items-center gap-2">
          <div class="relative flex-1">
            <input
              v-model="searchQuery"
              @keyup.enter="handleSearchTmdb"
              type="text"
              placeholder="Ex: Black Torch, Solo Leveling, Naruto..."
              class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-all"
            />
            <IconSearch :size="16" class="absolute left-3.5 top-3 text-white/40" />
          </div>
          <button
            @click="handleSearchTmdb"
            :disabled="isSearchingTmdb"
            class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <IconLoader2 v-if="isSearchingTmdb" :size="16" class="animate-spin" />
            <span v-else>Rechercher</span>
          </button>
        </div>

        <!-- TMDB Search Results Candidates -->
        <div v-if="tmdbResults.length > 0" class="grid grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
          <div
            v-for="item in tmdbResults"
            :key="item.id"
            @click="selectTmdbMedia(item)"
            :class="[
              'relative rounded-xl overflow-hidden bg-white/5 border cursor-pointer transition-all p-2 flex flex-col gap-1.5',
              selectedTmdbItem?.id === item.id ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10 hover:border-white/30'
            ]"
          >
            <img :src="item.poster" :alt="item.title" class="w-full aspect-[2/3] object-cover rounded-lg" />
            <span class="text-[11px] font-bold text-white line-clamp-1">{{ item.title }}</span>
            <span class="text-[9px] text-white/50">{{ item.year }} • {{ item.category }}</span>
          </div>
        </div>

        <!-- Selected Item Preview Card -->
        <div v-if="selectedTmdbItem" class="flex gap-4 p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
          <img :src="selectedTmdbItem.poster" class="w-20 aspect-[2/3] object-cover rounded-xl shadow-md shrink-0" />
          <div class="flex flex-col gap-1 text-xs">
            <span class="font-black text-cyan-300 text-sm">{{ selectedTmdbItem.title }}</span>
            <span class="text-white/60">ID TMDB : <strong>{{ selectedTmdbItem.id }}</strong> • Type : <strong>{{ selectedTmdbItem.mediaType || 'tv' }}</strong></span>
            <p class="text-[11px] text-white/50 line-clamp-3 mt-1">{{ selectedTmdbItem.overview || selectedTmdbItem.description }}</p>
          </div>
        </div>
      </div>

      <!-- STEP 2 & 3: CATALOG EXPLORER, SEASONS & LANGUAGES -->
      <div class="flex flex-col gap-5 p-6 rounded-3xl bg-white/[0.02] border border-white/10 shadow-xl">
        
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 class="text-base font-black text-white flex items-center gap-2">
            <span class="w-6 h-6 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center">2</span>
            <span>2. Catalogue, Saisons & Langues</span>
          </h2>
          <span v-if="scrapedEpisodes.length > 0" class="text-xs text-cyan-300 font-mono font-bold">
            {{ scrapedEpisodes.length }} épisodes prêts
          </span>
        </div>

        <!-- Catalog URL Input -->
        <div class="flex flex-col gap-1.5">
          <label class="text-xs text-white/60 font-semibold">URL du catalogue Anime-Sama :</label>
          <div class="flex items-center gap-2">
            <div class="relative flex-1" style="--wails-draggable: no-drag; -webkit-app-region: no-drag;">
              <input
                v-model="catalogUrl"
                @keyup.enter="handleDiscoverSeasons"
                type="text"
                placeholder="https://anime-sama.to/catalogue/solo-leveling/"
                class="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 outline-none focus:border-cyan-400 transition-all font-mono select-text"
                style="--wails-draggable: no-drag; -webkit-app-region: no-drag;"
              />
              <IconLink :size="16" class="absolute left-3.5 top-3 text-white/40" />
            </div>
            <button
              @click="handleDiscoverSeasons"
              :disabled="isDiscoveringSeasons"
              class="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <IconLoader2 v-if="isDiscoveringSeasons" :size="16" class="animate-spin" />
              <span v-else>Explorer</span>
            </button>
          </div>
        </div>

        <!-- Discovered Seasons & Languages Selectors -->
        <div v-if="discoveredSeasons.length > 0" class="flex flex-col gap-3">
          <span class="text-xs font-bold text-white/80 flex items-center gap-1.5">
            <IconFolder :size="15" class="text-cyan-400" />
            <span>Saisons & Langues Détectées :</span>
          </span>

          <div class="flex flex-col gap-2.5 max-h-52 overflow-y-auto pr-1">
            <div
              v-for="s in discoveredSeasons"
              :key="s.folderKey"
              class="p-3 rounded-2xl bg-white/5 border border-white/10 flex flex-col gap-2"
            >
              <div class="flex items-center justify-between">
                <button
                  @click="toggleSeasonSelection(s.folderKey)"
                  class="flex items-center gap-2 text-xs font-bold text-white cursor-pointer"
                >
                  <div
                    :class="[
                      'w-4 h-4 rounded border flex items-center justify-center transition-all',
                      selectedSeasonKeys.includes(s.folderKey) ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-white/30'
                    ]"
                  >
                    <IconCheck v-if="selectedSeasonKeys.includes(s.folderKey)" :size="12" :stroke-width="3" />
                  </div>
                  <span>{{ s.name }}</span>
                </button>
              </div>

              <!-- Available Languages Pills (VOSTFR / VF) -->
              <div v-if="selectedSeasonKeys.includes(s.folderKey)" class="flex items-center gap-2 pl-6">
                <span class="text-[10px] text-white/50 flex items-center gap-1">
                  <IconLanguage :size="13" /> Langues :
                </span>
                <button
                  v-for="lang in ['VOSTFR', 'VF']"
                  :key="lang"
                  @click="toggleLanguageSelection(s.folderKey, lang)"
                  :class="[
                    'px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer border',
                    (selectedLanguages[s.folderKey] || []).includes(lang)
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  ]"
                >
                  {{ lang }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Discovered Server Hosters Filter (Exclude Lplayer by default) -->
        <div v-if="discoveredHosters.length > 0" class="flex flex-col gap-2 border-t border-white/10 pt-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white/80">Serveurs / Lecteurs à Importer :</span>
            <span class="text-[10px] text-amber-400 font-semibold">Lplayer (Embed4me) exclu par défaut</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="h in discoveredHosters"
              :key="h.key"
              @click="toggleServerKeySelection(h.key)"
              :class="[
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5',
                selectedServerKeys.includes(h.key)
                  ? (h.key === 'lplayer' ? 'bg-red-500/20 border-red-400 text-red-300' : 'bg-cyan-500/20 border-cyan-400 text-cyan-300')
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
              ]"
            >
              <IconCheck v-if="selectedServerKeys.includes(h.key)" :size="13" />
              <span>{{ h.name }}</span>
            </button>
          </div>
        </div>

        <!-- Scraped Episodes Preview List -->
        <div v-if="scrapedEpisodes.length > 0" class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-white/80">Épisodes prêts à l'import ({{ scrapedEpisodes.length }}) :</span>
            <IconLoader2 v-if="isLoadingEpisodes" :size="14" class="animate-spin text-cyan-400" />
          </div>
          <div class="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            <div
              v-for="(ep, idx) in scrapedEpisodes"
              :key="idx"
              class="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5 text-xs"
            >
              <div class="flex items-center gap-2 overflow-hidden">
                <span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono text-[10px] font-bold shrink-0">
                  S{{ ep.seasonNumber }} E{{ ep.episodeNumber }}
                </span>
                <span class="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold uppercase shrink-0">{{ ep.language }}</span>
                <span v-if="ep.sources && ep.sources.length > 0" class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold shrink-0">
                  {{ ep.sources.length }} Serveurs
                </span>
                <span class="text-white/60 font-mono text-[10px] truncate max-w-xs">{{ ep.videoUrl }}</span>
              </div>
              <button @click="removeEpisode(idx)" class="text-white/40 hover:text-red-400 p-1 cursor-pointer shrink-0">
                <IconTrash :size="14" />
              </button>
            </div>
          </div>
        </div>

        <!-- EXECUTE BATCH IMPORT BUTTON -->
        <div class="border-t border-white/10 pt-4 mt-auto">
          <button
            @click="executeBatchImport"
            :disabled="isImporting || !selectedTmdbItem || scrapedEpisodes.length === 0"
            class="w-full py-3.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-black text-sm rounded-2xl shadow-xl transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
          >
            <IconLoader2 v-if="isImporting" :size="18" class="animate-spin" />
            <IconSparkles v-else :size="18" />
            <span>🚀 IMPORTER SUR SUPABASE ({{ scrapedEpisodes.length }} ÉPISODES)</span>
          </button>
        </div>

      </div>

    </div>

  </div>
</template>

