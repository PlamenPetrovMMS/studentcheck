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
