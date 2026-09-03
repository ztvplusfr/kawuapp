<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import Autoplay from 'embla-carousel-autoplay'
import { useCatalog } from '../composables/useCatalog'
import Skeleton from './ui/skeleton/Skeleton.vue'

// Tabler Stroke Icons
import {
  IconPlayerPlay,
  IconInfoCircle,
  IconVolume,
  IconVolumeOff,
  IconChevronLeft,
  IconChevronRight
} from '@tabler/icons-vue'

// Shadcn Carousel Components
import Carousel from './ui/carousel/Carousel.vue'
import CarouselContent from './ui/carousel/CarouselContent.vue'
import CarouselItem from './ui/carousel/CarouselItem.vue'
import CarouselPrevious from './ui/carousel/CarouselPrevious.vue'
import CarouselNext from './ui/carousel/CarouselNext.vue'

const router = useRouter()
const { heroSlides, isLoading } = useCatalog()
const isMuted = ref(true)

const plugin = Autoplay({
  delay: 8000,
  stopOnMouseEnter: true,
  stopOnInteraction: false
})

// Show a skeleton (not fake placeholder data) until the real hero slides have loaded
const isHeroLoading = computed(() => isLoading.value && heroSlides.value.length === 0)

function playSlide(id) {
  router.push(`/player/${id}`)
}

function goToDetail(slide) {
  router.push({
    path: `/detail/${slide.id}`,
    query: { type: slide.tmdbType || (slide.type === 'Série' ? 'tv' : 'movie') }
  })
}

function toggleMute() {
  isMuted.value = !isMuted.value
}
</script>

<template>
  <!-- SKELETON (While the real hero slides are loading — no more fake placeholder data) -->
  <div v-if="isHeroLoading" class="relative w-full h-[500px] sm:h-[560px] lg:h-[600px] rounded-3xl overflow-hidden border border-white/20 p-7 sm:p-12 flex flex-col justify-end gap-3.5">
    <Skeleton class="absolute inset-0 w-full h-full rounded-3xl opacity-30" />
    <Skeleton class="relative h-10 sm:h-14 w-2/3 max-w-md rounded-2xl bg-white/20" />
    <div class="relative flex items-center gap-2">
      <Skeleton class="h-4 w-16 rounded bg-white/15" />
      <Skeleton class="h-4 w-24 rounded bg-white/15" />
      <Skeleton class="h-4 w-12 rounded bg-white/15" />
    </div>
    <Skeleton class="relative h-10 w-full max-w-xl rounded-xl bg-white/10" />
    <div class="relative flex items-center gap-3 pt-1">
      <Skeleton class="h-11 w-32 rounded-full bg-white/20" />
      <Skeleton class="h-11 w-36 rounded-full bg-white/10" />
    </div>
  </div>

  <!-- SHADCN CINEMA CAROUSEL WITH OFFICIAL TMDB LOGOS & REAL DATA -->
  <Carousel
    v-else-if="heroSlides.length > 0"
    class="w-full relative group"
    :opts="{ loop: true, align: 'start' }"
    :plugins="[plugin]"
  >
    <CarouselContent class="-ml-0">
      <CarouselItem v-for="slide in heroSlides" :key="slide.id" class="pl-0">
        
        <!-- Individual Cinema Hero Card -->
        <div class="relative w-full h-[500px] sm:h-[560px] lg:h-[600px] rounded-3xl overflow-hidden border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15),0_25px_50px_-12px_rgba(0,0,0,0.95)] flex flex-col justify-between p-7 sm:p-12 select-none">
          
          <!-- Background Backdrop Image -->
          <div class="absolute inset-0 bg-cover bg-center transition-transform duration-1000 scale-100 group-hover:scale-105"
               :style="{ backgroundImage: `url(${slide.bgImg || slide.poster})` }">
          </div>

          <!-- Cinema Lighting Gradients (Vibrant backdrop with smooth text contrast) -->
          <div class="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent"></div>
          <div class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/35 to-transparent max-w-3xl"></div>
          <div class="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent h-24"></div>

          <!-- TOP ROW: Mute Toggle Right -->
          <div class="relative z-20 flex items-center justify-end w-full">
            <button @click="toggleMute"
                    class="w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-all cursor-pointer shadow-lg hover:scale-105 active:scale-95">
              <IconVolumeOff v-if="isMuted" :size="17" :stroke-width="2" />
              <IconVolume v-else :size="17" :stroke-width="2" />
            </button>
          </div>

          <!-- BOTTOM STAGE: Official PNG Logo + Real TMDB Metadata + Actions -->
          <div class="relative z-20 flex flex-col sm:flex-row sm:items-end justify-between gap-6 w-full">
            
            <div class="flex flex-col gap-3.5 max-w-2xl">
              
              <!-- 1. Official TMDB Logo PNG (FR/EN) or Clean Typography Fallback -->
              <div class="min-h-[60px] sm:min-h-[80px] flex items-end">
                <img
                  v-if="slide.logoUrl"
                  :src="slide.logoUrl"
                  :alt="slide.title"
                  class="max-h-20 sm:max-h-28 md:max-h-32 max-w-[280px] sm:max-w-[400px] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
                />
                <h1
                  v-else
                  class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.9)] line-clamp-2"
                >
                  {{ slide.title }}
                </h1>
              </div>

              <!-- 2. Real TMDB Metadata Line (Genre, Year, Real Rating, Age, Quality) -->
              <div class="flex items-center gap-2 text-xs font-semibold text-white flex-wrap">
                <span>{{ slide.type }}</span>
                <span class="text-white/40">•</span>
                <span>{{ slide.genre }}</span>
                <span v-if="slide.year" class="text-white/40">•</span>
                <span v-if="slide.year">{{ slide.year }}</span>
                <span v-if="slide.age" class="text-white/40">•</span>
                <span v-if="slide.age">{{ slide.age }}</span>
                <span v-if="slide.rating" class="text-emerald-400 font-black text-xs ml-1">
                  {{ slide.rating }}
                </span>
              </div>

              <!-- 3. Real Synopsis -->
              <p class="text-xs sm:text-sm text-white/70 line-clamp-2 max-w-xl leading-relaxed">
                {{ slide.synopsis }}
              </p>

              <!-- 4. Action Buttons (▶ Lecture & ℹ Plus d'infos) -->
              <div class="flex items-center gap-3 pt-1">
                
                <!-- Primary Solid White Play Pill Button -->
                <button @click="playSlide(slide.id)"
                        class="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-white/90 text-slate-950 font-black text-sm rounded-full shadow-2xl shadow-white/20 transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105">
                  <IconPlayerPlay :size="18" :stroke-width="2.5" class="fill-current" />
                  <span>Lecture</span>
                </button>

                <!-- Secondary Frosted Glass Plus d'infos Pill Button -->
                <button @click="goToDetail(slide)"
                        class="flex items-center gap-2 px-5 py-2.5 bg-white/20 hover:bg-white/30 text-white font-bold text-sm rounded-full border border-white/25 backdrop-blur-md shadow-lg transition-all duration-200 cursor-pointer active:scale-95 hover:scale-105">
                  <IconInfoCircle :size="18" :stroke-width="2" />
                  <span>Plus d'infos</span>
                </button>

              </div>

            </div>

          </div>

        </div>

      </CarouselItem>
    </CarouselContent>

    <!-- Shadcn Carousel Previous & Next Round Arrow Buttons -->
    <CarouselPrevious class="opacity-0 group-hover:opacity-100 transition-opacity left-3" />
    <CarouselNext class="opacity-0 group-hover:opacity-100 transition-opacity right-3" />

  </Carousel>
</template>
