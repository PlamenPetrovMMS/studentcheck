// Fire-and-forget heartbeat to warm up the server without blocking the UI.
// Use no-cors so we don't depend on CORS headers; an opaque success still wakes the server.
(() => {
    const url = 'https://studentcheck-server.onrender.com/heartbeat';
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 7000); // fail fast if sleeping too long
        fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal })
            .catch((err) => console.debug('Heartbeat ping failed (likely fine):', err))
            .finally(() => clearTimeout(timeout));
    } catch (e) {
        // Swallow any unexpected errors; this is best-effort only.
        console.debug('Heartbeat init error:', e);
    }
})();

document.getElementById('studentBtn').addEventListener('click', function() {
    window.location.href = 'studentLogin.html';
});

document.getElementById('teacherBtn').addEventListener('click', function() {
    window.location.href = 'teacherLogin.html';
});
