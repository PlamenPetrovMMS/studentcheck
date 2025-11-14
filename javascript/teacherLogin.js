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
                    // Store minimal teacher session data in sessionStorage only.
                    sessionStorage.setItem('teacherData', JSON.stringify({ email: teacherData.email }));
                } catch (e) {
                    console.warn('Failed to persist teacher session data in sessionStorage:', e);
                }
                if (errorMessage) {
                    errorMessage.textContent = '';
                    errorMessage.classList.remove('show');
                    errorMessage.style.removeProperty('display');
                }
                
                // Ensure any loading overlay is stopped before navigating
                stopLoadingAnimation();
                window.location.href = 'teacherHomepage.html';
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

// Password reveal/hide toggle (supports multiple fields)
document.querySelectorAll('.password-wrapper').forEach(wrapper => {
    const input = wrapper.querySelector('input[type="password"], input[type="text"]');
    const btn = wrapper.querySelector('.toggle-password');
    if (!input || !btn) return;
    const img = btn.querySelector('img');
    const setState = (show) => {
        // show=true -> reveal text
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-pressed', String(show));
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        if (img) {
            img.src = show ? 'icons/hide.svg' : 'icons/show.svg';
            img.alt = show ? 'Hide password' : 'Show password';
        }
    };
    btn.addEventListener('click', () => {
        const willShow = input.type === 'password';
        setState(willShow);
    });
});