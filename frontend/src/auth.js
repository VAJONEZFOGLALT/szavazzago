// Constants
const API_BASE_URL = "https://szavazzago.onrender.com/api"
let initializationAttempts = 0
const MAX_INIT_ATTEMPTS = 3
const INIT_RETRY_DELAY = 2000 // 2 seconds
let lastKnownUser = null

// Authentication utilities
class AuthManager {
  constructor() {
    this.token = localStorage.getItem('token')
    this.user = JSON.parse(localStorage.getItem('user'))
    this.votedQuestions = new Set(JSON.parse(localStorage.getItem('votedQuestions') || '[]'))
    this.reactedQuestions = new Map(JSON.parse(localStorage.getItem('reactedQuestions') || '[]'))
    this.isInitialized = false
    this.initializationInProgress = false
    console.log('AuthManager initialized with token:', !!this.token)
  }

  async initialize() {
    console.log('Initializing auth...')
    
    // Prevent multiple simultaneous initializations
    if (this.initializationInProgress) {
      console.log('Initialization already in progress, skipping...')
      return
    }

    if (this.isInitialized) {
      console.log('Auth already initialized, skipping...')
      return
    }

    this.initializationInProgress = true

    try {
      if (this.token) {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${this.token}` }
        })
        
        if (response.ok) {
          const data = await response.json()
          this.user = data.user
          localStorage.setItem('user', JSON.stringify(data.user))
          this.updateUI()
          return true
        } else {
          console.log('Token verification failed, logging out')
          this.logout()
          return false
        }
      }
    } catch (error) {
      console.error('Error verifying token:', error)
      this.logout()
      return false
    } finally {
      this.initializationInProgress = false
      this.isInitialized = true
    }
  }

  async login(username, password) {
    console.log('Attempting login for user:', username)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      this.token = data.token
      this.user = data.user
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return true
    } catch (error) {
      console.error('Login error:', error)
      throw error
    }
  }

  async register(username, email, password) {
    console.log('Attempting registration for user:', username)
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      this.token = data.token
      this.user = data.user
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      return true
    } catch (error) {
      console.error('Registration error:', error)
      throw error
    }
  }

  logout() {
    console.log('Logging out user')
    this.token = null
    this.user = null
    this.votedQuestions.clear()
    this.reactedQuestions.clear()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('votedQuestions')
    localStorage.removeItem('reactedQuestions')
    this.updateUI()
  }

  isLoggedIn() {
    return !!this.token && !!this.user
  }

  isAdmin() {
    return this.user?.isAdmin || false
  }

  getCurrentUser() {
    return this.user
  }

  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`
    }
  }

  hasVoted(questionId) {
    return this.votedQuestions.has(questionId)
  }

  markAsVoted(questionId) {
    this.votedQuestions.add(questionId)
    localStorage.setItem('votedQuestions', JSON.stringify([...this.votedQuestions]))
  }

  hasReacted(questionId, type) {
    return this.reactedQuestions.get(questionId) === type
  }

  markAsReacted(questionId, reaction) {
    this.reactedQuestions.set(questionId, reaction)
    localStorage.setItem('reactedQuestions', JSON.stringify([...this.reactedQuestions]))
  }

  getReaction(questionId) {
    return this.reactedQuestions.get(questionId)
  }

  isQuestionOwner(questionAuthorId) {
    return this.user && this.user.id === questionAuthorId
  }

  updateUI() {
    console.log('Updating UI for user:', this.user)
    const loginButton = document.getElementById('loginButtonText')
    const logoutButton = document.getElementById('logoutBtn')
    const logoutNavItem = document.getElementById('logoutNavItem')
    const adminNavItem = document.getElementById('adminNavItem')
    const adminPanelBtn = document.getElementById('adminPanelBtn')
    const userInfo = document.getElementById('userInfo')
    const userInfoText = document.getElementById('userInfoText')
    const userInfoNavItem = document.getElementById('userInfoNavItem')

    if (this.isLoggedIn()) {
      console.log('User is logged in, updating UI accordingly')
      if (loginButton) loginButton.textContent = this.user.username
      if (logoutButton) logoutButton.style.display = 'inline'
      if (logoutNavItem) logoutNavItem.style.display = 'block'
      if (adminNavItem) adminNavItem.style.display = this.isAdmin() ? 'block' : 'none'
      if (adminPanelBtn) adminPanelBtn.style.display = this.isAdmin() ? 'inline' : 'none'
      if (userInfo) userInfo.style.display = 'block'
      if (userInfoText) userInfoText.textContent = this.user.username
      if (userInfoNavItem) userInfoNavItem.style.display = 'block'
    } else {
      console.log('User is not logged in, resetting UI')
      if (loginButton) loginButton.textContent = 'Bejelentkezés'
      if (logoutButton) logoutButton.style.display = 'none'
      if (logoutNavItem) logoutNavItem.style.display = 'none'
      if (adminNavItem) adminNavItem.style.display = 'none'
      if (adminPanelBtn) adminPanelBtn.style.display = 'none'
      if (userInfo) userInfo.style.display = 'none'
      if (userInfoNavItem) userInfoNavItem.style.display = 'none'
    }
  }
}

// Create and export a single instance
window.authManager = new AuthManager()

// Initialize auth when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing auth...')
  window.authManager.initialize()
})
