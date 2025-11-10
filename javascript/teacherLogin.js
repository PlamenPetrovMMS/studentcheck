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
            // Ensure inline styles don't keep it hidden
            errorMessage.style.removeProperty('display');
            errorMessage.classList.remove('show');
            // force reflow to restart animation if same message repeats
            void errorMessage.offsetWidth;
            errorMessage.classList.add('show');
        }
        return;
    }

    const form = document.getElementById('teacherLoginForm');
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const t0 = performance.now();
    startLoadingAnimation();
    try {
        const response = await fetch("https://studentcheck-server.onrender.com/teacherLogin", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(teacherData)
        });
        const t1 = performance.now();
        console.log(`Response received from server in ${Math.round(t1 - t0)} ms`);
        console.log(response)
            if (response.ok) {
            const data = await response.json();
            if (data.loginSuccess) {
                try {
                    sessionStorage.setItem('teacherData', JSON.stringify({ email: teacherData.email }));
                    // Remember last logged-in teacher across browser restarts
                    localStorage.setItem('lastTeacherEmail', teacherData.email);
                } catch (e) {
                    console.warn('Failed to persist teacher session data:', e);
                }
                if (errorMessage) {
                    errorMessage.textContent = '';
                    errorMessage.classList.remove('show');
                    errorMessage.style.removeProperty('display');
                }
                
                // Ensure any loading overlay is stopped before navigating
                window.location.href = 'teacherHomepage.html';
                stopLoadingAnimation();
            } else {
                stopLoadingAnimation();
                if (errorMessage) {
                    errorMessage.textContent = 'Login failed: ' + (data.message || 'Invalid credentials');
                    errorMessage.style.removeProperty('display');
                    errorMessage.classList.remove('show');
                    void errorMessage.offsetWidth;
                    errorMessage.classList.add('show');
                }
                // Do not show loading overlay for wrong credentials
            }
        } else {
            stopLoadingAnimation();
            if (errorMessage) {
                errorMessage.textContent = 'Login failed: Invalid credentials';
                errorMessage.style.removeProperty('display');
                errorMessage.classList.remove('show');
                void errorMessage.offsetWidth;
                errorMessage.classList.add('show');
            }
            // Do not show loading overlay for wrong credentials
        }
    } catch (err) {
        stopLoadingAnimation();
        console.error('Login request failed:', err);
        if (errorMessage) {
            errorMessage.textContent = 'Login failed: Network error or unavailable server.';
            errorMessage.style.removeProperty('display');
            errorMessage.classList.remove('show');
            void errorMessage.offsetWidth;
            errorMessage.classList.add('show');
        }
        // Do not show loading overlay for errors
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
});

// Password eye toggle logic
const passwordInput = document.getElementById('password');
const toggleBtn = document.getElementById('togglePassword');
if (passwordInput && toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        toggleBtn.setAttribute('aria-pressed', String(isHidden));
        toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
        // Swap icon images
        const img = toggleBtn.querySelector('img');
        if (img) {
            img.src = isHidden ? 'icons/hide.png' : 'icons/show.png';
            img.alt = isHidden ? 'Hide' : 'Show';
        }
    });
}