
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
                    sessionStorage.setItem('studentAuth', JSON.stringify({
                        facultyNumber,
                        data
                    }));
                } catch (e) {
                    console.warn('Failed to persist session data:', e);
                }
                stopLoadingAnimation();
                window.location.href = 'studentHomepage.html';
            } else {
                errorMessage.style.color = "red";
                errorMessage.textContent = 'Login failed';
                stopLoadingAnimation();
            }
        } else {
            console.error('Login failed:', response.statusText);
            alert('Login failed: ' + response.statusText);
        }
    } catch (err) {
        console.error('Login request failed:', err);
        alert('Login failed: Network error or server unavailable.');
    }

});