// Loading overlay now handled by shared LoadingOverlay utility


// --- Login submit handler ---
document.getElementById('studentLoginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const errorMessage = document.getElementById('error-message');

    const facultyNumber = document.getElementById('facultyNumber').value;
    const password = document.getElementById('password').value;

    const studentData = { facultyNumber, password };

    if(studentData.facultyNumber != "" && studentData.password != "") {
        errorMessage.textContent = "";
        errorMessage.style.display = "none";
    }else{
        errorMessage.style.color = "red";
        errorMessage.textContent = "Faculty Number and Password are required."
        errorMessage.style.display = "block";
        return;
    }

    LoadingOverlay.show('Logging in...');

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
        if (response.ok) {
            const data = await response.json();
            if(data.loginSuccess) {
                try {
                    sessionStorage.removeItem('teacherData');
                    localStorage.removeItem('teacherEmail');
                } catch (_) {}
                // Store non-sensitive data for the homepage
                try {
                    sessionStorage.setItem('studentData', JSON.stringify({
                        data
                    }));
                } catch (e) {
                    console.warn('Failed to persist session data:', e);
                }
                LoadingOverlay.hide();
                window.location.href = 'studentHomepage.html';
            } else {
                errorMessage.style.color = "red";
                errorMessage.textContent = 'Login failed';
                errorMessage.style.display = "block";
                LoadingOverlay.hide();
            }
        } else {
            console.error('Login failed: response is not OK', response.statusText);
            errorMessage.style.color = "red";
            errorMessage.textContent = 'Invalid credentials';
            errorMessage.style.display = "block";
            LoadingOverlay.hide();
        }
    } catch (err) {
        console.error('Login request failed:', err);
        errorMessage.style.color = "red";
        errorMessage.textContent = 'Login failed: Network error or unavailable server.';
        errorMessage.style.display = "block";
        LoadingOverlay.hide();
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
