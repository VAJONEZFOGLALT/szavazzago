document.addEventListener("DOMContentLoaded", () => {
  // Constants
  const STORAGE_KEY = "szavazza-go-questions"
  const CURRENT_USER = "currentUser" // This will be dynamic when we add authentication

  // DOM Elements
  const elements = {
    userQuestionsList: document.getElementById("userQuestionsList"),
    emptyUserState: document.getElementById("emptyUserState"),
    noResultsState: document.getElementById("noResultsState"),
    filterSelect: document.getElementById("filterSelect"),
    sortSelect: document.getElementById("sortSelect"),
    searchInput: document.getElementById("searchInput"),
    clearFilters: document.getElementById("clearFilters"),
    // Stats
    totalUserQuestions: document.getElementById("totalUserQuestions"),
    totalUserVotes: document.getElementById("totalUserVotes"),
    totalUserLikes: document.getElementById("totalUserLikes"),
    activeUserQuestions: document.getElementById("activeUserQuestions"),
    // Edit Modal
    editQuestionModal: document.getElementById("editQuestionModal"),
    editQuestionForm: document.getElementById("editQuestionForm"),
    editQuestionId: document.getElementById("editQuestionId"),
    editQuestionText: document.getElementById("editQuestionText"),
    editQuestionCounter: document.getElementById("editQuestionCounter"),
    editAnswersContainer: document.getElementById("editAnswersContainer"),
    editTagsContainer: document.getElementById("editTagsContainer"),
    editNewTagInput: document.getElementById("editNewTagInput"),
    editAddTagBtn: document.getElementById("editAddTagBtn"),
    saveQuestionBtn: document.getElementById("saveQuestionBtn"),
    adminAccessBtn: document.getElementById("adminAccessBtn"),
  }

  let allUserQuestions = []
  let filteredQuestions = []
  let editQuestionModal
  const bootstrap = window.bootstrap // Declare the bootstrap variable

  // Initialize
  init()

  function init() {
    loadUserQuestions()
    updateStats()
    setupEventListeners()
    checkAdminStatus()

    // Initialize Bootstrap modal
    if (elements.editQuestionModal) {
      editQuestionModal = new bootstrap.Modal(elements.editQuestionModal)
    }
  }

  function setupEventListeners() {
    // Filter and search
    if (elements.filterSelect) elements.filterSelect.addEventListener("change", applyFilters)
    if (elements.sortSelect) elements.sortSelect.addEventListener("change", applyFilters)
    if (elements.searchInput) elements.searchInput.addEventListener("input", debounce(applyFilters, 300))

    // Edit modal
    if (elements.editQuestionText) elements.editQuestionText.addEventListener("input", updateEditCounter)
    if (elements.editAddTagBtn) elements.editAddTagBtn.addEventListener("click", addEditTag)
    if (elements.editNewTagInput) {
      elements.editNewTagInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          addEditTag()
        }
      })
    }
    if (elements.saveQuestionBtn) elements.saveQuestionBtn.addEventListener("click", saveEditedQuestion)

    // Tags removal in edit modal
    if (elements.editTagsContainer) elements.editTagsContainer.addEventListener("click", handleEditTagRemoval)
  }

  function loadUserQuestions() {
    const token = localStorage.getItem('token');
    if (!token) {
      showToast('Kérlek jelentkezz be a kérdéseid megtekintéséhez!', 'warning');
      return;
    }

    fetch('https://szavazzago.onrender.com/api/questions/user', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Hiba a kérdések betöltésekor');
      }
      return response.json();
    })
    .then(questions => {
      allUserQuestions = questions;
      filteredQuestions = [...questions];
      updateStats();
      applyFilters();
    })
    .catch(error => {
      console.error('Error:', error);
      showToast('Hiba történt a kérdések betöltésekor', 'danger');
    });
  }

  function updateStats() {
    if (!elements.totalUserQuestions || !elements.totalUserVotes || 
        !elements.totalUserLikes || !elements.activeUserQuestions) {
      console.error('Stats elements not found');
      return;
    }

    console.log('allUserQuestions:', allUserQuestions);

    const totalQuestions = allUserQuestions.length;
    const totalVotes = allUserQuestions.reduce((sum, q) => sum + (parseInt(q.votes) || 0), 0);
    const totalLikes = allUserQuestions.reduce((sum, q) => sum + (parseInt(q.likes) || 0), 0);
    const activeQuestions = allUserQuestions.filter((q) => !q.expiresAt || new Date(q.expiresAt) > new Date()).length;

    elements.totalUserQuestions.textContent = totalQuestions;
    elements.totalUserVotes.textContent = totalVotes;
    elements.totalUserLikes.textContent = totalLikes;
    elements.activeUserQuestions.textContent = activeQuestions;
  }

  function applyFilters() {
    const filterValue = elements.filterSelect ? elements.filterSelect.value : "all"
    const sortValue = elements.sortSelect ? elements.sortSelect.value : "newest"
    const searchValue = elements.searchInput ? elements.searchInput.value.toLowerCase().trim() : ""

    // Filter
    filteredQuestions = allUserQuestions.filter((question) => {
      // Search filter
      if (searchValue && !question.text.toLowerCase().includes(searchValue)) {
        return false
      }

      // Status filter
      switch (filterValue) {
        case "active":
          return !question.expiresAt || new Date(question.expiresAt) > new Date()
        case "expired":
          return question.expiresAt && new Date(question.expiresAt) <= new Date()
        case "popular":
          return (question.votes || 0) >= 10
        default:
          return true
      }
    })

    // Sort
    filteredQuestions.sort((a, b) => {
      switch (sortValue) {
        case "oldest":
          return new Date(a.createdAt) - new Date(b.createdAt)
        case "most-votes":
          return (b.votes || 0) - (a.votes || 0)
        case "most-likes":
          return (b.likes || 0) - (a.likes || 0)
        default: // newest
          return new Date(b.createdAt) - new Date(a.createdAt)
      }
    })

    renderQuestions()
  }

  function renderQuestions() {
    if (!elements.userQuestionsList) {
      console.error('userQuestionsList element not found');
      return;
    }

    elements.userQuestionsList.innerHTML = ""

    if (allUserQuestions.length === 0) {
      if (elements.emptyUserState) elements.emptyUserState.style.display = "block"
      if (elements.noResultsState) elements.noResultsState.style.display = "none"
      return
    }

    if (filteredQuestions.length === 0) {
      if (elements.emptyUserState) elements.emptyUserState.style.display = "none"
      if (elements.noResultsState) elements.noResultsState.style.display = "block"
      return
    }

    if (elements.emptyUserState) elements.emptyUserState.style.display = "none"
    if (elements.noResultsState) elements.noResultsState.style.display = "none"

    filteredQuestions.forEach((question) => {
      const questionCard = createUserQuestionCard(question)
      elements.userQuestionsList.appendChild(questionCard)
    })
  }

  function createUserQuestionCard(question) {
    const card = document.createElement("div")
    card.className = "user-question-card mb-4"
    card.dataset.id = question.id

    const isExpired = question.expiresAt && new Date(question.expiresAt) <= new Date()
    const statusClass = isExpired ? "expired" : "active"
    const statusText = isExpired ? "Lejárt" : "Aktív"
    const statusIcon = isExpired ? "fa-clock" : "fa-check-circle"
    const totalVotes = question.answers.reduce((sum, a) => sum + (a.votes || 0), 0)
    const questionUrl = `${window.location.origin}/index.html?q=${question.id}`

    card.innerHTML = `
      <div class="card bg-darker border-secondary">
        <div class="card-header bg-dark border-secondary d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <span class="badge bg-${isExpired ? "danger" : "success"} me-2">
              <i class="fas ${statusIcon} me-1"></i>${statusText}
            </span>
            <small class="text-white-50 ms-2">
              <i class="fas fa-calendar me-1"></i>
              ${formatDate(question.createdAt || question.created_at)}
            </small>
          </div>
          <div class="question-actions d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-secondary copy-link-btn" title="Link másolása" data-link="${questionUrl}">
              <i class="fas fa-link"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger delete-question-btn" 
                    data-id="${question.id}" title="Törlés">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="card-body">
          <h5 class="card-title text-white mb-3">${escapeHTML(question.text)}</h5>
          <div class="answers-preview mb-3">
            <h6 class="text-white-50 mb-2">
              <i class="fas fa-list me-2"></i>Válaszok (${question.answers.length})
            </h6>
            <div class="row">
              ${question.answers
                .map(
                  (answer, index) => `
                <div class="col-md-6 mb-2">
                  <div class="answer-preview bg-dark rounded p-2">
                    <small class="text-white">${index + 1}. ${escapeHTML(answer.text || answer)}</small>
                    <span class="badge bg-primary ms-2">${answer.votes || 0}</span>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
          <div class="question-stats mb-3">
            <div class="row text-center">
              <div class="col-4">
                <div class="stat-item">
                  <i class="fas fa-thumbs-up text-success"></i>
                  <div class="text-white fw-bold">${question.likes || 0}</div>
                  <small class="text-white-50">Like</small>
                </div>
              </div>
              <div class="col-4">
                <div class="stat-item">
                  <i class="fas fa-thumbs-down text-danger"></i>
                  <div class="text-white fw-bold">${question.dislikes || 0}</div>
                  <small class="text-white-50">Dislike</small>
                </div>
              </div>
              <div class="col-4">
                <div class="stat-item">
                  <i class="fas fa-vote-yea text-primary"></i>
                  <div class="text-white fw-bold">${totalVotes}</div>
                  <small class="text-white-50">Szavazat</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    // Add event listeners
    const deleteBtn = card.querySelector(".delete-question-btn")
    deleteBtn.addEventListener("click", () => deleteQuestion(question.id))

    // Copy link button
    const copyBtn = card.querySelector(".copy-link-btn")
    copyBtn.addEventListener("click", (e) => {
      navigator.clipboard.writeText(copyBtn.getAttribute("data-link"))
        .then(() => showToast("Link vágólapra másolva!", "success"))
        .catch(() => showToast("Nem sikerült a link másolása!", "danger"))
    })

    return card
  }

  function openEditModal(question) {
    elements.editQuestionId.value = question.id
    elements.editQuestionText.value = question.text
    updateEditCounter()

    // Load answers
    elements.editAnswersContainer.innerHTML = ""
    question.answers.forEach((answer, index) => {
      const answerDiv = document.createElement("div")
      answerDiv.className = "mb-2"
      answerDiv.innerHTML = `
        <div class="input-group">
          <span class="input-group-text bg-dark border-secondary text-white">${index + 1}</span>
          <input type="text" class="form-control bg-dark text-white border-secondary edit-answer-input" 
                 value="${escapeHTML(answer)}" maxlength="100" required>
        </div>
      `
      elements.editAnswersContainer.appendChild(answerDiv)
    })

    // Load tags
    elements.editTagsContainer.innerHTML = ""
    if (question.tags) {
      question.tags.forEach((tag) => {
        const tagSpan = document.createElement("span")
        tagSpan.className = "badge bg-white-soft tag-choice"
        tagSpan.innerHTML = `#${escapeHTML(tag)} <i class="fas fa-times ms-1"></i>`
        elements.editTagsContainer.appendChild(tagSpan)
      })
    }

    editQuestionModal.show()
  }

  function updateEditCounter() {
    const length = elements.editQuestionText.value.length
    elements.editQuestionCounter.textContent = length
    elements.editQuestionCounter.style.color = length > 180 ? "#ff6b6b" : "inherit"
  }

  function addEditTag() {
    const tagText = elements.editNewTagInput.value.trim()
    if (!tagText || tagText.includes(" ") || tagText.length > 15) {
      showToast("Érvénytelen címke! Max 15 karakter, szóköz nélkül.", "warning")
      return
    }

    if (elements.editTagsContainer.children.length >= 5) {
      showToast("Maximum 5 címkét adhatsz hozzá!", "warning")
      return
    }

    const tagSpan = document.createElement("span")
    tagSpan.className = "badge bg-white-soft tag-choice"
    tagSpan.innerHTML = `#${escapeHTML(tagText)} <i class="fas fa-times ms-1"></i>`
    elements.editTagsContainer.appendChild(tagSpan)
    elements.editNewTagInput.value = ""
  }

  function handleEditTagRemoval(e) {
    if (e.target.classList.contains("fa-times")) {
      e.target.closest(".tag-choice").remove()
    }
  }

  function saveEditedQuestion() {
    const questionId = elements.editQuestionId.value
    const newText = elements.editQuestionText.value.trim()
    const answerInputs = elements.editAnswersContainer.querySelectorAll(".edit-answer-input")
    const newAnswers = Array.from(answerInputs)
      .map((input) => input.value.trim())
      .filter((val) => val)
    const newTags = Array.from(elements.editTagsContainer.querySelectorAll(".tag-choice")).map((tag) =>
      tag.textContent.replace("#", "").replace("×", "").trim(),
    )

    if (!newText || newAnswers.length < 2) {
      showToast("Kérdés és legalább 2 válasz szükséges!", "warning")
      return
    }

    // Update in localStorage
    const allQuestions = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
    const questionIndex = allQuestions.findIndex((q) => q.id === questionId)

    if (questionIndex !== -1) {
      allQuestions[questionIndex] = {
        ...allQuestions[questionIndex],
        text: newText,
        answers: newAnswers,
        tags: newTags,
        updatedAt: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(allQuestions))

      editQuestionModal.hide()
      loadUserQuestions()
      updateStats()
      showToast("Kérdés sikeresen frissítve!", "success")
    }
  }

  function deleteQuestion(questionId) {
    if (!confirm("Biztosan törölni szeretnéd ezt a kérdést? Ez a művelet nem vonható vissza!")) {
      return;
    }

    const token = localStorage.getItem('token');
    fetch(`https://szavazzago.onrender.com/api/questions/${questionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error('Hiba történt a kérdés törlésekor');
        }
        showToast("Kérdés sikeresen törölve!", "success");
        loadUserQuestions();
        updateStats();
      })
      .catch(error => {
        showToast("Hiba történt a kérdés törlésekor", "danger");
        console.error(error);
      });
  }

  function formatDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleDateString("hu-HU", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  function escapeHTML(str) {
    const div = document.createElement("div")
    div.textContent = str
    return div.innerHTML
  }

  function debounce(func, wait) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
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
})
