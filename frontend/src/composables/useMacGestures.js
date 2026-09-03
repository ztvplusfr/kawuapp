import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSearchOverlay } from './useSearchOverlay'

export function useMacGestures() {
  const router = useRouter()
  const route = useRoute()
  const { openSearch } = useSearchOverlay()

  const isSwipingBack = ref(false)
  const swipeProgress = ref(0) // 0 to 1
  let accumulatedDeltaX = 0
  let swipeTimeout = null
  let isNavigating = false
  let lastEventTime = 0
  let dominantVerticalScroll = false

  function handleWheel(e) {
    const now = Date.now()
    const timeDelta = now - lastEventTime
    lastEventTime = now

    // Ignore momentum scrolls (too long between events means it's inertia)
    if (timeDelta > 200 && accumulatedDeltaX > 0) {
      accumulatedDeltaX = 0
      return
    }

    // Only consider it a swipe if deltaX is significantly greater than deltaY
    // (trackpad two-finger horizontal swipes have |deltaX| >> |deltaY|)
    const isHorizontalGesture = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5
    if (!isHorizontalGesture) {
      dominantVerticalScroll = true
      return
    }
    if (dominantVerticalScroll && Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2) {
      return
    }

    // Do not trigger back if the user is inside a scrollable carousel that is scrolled right
    const scrollableParent = e.target.closest('.overflow-x-auto, [data-scrollable="true"]')
    if (scrollableParent && scrollableParent.scrollLeft > 5) {
      return
    }

    // Two-Finger Swipe Left-to-Right (deltaX is negative on macOS trackpad)
    if (e.deltaX < -15) {
      // Don't swipe back if already on the root / landing / home with no history
      if (route.path === '/home' && window.history.state?.back === null) {
        return
      }
      if (route.path === '/') {
        return
      }

      accumulatedDeltaX += Math.abs(e.deltaX)
      swipeProgress.value = Math.min(1, accumulatedDeltaX / 150)
      isSwipingBack.value = true

      if (swipeTimeout) clearTimeout(swipeTimeout)
      swipeTimeout = setTimeout(() => {
        isSwipingBack.value = false
        swipeProgress.value = 0
        accumulatedDeltaX = 0
        dominantVerticalScroll = false
      }, 400)

      // Trigger navigation when threshold reached (higher threshold to avoid accidental triggers)
      if (accumulatedDeltaX > 140 && !isNavigating) {
        isNavigating = true
        isSwipingBack.value = false
        swipeProgress.value = 0
        accumulatedDeltaX = 0
        dominantVerticalScroll = false

        router.back()

        setTimeout(() => {
          isNavigating = false
        }, 800)
      }
    }
  }

  function handleKeyDown(e) {
    // Cmd on macOS, Ctrl on Windows/Linux
    const mod = e.metaKey || e.ctrlKey

    // macOS Standard Shortcuts: Cmd + [ or Cmd + ArrowLeft
    if ((e.metaKey && e.key === '[') || (e.metaKey && e.key === 'ArrowLeft') || (e.altKey && e.key === 'ArrowLeft')) {
      e.preventDefault()
      router.back()
    } else if ((e.metaKey && e.key === ']') || (e.metaKey && e.key === 'ArrowRight') || (e.altKey && e.key === 'ArrowRight')) {
      e.preventDefault()
      router.forward()
    } else if (mod && e.key.toLowerCase() === 'r') {
      // Cmd/Ctrl + R: reload the app
      e.preventDefault()
      window.location.reload()
    } else if (mod && e.key.toLowerCase() === 's') {
      // Cmd/Ctrl + S: open search
      e.preventDefault()
      openSearch()
    }
  }

  function handleMouseUp(e) {
    // Mouse Back Button (Button 3 or 4)
    if (e.button === 3 || e.button === 4) {
      e.preventDefault()
      router.back()
    }
  }

  onMounted(() => {
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('mouseup', handleMouseUp)
  })

  onUnmounted(() => {
    window.removeEventListener('wheel', handleWheel)
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('mouseup', handleMouseUp)
  })

  return {
    isSwipingBack,
    swipeProgress
  }
}
