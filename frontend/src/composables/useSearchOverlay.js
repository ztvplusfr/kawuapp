import { ref } from 'vue'

const isOpen = ref(false)

export function useSearchOverlay() {
  function openSearch() {
    isOpen.value = true
  }
  function closeSearch() {
    isOpen.value = false
  }
  return { isOpen, openSearch, closeSearch }
}
