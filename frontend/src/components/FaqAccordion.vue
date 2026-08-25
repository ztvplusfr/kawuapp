<script setup>
import { ref } from 'vue'

const faqs = ref([
  {
    id: 1,
    question: 'Qu\'est-ce que Kawu ?',
    answer: 'Kawu est une plateforme de streaming nouvelle génération sur macOS conçue pour offrir un accès instantané et fluide à des milliers de films, séries et animés en haute définition (4K HDR & Dolby Atmos).',
    open: true
  },
  {
    id: 2,
    question: 'Combien coûte Kawu et y a-t-il des publicités ?',
    answer: 'Kawu est 100% gratuit et garanti sans aucune publicité. Aucun abonnement, ni carte bancaire, ni engagement n\'est requis.',
    open: false
  },
  {
    id: 3,
    question: 'Quels types de contenus puis-je regarder (VF / VOSTFR) ?',
    answer: 'Le catalogue comprend les dernières sorties cinéma, les séries cultes et les animés en simulcast, disponibles en version française (VF) et en version originale sous-titrée (VOSTFR).',
    open: false
  },
  {
    id: 4,
    question: 'Où puis-je regarder mes programmes ?',
    answer: 'Vous pouvez regarder directement sur votre Mac, ou synchroniser votre compte pour continuer votre lecture sur vos téléviseurs connectés, tablettes et smartphones.',
    open: false
  },
  {
    id: 5,
    question: 'Pourquoi se connecter avec son compte Google ?',
    answer: 'La connexion Google vous permet de synchroniser vos favoris, reprendre la lecture exactement là où vous l\'aviez laissée et personnaliser vos recommandations.',
    open: false
  }
])

function toggleFaq(id) {
  const item = faqs.value.find(f => f.id === id)
  if (item) {
    item.open = !item.open
  }
}
</script>

<template>
  <section id="faq" class="flex flex-col gap-6 scroll-mt-20">
    <div class="flex flex-col items-center text-center gap-2">
      <h2 class="text-2xl sm:text-3xl font-black text-white tracking-tight">Foire aux questions</h2>
      <p class="text-sm text-white/60 max-w-md">Tout ce que vous devez savoir avant de commencer à regarder</p>
    </div>

    <div class="flex flex-col gap-3 max-w-3xl mx-auto w-full">
      <div v-for="faq in faqs" :key="faq.id"
           class="rounded-2xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] backdrop-blur-md overflow-hidden transition-all duration-200">
        
        <button @click="toggleFaq(faq.id)"
                class="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-base text-white cursor-pointer">
          <span>{{ faq.question }}</span>
          <span :class="['text-xl transition-transform duration-200 text-white/60', faq.open ? 'rotate-45 text-cyan-400' : '']">
            +
          </span>
        </button>

        <div v-if="faq.open" class="px-5 pb-5 pt-1 text-sm text-white/70 leading-relaxed border-t border-white/[0.04]">
          {{ faq.answer }}
        </div>
      </div>
    </div>
  </section>
</template>
