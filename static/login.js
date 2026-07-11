const API_URL = '';

async function handleLogin(event) {
  event.preventDefault();
  
  const alertEl = document.getElementById('loginAlert');
  const btnEl = document.getElementById('loginBtn');
  const userEl = document.getElementById('username');
  const passEl = document.getElementById('password');
  
  const username = userEl.value.trim();
  const password = passEl.value;
  
  // Reset alert
  alertEl.style.display = 'none';
  alertEl.textContent = '';
  
  btnEl.disabled = true;
  btnEl.textContent = 'Logging in...';
  
  try {
    const response = await fetch(`${API_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      // Redirect to admin panel on success
      window.location.href = '/admin.html';
    } else {
      // Display failure message
      alertEl.textContent = result.error || 'Invalid credentials';
      alertEl.style.display = 'block';
      passEl.value = ''; // Clear password field
    }
  } catch (error) {
    console.error('Login request error:', error);
    alertEl.textContent = '⚠️ Network error. Please try again.';
    alertEl.style.display = 'block';
  } finally {
    btnEl.disabled = false;
    btnEl.textContent = 'Log In';
  }
}

// Check if user is already logged in, redirect to admin.html if so
async function checkCurrentAuth() {
  try {
    const res = await fetch(`${API_URL}/api/admin/check-auth`);
    if (res.ok) {
      const status = await res.json();
      if (status.authenticated) {
        window.location.href = '/admin.html';
      }
    }
  } catch (e) {
    console.warn('Authentication verify error:', e);
  }
}

// Check auth state on page load
document.addEventListener('DOMContentLoaded', () => {
  checkCurrentAuth();
});
