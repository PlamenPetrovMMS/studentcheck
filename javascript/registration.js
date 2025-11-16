// Sliding 3-step registration controller
(function(){
    // Debug toggle: set to false to silence internal diagnostic messages.
    const DEBUG = true;
    const dbg = (...args) => { if (DEBUG) console.log('[Registration]', ...args); };
    const track = document.getElementById('slidesTrack');
    const progressBar = document.getElementById('progressBar');

    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');
    const actions = document.querySelector('.actions'); // container for navigation buttons

    const firstName = document.getElementById('firstName');
    const middleName = document.getElementById('middleName');
    const lastName = document.getElementById('lastName');

    const email = document.getElementById('email');
    const facultyNumber = document.getElementById('facultyNumber');
    const groupSelect = document.getElementById('group');

    const password = document.getElementById('password');
    const repeatPassword = document.getElementById('repeatPassword');

    const errorSlide1 = document.getElementById('errorSlide1');
    const errorSlide2 = document.getElementById('errorSlide2');
    // Removed dedicated errorSlide3 element; requirements list now provides all feedback.

    // Loading overlay helpers (same structure as studentLogin)
    function startLoadingAnimation() {
        if (document.getElementById('loginOverlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'loginOverlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-box" role="status" aria-live="polite">
                <div class="spinner" aria-hidden="true"></div>
                <div class="loading-text">Submitting...</div>
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

    const slides = Array.from(track.querySelectorAll('.slide'));
    const TOTAL_STEPS = slides.length; // derive dynamically
    let step = 0;
    // Initialize active slide visibility (show only first)
    slides.forEach((sl,i)=> sl.classList.toggle('active', i===0));

    function updateUI() {
    // Activate current slide; hide others
    slides.forEach((sl,i)=> sl.classList.toggle('active', i===step));
    dbg('updateUI step=', step);
        const progress = ((step + 1) / TOTAL_STEPS) * 100;
        progressBar.style.width = progress + '%';

            // Hide Back button entirely on first slide, show on others
            if (step === 0) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = 'inline-block';
                backBtn.disabled = false;
                backBtn.textContent = 'Back';
            }
        if (step < TOTAL_STEPS - 1) {
            nextBtn.style.display = 'inline-block';
            finishBtn.classList.add('finish-hidden');
        } else {
            nextBtn.style.display = 'none';
            finishBtn.classList.remove('finish-hidden');
        }
        // On first slide align the lone Continue button to the right
        if (actions) {
            if (step === 0) actions.classList.add('single-right');
            else actions.classList.remove('single-right');
        }
    // Removed automatic contact live validation so slide 2 errors only appear after user clicks Continue.
    }

    // Slide 1: Names (middle name now required)
    function validateNames() {
        const a = firstName.value.trim();
        const b = middleName.value.trim();
        const c = lastName.value.trim();
        if (!a || !b || !c) {
            errorSlide1.textContent = 'Please fill out every field.';
            return false;
        }
        errorSlide1.textContent = '';
        return true;
    }

    function validateEmailFormat(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

    // Slide 2 (index 1): Contact (email + faculty number)
    let contactErrorActivated = false; // becomes true after first failed Continue (or duplicate email server error)
    function validateContact() {
        const { valid, message, normalized, debug } = getContactState();
        dbg('validateContact state=', debug);
        if (!valid) {
            contactErrorActivated = true; // user attempted to proceed
            errorSlide2.textContent = message;
            errorSlide2.style.display = 'block';
            return false;
        }
        facultyNumber.value = normalized; // commit normalized value
        if (contactErrorActivated) {
            errorSlide2.textContent = '';
            errorSlide2.style.display = 'none';
        }
        return true;
    }

    // Unified validation state builder for Contact slide (email, faculty number, and group selection).
    function getContactState() {
        const e = email.value.trim();
        const fRaw = facultyNumber.value.trim();
        // Clean: remove leading/trailing whitespace and collapse internal spaces -> remove entirely
        const f = fRaw.replace(/\s+/g,'');
        const g = groupSelect ? (groupSelect.value || '') : '';
        const debug = { emailOriginal: email.value, emailTrimmed: e, facultyOriginal: facultyNumber.value, facultyStripped: f, groupValue: g };
        if (!e) return { valid:false, message:'Email is required.', normalized:f, debug };
        if (!validateEmailFormat(e)) return { valid:false, message:'Enter a valid email address.', normalized:f, debug };
        if (!f) return { valid:false, message:'Faculty number is required.', normalized:f, debug };
        // Minimal rule: must contain at least one alphanumeric; allow any printable except spaces.
        if (!/[A-Za-z0-9]/.test(f)) return { valid:false, message:'Faculty number needs a letter or digit.', normalized:f, debug };
        if (f.length > 50) return { valid:false, message:'Faculty number too long (max 50).', normalized:f, debug };
        // If it contains disallowed characters, attempt auto-sanitization (keep letters/digits and - _ . /)
        const sanitized = f.replace(/[^A-Za-z0-9\-_.\/]/g,'');
        if (sanitized.length === 0) return { valid:false, message:'Faculty number invalid characters only.', normalized:f, debug };
        // Group selection required; only allow 37-42
        const allowedGroups = ['37','38','39','40','41','42'];
        if (!g || !allowedGroups.includes(g)) return { valid:false, message:'Please select your group (37–42).', normalized:f, debug };
        debug.sanitized = sanitized;
        return { valid:true, message:'', normalized:sanitized.toUpperCase(), debug };
    }

    let lastDuplicateEmail = null; // tracks last server-rejected email to clear red state on change
    function liveContactValidation() {
        // Only perform live updates if user has already triggered error display OR duplicate email state is active.
        if (step !== 1) return;
        const currentEmail = email.value.trim();
        if (lastDuplicateEmail) {
            if (currentEmail === lastDuplicateEmail) {
                errorSlide2.style.display = 'block';
                return;
            } else {
                email.classList.remove('invalid');
                lastDuplicateEmail = null;
                contactErrorActivated = true; // allow live validation after duplicate cleared
            }
        }
        if (!contactErrorActivated) return; // user hasn't clicked Continue yet; stay silent
        const { valid, message, debug } = getContactState();
        dbg('liveContactValidation state=', debug);
        if (valid) {
            errorSlide2.textContent = '';
            errorSlide2.style.display = 'none';
        } else {
            errorSlide2.textContent = message;
            errorSlide2.style.display = 'block';
        }
    }

    // Slide 3 (index 2): Passwords
    function validatePassword() {
        const p1 = password.value;
        const p2 = repeatPassword.value;
        if (!p1 || !p2) return false;
        const lengthOk = p1.length >= 8;
        const letterOk = /[A-Za-z]/.test(p1);
        const numberOk = /\d/.test(p1);
        const matchOk = p1 === p2;
        return lengthOk && letterOk && numberOk && matchOk;
    }

    // Live password validation so mismatch appears immediately without waiting for Finish
    function livePasswordFeedback() {
        const p1 = password.value;
        const p2 = repeatPassword.value;
        const lengthOk = p1.length >= 8;
        const letterOk = /[A-Za-z]/.test(p1);
        const numberOk = /\d/.test(p1);
        const matchOk = p1 && p2 && p1 === p2;
        const reqLength = document.getElementById('reqLength');
        const reqLetter = document.getElementById('reqLetter');
        const reqNumber = document.getElementById('reqNumber');
        const reqMatch = document.getElementById('reqMatch');
        const setState = (el, ok) => { if (el){ el.classList.toggle('met', ok); el.classList.toggle('unmet', !ok);} };
        setState(reqLength, lengthOk);
        setState(reqLetter, letterOk);
        setState(reqNumber, numberOk);
        setState(reqMatch, matchOk);
    }

    function next() {
        dbg('next() invoked at step', step);
        if (step === 0 && !validateNames()) { dbg('Names validation failed'); return; }
    if (step === 1 && !validateContact()) { dbg('Contact validation failed'); return; }
        if (step < TOTAL_STEPS - 1) {
            step++;
            dbg('Advancing to step', step);
            updateUI();
            focusFirstInput();
        } else {
            dbg('Already at last step; next() ignored');
        }
    }

    function back() {
        if (step > 0) {
            step--;
            updateUI();
            focusFirstInput();
        }
    }

    function focusFirstInput() {
        requestAnimationFrame(() => {
            if (step === 0) firstName.focus();
            else if (step === 1) email.focus();
            else if (step === 2) password.focus();
        });
    }

    let submitting = false;
    async function finish() {
        if (submitting) return; // guard against double click
        // Re-validate contact & password on final step
        if (!validateContact()) { alert('Please correct contact details before finishing.'); return; }
        if (!validatePassword()) { alert('Please meet all password requirements before finishing.'); return; }

        const payload = {
            firstName: firstName.value.trim(),
            middleName: middleName.value.trim(),
            lastName: lastName.value.trim(),
            email: email.value.trim(),
            facultyNumber: facultyNumber.value.trim(),
            group: groupSelect ? groupSelect.value : undefined,
            password: password.value
        };
        dbg('Submitting registration payload', payload);

        try {
            submitting = true;
            finishBtn.disabled = true;
            const originalText = finishBtn.textContent;
            finishBtn.textContent = 'Submitting...';
            startLoadingAnimation();

            const resp = await fetch('https://studentcheck-server.onrender.com/registration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let data;
            dbg('Response status:', resp.status, resp.statusText);
            if (!resp.ok) {
                // Try to parse JSON error payload for more detail (e.g. duplicate email)
                try { data = await resp.json(); } catch(_) { data = null; }
                const serverMsg = data && (data.message || data.error || data.detail) || (resp.status + ' ' + resp.statusText);
                if (/duplicate|exists|already/i.test(serverMsg) && email) {
                    // Prepare duplicate state BEFORE updating UI so live validator preserves the message
                    lastDuplicateEmail = email.value.trim();
                    email.classList.add('invalid');
                    contactErrorActivated = true;
                    errorSlide2.textContent = 'This email is already registered. You were returned to the email step to change it.';
                    errorSlide2.style.display = 'block';
                    step = 1; // ensure contact slide visible
                    updateUI();
                    email.focus();
                    return;
                }
                alert('Registration failed: ' + serverMsg);
                return;
            } else {
                data = await resp.json();
            }
            dbg('Server response', data);
            if (data && (data.registrationSuccess || data.success)) {
                // Optionally store token if provided
                if (data.token) {
                    // Store token ONLY in sessionStorage so closing the tab ends implicit login.
                    try { sessionStorage.setItem('authToken', data.token); } catch (_) {}
                }
                alert('Registration successful! Redirecting...');
                window.location.href = 'studentHomepage.html';
            } else {
                if (/duplicate|exists|already/i.test(data.message || '')) {
                    // Prepare duplicate state BEFORE updating UI so live validator preserves the message
                    lastDuplicateEmail = email.value.trim();
                    email.classList.add('invalid');
                    contactErrorActivated = true;
                    errorSlide2.textContent = 'This email is already registered. You were returned to the email step to change it.';
                    errorSlide2.style.display = 'block';
                    step = 1; updateUI();
                    email.focus();
                } else {
                    alert('Registration failed: ' + (data.message || 'Unknown error'));
                }
            }
        } catch (e) {
            console.error('Registration request failed:', e);
            alert('Network error or server unavailable.');
        } finally {
            submitting = false;
            finishBtn.disabled = false;
            finishBtn.textContent = 'Finish';
            stopLoadingAnimation();
        }
    }

    nextBtn.addEventListener('click', next);
    backBtn.addEventListener('click', back);
    finishBtn.addEventListener('click', finish);

    // Attach live validation listeners
    password.addEventListener('input', livePasswordFeedback);
    repeatPassword.addEventListener('input', livePasswordFeedback);
    email.addEventListener('input', () => { liveContactValidation(); });
    facultyNumber.addEventListener('input', () => { liveContactValidation(); });
    if (groupSelect) {
        groupSelect.addEventListener('change', () => { liveContactValidation(); });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (step < TOTAL_STEPS - 1) { e.preventDefault(); next(); }
            else { e.preventDefault(); finish(); }
        }
    });

    // Hide contact error initially until user attempts to Continue.
    if (errorSlide2) errorSlide2.style.display = 'none';
    updateUI();
    focusFirstInput();
    
    // Password reveal/hide: single toggle controls both password fields
    (function(){
        const pwInput = document.getElementById('password');
        const repeatInput = document.getElementById('repeatPassword');
        const pwBtn = document.querySelector('.password-wrapper .toggle-password');
        if (!pwInput || !repeatInput || !pwBtn) return;
        const img = pwBtn.querySelector('img');
        const setState = (show) => {
            pwInput.type = show ? 'text' : 'password';
            repeatInput.type = show ? 'text' : 'password';
            pwBtn.setAttribute('aria-pressed', String(show));
            pwBtn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
            if (img) {
                img.src = show ? 'icons/hide.svg' : 'icons/show.svg';
                img.alt = show ? 'Hide password' : 'Show password';
            }
        };
        pwBtn.addEventListener('click', () => {
            const willShow = pwInput.type === 'password';
            setState(willShow);
        });
    })();
})();