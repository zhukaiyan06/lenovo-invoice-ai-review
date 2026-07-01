import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, clearStoredToken, getStoredToken, storeToken, type ApiUser } from '@/api/client'

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<ApiUser | null>(null)
  const initialized = ref(false)
  const token = ref<string | null>(getStoredToken())

  const isLoggedIn = computed(() => Boolean(currentUser.value))
  const isL2 = computed(() => currentUser.value?.role === 'L2')
  const isAuditor = computed(() => ['AUDITOR', 'SUPERVISOR'].includes(currentUser.value?.role ?? ''))
  const isSupervisor = computed(() => currentUser.value?.role === 'SUPERVISOR')

  async function login(username: string, password: string) {
    const result = await api.login(username, password)
    token.value = result.token
    storeToken(result.token)
    currentUser.value = result.user
  }

  async function restoreSession() {
    if (initialized.value) return
    initialized.value = true

    if (!token.value) return

    try {
      const result = await api.me()
      currentUser.value = result.user
    } catch {
      logout()
    }
  }

  function logout() {
    currentUser.value = null
    token.value = null
    clearStoredToken()
  }

  return {
    currentUser,
    initialized,
    token,
    isLoggedIn,
    isL2,
    isAuditor,
    isSupervisor,
    login,
    restoreSession,
    logout
  }
})
