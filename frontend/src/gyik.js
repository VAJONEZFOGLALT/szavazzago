document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const elements = {
    adminAccessBtn: document.getElementById("adminAccessBtn"),
  }

  // Initialize
  init()

  function init() {
    setupSmoothScrolling()
    setupAccordionEnhancements()
    checkAdminStatus()
    highlightActiveSection()
  }

  // Smooth scrolling for navigation links
  function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (e) {
        e.preventDefault()
        const target = document.querySelector(this.getAttribute("href"))
        if (target) {
          target.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })

          // Update URL without jumping
          history.pushState(null, null, this.getAttribute("href"))
        }
      })
    })
  }

  // Enhanced accordion functionality
  function setupAccordionEnhancements() {
    // Add icons to accordion buttons
    document.querySelectorAll(".accordion-button").forEach((button) => {
      if (!button.querySelector(".accordion-icon")) {
        const icon = document.createElement("i")
        icon.className = "fas fa-chevron-down accordion-icon me-2"
        button.insertBefore(icon, button.firstChild)
      }
    })

    // Handle accordion state changes
    document.querySelectorAll(".accordion-collapse").forEach((collapse) => {
      collapse.addEventListener("show.bs.collapse", function () {
        const button = document.querySelector(`[data-bs-target="#${this.id}"]`)
        const icon = button.querySelector(".accordion-icon")
        if (icon) {
          icon.style.transform = "rotate(180deg)"
        }
      })

      collapse.addEventListener("hide.bs.collapse", function () {
        const button = document.querySelector(`[data-bs-target="#${this.id}"]`)
        const icon = button.querySelector(".accordion-icon")
        if (icon) {
          icon.style.transform = "rotate(0deg)"
        }
      })
    })
  }

  // Highlight active section in navigation
  function highlightActiveSection() {
    const sections = document.querySelectorAll(".faq-section")
    const navLinks = document.querySelectorAll(".quick-nav-item a")

    function updateActiveSection() {
      let current = ""
      sections.forEach((section) => {
        const sectionTop = section.offsetTop - 100
        if (window.pageYOffset >= sectionTop) {
          current = section.getAttribute("id")
        }
      })

      navLinks.forEach((link) => {
        link.classList.remove("active")
        if (link.getAttribute("href") === `#${current}`) {
          link.classList.add("active")
        }
      })
    }

    window.addEventListener("scroll", updateActiveSection)
    updateActiveSection() // Initial call
  }

  // Search functionality (if needed in the future)
  function setupSearch() {
    const searchInput = document.getElementById("faqSearch")
    if (!searchInput) return

    searchInput.addEventListener("input", function () {
      const searchTerm = this.value.toLowerCase()
      const accordionItems = document.querySelectorAll(".accordion-item")

      accordionItems.forEach((item) => {
        const button = item.querySelector(".accordion-button")
        const body = item.querySelector(".accordion-body")
        const buttonText = button.textContent.toLowerCase()
        const bodyText = body.textContent.toLowerCase()

        if (buttonText.includes(searchTerm) || bodyText.includes(searchTerm)) {
          item.style.display = "block"
          if (searchTerm.length > 2) {
            // Auto-expand matching items
            const collapse = item.querySelector(".accordion-collapse")
            if (collapse && !collapse.classList.contains("show")) {
              button.click()
            }
          }
        } else {
          item.style.display = "none"
        }
      })
    })
  }

  // Copy link functionality
  function setupCopyLinks() {
    document.querySelectorAll(".faq-section h3").forEach((heading) => {
      const section = heading.closest(".faq-section")
      const sectionId = section.getAttribute("id")

      const copyButton = document.createElement("button")
      copyButton.className = "btn btn-sm btn-outline-secondary ms-2 copy-link-btn"
      copyButton.innerHTML = '<i class="fas fa-link"></i>'
      copyButton.title = "Link másolása"

      copyButton.addEventListener("click", () => {
        const url = `${window.location.origin}${window.location.pathname}#${sectionId}`
        navigator.clipboard.writeText(url).then(() => {
          showToast("Link másolva a vágólapra!", "success")
        })
      })

      heading.appendChild(copyButton)
    })
  }

  // Print functionality
  function setupPrintButton() {
    const printButton = document.createElement("button")
    printButton.className = "btn btn-outline-secondary position-fixed"
    printButton.style.cssText = "bottom: 80px; right: 20px; z-index: 1000;"
    printButton.innerHTML = '<i class="fas fa-print"></i>'
    printButton.title = "Oldal nyomtatása"

    printButton.addEventListener("click", () => {
      window.print()
    })

    document.body.appendChild(printButton)
  }

  // Back to top functionality
  function setupBackToTop() {
    const backToTopButton = document.createElement("button")
    backToTopButton.className = "btn btn-primary position-fixed back-to-top"
    backToTopButton.style.cssText = "bottom: 140px; right: 20px; z-index: 1000; display: none;"
    backToTopButton.innerHTML = '<i class="fas fa-arrow-up"></i>'
    backToTopButton.title = "Vissza a tetejére"

    backToTopButton.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      })
    })

    window.addEventListener("scroll", () => {
      if (window.pageYOffset > 300) {
        backToTopButton.style.display = "block"
      } else {
        backToTopButton.style.display = "none"
      }
    })

    document.body.appendChild(backToTopButton)
  }

  // Toast notification system
  function showToast(message, type = "info") {
    const toastContainer = document.getElementById("toastContainer") || createToastContainer()
    const toast = document.createElement("div")
    toast.className = `toast show align-items-center text-white bg-${type} border-0`
    toast.setAttribute("role", "alert")
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `
    toastContainer.appendChild(toast)

    setTimeout(() => {
      toast.classList.remove("show")
      toast.addEventListener("transitionend", () => toast.remove())
    }, 5000)
  }

  function createToastContainer() {
    const container = document.createElement("div")
    container.id = "toastContainer"
    container.className = "position-fixed bottom-0 end-0 p-3"
    container.style.zIndex = "1100"
    document.body.appendChild(container)
    return container
  }

  // Admin status check
  function isAdmin() {
    return localStorage.getItem("isAdmin") === "true"
  }

  function checkAdminStatus() {
    if (elements.adminAccessBtn) {
      elements.adminAccessBtn.style.display = isAdmin() ? "flex" : "none"
    }
  }

  // Initialize additional features
  setupBackToTop()

  // Handle URL hash on page load
  if (window.location.hash) {
    setTimeout(() => {
      const target = document.querySelector(window.location.hash)
      if (target) {
        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }
    }, 100)
  }
})
