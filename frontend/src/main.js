// Constants
const MAX_QUESTION_LENGTH = 200;
const MAX_ANSWER_LENGTH = 100;
const MAX_TAG_LENGTH = 15;
const API_BASE_URL = "http://localhost:3000/api";

// State management
let state = {
    questions: [],
    token: localStorage.getItem('token') || null,
    currentUser: JSON.parse(localStorage.getItem('currentUser')) || null
};

// Helper Functions
function showError(message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        // Create alert container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'alertContainer';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        document.body.appendChild(container);
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger alert-dismissible fade show';
    errorDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.getElementById('alertContainer').appendChild(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
}

function showSuccess(message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) {
        // Create alert container if it doesn't exist
        const container = document.createElement('div');
        container.id = 'alertContainer';
        container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        document.body.appendChild(container);
    }

    const successDiv = document.createElement('div');
    successDiv.className = 'alert alert-success alert-dismissible fade show';
    successDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.getElementById('alertContainer').appendChild(successDiv);
    setTimeout(() => successDiv.remove(), 5000);
}

// Auth Functions
function updateAuthUI() {
    const authNavItem = document.getElementById('authNavItem');
    if (!authNavItem) return;

    // Always check localStorage for the latest state
    state.token = localStorage.getItem('token') || null;
    state.currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;

    if (state.token && state.currentUser) {
        authNavItem.innerHTML = `
            <div class="dropdown">
                <button class="btn btn-outline-light dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    ${state.currentUser.username}
                </button>
                <ul class="dropdown-menu">
                    <li><a class="dropdown-item" href="#" id="logoutBtn">Kijelentkezés</a></li>
                </ul>
            </div>
        `;
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    } else {
        // Check if we're on a page with the auth modal
        const authModal = document.getElementById('authModal');
        if (authModal) {
            authNavItem.innerHTML = `
                <button class="btn btn-outline-light" data-bs-toggle="modal" data-bs-target="#authModal">
                    Bejelentkezés
                </button>
            `;
        } else {
            // On pages without the modal, just show a link to the homepage
            authNavItem.innerHTML = `
                <a href="index.html" class="btn btn-outline-light">
                    Bejelentkezés
                </a>
            `;
        }
    }

    // Update question form visibility
    const questionForm = document.getElementById('questionForm');
    if (questionForm) {
        questionForm.style.display = state.token ? 'block' : 'none';
    }

    // Update create first question button
    const createFirstQuestion = document.getElementById('createFirstQuestion');
    if (createFirstQuestion) {
        createFirstQuestion.style.display = state.token ? 'block' : 'none';
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        state.token = data.token;
        state.currentUser = data.user;
        localStorage.setItem('token', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        updateAuthUI();
        bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
        document.getElementById('loginForm').reset();
        loadQuestions();
    } catch (error) {
        showError(error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (password !== confirmPassword) {
        showError('A jelszavak nem egyeznek!');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        state.token = data.token;
        state.currentUser = data.user;
        localStorage.setItem('token', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        updateAuthUI();
        bootstrap.Modal.getInstance(document.getElementById('authModal')).hide();
        document.getElementById('registerForm').reset();
        loadQuestions();
    } catch (error) {
        showError(error.message);
    }
}

function handleLogout(e) {
    e.preventDefault();
    state.token = null;
    state.currentUser = null;
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    updateAuthUI();
    loadQuestions();
}

// Question Functions
let answerCount = 2;

function updateQuestionCounter() {
    const questionInput = document.getElementById('questionInput');
    const questionCounter = document.getElementById('questionCounter');
    if (!questionInput || !questionCounter) return;

    const count = questionInput.value.length;
    questionCounter.textContent = count;
    if (count > MAX_QUESTION_LENGTH) {
        questionInput.value = questionInput.value.substring(0, MAX_QUESTION_LENGTH);
        questionCounter.textContent = MAX_QUESTION_LENGTH;
    }
}

function addAnswerInput() {
    if (answerCount >= 4) {
        showError('Maximum 4 válaszlehetőség engedélyezett!');
        return;
    }

    answerCount++;
    const answerInputsContainer = document.getElementById('answerInputsContainer');
    if (!answerInputsContainer) return;

    const answerDiv = document.createElement('div');
    answerDiv.className = 'mb-3';
    answerDiv.innerHTML = `
        <label class="form-label text-white d-flex align-items-center">
            <i class="fas fa-list-ol me-2 text-white"></i>Válaszlehetőség ${answerCount}
        </label>
        <div class="input-group">
            <span class="input-group-text bg-dark border-secondary text-white">${answerCount}</span>
            <input type="text" class="form-control bg-dark text-white border-secondary answer-input" required>
        </div>
    `;
    answerInputsContainer.appendChild(answerDiv);
}

async function handleQuestionSubmit(e) {
    e.preventDefault();

    if (!state.token) {
        showError('Kérjük, jelentkezz be a kérdés létrehozásához');
        return;
    }

    const questionInput = document.getElementById('questionInput');
    const questionText = questionInput.value.trim();
    const answerInputs = document.querySelectorAll('.answer-input');
    const answers = Array.from(answerInputs).map(input => input.value.trim());

    if (!questionText || answers.some(answer => !answer)) {
        showError('Kérjük, töltsd ki az összes mezőt!');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/questions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({
                text: questionText,
                answers: answers
            })
        });

        if (!response.ok) {
            throw new Error('Hiba történt a kérdés létrehozásakor');
        }

        // Reset form
        questionInput.value = '';
        document.getElementById('questionCounter').textContent = '0';
        
        // Remove extra answer inputs
        const answerInputsContainer = document.getElementById('answerInputsContainer');
        while (answerInputsContainer.children.length > 2) {
            answerInputsContainer.removeChild(answerInputsContainer.lastChild);
        }
        answerCount = 2;

        // Reload questions
        await loadQuestions();
        showSuccess('Kérdés sikeresen létrehozva!');
    } catch (error) {
        showError(error.message);
    }
}

async function voteOnQuestion(questionId, answerId) {
    if (!state.token) {
        showError('Kérjük, jelentkezz be a szavazáshoz!');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/questions/${questionId}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`
            },
            body: JSON.stringify({ answerId: parseInt(answerId) })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Hiba történt a szavazás során');
        }

        await loadQuestions();
        showSuccess('Szavazat sikeresen rögzítve!');
    } catch (error) {
        showError(error.message);
    }
}

async function loadQuestions() {
    try {
        const response = await fetch(`${API_BASE_URL}/questions`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        state.questions = data;
        renderQuestions();
    } catch (error) {
        console.error('Error loading questions:', error);
        showError('Failed to load questions');
    }
}

async function deleteQuestion(questionId) {
    if (!confirm('Biztosan törölni szeretnéd ezt a kérdést?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Hiba történt a kérdés törlése során');
        }

        showSuccess('Kérdés sikeresen törölve!');
        loadUserQuestions();
    } catch (error) {
        console.error('Error deleting question:', error);
        showError(error.message);
    }
}

async function editQuestion(questionId) {
    try {
        const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Hiba történt a kérdés betöltése során');
        }

        const question = await response.json();
        
        // Fill the form with the question data
        const questionInput = document.getElementById('questionInput');
        const answerInputsContainer = document.getElementById('answerInputsContainer');
        
        if (questionInput && answerInputsContainer) {
            questionInput.value = question.text;
            updateQuestionCounter();
            
            // Clear existing answer inputs
            answerInputsContainer.innerHTML = '';
            answerCount = 0;
            
            // Add answer inputs
            question.answers.forEach(answer => {
                addAnswerInput();
                const lastInput = answerInputsContainer.lastElementChild.querySelector('.answer-input');
                if (lastInput) {
                    lastInput.value = answer.text;
                }
            });
            
            // Scroll to the form
            document.querySelector('.creation-form').scrollIntoView({ behavior: 'smooth' });
            
            // Update the form's submit handler to handle updates
            const questionForm = document.getElementById('questionForm');
            if (questionForm) {
                const originalSubmitHandler = questionForm.onsubmit;
                questionForm.onsubmit = async (e) => {
                    e.preventDefault();
                    
                    const updatedText = questionInput.value.trim();
                    const updatedAnswers = Array.from(answerInputsContainer.querySelectorAll('.answer-input'))
                        .map(input => input.value.trim());
                    
                    if (!updatedText || updatedAnswers.some(answer => !answer)) {
                        showError('Kérjük, töltsd ki az összes mezőt!');
                        return;
                    }
                    
                    try {
                        const updateResponse = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${state.token}`
                            },
                            body: JSON.stringify({
                                text: updatedText,
                                answers: updatedAnswers
                            })
                        });
                        
                        if (!updateResponse.ok) {
                            throw new Error('Hiba történt a kérdés frissítése során');
                        }
                        
                        showSuccess('Kérdés sikeresen frissítve!');
                        loadUserQuestions();
                        
                        // Reset the form and its handler
                        questionForm.reset();
                        questionForm.onsubmit = originalSubmitHandler;
                        answerCount = 2;
                        updateQuestionCounter();
                    } catch (error) {
                        console.error('Error updating question:', error);
                        showError(error.message);
                    }
                };
            }
        }
    } catch (error) {
        console.error('Error loading question for edit:', error);
        showError(error.message);
    }
}

