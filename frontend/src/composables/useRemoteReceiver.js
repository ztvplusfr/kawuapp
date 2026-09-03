import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSearchOverlay } from './useSearchOverlay'
import { EventsOn } from '../../wailsjs/runtime/runtime'

let tvFocusedElement = null
let toastTimeout = null
let lastActionTime = 0
let lastActionKey = ''

export function useRemoteReceiver() {
  const router = useRouter()
  const { openSearch, closeSearch, isOpen: isSearchOpen } = useSearchOverlay()
  let cancelWailsListener = null
  let sseEventSource = null

  // 1. Inject Netflix TV Focus & Toast Styles with Cyan Blue Accent (#22D3EE)
  function injectTVStyles() {
    let style = document.getElementById('kawu-tv-remote-styles')
    if (!style) {
      style = document.createElement('style')
      style.id = 'kawu-tv-remote-styles'
      document.head.appendChild(style)
    }

    style.textContent = `
      .kawu-tv-focus {
        outline: 3.5px solid #22D3EE !important;
        outline-offset: 3px !important;
        box-shadow: 0 0 35px rgba(34, 211, 238, 0.95), 0 10px 30px rgba(0, 0, 0, 0.9) !important;
        transform: scale(1.04) !important;
        border-radius: 12px !important;
        z-index: 99999 !important;
        transition: transform 0.16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.16s ease-out, outline-color 0.16s ease !important;
      }
      .group\\/ep.kawu-tv-focus,
      [class*="group/ep"].kawu-tv-focus {
        transform: none !important;
        outline: 3px solid #22D3EE !important;
        outline-offset: 2px !important;
        border-radius: 14px !important;
        box-shadow: 0 0 25px rgba(34, 211, 238, 0.9), 0 8px 25px rgba(0, 0, 0, 0.9) !important;
      }
      .kawu-tv-pressed {
        transform: scale(0.96) !important;
        outline-color: #67E8F9 !important;
        box-shadow: 0 0 50px rgba(103, 232, 249, 1) !important;
      }
    `
  }

  // 2. Suppressed on-screen toast per user request (keeps UI 100% clean and distraction-free)
  function showRemoteToast(_text, _icon) {
    const existingOsd = document.getElementById('kawu-remote-osd')
    if (existingOsd) existingOsd.remove()
  }

  // 3. Set TV Focus with smart viewport centering
  function setTVFocus(element, options = { smoothScroll: true }) {
    if (!element) return

    if (tvFocusedElement && tvFocusedElement !== element) {
      tvFocusedElement.classList.remove('kawu-tv-focus', 'kawu-tv-pressed')
    }

    tvFocusedElement = element
    element.classList.add('kawu-tv-focus')

    if (options.smoothScroll) {
      const rect = element.getBoundingClientRect()
      const main = document.querySelector('main')

      // If element is already nicely visible in viewport, don't scroll unnecessarily!
      if (rect.top >= 30 && rect.bottom <= window.innerHeight - 30) {
        return
      }

      // If element is in the top section of the page, keep page at top: 0
      const elTopInDoc = rect.top + (main ? main.scrollTop : window.scrollY)
      if (elTopInDoc < 600) {
        if (main) main.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      // Smoothly bring it into view without ANY horizontal jumping (inline: 'nearest')
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }

  // Helper to cluster elements by vertical Y coordinate
  function clusterElementsByY(elements) {
    const clusters = []
    for (const el of elements) {
      const top = Math.round(el.getBoundingClientRect().top + window.scrollY)
      let cluster = clusters.find((c) => Math.abs(c.top - top) < 35)
      if (!cluster) {
        cluster = { top, items: [] }
        clusters.push(cluster)
      }
      cluster.items.push(el)
    }

    clusters.sort((a, b) => a.top - b.top)
    return clusters.map((c, i) => {
      c.items.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
      return {
        type: 'cluster',
        name: `Rangée ${i + 1}`,
        top: c.top,
        items: c.items,
      }
    })
  }

  // 4. Build Comprehensive Navigation Tree (Home, Detail, and Video Player Overlays)
  function getNavigationRows() {
    const rows = []
    const inPlayer = window.location.hash.includes('/player') || !!document.querySelector('video')
    const isDetail =
      window.location.hash.includes('/detail') ||
      window.location.hash.includes('/media') ||
      !!document.querySelector('#detail-action-buttons, button[title*="ma liste"], button[title*="Bande-annonce"]')

    // === OVERLAY 1: Full-Screen Episodes Grid Panel in Video Player ===
    const episodesOverlay = document.querySelector('[class*="bg-black/92"]')
    if (episodesOverlay && episodesOverlay.offsetWidth > 0) {
      const closeBtn = episodesOverlay.querySelector('button')
      if (closeBtn) {
        rows.push({
          type: 'overlay-header',
          name: 'Fermer la liste des épisodes',
          items: [closeBtn],
          top: 0,
        })
      }

      const epCards = Array.from(episodesOverlay.querySelectorAll('.group\\/ep')).filter(
        (el) => el.offsetWidth > 20
      )
      if (epCards.length > 0) {
        const gridRows = clusterElementsByY(epCards)
        rows.push(...gridRows)
      }

      return rows
    }

    // === OVERLAY 2: Audio/Sous-titres, Sources & Options Modal in Video Player ===
    const optionsModal = document.querySelector('[class*="max-h-[65vh]"]')
    if (optionsModal && optionsModal.offsetWidth > 0) {
      const headerBtns = Array.from(
        optionsModal.querySelectorAll('div:first-child button')
      ).filter((b) => b.offsetWidth > 15)

      if (headerBtns.length > 0) {
        rows.push({
          type: 'modal-header',
          name: 'En-tête Options',
          items: headerBtns,
          top: 0,
        })
      }

      const filterPills = Array.from(
        optionsModal.querySelectorAll('[class*="rounded-full"] button, div[class*="overflow-x-auto"] button')
      ).filter((b) => b.offsetWidth > 20 && !headerBtns.includes(b))

      if (filterPills.length > 0) {
        rows.push({
          type: 'modal-pills',
          name: 'Filtres Sources',
          items: filterPills,
          top: 50,
        })
      }

      const menuItems = Array.from(
        optionsModal.querySelectorAll('div.flex-col > button, div:not(:first-child) > button:not([class*="rounded-lg"])')
      ).filter((b) => b.offsetWidth > 20 && !headerBtns.includes(b) && !filterPills.includes(b))

      for (let i = 0; i < menuItems.length; i++) {
        const btn = menuItems[i]
        const label = btn.querySelector('span')?.textContent?.trim() || btn.textContent?.trim() || `Option ${i + 1}`
        rows.push({
          type: 'modal-item',
          name: label,
          items: [btn],
          top: btn.getBoundingClientRect().top,
        })
      }

      return rows
    }

    // === OVERLAY 3: Season Popover Modal in DetailView ===
    const seasonModal = document.querySelector('#detail-season-modal')
    if (seasonModal && seasonModal.offsetWidth > 0) {
      const seasonOptionBtns = Array.from(seasonModal.querySelectorAll('button:not(:first-child)')).filter(
        (b) => b.offsetWidth > 15
      )
      if (seasonOptionBtns.length > 0) {
        for (let i = 0; i < seasonOptionBtns.length; i++) {
          const btn = seasonOptionBtns[i]
          rows.push({
            type: 'season-modal-option',
            name: btn.textContent?.trim() || `Saison ${i + 1}`,
            items: [btn],
            top: i * 45,
          })
        }
        return rows
      }
    }

    // === STANDARD VIDEO PLAYER INTERFACE (No overlay open) ===
    if (inPlayer) {
      const topLeftButtons = Array.from(document.querySelectorAll('button')).filter((b) => {
        if (!b.offsetWidth || !b.offsetHeight) return false
        if (b.closest('header')) return false
        const r = b.getBoundingClientRect()
        return r.top < 140 && r.left < window.innerWidth * 0.6
      })

      if (topLeftButtons.length > 0) {
        topLeftButtons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        rows.push({
          type: 'player-top',
          name: 'Menu Haut Gauche',
          items: topLeftButtons,
          top: 0,
        })
      }

      const skipIntroBtn = Array.from(document.querySelectorAll('button')).find((b) => {
        if (!b.offsetWidth || !b.offsetHeight) return false
        const text = b.textContent?.toLowerCase() || ''
        return text.includes('passer') || text.includes('intro') || text.includes('générique')
      })
      if (skipIntroBtn) {
        rows.push({
          type: 'player-skip',
          name: "Passer l'intro",
          items: [skipIntroBtn],
          top: skipIntroBtn.getBoundingClientRect().top,
        })
      }

      const bottomButtons = Array.from(document.querySelectorAll('button')).filter((b) => {
        if (!b.offsetWidth || !b.offsetHeight) return false
        const r = b.getBoundingClientRect()
        return r.top > window.innerHeight - 200
      })

      if (bottomButtons.length > 0) {
        bottomButtons.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
        rows.push({
          type: 'player-bottom',
          name: 'Contrôles de Lecture',
          items: bottomButtons,
          top: window.innerHeight - 100,
        })
      }

      if (rows.length > 0) return rows
    }

    // === HEADER NAVIGATION BAR (Always Row 0 for main app) ===
    const header = document.querySelector('header')
    if (header) {
      const headerNav = header.querySelector('nav')
      const navButtons = headerNav
        ? Array.from(headerNav.querySelectorAll('button')).filter((b) => b.offsetWidth > 20)
        : []

      if (navButtons.length > 0) {
        rows.push({
          type: 'header',
          name: 'Menu Principal',
          top: 0,
          items: navButtons,
        })
      }
    }

    // === CASE: DetailView (Movies and TV Series) ===
    if (isDetail) {
      // 1. Top Circular Back Button (top-24 left-6)
      const detailBackBtn = document.querySelector('div[class*="top-24"] button, button[class*="rounded-full"][class*="bg-black/60"]')
      if (detailBackBtn && detailBackBtn.offsetWidth > 0) {
        rows.push({
          type: 'detail-back',
          name: 'Retour',
          top: 80,
          items: [detailBackBtn],
        })
      }

      // 2. The 5 Hero Action Buttons (Lecture, Recommencer, Ma liste, Marquer vu, Bande-annonce)
      const actionContainer = document.querySelector('#detail-action-buttons, [data-row="hero-actions"]')
      let heroButtons = []
      if (actionContainer) {
        heroButtons = Array.from(actionContainer.querySelectorAll('button')).filter(
          (b) => b.offsetWidth > 15 && b.offsetHeight > 15
        )
      } else {
        heroButtons = Array.from(
          document.querySelectorAll(
            'main button.bg-cyan-400, main button[class*="bg-cyan-400"], main button[title="Recommencer"], main button[title*="liste"], main button[title*="vu"], main button[title="Bande-annonce"]'
          )
        ).filter((b) => b.offsetWidth > 15 && b.offsetHeight > 15 && !b.closest('header'))
      }

      if (heroButtons.length > 0) {
        // Natural DOM order: 1: Play, 2: Recommencer, 3: Ma liste, 4: Marquer vu, 5: Bande-annonce
        rows.push({
          type: 'hero-actions',
          name: 'Actions Principales',
          top: 450,
          items: heroButtons,
        })
      }

      // 3. Navigation Tabs (Épisodes, Distribution & Acteurs, Titres similaires, Bande-annonce)
      const tabsContainer = document.querySelector('#detail-tabs, [data-row="detail-tabs"]')
      let tabButtons = []
      if (tabsContainer) {
        tabButtons = Array.from(tabsContainer.querySelectorAll('button')).filter((b) => b.offsetWidth > 20)
      } else {
        tabButtons = Array.from(
          document.querySelectorAll('div[class*="border-b border-white/10"] button')
        ).filter((b) => b.offsetWidth > 20 && !b.closest('header'))
      }

      if (tabButtons.length > 0) {
        rows.push({
          type: 'detail-tabs',
          name: 'Onglets',
          top: 550,
          items: tabButtons,
        })
      }

      // 4. Season & Order Controls (Stepper buttons, Season Pill, Sort Cycle, Season Watched)
      const seasonContainer = document.querySelector('#detail-season-controls, [data-row="season-controls"]')
      let seasonControls = []
      if (seasonContainer) {
        seasonControls = Array.from(seasonContainer.querySelectorAll('button')).filter(
          (b) => b.offsetWidth > 15 && b.offsetHeight > 15 && !b.closest('#detail-season-modal')
        )
      }

      if (seasonControls.length > 0) {
        rows.push({
          type: 'season-controls',
          name: 'Saison & Tri',
          top: 620,
          items: seasonControls,
        })
      }

      // 5. Episodes List (if in series)
      const episodeCards = Array.from(
        document.querySelectorAll('.group\\/ep, [class*="group/ep"]')
      ).filter((el) => el.offsetWidth > 40 && el.offsetHeight > 40)

      if (episodeCards.length > 0) {
        for (let i = 0; i < episodeCards.length; i++) {
          rows.push({
            type: 'episode',
            name: `Épisode ${i + 1}`,
            top: 700 + i * 90,
            items: [episodeCards[i]],
          })
        }
      }

      // 6. Cast & Actors Grid (if on Distribution tab)
      const actorCards = Array.from(
        document.querySelectorAll('[class*="grid-cols"] .group, [class*="grid-cols"] [class*="cursor-pointer"]')
      ).filter((el) => el.offsetWidth > 40 && !episodeCards.includes(el))

      if (actorCards.length > 0) {
        const actorRows = clusterElementsByY(actorCards)
        rows.push(...actorRows)
      }

      // 7. Similar Titles Rails
      const similarRails = Array.from(
        document.querySelectorAll('.group\\/row [class*="overflow-x-auto"]')
      )
      for (const sc of similarRails) {
        const cards = Array.from(sc.children).filter((el) => el.offsetWidth > 40)
        if (cards.length > 0) {
          rows.push({
            type: 'carousel',
            name: 'Titres Similaires',
            top: sc.getBoundingClientRect().top + window.scrollY,
            items: cards,
          })
        }
      }

      return rows
    }

    // === CASE 4: HomeView / Content Rails (MediaRows) ===
    const scrollContainers = Array.from(
      document.querySelectorAll(
        '.group\\/row [class*="overflow-x-auto"], [data-row] [class*="overflow-x-auto"], .overflow-x-auto'
      )
    )

    if (scrollContainers.length > 0) {
      for (const sc of scrollContainers) {
        const cards = Array.from(sc.children).filter(
          (el) => el.offsetWidth > 40 && el.offsetHeight > 40 && window.getComputedStyle(el).display !== 'none'
        )

        if (cards.length > 0) {
          const rowParent = sc.closest('.group\\/row, [data-row]') || sc.parentElement || sc
          const titleEl = rowParent.querySelector('h2, h3, [class*="font-black"]')
          const rowName = titleEl ? titleEl.textContent.trim() : 'Section'

          rows.push({
            type: 'carousel',
            name: rowName,
            scrollContainer: sc,
            top: sc.getBoundingClientRect().top + window.scrollY,
            items: cards,
          })
        }
      }
    }

    // === CASE 5: Grid View (CatalogView, WatchlistView, etc.) ===
    if (rows.length <= 1) {
      const gridContainer = document.querySelector('[class*="grid-cols"], .grid')
      if (gridContainer) {
        const cards = Array.from(gridContainer.children).filter(
          (el) => el.offsetWidth > 40 && el.offsetHeight > 40 && window.getComputedStyle(el).display !== 'none'
        )

        if (cards.length > 0) {
          const gridRows = clusterElementsByY(cards)
          rows.push(...gridRows)
        }
      }
    }

    const headerRow = rows.find((r) => r.type === 'header')
    const contentRows = rows.filter((r) => r.type !== 'header').sort((a, b) => a.top - b.top)

    return headerRow ? [headerRow, ...contentRows] : contentRows
  }

  // 5. Navigate strictly 1-by-1 (Zero Skips, Netflix TV Logic)
  function navigateNetflixTV(direction) {
    const inPlayer = window.location.hash.includes('/player') || !!document.querySelector('video')

    if (inPlayer) {
      const playerEl =
        document.querySelector('.video-player-container, #player-wrapper, video') || document.body
      playerEl.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: 200 })
      )
    }

    const rows = getNavigationRows()
    if (rows.length === 0) return

    // Priority 1: In full-screen episodes overlay, always focus the currently playing episode first!
    const epOverlay = document.querySelector('[class*="bg-black/92"]')
    if (epOverlay && epOverlay.offsetWidth > 0) {
      if (!tvFocusedElement || !epOverlay.contains(tvFocusedElement)) {
        const activeEp =
          epOverlay.querySelector('[data-current-episode="true"]') ||
          epOverlay.querySelector('.bg-cyan-500')?.closest('.group\\/ep') ||
          epOverlay.querySelector('.text-cyan-400')?.closest('.group\\/ep') ||
          epOverlay.querySelector('.group\\/ep')
        if (activeEp) {
          setTVFocus(activeEp)
          return
        }
      }
    }

    // If nothing currently has focus:
    if (!tvFocusedElement || !document.body.contains(tvFocusedElement)) {

      // In options modal: focus first item
      const optionsModal = document.querySelector('[class*="max-h-[65vh]"]')
      if (optionsModal) {
        const firstItem = optionsModal.querySelector('div.flex-col > button') || optionsModal.querySelector('button')
        if (firstItem) {
          setTVFocus(firstItem)
          showRemoteToast(firstItem.textContent?.trim() || 'Options', '⚙️')
          return
        }
      }

      // In DetailView: default to the Hero Play button at the top without scrolling!
      const isDetail =
        window.location.hash.includes('/detail') || window.location.hash.includes('/media')
      if (isDetail) {
        const playBtn = document.querySelector('#detail-action-buttons button, main button.bg-cyan-400')
        if (playBtn) {
          setTVFocus(playBtn, { smoothScroll: false })
          showRemoteToast(playBtn.textContent?.trim() || 'Lecture', '▶️')
          return
        }
      }

      // Standard player: focus Play/Pause
      if (inPlayer) {
        const bottomRow = rows.find((r) => r.type === 'player-bottom')
        const targetRow = bottomRow || rows[0]
        if (targetRow && targetRow.items.length > 0) {
          setTVFocus(targetRow.items[0])
          showRemoteToast(targetRow.items[0].getAttribute('title') || 'Lecture', '🎬')
          return
        }
      }

      const firstRow = rows.find((r) => r.type !== 'header') || rows[0]
      if (firstRow && firstRow.items.length > 0) {
        setTVFocus(firstRow.items[0])
        showRemoteToast(firstRow.name || 'Sélection', '📺')
        return
      }
      return
    }

    // Find currently focused row and index
    let currentRowIndex = -1
    let currentItemIndex = -1

    for (let r = 0; r < rows.length; r++) {
      const idx = rows[r].items.indexOf(tvFocusedElement)
      if (idx !== -1) {
        currentRowIndex = r
        currentItemIndex = idx
        break
      }
      const childIdx = rows[r].items.findIndex((item) => item.contains(tvFocusedElement))
      if (childIdx !== -1) {
        currentRowIndex = r
        currentItemIndex = childIdx
        break
      }
    }

    // Fallback: nearest row
    if (currentRowIndex === -1) {
      const curRect = tvFocusedElement.getBoundingClientRect()
      let minDy = Infinity
      for (let r = 0; r < rows.length; r++) {
        for (let i = 0; i < rows[r].items.length; i++) {
          const itemRect = rows[r].items[i].getBoundingClientRect()
          const dy = Math.abs(itemRect.top - curRect.top)
          if (dy < minDy) {
            minDy = dy
            currentRowIndex = r
            currentItemIndex = i
          }
        }
      }
    }

    const currentRow = rows[currentRowIndex]
    if (!currentRow) return

    // === HORIZONTAL: ONE ITEM IN SAME ROW ===
    if (direction === 'right') {
      if (currentItemIndex < currentRow.items.length - 1) {
        const nextCard = currentRow.items[currentItemIndex + 1]
        setTVFocus(nextCard)
        const title = nextCard.getAttribute('title') || nextCard.textContent?.trim()
        if (title) showRemoteToast(title.slice(0, 24), '→')
      } else {
        showRemoteToast('Fin de ligne', '⇥')
      }
      return
    }

    if (direction === 'left') {
      if (currentItemIndex > 0) {
        const prevCard = currentRow.items[currentItemIndex - 1]
        setTVFocus(prevCard)
        const title = prevCard.getAttribute('title') || prevCard.textContent?.trim()
        if (title) showRemoteToast(title.slice(0, 24), '←')
      } else {
        showRemoteToast('Début de ligne', '⇤')
      }
      return
    }

    // === VERTICAL: PREVIOUS / NEXT ROW ===
    const curRect = tvFocusedElement.getBoundingClientRect()
    const targetX = curRect.left + curRect.width / 2

    if (direction === 'down') {
      if (currentRowIndex < rows.length - 1) {
        const nextRow = rows[currentRowIndex + 1]
        let bestItem = nextRow.items[0]
        let minDx = Infinity

        for (const item of nextRow.items) {
          const r = item.getBoundingClientRect()
          const itemX = r.left + r.width / 2
          const dx = Math.abs(itemX - targetX)
          if (dx < minDx) {
            minDx = dx
            bestItem = item
          }
        }

        setTVFocus(bestItem)
        const name = bestItem.getAttribute('title') || bestItem.textContent?.trim() || nextRow.name
        if (name) showRemoteToast(name.slice(0, 24), '▼')
      } else {
        showRemoteToast('Bas de page', '⤓')
      }
      return
    }

    if (direction === 'up') {
      if (currentRowIndex > 0) {
        const prevRow = rows[currentRowIndex - 1]
        let bestItem = prevRow.items[0]
        let minDx = Infinity

        for (const item of prevRow.items) {
          const r = item.getBoundingClientRect()
          const itemX = r.left + r.width / 2
          const dx = Math.abs(itemX - targetX)
          if (dx < minDx) {
            minDx = dx
            bestItem = item
          }
        }

        setTVFocus(bestItem)
        const name = bestItem.getAttribute('title') || bestItem.textContent?.trim() || prevRow.name
        if (name) showRemoteToast(name.slice(0, 24), '▲')
      } else {
        const main = document.querySelector('main') || window
        if (typeof main.scrollTo === 'function') {
          main.scrollTo({ top: 0, behavior: 'smooth' })
        }
        showRemoteToast('Haut de page', '⤒')
      }
      return
    }
  }

  // 6. Direct Jump to Header / Menu
  function jumpToHeaderMenu() {
    const inPlayer = window.location.hash.includes('/player') || !!document.querySelector('video')
    if (inPlayer) {
      const rows = getNavigationRows()
      const topRow = rows.find((r) => r.type === 'player-top')
      if (topRow && topRow.items.length > 0) {
        setTVFocus(topRow.items[0])
        showRemoteToast('Retour', '‹')
        return
      }
    }

    const rows = getNavigationRows()
    const headerRow = rows.find((r) => r.type === 'header')

    if (headerRow && headerRow.items.length > 0) {
      const main = document.querySelector('main')
      if (main) {
        main.scrollTo({ top: 0, behavior: 'smooth' })
      }

      const activeTab =
        headerRow.items.find(
          (el) => el.classList.contains('border-white') || el.classList.contains('bg-white')
        ) || headerRow.items[0]

      setTVFocus(activeTab)
      showRemoteToast('Menu & Onglets', '📺')
    } else {
      router.push('/home')
      showRemoteToast('Accueil', '🏠')
    }
  }

  // 7. Center Button (OK / Select)
  function handleSelect() {
    if (tvFocusedElement) {
      tvFocusedElement.classList.add('kawu-tv-pressed')
      setTimeout(() => {
        if (tvFocusedElement) tvFocusedElement.classList.remove('kawu-tv-pressed')
      }, 150)

      const label =
        tvFocusedElement.getAttribute('title') ||
        tvFocusedElement.getAttribute('aria-label') ||
        tvFocusedElement.textContent?.trim() ||
        'Validé'
      showRemoteToast(label.slice(0, 24), '🔘')
      tvFocusedElement.click()
      return
    }

    const video = document.querySelector('video')
    if (video) {
      if (video.paused) {
        video.play().catch(() => {})
        showRemoteToast('Lecture', '▶️')
      } else {
        video.pause()
        showRemoteToast('Pause', '⏸️')
      }
      return
    }

    navigateNetflixTV('down')
  }

  // 8. Action Router Dispatcher
  function handleRemoteAction(action) {
    const now = Date.now()
    if (action === lastActionKey && now - lastActionTime < 130) {
      return
    }
    lastActionTime = now
    lastActionKey = action

    injectTVStyles()

    // Real native macOS hardware volume feedback
    if (action.startsWith('mac_volume:')) {
      const vol = action.replace('mac_volume:', '').trim()
      if (vol === 'mute') {
        showRemoteToast('Mac en sourdine', '🔇')
      } else {
        showRemoteToast(`Volume Mac : ${vol}%`, '🔊')
      }
      return
    }

    const video = document.querySelector('video')
    const inPlayer = window.location.hash.includes('/player') || !!video

    switch (action) {
      case 'play_pause':
        if (video) {
          if (video.paused) {
            video.play().catch(() => {})
            showRemoteToast('Lecture', '▶️')
          } else {
            video.pause()
            showRemoteToast('Pause', '⏸️')
          }
        } else {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true })
          )
          showRemoteToast('Lecture / Pause', '⏯️')
        }
        break

      case 'seek_forward':
        if (video) {
          video.currentTime = Math.min(video.duration || 99999, video.currentTime + 10)
          showRemoteToast('+10s', '⏩')
        } else {
          const main = document.querySelector('main')
          if (main) main.scrollBy({ top: 450, behavior: 'smooth' })
          showRemoteToast('Page Suivante', '⬇️')
        }
        break

      case 'seek_backward':
        if (video) {
          video.currentTime = Math.max(0, video.currentTime - 10)
          showRemoteToast('-10s', '⏪')
        } else {
          const main = document.querySelector('main')
          if (main) main.scrollBy({ top: -450, behavior: 'smooth' })
          showRemoteToast('Page Précédente', '⬆️')
        }
        break

      case 'fullscreen':
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.().catch(() => {})
          showRemoteToast('Plein écran', '⛶')
        } else {
          document.exitFullscreen?.().catch(() => {})
          showRemoteToast('Fenêtré', '🗗')
        }
        break

      case 'subtitles':
        if (video && video.textTracks && video.textTracks.length > 0) {
          const track = video.textTracks[0]
          track.mode = track.mode === 'showing' ? 'hidden' : 'showing'
          showRemoteToast(
            track.mode === 'showing' ? 'Sous-titres activés' : 'Sous-titres masqués',
            '💬'
          )
        } else {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true })
          )
          showRemoteToast('Sous-titres', '💬')
        }
        break

      case 'next_episode':
        const nextBtn = document.querySelector('[data-remote="next-episode"], .btn-next-episode, [title="Épisode suivant"]')
        if (nextBtn) {
          nextBtn.click()
        } else {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'n', code: 'KeyN', bubbles: true })
          )
        }
        showRemoteToast('Épisode Suivant', '⏭️')
        break

      case 'prev_episode':
        const prevBtn = document.querySelector('[data-remote="prev-episode"], .btn-prev-episode')
        if (prevBtn) {
          prevBtn.click()
        } else {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true })
          )
        }
        showRemoteToast('Épisode Précédent', '⏮️')
        break

      case 'up':
        navigateNetflixTV('up')
        break

      case 'down':
        navigateNetflixTV('down')
        break

      case 'left':
        navigateNetflixTV('left')
        break

      case 'right':
        navigateNetflixTV('right')
        break

      case 'select':
        handleSelect()
        break

      case 'menu':
      case 'header_menu':
        jumpToHeaderMenu()
        break

      case 'home':
        router.push('/home')
        showRemoteToast('Accueil', '🏠')
        break

      case 'back':
        if (isSearchOpen?.value) {
          closeSearch()
          showRemoteToast('Recherche fermée', '✕')
          return
        }

        // Check if full-screen episodes overlay in player is open: close it
        const epOverlay = document.querySelector('[class*="bg-black/92"]')
        if (epOverlay && epOverlay.offsetWidth > 0) {
          // If season dropdown inside episodes overlay is open: close it first!
          const openSeasonDropdown = epOverlay.querySelector('[class*="w-72"]')
          if (openSeasonDropdown && openSeasonDropdown.offsetWidth > 0) {
            const seasonToggle = epOverlay.querySelector('button[aria-label="Changer de saison"]')
            if (seasonToggle) {
              seasonToggle.click()
              showRemoteToast('Saison fermée', '✕')
              return
            }
          }

          // Otherwise close the episodes panel
          const epCloseBtn =
            epOverlay.querySelector('button[aria-label="Fermer la liste des épisodes"]') ||
            Array.from(epOverlay.querySelectorAll('button')).find(
              (b) => b.getAttribute('aria-label')?.includes('Fermer') || b.querySelector('svg[class*="IconX"]')
            )

          if (epCloseBtn) {
            epCloseBtn.click()
          }

          // Also dispatch Escape to guarantee showEpisodesPanel becomes false in Vue component
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })
          )
          showRemoteToast('Épisodes fermés', '✕')
          return
        }

        // Check if Season Popover Modal in DetailView is open: close it
        const seasonModalEl = document.querySelector('#detail-season-modal')
        if (seasonModalEl && seasonModalEl.offsetWidth > 0) {
          const seasonCloseBtn = seasonModalEl.querySelector('button')
          if (seasonCloseBtn) {
            seasonCloseBtn.click()
            showRemoteToast('Saisons fermées', '✕')
            return
          }
        }

        // Check if options / sources modal is open:
        const modalEl = document.querySelector('[class*="max-h-[65vh]"]')
        if (modalEl && modalEl.offsetWidth > 0) {
          const modalBackBtn = modalEl.querySelector('div:first-child button:first-child')
          const modalCloseBtn = modalEl.querySelector('div:first-child button:last-child')
          if (modalBackBtn && modalBackBtn !== modalCloseBtn) {
            modalBackBtn.click()
            showRemoteToast('Précédent', '‹')
            return
          }
          if (modalCloseBtn) {
            modalCloseBtn.click()
            showRemoteToast('Options fermées', '✕')
            return
          }
        }

        // If in player: click top-left Back button to exit
        if (inPlayer) {
          const playerBackBtn = document.querySelector(
            'button[title="Retour"], [class*="top-8"] button:first-child, [class*="IconArrowLeft"]'
          )
          if (playerBackBtn && playerBackBtn.closest('button')) {
            playerBackBtn.closest('button').click()
            showRemoteToast('Retour', '‹')
            return
          }
        }

        const closeBtn = document.querySelector(
          '[data-remote="close-modal"], .btn-close, [class*="IconX"]'
        )
        if (closeBtn && closeBtn.closest('button')) {
          closeBtn.closest('button').click()
          showRemoteToast('Fermé', '✕')
        } else if (window.history.length > 1) {
          router.back()
          showRemoteToast('Retour', '‹')
        } else {
          router.push('/home')
        }
        break

      case 'search':
        openSearch()
        showRemoteToast('Recherche', '🔍')
        break

      default:
        console.log('[Kawu Remote] Action:', action)
        break
    }
  }

  // 9. Connect SINGLE listener (Wails native OR SSE fallback)
  function setupListeners() {
    injectTVStyles()

    let hasWails = false
    try {
      if (typeof EventsOn === 'function') {
        hasWails = true
        cancelWailsListener = EventsOn('remote:action', (action) => {
          handleRemoteAction(action)
        })
      } else if (window.runtime?.EventsOn) {
        hasWails = true
        cancelWailsListener = window.runtime.EventsOn('remote:action', (action) => {
          handleRemoteAction(action)
        })
      }
    } catch (e) {
      console.warn('Wails EventsOn absent:', e)
    }

    if (!hasWails) {
      try {
        sseEventSource = new EventSource('http://127.0.0.1:8765/api/remote/events')
        sseEventSource.onmessage = (e) => {
          if (e.data && e.data !== 'ok') {
            handleRemoteAction(e.data)
          }
        }
        sseEventSource.onerror = () => {}
      } catch (e) {
        console.warn('SSE remote listener error:', e)
      }
    }

    // Ensure scroll to top on route change
    router.afterEach(() => {
      const main = document.querySelector('main')
      if (main) main.scrollTo({ top: 0, behavior: 'instant' })
      window.scrollTo(0, 0)

      if (tvFocusedElement) {
        tvFocusedElement.classList.remove('kawu-tv-focus', 'kawu-tv-pressed')
        tvFocusedElement = null
      }

      setTimeout(() => {
        const isDetail =
          window.location.hash.includes('/detail') || window.location.hash.includes('/media')
        if (isDetail) {
          const playBtn = document.querySelector('#detail-action-buttons button, main button.bg-cyan-400')
          if (playBtn) {
            setTVFocus(playBtn, { smoothScroll: false })
          }
        }
      }, 400)
    })
  }

  onMounted(() => {
    setupListeners()
  })

  onUnmounted(() => {
    if (typeof cancelWailsListener === 'function') {
      cancelWailsListener()
    }
    if (sseEventSource) {
      sseEventSource.close()
    }
    if (tvFocusedElement) {
      tvFocusedElement.classList.remove('kawu-tv-focus', 'kawu-tv-pressed')
      tvFocusedElement = null
    }
  })

  return {
    handleRemoteAction,
    navigateNetflixTV,
    jumpToHeaderMenu,
    handleSelect,
  }
}
