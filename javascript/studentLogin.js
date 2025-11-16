
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


// --- Login submit handler ---
document.getElementById('studentLoginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const errorMessage = document.getElementById('error-message');

    const facultyNumber = document.getElementById('facultyNumber').value;
    const password = document.getElementById('password').value;

    const studentData = { facultyNumber, password };

    if(studentData.facultyNumber != "" && studentData.password != "") {
        errorMessage.textContent = "";
        console.log('Student Login Attempt:', studentData);
    }else{
        errorMessage.style.color = "red";
        errorMessage.textContent = "Faculty Number and Password are required."
        return;
    }

    startLoadingAnimation();

    // Optional: measure request duration
    const t0 = performance.now();
    try {
        const response = await fetch("https://studentcheck-server.onrender.com/studentLogin", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(studentData)
        });
        const t1 = performance.now();
        console.log(`Response received from server in ${Math.round(t1 - t0)} ms`);
        if (response.ok) {
            const data = await response.json();
            if(data.loginSuccess) {
                // Store non-sensitive data for the homepage
                try {
                    sessionStorage.setItem('studentData', JSON.stringify({
                        data
                    }));
                    console.log("Session data persisted successfully.");
                    console.log(data);
                } catch (e) {
                    console.warn('Failed to persist session data:', e);
                }
                // Persist student profile locally for offline use
                try {
                    if (window.db) {
                        const s = data?.student || data?.data?.student || data;
                        const studentRecord = {
                            id: s?.facultyNumber || s?.faculty_number || s?.email || facultyNumber,
                            fullName: s?.fullName || s?.full_name || s?.name || '',
                            facultyNumber: s?.facultyNumber || s?.faculty_number || facultyNumber,
                            email: s?.email || null,
                            group: s?.group || s?.Group || null,
                            updatedAt: Date.now()
                        };
                        if (studentRecord.id) await window.db.saveStudent(studentRecord);
                    }
                } catch (e) { console.warn('Failed to store student profile in IndexedDB:', e); }
                stopLoadingAnimation();
                window.location.href = 'studentHomepage.html';
            } else {
                console.log("data.loginSuccess = false")
                errorMessage.style.color = "red";
                errorMessage.textContent = 'Login failed';
                stopLoadingAnimation();
            }
        } else {
            console.error('Login failed: response is not OK', response.statusText);
            errorMessage.style.color = "red";
            errorMessage.textContent = 'Invalid credentials';
            stopLoadingAnimation();
        }
    } catch (err) {
        console.error('Login request failed:', err);
        errorMessage.style.color = "red";
        errorMessage.textContent = 'Login failed: Network error or unavailable server.';
        stopLoadingAnimation();
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