// Navigation Functions
function handleNavigation() {
    const path = window.location.pathname;
    const questionsList = document.getElementById('questionsList');
    
    // Update active nav item
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === path) {
            link.classList.add('active');
        }
    });

    // Check authentication for protected routes
    if (path.includes('sajatkerdes.html')) {
        if (!state.token) {
            window.location.href = 'index.html';
            return;
        }
        loadUserQuestions();
    } else if (path.includes('toplista.html')) {
        loadTopQuestions();
    } else if (path.includes('gyik.html')) {
        // GYIK page doesn't need any special loading
        return;
    } else {
        loadQuestions();
    }
}

async function loadTopQuestions() {
    try {
        const response = await fetch(`${API_BASE_URL}/questions/top`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        state.questions = data;
        renderQuestions();
    } catch (error) {
        console.error('Error loading top questions:', error);
        showError('Failed to load top questions');
    }
}

async function loadUserQuestions() {
    try {
        const response = await fetch(`${API_BASE_URL}/questions/user`, {
            headers: {
                'Authorization': `Bearer ${state.token}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                state.questions = [];
                renderQuestions();
                return;
            }
            throw new Error('Failed to load your questions');
        }

        const data = await response.json();
        state.questions = data;
        renderQuestions();
    } catch (error) {
        console.error('Error loading user questions:', error);
        state.questions = [];
        renderQuestions();
        showError('Nem sikerült betölteni a kérdéseidet. Kérjük, próbáld újra később.');
    }
}

function renderQuestions() {
    const questionsList = document.getElementById('questionsList');
    if (!questionsList) return;

    if (state.questions.length === 0) {
        questionsList.innerHTML = `
            <div id="emptyState" class="h-100 d-flex flex-column justify-content-center align-items-center">
                <div class="empty-state-icon mb-4 position-relative">
                    <i class="fas fa-question-circle fa-4x text-white" aria-hidden="true"></i>
                    <div class="position-absolute top-50 start-50 translate-middle w-100 h-100 rounded-circle"
                        style="background: radial-gradient(circle, rgba(187,19,254,0.15) 0%, transparent 70%);"></div>
                </div>
                <h4 class="text-white mb-2">Nincsenek kérdések</h4>
                <p class="text-white mb-4">Létrehozhatod az elsőt!</p>
                <button class="btn btn-outline-primary hover-glow" id="createFirstQuestion">
                    <i class="fas fa-arrow-right me-2"></i>Kérdés létrehozása
                </button>
            </div>
        `;
        return;
    }

    questionsList.innerHTML = `
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-4">
            ${state.questions.map(question => `
                <div class="col">
                    <div class="question-card bg-darker rounded-3 p-3 h-100 border border-secondary">
                        <h5 class="text-white mb-3">${question.text}</h5>
                        <div class="answers-container">
                            ${question.answers.map(answer => `
                                <button class="btn btn-outline-light w-100 mb-2 answer-btn" 
                                        onclick="voteOnQuestion(${question.id}, ${answer.id})">
                                    ${answer.text}
                                    <span class="badge bg-primary float-end">${answer.votes}</span>
                                </button>
                            `).join('')}
                        </div>
                        <div class="mt-2 d-flex justify-content-between align-items-center">
                            <small class="text-white-50">
                                Szerző: ${question.author || 'Anonim'} • ${new Date(question.created_at).toLocaleDateString()}
                            </small>
                            <div class="like-dislike-group ms-2">
                                <button class="btn btn-sm btn-outline-success me-1 like-btn" data-id="${question.id}"><i class="fas fa-thumbs-up"></i> <span class="like-count">${question.likes || 0}</span></button>
                                <button class="btn btn-sm btn-outline-danger dislike-btn" data-id="${question.id}"><i class="fas fa-thumbs-down"></i> <span class="dislike-count">${question.dislikes || 0}</span></button>
                            </div>
                            ${window.location.pathname.includes('sajatkerdes.html') ? `
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteQuestion(${question.id})">
                                    <i class="fas fa-trash"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    addLikeDislikeListenersHomepage();
}

function addLikeDislikeListenersHomepage() {
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            await reactToQuestionHomepage(id, 'like', btn);
        });
    });
    document.querySelectorAll('.dislike-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            await reactToQuestionHomepage(id, 'dislike', btn);
        });
    });
}

