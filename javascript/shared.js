// Shared navbar logo click handler
// Uses ONLY sessionStorage so login dies with the tab/window.
(function(){
  function getAuthStatus() {
    // Student session data set by studentLogin.js
    try {
      const studentData = sessionStorage.getItem('studentData');
      if (studentData) return { loggedIn: true, role: 'student' };
    } catch(_) {}
    // Teacher session data set by teacherLogin.js
    try {
      const teacherData = sessionStorage.getItem('teacherData');
      if (teacherData) return { loggedIn: true, role: 'teacher' };
    } catch(_) {}
    // authToken optional; stored in sessionStorage after registration/login if needed
    // We don't infer role from token alone to avoid accidental auto-login.
    return { loggedIn: false, role: null };
  }

  function handleLogoClick() {
    const { loggedIn, role } = getAuthStatus();
    if (loggedIn) {
      window.location.href = role === 'teacher' ? 'teacherHomepage.html' : 'studentHomepage.html';
    } else {
      window.location.href = 'index.html';
    }
  }

  window.handleLogoClick = handleLogoClick;
})();

// Reusable loading/submitting overlay with long-wait timer
// Usage: LoadingOverlay.show('Logging in...'); ... LoadingOverlay.hide();
(function(){
  let longWaitTimeout = null;
  let longWaitInterval = null;
  let startMs = 0;

  function ensureOverlay(message){
    if (document.getElementById('loginOverlay')) {
      const txt = document.querySelector('#loginOverlay .loading-text');
      if (txt) txt.textContent = message || 'Loading...';
      return document.getElementById('loginOverlay');
    }
    const overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.className = 'loading-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="loading-box" role="status" aria-live="polite">
        <div class="spinner" aria-hidden="true"></div>
        <div class="loading-text"></div>
      </div>
      <div class="overlay-long-wait" id="overlayLongWait" aria-live="polite" role="status" style="display:none"></div>
    `;
    document.body.appendChild(overlay);
    const txt = overlay.querySelector('.loading-text');
    if (txt) txt.textContent = message || 'Loading...';
    return overlay;
  }

  function show(message){
    const overlay = ensureOverlay(message);
    document.body.setAttribute('aria-busy', 'true');
    startMs = Date.now();
    // Clear any previous timers just in case
    clearTimers();
    const longWaitEl = overlay.querySelector('#overlayLongWait');
    // After 10s, show long-wait message and start 1s counter
    longWaitTimeout = setTimeout(() => {
      if (longWaitEl) {
        longWaitEl.style.display = 'block';
        longWaitEl.textContent = 'Server is waking up ... (0 sec)';
      }
      longWaitInterval = setInterval(() => {
        const elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000) - 10);
        if (longWaitEl) longWaitEl.textContent = `Server is waking up ... (${elapsed} sec)`;
      }, 1000);
    }, 10000);
  }

  function hide(){
    clearTimers();
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.remove();
    document.body.removeAttribute('aria-busy');
  }

  function clearTimers(){
    if (longWaitTimeout) { clearTimeout(longWaitTimeout); longWaitTimeout = null; }
    if (longWaitInterval) { clearInterval(longWaitInterval); longWaitInterval = null; }
  }

  window.LoadingOverlay = { show, hide };
})();
