// Shared navbar logo click handler
// Detects login status and role, then redirects accordingly
(function(){
  function getAuthStatus() {
    try {
      // Student: stored in sessionStorage by studentLogin
      const studentData = sessionStorage.getItem('studentData');
      if (studentData) {
        return { loggedIn: true, role: 'student' };
      }
    } catch(_) {}

    try {
      // Teacher: lastTeacherEmail stored in localStorage by teacherLogin
      const lastTeacher = localStorage.getItem('lastTeacherEmail');
      if (lastTeacher) {
        return { loggedIn: true, role: 'teacher' };
      }
    } catch(_) {}

    try {
      // Optional future: explicit role/token
      const role = localStorage.getItem('authRole');
      const token = localStorage.getItem('authToken');
      if (token && (role === 'student' || role === 'teacher')) {
        return { loggedIn: true, role };
      }
    } catch(_) {}

    return { loggedIn: false, role: null };
  }

  function handleLogoClick() {
    const { loggedIn, role } = getAuthStatus();
    if (loggedIn) {
      if (role === 'student') {
        window.location.href = 'studentHomepage.html';
        return;
      }
      if (role === 'teacher') {
        window.location.href = 'teacherHomepage.html';
        return;
      }
    }
    window.location.href = 'index.html';
  }

  // Expose to global for inline onclick usage
  window.handleLogoClick = handleLogoClick;
})();
