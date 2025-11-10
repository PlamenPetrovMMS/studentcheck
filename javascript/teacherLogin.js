function startLoadingAnimation() {
    if (document.getElementById('loginOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-box" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <div class="loading-text">Logging In...</div>
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.setAttribute('aria-busy', 'true');
}

function stopLoadingAnimation() {
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.remove();
    document.body.removeAttribute('aria-busy');
}

document.getElementById('teacherLoginForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorMessage = document.getElementById('error-message');

    const teacherData = { email, password };
    console.log('Teacher Login Attempt:', teacherData);

    if (!email || !password) {
        if (errorMessage) {
            errorMessage.textContent = 'Email and Password are required.';
            errorMessage.style.display = 'block';
        }
        return;
    }

    startLoadingAnimation();
    const t0 = performance.now();
    try {
        const response = await fetch("https://studentcheck-server.onrender.com/teacherLogin", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teacherData)
        });
        const t1 = performance.now();
        console.log(`Response received from server in ${Math.round(t1 - t0)} ms`);

        if (response.ok) {
            const data = await response.json();
            if (data.loginSuccess) {
                try {
                    sessionStorage.setItem('teacherData', JSON.stringify({ email: teacherData.email }));
                } catch (e) {
                    console.warn('Failed to persist teacher session data:', e);
                }
                if (errorMessage) {
                    errorMessage.textContent = '';
                    errorMessage.style.display = 'none';
                }
                stopLoadingAnimation();
                window.location.href = 'teacherHomepage.html';
            } else {
                if (errorMessage) {
                    errorMessage.textContent = 'Login failed: ' + (data.message || 'Invalid credentials');
                    errorMessage.style.display = 'block';
                }
                stopLoadingAnimation();
            }
        } else {
            if (errorMessage) {
                errorMessage.textContent = 'Login failed: Invalid credentials';
                errorMessage.style.display = 'block';
            }
            stopLoadingAnimation();
        }
    } catch (err) {
        console.error('Login request failed:', err);
        if (errorMessage) {
            errorMessage.textContent = 'Login failed: Network error or unavailable server.';
            errorMessage.style.display = 'block';
        }
        stopLoadingAnimation();
    }
});