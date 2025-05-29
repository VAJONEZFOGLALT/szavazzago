document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is logged in and is admin
  if (!window.authManager || !window.authManager.user || !window.authManager.user.isAdmin) {
    window.location.href = 'index.html';
    return;
  }

  // Load admin data
  await loadAdminData();

  // Add event listeners
  document.getElementById('logoutBtn').addEventListener('click', () => {
    window.authManager.logout();
    window.location.href = 'index.html';
  });
});

async function loadAdminData() {
  try {
    // Load users
    const usersResponse = await fetch('https://szavazzago.onrender.com/api/admin/users', {
      headers: window.authManager.getAuthHeaders()
    });
    const users = await usersResponse.json();
    renderUsers(users);

    // Load questions
    const questionsResponse = await fetch('https://szavazzago.onrender.com/api/admin/questions', {
      headers: window.authManager.getAuthHeaders()
    });
    const questions = await questionsResponse.json();
    renderQuestions(questions);
  } catch (error) {
    console.error('Error loading admin data:', error);
    showError('Hiba történt az adatok betöltése közben');
  }
}

function renderUsers(users) {
  const usersList = document.getElementById('usersList');
  if (!users.length) {
    usersList.innerHTML = `
      <div class="text-center text-white-50 py-3">
        <p>Nincsenek felhasználók</p>
      </div>
    `;
    return;
  }

  usersList.innerHTML = users.map(user => `
    <div class="d-flex justify-content-between align-items-center mb-3 p-3 bg-dark rounded">
      <div>
        <h6 class="mb-1">${user.username}</h6>
        <small class="text-white-50">${user.email}</small>
      </div>
      <div>
        <button class="btn btn-sm ${user.isAdmin ? 'btn-warning' : 'btn-success'} me-2" 
                onclick="toggleAdmin(${user.id}, ${!user.isAdmin})">
          ${user.isAdmin ? 'Admin jog elvétele' : 'Admin jog adása'}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteUser(${user.id})">
          Törlés
        </button>
      </div>
    </div>
  `).join('');
}

function renderQuestions(questions) {
  const questionsList = document.getElementById('questionsList');
  if (!questions.length) {
    questionsList.innerHTML = `
      <div class="text-center text-white-50 py-3">
        <p>Nincsenek kérdések</p>
      </div>
    `;
    return;
  }

  questionsList.innerHTML = questions.map(question => `
    <div class="mb-3 p-3 bg-dark rounded">
      <div class="d-flex justify-content-between align-items-start mb-2">
        <h6 class="mb-0">${question.text}</h6>
        <button class="btn btn-sm btn-danger" onclick="deleteQuestion(${question.id})">
          Törlés
        </button>
      </div>
      <div class="text-white-50">
        <small>Készítette: ${question.username}</small>
        <br>
        <small>Szavazatok: ${question.votes || 0}</small>
      </div>
    </div>
  `).join('');
}

async function toggleAdmin(userId, makeAdmin) {
  if (!confirm(`Biztosan ${makeAdmin ? 'admin jogot adsz' : 'elveszed az admin jogot'} ennek a felhasználónak?`)) {
    return;
  }

  try {
    const response = await fetch(`https://szavazzago.onrender.com/api/admin/users/${userId}/toggle-admin`, {
      method: 'POST',
      headers: {
        ...window.authManager.getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isAdmin: makeAdmin })
    });

    if (!response.ok) {
      throw new Error('Failed to toggle admin status');
    }

    showSuccess(`Felhasználó admin státusza sikeresen ${makeAdmin ? 'frissítve' : 'elvéve'}`);
    await loadAdminData();
  } catch (error) {
    console.error('Error toggling admin status:', error);
    showError('Hiba történt az admin státusz módosítása közben');
  }
}

async function deleteUser(userId) {
  if (!confirm('Biztosan törölni szeretnéd ezt a felhasználót?')) {
    return;
  }

  try {
    const response = await fetch(`https://szavazzago.onrender.com/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: window.authManager.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to delete user');
    }

    showSuccess('Felhasználó sikeresen törölve');
    await loadAdminData();
  } catch (error) {
    console.error('Error deleting user:', error);
    showError('Hiba történt a felhasználó törlése közben');
  }
}

async function deleteQuestion(questionId) {
  if (!confirm('Biztosan törölni szeretnéd ezt a kérdést?')) {
    return;
  }

  try {
    const response = await fetch(`https://szavazzago.onrender.com/api/admin/questions/${questionId}`, {
      method: 'DELETE',
      headers: window.authManager.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error('Failed to delete question');
    }

    showSuccess('Kérdés sikeresen törölve');
    await loadAdminData();
  } catch (error) {
    console.error('Error deleting question:', error);
    showError('Hiba történt a kérdés törlése közben');
  }
}

function showError(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-danger alert-dismissible fade show';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.querySelector('.container').insertBefore(alert, document.querySelector('.row'));
}

function showSuccess(message) {
  const alert = document.createElement('div');
  alert.className = 'alert alert-success alert-dismissible fade show';
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.querySelector('.container').insertBefore(alert, document.querySelector('.row'));
}

// Make functions globally available
window.toggleAdmin = toggleAdmin;
window.deleteUser = deleteUser;
window.deleteQuestion = deleteQuestion;

