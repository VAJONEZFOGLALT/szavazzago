// Global authentication handler for all pages
;(() => {
  // Initialize auth manager on every page
  function initGlobalAuth() {
    // Load auth manager if not already loaded
    if (!window.authManager && window.AuthManager) {
      window.authManager = new window.AuthManager()
    }

    // Update navigation on all pages
    updateGlobalNavigation()
  }

  function updateGlobalNavigation() {
    const isLoggedIn = window.authManager && window.authManager.isLoggedIn()
    const isAdmin = window.authManager && window.authManager.isAdmin()

    // Update login/logout buttons on any page
    const loginButtons = document.querySelectorAll('[data-bs-target="#loginModal"], [data-bs-target="#authModal"]')
    const logoutButtons = document.querySelectorAll("#logoutBtn")
    const adminButtons = document.querySelectorAll("#adminPanelBtn")
    const userMenus = document.querySelectorAll("#userMenuNavItem")
    const loginNavItems = document.querySelectorAll("#loginNavItem")

    // Show/hide login buttons
    loginButtons.forEach((btn) => {
      if (btn.closest("#loginNavItem")) {
        btn.closest("#loginNavItem").style.display = isLoggedIn ? "none" : "block"
      } else {
        btn.style.display = isLoggedIn ? "none" : "inline-block"
      }
    })

    // Show/hide user menus
    userMenus.forEach((menu) => {
      menu.style.display = isLoggedIn ? "block" : "none"
      const usernameText = menu.querySelector("#usernameText")
      if (usernameText && isLoggedIn) {
        usernameText.textContent = window.authManager.user.username
      }
    })

    // Show/hide logout buttons
    logoutButtons.forEach((btn) => {
      btn.style.display = isLoggedIn ? "inline-block" : "none"
      btn.onclick = () => {
        window.authManager.logout()
        updateGlobalNavigation()
        // Redirect to home page after logout
        if (window.location.pathname !== "/index.html" && window.location.pathname !== "/") {
          window.location.href = "index.html"
        }
      }
    })

    // Show/hide admin buttons
    adminButtons.forEach((btn) => {
      btn.style.display = isAdmin ? "inline-block" : "none"
    })

    // Update any username displays
    const usernameDisplays = document.querySelectorAll("#usernameDisplay, .username-display")
    usernameDisplays.forEach((display) => {
      if (isLoggedIn) {
        display.textContent = `Üdv, ${window.authManager.user.username}!`
        display.style.display = "block"
      } else {
        display.style.display = "none"
      }
    })
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobalAuth)
  } else {
    initGlobalAuth()
  }

  // Re-initialize when auth state changes
  window.addEventListener("storage", (e) => {
    if (e.key === "authToken" || e.key === "user") {
      initGlobalAuth()
    }
  })

  // Make functions globally available
  window.updateGlobalNavigation = updateGlobalNavigation
})()
