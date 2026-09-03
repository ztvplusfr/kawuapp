<script setup>
import { ref, onMounted, watch } from 'vue'
import QRCode from 'qrcode'
import { IconDeviceMobile, IconX, IconCheck, IconCopy, IconWifi, IconDeviceTv } from '@tabler/icons-vue'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const qrCodeUrl = ref('')
const serverIp = ref('192.168.1.47')
const serverPort = ref('8765')
const isCopied = ref(false)
const isLoading = ref(true)

async function fetchServerInfoAndGenerateQR() {
  isLoading.value = true
  try {
    let ip = '192.168.1.47'
    let port = '8765'

    // Try calling Go backend directly if Wails runtime is ready
    if (window.go?.main?.App?.GetRemoteServerInfo) {
      const info = await window.go.main.App.GetRemoteServerInfo()
      if (info && info.ip) {
        ip = info.ip
        port = String(info.port || '8765')
      }
    } else {
      // Fallback: fetch from local HTTP endpoint
      try {
        const res = await fetch('http://127.0.0.1:8765/api/info')
        if (res.ok) {
          const data = await res.json()
          if (data.ip) ip = data.ip
          if (data.port) port = String(data.port)
        }
      } catch (err) {
        console.warn('Local remote server check fallback:', err)
      }
    }

    serverIp.value = ip
    serverPort.value = port

    const qrData = JSON.stringify({ ip, port, app: 'kawu' })
    qrCodeUrl.value = await QRCode.toDataURL(qrData, {
      width: 260,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    })
  } catch (e) {
    console.error('Failed to generate remote pairing QR code:', e)
  } finally {
    isLoading.value = false
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    fetchServerInfoAndGenerateQR()
  }
})

onMounted(() => {
  if (props.isOpen) {
    fetchServerInfoAndGenerateQR()
  }
})

function copyIp() {
  navigator.clipboard.writeText(`${serverIp.value}:${serverPort.value}`)
  isCopied.value = true
  setTimeout(() => {
    isCopied.value = false
  }, 2000)
}
</script>

<template>
  <Teleport to="body">
    <transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        @click.self="emit('close')"
      >
        <div class="relative w-full max-w-md bg-zinc-900 border border-zinc-800/80 rounded-3xl p-6 text-white shadow-2xl shadow-purple-950/20">
          <!-- Close button -->
          <button
            @click="emit('close')"
            class="absolute top-5 right-5 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <IconX :size="18" />
          </button>

          <!-- Header -->
          <div class="flex items-center gap-3 mb-5">
            <div class="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <IconDeviceTv :size="22" />
            </div>
            <div>
              <h3 class="text-lg font-bold text-white tracking-tight">Télécommande Kawu</h3>
              <p class="text-xs text-zinc-400">Pilotez votre Mac depuis votre lit</p>
            </div>
          </div>

          <!-- QR Code Canvas Container -->
          <div class="flex flex-col items-center justify-center bg-zinc-950/60 border border-zinc-800/60 rounded-2xl p-5 mb-5">
            <div class="relative w-56 h-56 bg-white rounded-2xl p-2 flex items-center justify-center shadow-lg">
              <img
                v-if="qrCodeUrl && !isLoading"
                :src="qrCodeUrl"
                alt="QR Code Télécommande"
                class="w-full h-full object-contain rounded-xl"
              />
              <div v-else class="flex flex-col items-center gap-2 text-zinc-500 text-xs">
                <span class="animate-spin text-purple-600">●</span>
                <span>Génération du code...</span>
              </div>
            </div>

            <p class="text-xs text-zinc-400 mt-3 text-center">
              Scannez ce QR code avec l'application <span class="text-white font-semibold">Kawu Remote</span> sur votre iPhone
            </p>
          </div>

          <!-- Connection Info Pill -->
          <div class="flex items-center justify-between bg-zinc-800/60 rounded-xl px-4 py-3 mb-5 border border-zinc-700/50">
            <div class="flex items-center gap-2.5">
              <div class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <div class="text-xs">
                <span class="text-zinc-400 block font-medium">Adresse Wi-Fi locale :</span>
                <span class="text-white font-mono font-bold">{{ serverIp }}:{{ serverPort }}</span>
              </div>
            </div>

            <button
              @click="copyIp"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-700/70 hover:bg-zinc-600 text-zinc-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
            >
              <IconCheck v-if="isCopied" :size="14" class="text-emerald-400" />
              <IconCopy v-else :size="14" />
              <span>{{ isCopied ? 'Copié !' : 'Copier' }}</span>
            </button>
          </div>

          <!-- Steps Reminder -->
          <div class="text-[11px] text-zinc-500 space-y-1">
            <p>• Votre iPhone et votre Mac doivent être connectés au même réseau Wi-Fi.</p>
            <p>• L'application mobile est disponible via Expo Go : <span class="text-purple-400 font-mono">exp://{{ serverIp }}:8081</span></p>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>
