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

  // Offline badge and connectivity handling
  function ensureOfflineBadge() {
    if (document.getElementById('offlineBadge')) return;
    const badge = document.createElement('div');
    badge.id = 'offlineBadge';
    badge.textContent = 'Offline Mode';
    badge.style.cssText = [
      'position:fixed','top:12px','right:12px','z-index:9999',
      'padding:6px 10px','border-radius:8px','font-size:12px','font-weight:600',
      'background:rgba(107,114,128,0.9)','color:#fff','box-shadow:0 4px 10px rgba(0,0,0,0.2)',
      'display:none'
    ].join(';');
    document.body.appendChild(badge);
  }
  function updateOfflineBadge() {
    const badge = document.getElementById('offlineBadge');
    if (!badge) return;
    badge.style.display = navigator.onLine ? 'none' : 'block';
  }
  function onOnline() {
    updateOfflineBadge();
    // Kick off sync if available
    if (window.db && typeof window.db.syncAttendanceQueue === 'function') {
      window.db.syncAttendanceQueue().then((res)=>{
        if (res && res.ok && res.synced > 0) {
          console.log(`[sync] uploaded ${res.synced} attendance records`);
        }
      }).catch(()=>{});
    }
  }
  function onOffline() { updateOfflineBadge(); }

  // Initialize connectivity UI
  document.addEventListener('DOMContentLoaded', () => {
    ensureOfflineBadge();
    updateOfflineBadge();
  });
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  // Optional: Service Worker registration for PWA offline support
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
})();
