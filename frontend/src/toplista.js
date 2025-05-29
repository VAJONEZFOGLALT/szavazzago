document.addEventListener("DOMContentLoaded", () => {
  // Constants
  const STORAGE_KEY = "szavazza-go-questions"
  const API_BASE_URL = "http://localhost:3000/api"

  // DOM Elements
  const elements = {
    // Tab containers
    mostVotesList: document.getElementById("mostVotesList"),
    mostLikedList: document.getElementById("mostLikedList"),
    trendingList: document.getElementById("trendingList"),
    recentList: document.getElementById("recentList"),
    emptyToplistState: document.getElementById("emptyToplistState"),

    // Filters
    timeRangeSelect: document.getElementById("timeRangeSelect"),
    minVotesFilter: document.getElementById("minVotesFilter"),
    categoryFilter: document.getElementById("categoryFilter"),

    // Stats
    totalQuestionsCount: document.getElementById("totalQuestionsCount"),
    totalVotesCount: document.getElementById("totalVotesCount"),
    activeUsersCount: document.getElementById("activeUsersCount"),
    trendingQuestionsCount: document.getElementById("trendingQuestionsCount"),

    // Admin
    adminAccessBtn: document.getElementById("adminAccessBtn"),
  }
  console.log('TOPLISTA ELEMENTS:', elements);

  let allQuestions = []
  let currentTab = "most-votes"

  // Initialize
  init()

  function init() {
    fetchTopQuestions('mostVotes')
    populateCategories()
    updateOverallStats()
    setupEventListeners()
    checkAdminStatus()
  }

  function setupEventListeners() {
    // Tab switching
    document.querySelectorAll('[data-bs-toggle="pill"]').forEach((tab) => {
      tab.addEventListener("shown.bs.tab", (e) => {
        const tabId = e.target.getAttribute("data-bs-target").replace("#", "")
        currentTab = tabId
        fetchTopQuestions(tabId.replace('-', ''))
      })
    })

    // Filters
    elements.timeRangeSelect.addEventListener("change", () => fetchTopQuestions(currentTab.replace('-', '')))
    elements.minVotesFilter.addEventListener("change", () => fetchTopQuestions(currentTab.replace('-', '')))
  }

  function fetchTopQuestions(sort = 'mostVotes') {
    const timeRange = elements.timeRangeSelect.value
    const minVotes = elements.minVotesFilter.value

    let url = `${API_BASE_URL}/questions/top?sort=${sort}`
    if (timeRange !== 'all') url += `&timeRange=${timeRange}`
    if (minVotes > 0) url += `&minVotes=${minVotes}`

    fetch(url)
      .then(res => res.json())
      .then(questions => {
        allQuestions = questions
        updateOverallStats()
        renderTopQuestions(questions, sort)
      })
      .catch(err => {
        console.error('Error fetching questions:', err)
        showToast('Hiba történt a kérdések betöltése közben', 'error')
      })
  }

  function populateCategories() {
    const categories = new Set()
    allQuestions.forEach((question) => {
      if (question.tags) {
        question.tags.forEach((tag) => categories.add(tag))
      }
    })

    elements.categoryFilter.innerHTML = '<option value="all">Minden kategória</option>'
    Array.from(categories)
      .sort()
      .forEach((category) => {
        const option = document.createElement("option")
        option.value = category
        option.textContent = `#${category}`
        elements.categoryFilter.appendChild(option)
      })
  }

  function updateOverallStats() {
    const totalQuestions = allQuestions.length
    const totalVotes = allQuestions.reduce((sum, q) => sum + (q.votes || 0), 0)
    const uniqueAuthors = new Set(allQuestions.map((q) => q.author)).size
    const trendingCount = allQuestions.filter(q => {
      const createdAt = new Date(q.created_at)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
      return createdAt >= oneDayAgo && (q.votes >= 3 || q.likes >= 2)
    }).length

    elements.totalQuestionsCount.textContent = totalQuestions
    elements.totalVotesCount.textContent = totalVotes
    elements.activeUsersCount.textContent = uniqueAuthors
    elements.trendingQuestionsCount.textContent = trendingCount
  }

  function renderTopQuestions(questions, sort) {
    const containerMap = {
      mostVotes: elements.mostVotesList,
      mostLiked: elements.mostLikedList,
      trending: elements.trendingList,
      recent: elements.recentList
    }

    const container = containerMap[sort]
    if (!container) return

    if (questions.length === 0) {
      elements.emptyToplistState.style.display = "block"
      container.innerHTML = ""
      return
    }

    elements.emptyToplistState.style.display = "none"
    container.innerHTML = questions.map((question, index) => createToplistCard(question, index + 1, sort)).join("")
    addLikeDislikeListeners()
  }

  function createToplistCard(question, rank, tabType) {
    const rankIcon = getRankIcon(rank)
    const primaryStat = getPrimaryStat(question, tabType)
    const secondaryStats = getSecondaryStats(question, tabType)

    return `
      <div class="card bg-darker border-secondary toplist-item mb-3">
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-auto">
              <div class="rank-badge ${getRankClass(rank)}">
                ${rankIcon}
                <div class="rank-number">${rank}</div>
              </div>
            </div>
            <div class="col">
              <div class="question-content">
                <h5 class="question-title text-white mb-2">${escapeHTML(question.text)}</h5>
                <div class="question-meta d-flex flex-wrap align-items-center gap-3 mb-2">
                  <small class="text-white-50">
                    <i class="fas fa-calendar me-1"></i>
                    ${formatDate(question.created_at)}
                  </small>
                  <small class="text-white-50">
                    <i class="fas fa-user me-1"></i>
                    ${question.author || "Névtelen"}
                  </small>
                </div>
                <div class="like-dislike-group mt-2">
                  <button class="btn btn-sm btn-outline-success me-2 like-btn" data-id="${question.id}"><i class="fas fa-thumbs-up"></i> <span class="like-count">${question.likes || 0}</span></button>
                  <button class="btn btn-sm btn-outline-danger dislike-btn" data-id="${question.id}"><i class="fas fa-thumbs-down"></i> <span class="dislike-count">${question.dislikes || 0}</span></button>
                </div>
              </div>
            </div>
            <div class="col-auto">
              <div class="stats-column text-end">
                <div class="primary-stat">
                  <div class="stat-value text-white fw-bold">${primaryStat.value}</div>
                  <small class="stat-label text-white-50">${primaryStat.label}</small>
                </div>
                <div class="secondary-stats mt-2">
                  ${secondaryStats
                    .map(
                      (stat) => `
                    <div class="secondary-stat">
                      <i class="${stat.icon} me-1"></i>
                      <span class="text-white-50">${stat.value}</span>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Answers Preview -->
          <div class="answers-preview mt-3">
            <div class="row">
              ${question.answers
                .slice(0, 2)
                .map(
                  (answer, index) => `
                <div class="col-md-6 mb-2">
                  <div class="answer-preview-small bg-dark rounded p-2">
                    <small class="text-white">${index + 1}. ${escapeHTML(answer.text)}</small>
                    <span class="badge bg-secondary ms-2">${answer.votes || 0} szavazat</span>
                  </div>
                </div>
              `,
                )
                .join("")}
              ${
                question.answers.length > 2
                  ? `
                <div class="col-12">
                  <small class="text-white-50">
                    <i class="fas fa-plus me-1"></i>
                    +${question.answers.length - 2} további válasz
                  </small>
                </div>
              `
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
    `
  }

  function getRankIcon(rank) {
    switch (rank) {
      case 1:
        return '<i class="fas fa-crown"></i>'
      case 2:
        return '<i class="fas fa-medal"></i>'
      case 3:
        return '<i class="fas fa-award"></i>'
      default:
        return ""
    }
  }

  function getRankClass(rank) {
    switch (rank) {
      case 1:
        return "rank-gold"
      case 2:
        return "rank-silver"
      case 3:
        return "rank-bronze"
      default:
        return "rank-default"
    }
  }

  function getPrimaryStat(question, tabType) {
    switch (tabType) {
      case "mostVotes":
        return { value: question.votes || 0, label: "szavazat" }
      case "mostLiked":
        return { value: question.likes || 0, label: "like" }
      case "trending":
        return { value: question.engagement || 0, label: "pont" }
      case "recent":
        return { value: formatTimeAgo(question.created_at), label: "" }
      default:
        return { value: question.votes || 0, label: "szavazat" }
    }
  }

  function getSecondaryStats(question, tabType) {
    const stats = []

    if (tabType !== "mostVotes") {
      stats.push({ icon: "fas fa-vote-yea", value: question.votes || 0 })
    }
    if (tabType !== "mostLiked") {
      stats.push({ icon: "fas fa-thumbs-up", value: question.likes || 0 })
    }
    stats.push({ icon: "fas fa-thumbs-down", value: question.dislikes || 0 })
    stats.push({ icon: "fas fa-list", value: question.answers.length })

    return stats
  }

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString("hu-HU", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function formatTimeAgo(dateString) {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) {
      return `${diffDays} napja`
    } else if (diffHours > 0) {
      return `${diffHours} órája`
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      return `${diffMinutes} perce`
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  }

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

  function isAdmin() {
    return localStorage.getItem("isAdmin") === "true"
  }

  function checkAdminStatus() {
    if (elements.adminAccessBtn) {
      elements.adminAccessBtn.style.display = isAdmin() ? "flex" : "none"
    }
  }

  // Toplist tab logic
  const toplistTabs = document.getElementById('toplistTabs');
  const toplistTabsContent = document.getElementById('toplistTabsContent');

  // Tab click event
  if (toplistTabs) {
    toplistTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button, a');
      if (!btn) return;
      let sort = 'mostVotes';
      if (btn.id === 'most-liked-tab') sort = 'mostLiked';
      if (btn.id === 'trending-tab') sort = 'trending';
      if (btn.id === 'recent-tab') sort = 'recent';
      // Highlight active tab
      toplistTabs.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
      btn.classList.add('active');
      // Show correct tab content
      toplistTabsContent.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('show', 'active'));
      const tabMap = {
        mostVotes: 'most-votes',
        mostLiked: 'most-liked',
        trending: 'trending',
        recent: 'recent'
      };
      const pane = document.getElementById(tabMap[sort]);
      if (pane) {
        pane.classList.add('show', 'active');
      }
      fetchTopQuestions(sort);
    });
  }

  // Initial load
  fetchTopQuestions('mostVotes');

  // After rendering, add event listeners for like/dislike
  function addLikeDislikeListeners() {
    document.querySelectorAll('.like-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')
        await reactToQuestion(id, 'like', btn)
      })
    })
    document.querySelectorAll('.dislike-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.getAttribute('data-id')
        await reactToQuestion(id, 'dislike', btn)
      })
    })
  }

  async function reactToQuestion(id, reaction, btn) {
    const token = localStorage.getItem('token')
    if (!token) {
      showToast('Előbb jelentkezz be!', 'danger')
      return
    }
    try {
      const res = await fetch(`${API_BASE_URL}/questions/${id}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ reaction })
      })
      if (!res.ok) throw new Error('Hiba a szavazat rögzítésekor')
      // Refresh toplist
      fetchTopQuestions(currentTab.replace('-', ''))
    } catch (err) {
      showToast('Hiba a szavazat rögzítésekor', 'danger')
    }
  }
})
