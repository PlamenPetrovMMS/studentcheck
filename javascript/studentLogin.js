// --- Simple login countdown timer ---
const LOGIN_TIMEOUT_SECONDS = 60; // adjust as needed
let remainingSeconds = LOGIN_TIMEOUT_SECONDS;
let countdownId = null;

const timerEl = document.getElementById('loginTimer');
const formEl = document.getElementById('studentLoginForm');
const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;

function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function renderTimer() {
    if (!timerEl) return;
    if (remainingSeconds > 0) {
        timerEl.textContent = `Time left: ${formatTime(remainingSeconds)}`;
    } else {
        timerEl.textContent = 'Time expired. Reload to try again.';
    }
}

function startCountdown() {
    renderTimer();
    countdownId = setInterval(() => {
        remainingSeconds -= 1;
        if (remainingSeconds <= 0) {
            remainingSeconds = 0;
            clearInterval(countdownId);
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Time expired';
                submitBtn.setAttribute('aria-disabled', 'true');
            }
        }
        renderTimer();
    }, 1000);
}

startCountdown();

// --- Login submit handler ---
document.getElementById('studentLoginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    // Block submit if time expired
    if (remainingSeconds <= 0) {
        renderTimer();
        return;
    }

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    const studentData = { username, password };

    console.log('Student Login Attempt:', studentData);

    // Optional: measure request duration
    const t0 = performance.now();
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
        console.log('Login successful:', data);
    } else {
        console.error('Login failed:', response.statusText);
    }

});