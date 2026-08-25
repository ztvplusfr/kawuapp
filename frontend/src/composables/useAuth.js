import { ref, computed } from 'vue'
import { LoginWithGoogle as WailsLoginWithGoogle } from '../../wailsjs/go/main/App'
import { playWelcomeSound } from './useAudio'
import { syncUserProfile } from '../services/supabase'
import { WindowShow, WindowUnminimise } from '../../wailsjs/runtime/runtime'

const AUTH_STORAGE_KEY = 'kawu_user_session'

// Restore persisted Google session from localStorage if available
function getInitialAuthState() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const profile = data.profile || data.user || {}
      return {
        isLoggedIn: true,
        userProfile: profile,
        userId: profile.id || '',
        userEmail: profile.email || '',
        userName: profile.name || profile.email || 'Utilisateur',
        userAvatar: profile.picture || profile.avatar_url || ''
      }
    }
  } catch (e) {
    console.warn('Impossible de charger la session locale:', e)
  }
  return {
    isLoggedIn: false,
    userProfile: null,
    userId: '',
    userEmail: '',
    userName: 'Invité',
    userAvatar: ''
  }
}

const initialState = getInitialAuthState()

const isLoggedIn = ref(initialState.isLoggedIn)
const userProfile = ref(initialState.userProfile)
const userId = ref(initialState.userId)
const userEmail = ref(initialState.userEmail)
const userName = ref(initialState.userName)
const userAvatar = ref(initialState.userAvatar)
const isAuthenticating = ref(false)
const authError = ref('')
const showWelcomeScreen = ref(false)

// Background sync on startup if already logged in
if (isLoggedIn.value && userProfile.value?.id) {
  syncUserProfile(userProfile.value)
    .then(dbUser => {
      if (dbUser) {
        userProfile.value = { ...userProfile.value, ...dbUser }
        userName.value = dbUser.name || userProfile.value.name
        userAvatar.value = dbUser.picture || userProfile.value.picture
      }
    })
    .catch(err => console.warn('[Supabase Init Sync]', err))
}

export function useAuth() {
  /**
   * Connexion via Google OAuth (PKCE natif Desktop Go) + Remplissage / Mise à jour table users Supabase
   */
  async function loginWithGoogle() {
    if (isAuthenticating.value) return
    isAuthenticating.value = true
    authError.value = ''
    try {
      // 1. Récupération du profil Google via le serveur loopback Go
      const profile = await WailsLoginWithGoogle()
      if (profile && profile.id) {
        // 2. Synchronisation / Upsert immédiat dans la table users Supabase
        const dbUser = await syncUserProfile(profile)
        const activeProfile = dbUser ? { ...profile, ...dbUser } : profile

        // 3. Mise à jour de l'état réactif de l'application
        userProfile.value = activeProfile
        userId.value = String(activeProfile.id)
        userEmail.value = activeProfile.email || ''
        userName.value = activeProfile.name || activeProfile.email || 'Utilisateur'
        userAvatar.value = activeProfile.picture || ''
        isLoggedIn.value = true

        // 4. Sauvegarde persistante de la session Google dans l'app
        try {
          const sessionPayload = {
            profile: activeProfile,
            userId: userId.value,
            email: userEmail.value,
            name: userName.value,
            picture: userAvatar.value,
            loggedAt: new Date().toISOString()
          }
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(sessionPayload))
        } catch (e) {
          console.error('Erreur de persistance de session:', e)
        }

        // 5. Feedback sonore et visuel de bienvenue
        showWelcomeScreen.value = true
        playWelcomeSound()

        // 6. Mettre l'app au premier plan
        WindowShow()
        WindowUnminimise()
        if (window.focus) window.focus()
      }
    } catch (err) {
      console.error('Erreur Google Auth / Supabase:', err)
      authError.value = 'Erreur lors de la connexion Google'
    } finally {
      isAuthenticating.value = false
    }
  }

  /**
   * Déconnexion et suppression de la session
   */
  function logout() {
    isLoggedIn.value = false
    userProfile.value = null
    userId.value = ''
    userEmail.value = ''
    userName.value = 'Invité'
    userAvatar.value = ''
    showWelcomeScreen.value = false
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch (e) {
      console.error('Erreur suppression session locale:', e)
    }
  }

  function closeWelcomeScreen() {
    showWelcomeScreen.value = false
  }

  return {
    isLoggedIn,
    userProfile,
    userId,
    userEmail,
    userName,
    userAvatar,
    isAuthenticating,
    authError,
    showWelcomeScreen,
    loginWithGoogle,
    logout,
    closeWelcomeScreen
  }
}
