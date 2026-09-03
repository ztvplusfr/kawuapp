import { ref } from 'vue'
import { useAuth } from './useAuth'
import { toggleWatchlist } from '../services/api/watchService'
import { supabase } from '../services/supabase'

const isOpen = ref(false)
const position = ref({ x: 0, y: 0 })
const currentItem = ref(null)
const isInWatchlist = ref(false)
const isTogglingWatchlist = ref(false)
const toastMessage = ref('')
let toastTimeout = null

export function useContextMenu() {
  const { userProfile, isLoggedIn } = useAuth()

  async function checkWatchlist(contentId) {
    if (!userProfile.value?.id || !contentId) {
      isInWatchlist.value = false
      return
    }
    try {
      const uid = String(userProfile.value.id)
      const userIds = [uid]
      if (uid.startsWith('google_')) {
        userIds.push(uid.replace('google_', ''))
      } else {
        userIds.push(`google_${uid}`)
      }

      const { data } = await supabase
        .from('watchlist')
        .select('id, content_id')
        .in('user_id', userIds)

      isInWatchlist.value = (data || []).some(item => 
        String(item.content_id) === String(contentId)
      )
    } catch (e) {
      isInWatchlist.value = false
    }
  }

  function showToast(msg) {
    if (toastTimeout) clearTimeout(toastTimeout)
    toastMessage.value = msg
    toastTimeout = setTimeout(() => {
      toastMessage.value = ''
    }, 2500)
  }

  async function openContextMenu(item, event) {
    if (!item) return
    event.preventDefault()
    event.stopPropagation()

    currentItem.value = item
    const targetId = item.supabaseContentId || item.id

    // Position calculation with viewport boundaries (macOS feel)
    const menuWidth = 240
    const menuHeight = 220
    const screenWidth = window.innerWidth
    const screenHeight = window.innerHeight

    let x = event.clientX
    let y = event.clientY

    if (x + menuWidth > screenWidth - 10) {
      x = screenWidth - menuWidth - 10
    }
    if (y + menuHeight > screenHeight - 10) {
      y = screenHeight - menuHeight - 10
    }

    position.value = { x: Math.max(10, x), y: Math.max(10, y) }
    isOpen.value = true

    // Check watchlist status asynchronously
    await checkWatchlist(targetId)
  }

  function closeContextMenu() {
    isOpen.value = false
  }

  async function handleToggleWatchlist() {
    if (!currentItem.value) return
    const targetId = currentItem.value.supabaseContentId || currentItem.value.id
    if (!userProfile.value?.id) {
      showToast('Connecte-toi pour ajouter à ta watchlist')
      closeContextMenu()
      return
    }

    isTogglingWatchlist.value = true
    try {
      const added = await toggleWatchlist(userProfile.value.id, targetId)
      isInWatchlist.value = added
      showToast(added ? 'Ajouté à la Watchlist 🔖' : 'Retiré de la Watchlist')
    } catch (e) {
      showToast('Erreur lors de la modification')
    } finally {
      isTogglingWatchlist.value = false
      closeContextMenu()
    }
  }

  function copyTitle() {
    if (!currentItem.value?.title) return
    try {
      navigator.clipboard?.writeText(currentItem.value.title)
      showToast('Titre copié dans le presse-papier 📋')
    } catch (e) {}
    closeContextMenu()
  }

  return {
    isOpen,
    position,
    currentItem,
    isInWatchlist,
    isTogglingWatchlist,
    toastMessage,
    openContextMenu,
    closeContextMenu,
    handleToggleWatchlist,
    copyTitle
  }
}