async function reactToQuestionHomepage(id, reaction, btn) {
    const token = localStorage.getItem('token');
    if (!token) {
        showError('Előbb jelentkezz be!');
        return;
    }
    try {
        const res = await fetch(`${API_BASE_URL}/questions/${id}/react`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ reaction })
        });
        if (!res.ok) throw new Error('Hiba a szavazat rögzítésekor');
        // Refresh questions
        loadQuestions();
    } catch (err) {
        showError('Hiba a szavazat rögzítésekor');
    }
}

// Event Listeners
function setupEventListeners() {
    // Question form submission
    const questionForm = document.getElementById('questionForm');
    if (questionForm) {
        questionForm.addEventListener('submit', handleQuestionSubmit);
    }

    // Add answer button
    const addAnswerBtn = document.getElementById('addAnswerBtn');
    if (addAnswerBtn) {
        addAnswerBtn.addEventListener('click', addAnswerInput);
    }

    // Question counter
    const questionInput = document.getElementById('questionInput');
    if (questionInput) {
        questionInput.addEventListener('input', updateQuestionCounter);
    }

    // Create first question button
    const createFirstQuestion = document.getElementById('createFirstQuestion');
    if (createFirstQuestion) {
        createFirstQuestion.addEventListener('click', () => {
            document.querySelector('.creation-form').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Register form
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Initialize state from localStorage
    state.token = localStorage.getItem('token') || null;
    state.currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;

    // Update UI based on auth state
    updateAuthUI();

    // Setup event listeners
    setupEventListeners();

    // Handle initial navigation
    handleNavigation();

    // Add navigation event listener
    window.addEventListener('popstate', handleNavigation);

    // Add storage event listener to sync auth state across tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'token' || e.key === 'currentUser') {
            state.token = localStorage.getItem('token') || null;
            state.currentUser = JSON.parse(localStorage.getItem('currentUser')) || null;
            updateAuthUI();
        }
    });
});

