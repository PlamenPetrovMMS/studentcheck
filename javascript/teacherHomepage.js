const serverBaseUrl = 'https://studentcheck-server.onrender.com'; // Set to your server base URL if needed

// Add click logging and behavior for dynamically created "New Class" buttons
document.addEventListener('DOMContentLoaded', async () => {

    const classList = document.getElementById('classList');
    const addBtn = document.getElementById('addClassBtn');

    // Determine current teacher email with robust fallbacks (mobile reload safe)
    let teacherEmail = localStorage.getItem('teacherEmail') || null;
    if(!teacherEmail) console.error('No teacher email found in localStorage for session.');

    const normalizeEmail = (e) => (e || '').trim().toLowerCase();

    const parseEmailFromPerClassKey = (key) => {
        // key pattern: teacher:class:<email>:<className>
        const m = key.match(/^teacher:class:([^:]+):/);
        return m ? m[1] : null;
    };

    const ENDPOINTS = {
        createClass: `/classes`,
        markAttendance: `/attendance`,
        class_students: '/class_students',
    };

    async function apiCreateClass(name, studentIds, teacherEmail) {
        console.log('[API] Creating class:', name, 'with students:', studentIds);
        const res = await fetch(serverBaseUrl + ENDPOINTS.createClass, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, students: studentIds, teacherEmail }) });
        if (!res.ok) throw new Error('Class create failed');
        return res.json();
    }
    
    async function apiMarkAttendance(classId, studentId) {
        const res = await fetch(serverBaseUrl + ENDPOINTS.markAttendance, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: classId, student_id: studentId }) });
        if (!res.ok) throw new Error('Attendance mark failed');
        return res.json();
    }

    async function apiFetchClassAttendance(classId) {
        const res = await fetch(serverBaseUrl + ENDPOINTS.classAttendanceSummary(classId), { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error('Attendance summary fetch failed');
        return res.json();
    }

    const classIdByName = new Map();
    const attendanceCountCache = new Map();

    const storageKey = (email) => {
        const e = normalizeEmail(email || teacherEmail);
        return e ? `teacher:classes:${e}` : null;
    };

    // --- Per-class readiness state ---
    const readyClasses = new Set(); // class name strings
    const classStudentAssignments = new Map(); // className -> Set(studentIds)
    let currentClassButton = null;
    let currentClassName = '';
    let currentClassId = '';
    let wizardSelections = new Set();
    let wizardClassName = '';
    let wizardStudentIndex = new Map(); // id -> { fullName, facultyNumber }

    // Helper: Get normalized class name text from a class button
    // Purpose: Centralizes extraction from dataset/text and removes the "✓ Ready" suffix.
    function getRawClassNameFromButton(button) {
        if (!button) return '';
        return (button.dataset.className || button.dataset.originalLabel || button.textContent || '')
            .replace(/✓\s*Ready/g, '')
            .trim();
    }

    function updateClassStatusUI(btn) {
        const button = btn || currentClassButton;
        if (!button) return;
        const className = getRawClassNameFromButton(button);
        const isReady = readyClasses.has(className);
        if (isReady) {
            button.classList.add('class-ready');
        } else {
            button.classList.remove('class-ready');
        }
    }

    function flashReadyBadge(button) {
        if (!button) return;
        const badge = document.createElement('div');
        badge.className = 'ready-badge';
        badge.textContent = '✓ Ready';
        button.appendChild(badge);
        setTimeout(() => {
            badge.remove();
        }, 2000);
    }

    // ---- Scanner Overlay (Start Scanning) ----
    let scannerOverlay = null;
    let currentScanMode = 'joining';
    let html5QrCode = null; // Html5Qrcode instance
    // Attendance state per class: Map<className, Map<studentId, 'none'|'joined'|'completed'>>
    const attendanceState = new Map();
    // Quick index for UI dots in attendance overlay: Map<studentId, HTMLElement>
    let attendanceDotIndex = new Map();
    let attendanceOverlay = null;

    function ensureScannerOverlay() {
        if (scannerOverlay) return scannerOverlay;
        scannerOverlay = document.createElement('div');
        scannerOverlay.id = 'scannerOverlay';
        scannerOverlay.className = 'overlay';
        scannerOverlay.style.visibility = 'hidden';
        scannerOverlay.innerHTML = `
            <div class="ready-class-popup" role="dialog" aria-modal="true" aria-labelledby="scannerTitle">
                <h2 id="scannerTitle" style="text-align:center; margin:0 0 16px 0;">Start Scanning</h2>
                <button type="button" id="closeScannerBtn" class="close-small" aria-label="Close">×</button>
                <div id="scannerModeGroup" class="mode-toggle-group" role="radiogroup" aria-label="Scan mode">
                    <label class="mode-toggle" for="scanJoin">
                        <input type="radio" name="scanMode" value="joining" id="scanJoin" checked>
                        <span class="mode-label">Joining</span>
                    </label>
                    <label class="mode-toggle" for="scanLeave">
                        <input type="radio" name="scanMode" value="leaving" id="scanLeave">
                        <span class="mode-label">Leaving</span>
                    </label>
                </div>
                <div id="cameraContainer" class="camera-container">
                    <div id="qr-reader" style="width:100%; height:100%;"></div>
                </div>
                <div class="scanner-footer-actions">
                    <button type="button" id="scannerStopBtn" class="role-button primary">Show Attendance</button>
                    <button type="button" id="scannerCloseBtn" class="role-button">Close</button>
                </div>
            </div>`;
        document.body.appendChild(scannerOverlay);
        const closeBtn = scannerOverlay.querySelector('#closeScannerBtn');
        // Close (X) triggers confirmation popup; overlay won't close by ESC or background clicks
        closeBtn?.addEventListener('click', () => openCloseScannerConfirm());
        // Disable background click closing for scanner overlay
        scannerOverlay.addEventListener('click', (e) => {
            // Intentionally do nothing to prevent accidental close on backdrop
            return;
        });
        // Disable ESC-to-close for scanner overlay
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && scannerOverlay.style.visibility === 'visible') {
                // no-op; require explicit confirmation to close
                e.stopPropagation();
                e.preventDefault();
            }
        });
        // Radio handlers
        const radios = scannerOverlay.querySelectorAll('input[name="scanMode"]');
        radios.forEach(r => r.addEventListener('change', (ev) => {
            const mode = ev.target.value === 'leaving' ? 'leaving' : 'joining';
            handleRadioChange(mode);
        }));
        // Footer action buttons
        const stopBtn = scannerOverlay.querySelector('#scannerStopBtn');
        stopBtn?.addEventListener('click', () => {
            // Open attendance overlay while keeping scanner running for live updates
            openAttendanceOverlay(currentClassName);
        });
        const closeActionBtn = scannerOverlay.querySelector('#scannerCloseBtn');
        closeActionBtn?.addEventListener('click', () => openCloseScannerConfirm());
        return scannerOverlay;
    }

    function stopAllCameraTracks() {
        try {
            const videos = document.querySelectorAll('#qr-reader video, #cameraContainer video, video');
            videos.forEach(v => {
                try {
                    const s = v.srcObject;
                    if (s && typeof s.getTracks === 'function') {
                        s.getTracks().forEach(t => { try { t.stop(); } catch(_){} });
                    }
                    v.srcObject = null;
                } catch(_){}
            });
        } catch(_) {}
    }

    function closeScannerOverlay(onClosed) {
        const finish = () => {
            if (scannerOverlay) scannerOverlay.style.visibility = 'hidden';
            document.body.style.overflow = '';
             // Hard-stop any lingering camera tracks as a safety net
            stopAllCameraTracks();
            try { if (typeof onClosed === 'function') onClosed(); } catch(_) {}
        };
        try {
            if (html5QrCode) {
                // stop() returns a promise
                html5QrCode.stop().then(() => {
                    html5QrCode.clear();
                    html5QrCode = null;
                    finish();
                }).catch(() => {
                    try { html5QrCode.clear(); } catch(_){}
                    html5QrCode = null;
                    // Fallback hard stop if library couldn't stop cleanly
                    stopAllCameraTracks();
                    finish();
                });
                return;
            }
        } catch (e) { console.warn('Scanner cleanup error:', e); }
        // If no instance or error, still attempt to hard-stop camera tracks
        stopAllCameraTracks();
        finish();
    }

    let html5qrcodeLoadPromise = null;
    function ensureHtml5QrcodeLoaded() {
        if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
        if (html5qrcodeLoadPromise) return html5qrcodeLoadPromise;
        const sources = [
            'https://unpkg.com/html5-qrcode@latest/minified/html5-qrcode.min.js',
            'https://unpkg.com/html5-qrcode@latest/html5-qrcode.min.js',
            'https://cdn.jsdelivr.net/npm/html5-qrcode@latest/minified/html5-qrcode.min.js',
            'https://cdn.jsdelivr.net/npm/html5-qrcode@latest/html5-qrcode.min.js'
        ];
        html5qrcodeLoadPromise = new Promise((resolve, reject) => {
            const tryNext = (i) => {
                if (i >= sources.length) { reject(new Error('Failed to load html5-qrcode library')); return; }
                const script = document.createElement('script');
                script.src = sources[i];
                script.async = true;
                script.onload = () => resolve(window.Html5Qrcode);
                script.onerror = () => { script.remove(); tryNext(i+1); };
                document.head.appendChild(script);
            };
            tryNext(0);
        });
        return html5qrcodeLoadPromise;
    }

    let lastScanAt = 0;
    function handleRadioChange(mode) {
        currentScanMode = (mode === 'leaving') ? 'leaving' : 'joining';
        const cam = document.getElementById('cameraContainer');
        if (cam) cam.setAttribute('data-mode', currentScanMode);
    }
    function initializeScanner(mode) {
        return ensureHtml5QrcodeLoaded().then(() => {
            const container = document.getElementById('qr-reader');
            if (!container) { throw new Error('QR container not found'); }
            html5QrCode = new Html5Qrcode('qr-reader');
            const onScanSuccess = (decodedText, decodedResult) => {
                const now = Date.now();
                if (now - lastScanAt > 300) {
                    lastScanAt = now;
                    handleScannedCode(decodedText, currentScanMode, currentClassName);
                }
            };
            const onScanError = (errorMessage, error) => {
                // Ignore frequent decode errors; log only severe ones silently
                return;
            };
            return html5QrCode.start(
                { facingMode: 'environment' },
                {
                    fps: 24,
                    qrbox: { width: 220, height: 220 },
                    aspectRatio: 1.0,
                    disableFlip: true
                },
                onScanSuccess,
                onScanError
            ).catch((e) => {
                console.error('Scanner initialization error:', e);
                if (container) container.innerHTML = '<p style="color:#b91c1c; text-align:center;">Unable to start camera scanner.</p>';
            });
        });
    }

    function handleScannedCode(data, mode, classId) {
        // Parse JSON payload from student QR (expects facultyNumber, name, email)
        let payload = null;
        try {
            payload = JSON.parse(data);
        } catch(_) {}
        const studentId = deriveStudentIdFromPayload(payload);
        if (studentId) {
            // Resolve active class (fallback if classId missing)
            const activeClass = (classId || getActiveClassName() || '').trim();
            if (!activeClass) {
                console.log('[Attendance] Ignoring scan – no active class context.');
            } else if (!isStudentInClass(activeClass, studentId)) {
                console.log('[Attendance] Ignoring scan for unassigned student:', studentId, 'class:', activeClass);
            } else {
                updateAttendanceState(activeClass, studentId, mode);
            }
        }
        // For UX feedback, briefly flash camera border
        const cam = document.getElementById('cameraContainer');
        if (cam) {
            cam.style.boxShadow = '0 0 0 4px rgba(37,99,235,0.25) inset';
            setTimeout(() => { cam.style.boxShadow = 'none'; }, 180);
        }
    }

    function deriveStudentIdFromPayload(payload) {
        if (!payload || typeof payload !== 'object') return null;
        const id = payload.facultyNumber || payload.faculty_number || payload.email || null;
        return id || null;
    }

    function ensureAttendanceOverlay() {
        if (attendanceOverlay) return attendanceOverlay;
        attendanceOverlay = document.createElement('div');
        attendanceOverlay.id = 'attendanceOverlay';
        attendanceOverlay.className = 'overlay';
        attendanceOverlay.style.visibility = 'hidden';
        attendanceOverlay.innerHTML = `
            <div class="ready-class-popup attendance-popup" role="dialog" aria-modal="true" aria-labelledby="attendanceTitle">
                <h2 id="attendanceTitle">Attendance</h2>
                <div id="attendanceList" class="attendance-list"></div>
                <div class="manage-footer-actions">
                    <button type="button" id="attendanceCloseBtn" class="role-button">Close</button>
                </div>
            </div>`;
        document.body.appendChild(attendanceOverlay);
        const closeBtn = attendanceOverlay.querySelector('#attendanceCloseBtn');
        closeBtn?.addEventListener('click', () => closeAttendanceOverlay());
        attendanceOverlay.addEventListener('click', (e) => { if (e.target === attendanceOverlay) closeAttendanceOverlay(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && attendanceOverlay.style.visibility === 'visible') closeAttendanceOverlay(); });
        return attendanceOverlay;
    }

    function openAttendanceOverlay(className) {
        ensureAttendanceOverlay();
        const titleEl = attendanceOverlay.querySelector('#attendanceTitle');
        if (titleEl) titleEl.textContent = `Attendance — ${className || currentClassName || 'Class'}`;
        renderAttendanceForClass(className || currentClassName);
        attendanceOverlay.style.visibility = 'visible';
        // Keep body overflow hidden because scanner overlay is also open
        document.body.style.overflow = 'hidden';
    }
    function closeAttendanceOverlay() {
        if (!attendanceOverlay) return;
        attendanceOverlay.style.visibility = 'hidden';
        // Don't alter body overflow here because scanner overlay might be active
    }

    function getStudentsForClassDisplay(className) {
        // Prefer per-class stored student objects
        const stored = loadClassStudents(className) || [];
        if (stored.length > 0) {
            return stored.map(s => ({
                id: s.facultyNumber || s.fullName || '',
                name: s.fullName || '',
                facultyNumber: s.facultyNumber || ''
            })).filter(s => s.id);
        }
        // Fallback to the selection set
        const set = classStudentAssignments.get(className);
        if (set && set.size > 0) {
            return Array.from(set).map(id => {
                const rec = studentIndex.get(id) || { fullName: id, faculty_number: '' };
                return { id, name: rec.fullName || id, facultyNumber: rec.faculty_number || '' };
            });
        }
        return [];
    }

    function initAttendanceStateForClass(className, students) {
        if (!attendanceState.has(className)) attendanceState.set(className, new Map());
        const map = attendanceState.get(className);
        students.forEach(s => { if (!map.has(s.id)) map.set(s.id, 'none'); });
        return map;
    }

    function renderAttendanceForClass(className) {
        const listEl = document.getElementById('attendanceList');
        if (!listEl) return;
        attendanceDotIndex = new Map();
        const students = getStudentsForClassDisplay(className);
        const stateMap = initAttendanceStateForClass(className, students);
        listEl.innerHTML = '';
        if (students.length === 0) {
            listEl.innerHTML = '<p class="muted" style="text-align:center;">No students in this class.</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'attendance-ul';
        students.forEach(s => {
            const li = document.createElement('li');
            li.className = 'attendance-item';
            const name = document.createElement('span');
            name.className = 'attendance-name';
            name.textContent = s.name + (s.facultyNumber ? ` (${s.facultyNumber})` : '');
            const dot = document.createElement('span');
            dot.className = 'status-dot';
            applyDotStateClass(dot, stateMap.get(s.id));
            li.appendChild(name);
            li.appendChild(dot);
            ul.appendChild(li);
            attendanceDotIndex.set(s.id, dot);
        });
        listEl.appendChild(ul);
    }

    function applyDotStateClass(dotEl, state) {
        dotEl.classList.remove('status-none', 'status-joined', 'status-completed');
        if (state === 'completed') dotEl.classList.add('status-completed');
        else if (state === 'joined') dotEl.classList.add('status-joined');
        else dotEl.classList.add('status-none');
    }

    // --- Attendance session logs (per class, per student) ---
    // In-memory pending joins: Map<className, Map<studentId, number(joinAtMs)>>
    const pendingJoinTimes = new Map();
    function ensurePendingMap(className) {
        if (!pendingJoinTimes.has(className)) pendingJoinTimes.set(className, new Map());
        return pendingJoinTimes.get(className);
    }
    function markJoinTime(className, studentId, when) {
        const m = ensurePendingMap(className);
        m.set(studentId, when || Date.now());
    }
    function takeJoinTime(className, studentId) {
        const m = ensurePendingMap(className);
        const t = m.get(studentId);
        m.delete(studentId);
        return t || Date.now();
    }
    function loadAttendanceLog(className, studentId) {
        return [];
    }

    function updateAttendanceState(className, studentId, mode) {
        if (!className || !studentId) return;
        // Guard: ignore scans for students not assigned to the class
        if (!isStudentInClass(className, studentId)) {
            console.log('[Attendance] Ignoring scan for unassigned student:', studentId, 'in class:', className);
            return;
        }
        if (!attendanceState.has(className)) attendanceState.set(className, new Map());
        const map = attendanceState.get(className);
        const current = map.get(studentId) || 'none';
        let next = current;
        if (mode === 'joining') {
            if (current === 'none') {
                next = 'joined';
                markJoinTime(className, studentId, Date.now());
            }
        } else if (mode === 'leaving') {
            if (current === 'joined') next = 'completed';
        }
        if (next !== current) {
            map.set(studentId, next);
            // Update UI dot if visible
            const dot = attendanceDotIndex.get(studentId);
            if (dot) applyDotStateClass(dot, next);
            // Increment attendance when completing a session (joined -> completed)
            if (current === 'joined' && next === 'completed') {
                const joinAt = takeJoinTime(className, studentId);
                const classId = classIdByName.get(className);
                if (!classId) {
                    console.warn('Missing class id for', className);
                } else {
                    if (dot) dot.classList.add('status-loading');
                    apiMarkAttendance(classId, studentId).then(() => {
                        if (dot) dot.classList.remove('status-loading');
                        const counts = attendanceCountCache.get(classId) || new Map();
                        const existing = counts.get(studentId) || 0;
                        counts.set(studentId, existing + 1);
                        attendanceCountCache.set(classId, counts);
                        updateStudentInfoOverlayCount(studentId, className);
                    }).catch(e => {
                        if (dot) dot.classList.remove('status-loading');
                        alert('Failed to record attendance: ' + e.message);
                        map.set(studentId, 'joined');
                        if (dot) applyDotStateClass(dot, 'joined');
                    });
                }
            }
        }
    }

    // ---- Reusable confirmation overlay ----
    let confirmOverlay = null;
    function ensureConfirmOverlay() {
        if (confirmOverlay) return confirmOverlay;
        confirmOverlay = document.createElement('div');
        confirmOverlay.id = 'confirmOverlay';
        confirmOverlay.className = 'overlay';
        confirmOverlay.style.visibility = 'hidden';
        confirmOverlay.innerHTML = `
            <div class="confirm-popup" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
                <h3 id="confirmTitle" class="confirm-title">Confirm</h3>
                <p id="confirmMessage" class="confirm-message"></p>
                <div class="confirm-actions">
                    <button type="button" id="confirmCancelBtn" class="role-button">Cancel</button>
                    <button type="button" id="confirmOkBtn" class="role-button danger">Confirm</button>
                </div>
            </div>`;
        document.body.appendChild(confirmOverlay);
        return confirmOverlay;
    }
    function openConfirmOverlay(message, onConfirm, onCancel) {
        ensureConfirmOverlay();
        const msgEl = confirmOverlay.querySelector('#confirmMessage');
        if (msgEl) msgEl.textContent = message || 'Are you sure?';
        const cancelBtn = confirmOverlay.querySelector('#confirmCancelBtn');
        const okBtn = confirmOverlay.querySelector('#confirmOkBtn');
        const cleanup = () => {
            cancelBtn?.replaceWith(cancelBtn.cloneNode(true));
            okBtn?.replaceWith(okBtn.cloneNode(true));
        };
        // Re-query after cloning
        let newCancel = null, newOk = null;
        const wire = () => {
            newCancel = confirmOverlay.querySelector('#confirmCancelBtn');
            newOk = confirmOverlay.querySelector('#confirmOkBtn');
            newCancel?.addEventListener('click', () => {
                closeConfirmOverlay();
                if (onCancel) onCancel();
            });
            newOk?.addEventListener('click', () => {
                closeConfirmOverlay();
                if (onConfirm) onConfirm();
            });
        };
        cleanup();
        wire();
        confirmOverlay.style.visibility = 'visible';
        // Prevent backdrop click from propagating to scanner close; treat as cancel
        confirmOverlay.addEventListener('click', (e) => {
            if (e.target === confirmOverlay) {
                closeConfirmOverlay();
                if (onCancel) onCancel();
            }
        }, { once: true });
    }
    function closeConfirmOverlay() { if (confirmOverlay) confirmOverlay.style.visibility = 'hidden'; }

    function clearTemporaryAttendanceData(className) {
        try {
            if (className) attendanceState.delete(className);
            attendanceDotIndex.clear();
        } catch (_) { }
    }
    function openCloseScannerConfirm() {
        openConfirmOverlay(
            'Are you sure you want to close the scanner? All attendance data will be deleted.',
            () => {
                // Confirm: clear temp attendance, close attendance overlay if open, then close scanner
                clearTemporaryAttendanceData(currentClassName);
                if (attendanceOverlay && attendanceOverlay.style.visibility === 'visible') closeAttendanceOverlay();
                const className = currentClassName;
                closeScannerOverlay(() => {
                    // After scanner fully closed, return to ready class popup
                    openReadyClassPopup(className);
                });
            },
            () => {
                // Cancel: do nothing; keep scanner running
            }
        );
    }

    function openScannerOverlay(classId) {
        ensureScannerOverlay();
        // Hide ready overlay to avoid stacking
        if (readyPopupOverlay) readyPopupOverlay.style.visibility = 'hidden';
        // Title
        const titleEl = scannerOverlay.querySelector('#scannerTitle');
        if (titleEl) {
            const displayName = (classId || currentClassName || '').trim();
            titleEl.textContent = displayName || 'Class';
        }
        // Default mode
        currentScanMode = 'joining';
        const joinRadio = scannerOverlay.querySelector('#scanJoin'); if (joinRadio) joinRadio.checked = true;
        const leaveRadio = scannerOverlay.querySelector('#scanLeave'); if (leaveRadio) leaveRadio.checked = false;
        // Show overlay
        scannerOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    // Start camera
    initializeScanner(currentScanMode);
    }

    function startScanner() {
        openScannerOverlay(currentClassName);
    }

    // Ready class popup dynamic creation (unchanged semantics)
    let readyPopupOverlay = null;
    function ensureReadyPopup() {
        if (readyPopupOverlay) return readyPopupOverlay;
        readyPopupOverlay = document.createElement('div');
        readyPopupOverlay.id = 'readyClassPopupOverlay';
        readyPopupOverlay.className = 'overlay';
        readyPopupOverlay.style.visibility = 'hidden';
        readyPopupOverlay.innerHTML = `
            <div class="ready-class-popup" role="dialog" aria-modal="true" aria-labelledby="readyClassTitle">
                <h2 id="readyClassTitle">Class Ready</h2>
                <p class="ready-class-desc">Choose an action for this ready class.</p>
                <div class="ready-class-actions">
                    <button type="button" id="manageStudentsBtn" class="role-button primary">Manage Students</button>
                    <button type="button" id="startScannerBtn" class="role-button secondary-green">Start Scanner</button>
                    <button type="button" id="downloadAttendanceTableBtn" class="role-button primary" aria-label="Download Attendance Table">Download Attendance Table</button>
                    <button type="button" id="classOptionsBtn" class="role-button primary" aria-label="Class Options">Options</button>
                </div>
                <button type="button" id="closeReadyPopupBtn" class="close-small" aria-label="Close">×</button>
            </div>`;
        document.body.appendChild(readyPopupOverlay);
        const manageBtn = readyPopupOverlay.querySelector('#manageStudentsBtn');
        const scannerBtn = readyPopupOverlay.querySelector('#startScannerBtn');
        const downloadBtn = readyPopupOverlay.querySelector('#downloadAttendanceTableBtn');
        const optionsBtn = readyPopupOverlay.querySelector('#classOptionsBtn');
        const closeBtn = readyPopupOverlay.querySelector('#closeReadyPopupBtn');
        manageBtn?.addEventListener('click', () => {
            // Replace the current ready overlay with Manage Students overlay
            const className = currentClassName || (currentClassButton ? (currentClassButton.dataset.className || currentClassButton.dataset.originalLabel || currentClassButton.textContent || '') : '');
            closeReadyClassPopup();
            openManageStudentsOverlay((className || '').trim());
        });
    scannerBtn?.addEventListener('click', () => { startScanner(); });
        downloadBtn?.addEventListener('click', () => {
            try {
                const resolved = getActiveClassName();
                console.log('[Attendance Export] Resolved active class for download button click:', resolved);
                handleDownloadAttendanceTable(resolved);
            } catch (e) {
                console.error('Download Attendance Table failed unexpectedly:', e);
            }
        });
        optionsBtn?.addEventListener('click', () => {
            const name = getActiveClassName();
            openClassOptionsOverlay(name);
        });
        closeBtn?.addEventListener('click', () => closeAllClassOverlays());
        readyPopupOverlay.addEventListener('click', (e) => { if (e.target === readyPopupOverlay) closeReadyClassPopup(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReadyClassPopup(); });
        return readyPopupOverlay;
    }
    function openReadyClassPopup(nameOptional) {
        if (nameOptional) {
            currentClassName = nameOptional;
        }
        ensureReadyPopup();
        // Switch to buttons-only layout and vertical actions
        const popup = readyPopupOverlay.querySelector('.ready-class-popup');
        if (popup) {
            popup.classList.add('buttons-only');
            const actions = popup.querySelector('.ready-class-actions');
            actions?.classList.add('vertical');
            // Set the title to the selected class name
            const titleEl = popup.querySelector('#readyClassTitle');
            if (titleEl) {
                const rawFromBtn = currentClassButton ? getRawClassNameFromButton(currentClassButton) : '';
                const name = (currentClassName || rawFromBtn || '').trim();
                titleEl.textContent = name || 'Class';
            }
        }
        readyPopupOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }
    function closeReadyClassPopup() { if (!readyPopupOverlay) return; readyPopupOverlay.style.visibility = 'hidden'; document.body.style.overflow = ''; }

    // ---- Class Options (Rename / Delete) ----
    let classOptionsOverlay = null;
    function ensureClassOptionsOverlay(){
        if (classOptionsOverlay) return classOptionsOverlay;
        classOptionsOverlay = document.createElement('div');
        classOptionsOverlay.id = 'classOptionsOverlay';
        classOptionsOverlay.className = 'overlay';
        classOptionsOverlay.style.visibility = 'hidden';
        classOptionsOverlay.innerHTML = `
            <div class="ready-class-popup class-options-popup" role="dialog" aria-modal="true" aria-labelledby="classOptionsTitle">
                <h2 id="classOptionsTitle">Class Options</h2>
                <button type="button" id="closeClassOptionsBtn" class="close-small" aria-label="Close" style="top:10px; right:12px;">×</button>
                <div class="class-options-row">
                    <input type="text" id="classOptionsNameInput" placeholder="Class name" />
                    <button type="button" id="classOptionsSaveBtn" class="role-button primary">Save</button>
                </div>
                <div class="class-options-footer">
                    <button type="button" id="classOptionsDeleteBtn" class="role-button danger">Delete Class</button>
                </div>
            </div>`;
        document.body.appendChild(classOptionsOverlay);
        // Wire events
        const closeBtn = classOptionsOverlay.querySelector('#closeClassOptionsBtn');
        closeBtn?.addEventListener('click', () => closeClassOptionsOverlay());
        classOptionsOverlay.addEventListener('click', (e) => { if (e.target === classOptionsOverlay) closeClassOptionsOverlay(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && classOptionsOverlay.style.visibility === 'visible') closeClassOptionsOverlay(); });
        const saveBtn = classOptionsOverlay.querySelector('#classOptionsSaveBtn');
        const deleteBtn = classOptionsOverlay.querySelector('#classOptionsDeleteBtn');
        saveBtn?.addEventListener('click', onSaveClassOptions);
        deleteBtn?.addEventListener('click', onDeleteClassFromOptions);
        return classOptionsOverlay;
    }
    function openClassOptionsOverlay(className){
        ensureClassOptionsOverlay();
        const input = classOptionsOverlay.querySelector('#classOptionsNameInput');
        input.value = (className || getActiveClassName() || '').trim();
        const titleEl = classOptionsOverlay.querySelector('#classOptionsTitle');
        if (titleEl) titleEl.textContent = `Class Options — ${input.value || 'Class'}`;
        classOptionsOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
        input.focus();
    }
    function closeClassOptionsOverlay(){ if (classOptionsOverlay) classOptionsOverlay.style.visibility = 'hidden'; if (!readyPopupOverlay || readyPopupOverlay.style.visibility !== 'visible') document.body.style.overflow = ''; }

    function renameClass(oldName, newName){
        const from = (oldName||'').trim();
        const to = (newName||'').trim();
        if (!from || !to || from === to) return false;
        // Migrate per-class storage
        try {
            const oldKey = classItemKey(from);
            const newKey = classItemKey(to);
            const raw = oldKey ? localStorage.getItem(oldKey) : null;
            let studentsArr = [];
            if (raw) {
                try { const obj = JSON.parse(raw); studentsArr = Array.isArray(obj?.students) ? obj.students : []; } catch(_) {}
            } else {
                studentsArr = loadClassStudents(from) || [];
            }
            if (newKey) localStorage.setItem(newKey, JSON.stringify({ name: to, students: studentsArr }));
            if (oldKey) localStorage.removeItem(oldKey);
        } catch(e){ console.warn('Rename class storage migrate failed', e); }
        // Update readiness set
        if (readyClasses.has(from)) { readyClasses.delete(from); readyClasses.add(to); }
        // Update assignments map
        if (classStudentAssignments.has(from)) { const set = classStudentAssignments.get(from); classStudentAssignments.delete(from); classStudentAssignments.set(to, set); }
        // Migrate attendance logs keys
        try {
            if (teacherEmail) {
                const normEmail = normalizeEmail(teacherEmail);
                const oldPrefix = `teacher:attendance:${normEmail}:logs:${encodeURIComponent(from)}:`;
                const newPrefix = `teacher:attendance:${normEmail}:logs:${encodeURIComponent(to)}:`;
                const toMove = [];
                for (let i=0;i<localStorage.length;i++){
                    const k = localStorage.key(i);
                    if (k && k.startsWith(oldPrefix)) toMove.push(k);
                }
                toMove.forEach(k => {
                    const tail = k.substring(oldPrefix.length);
                    const val = localStorage.getItem(k);
                    localStorage.setItem(newPrefix + tail, val);
                    localStorage.removeItem(k);
                });
            }
        } catch(e){ console.warn('Attendance logs migrate failed', e); }
        // Update UI: button, titles, currentClassName, datasets
        const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').replace(/✓\s*Ready/g,'').trim() === from);
        if (btn) {
            btn.dataset.className = to;
            btn.dataset.originalLabel = to;
            btn.textContent = to;
            updateClassStatusUI(btn);
        }
        if (currentClassName === from) currentClassName = to;
        if (currentClassButton === btn) currentClassButton.dataset.className = to;
        // Update any open overlay titles
        const readyTitle = document.getElementById('readyClassTitle'); if (readyTitle && readyPopupOverlay && readyPopupOverlay.style.visibility === 'visible') readyTitle.textContent = to;
        const manageTitle = document.getElementById('manageStudentsTitle'); if (manageTitle && manageStudentsOverlay && manageStudentsOverlay.style.visibility === 'visible') manageTitle.textContent = `Manage Students — ${to}`;
        const scannerTitle = document.getElementById('scannerTitle'); if (scannerTitle && scannerOverlay && scannerOverlay.style.visibility === 'visible') scannerTitle.textContent = to;
        const attendanceTitle = document.getElementById('attendanceTitle'); if (attendanceTitle && attendanceOverlay && attendanceOverlay.style.visibility === 'visible') attendanceTitle.textContent = `Attendance — ${to}`;
        return true;
    }
    function deleteClassCompletely(name){
        const n = (name||'').trim(); if (!n) return;
        // Remove per-class item
        try { const key = classItemKey(n); if (key) localStorage.removeItem(key); } catch(_){}
        // Remove readiness
        if (readyClasses.has(n)) { readyClasses.delete(n); }
        // Remove assignments
        if (classStudentAssignments.has(n)) { classStudentAssignments.delete(n); }
        // Remove attendance logs
        try {
            if (teacherEmail) {
                const normEmail = normalizeEmail(teacherEmail);
                const prefix = `teacher:attendance:${normEmail}:logs:${encodeURIComponent(n)}:`;
                const keys = [];
                for (let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if (k && k.startsWith(prefix)) keys.push(k); }
                keys.forEach(k => localStorage.removeItem(k));
            }
        } catch(_){}
        // Remove button from UI
        const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').replace(/✓\s*Ready/g,'').trim() === n);
        if (btn) { const li = btn.closest('li'); if (li) li.remove(); }
        // If current class matches, reset and close overlays
        if (currentClassName === n) {
            currentClassName = '';
            currentClassButton = null;
            closeAllClassOverlays();
        }
    }
    function onSaveClassOptions(){
        const input = classOptionsOverlay.querySelector('#classOptionsNameInput');
        const proposed = (input.value||'').trim();
        const oldName = getActiveClassName();
        if (!proposed) { alert('Name cannot be empty.'); input.focus(); return; }
        if (proposed === oldName) { closeClassOptionsOverlay(); return; }
        const ok = renameClass(oldName, proposed);
        if (ok) { closeClassOptionsOverlay(); }
    }
    function onDeleteClassFromOptions(){
        const name = getActiveClassName();
        openConfirmOverlay('Are you sure you want to delete this class?', () => {
            deleteClassCompletely(name);
            closeClassOptionsOverlay();
        }, () => { /* canceled */ });
    }

    // ---- CLASS CREATION WIZARD ----
    let wizardOverlay = null;
    let wizardTrack = null; // slides container
    let wizardNameInput = null;
    let wizardErrorName = null;
    let wizardBackBtn = null;
    let wizardNextBtn = null;
    let wizardFinishBtn = null;
    let wizardStudentContainer = null; // where students list renders
    const WIZARD_TOTAL_SLIDES = 2;

    function ensureWizard() {
        if (wizardOverlay) return;
        wizardOverlay = document.createElement('div');
        wizardOverlay.id = 'classWizardOverlay';
        wizardOverlay.className = 'overlay';
        wizardOverlay.style.visibility = 'hidden';
        wizardOverlay.innerHTML = `
            <div class="card" role="dialog" aria-modal="true" aria-labelledby="classWizardTitle">
                <div class="card-header">
                    <h1 id="classWizardTitle" class="title">Create Class</h1>
                </div>
                <div class="slider">
                    <div class="slides-track" id="classWizardTrack">
                        <section class="slide" data-index="0" aria-label="Class Name">
                            <div class="field">
                                <label for="wizardClassName">Name</label>
                                <input id="wizardClassName" type="text" required />
                            </div>
                            <div id="wizardErrorName" class="error" role="alert" aria-live="polite"></div>
                        </section>
                        <section class="slide" data-index="1" aria-label="Select Students">
                            <div class="field">
                                <label for="wizardSearchInput">Search students</label>
                                <input id="wizardSearchInput" type="text" placeholder="Type to filter..." />
                            </div>
                            <div id="wizardStudentsBody"></div>
                            <div id="wizardNoStudentsMsg" class="error" aria-live="polite" style="display:none"></div>
                        </section>
                    </div>
                </div>
                <div class="actions" id="wizardActions">
                    <button type="button" id="wizardBackBtn" class="btn btn-secondary" disabled>Back</button>
                    <div>
                        <button type="button" id="wizardNextBtn" class="btn btn-primary">Continue</button>
                        <button type="button" id="wizardFinishBtn" class="btn btn-primary finish-hidden">Finish</button>
                    </div>
                </div>
                <button type="button" id="wizardCloseBtn" class="close-small" aria-label="Close">×</button>
            </div>`;
        document.body.appendChild(wizardOverlay);
        wizardTrack = wizardOverlay.querySelector('#classWizardTrack');
        wizardNameInput = wizardOverlay.querySelector('#wizardClassName');
        wizardErrorName = wizardOverlay.querySelector('#wizardErrorName');
        wizardBackBtn = wizardOverlay.querySelector('#wizardBackBtn');
        wizardNextBtn = wizardOverlay.querySelector('#wizardNextBtn');
        wizardFinishBtn = wizardOverlay.querySelector('#wizardFinishBtn');
        wizardStudentContainer = wizardOverlay.querySelector('#wizardStudentsBody');
        const closeBtn = wizardOverlay.querySelector('#wizardCloseBtn');
        closeBtn.addEventListener('click', closeWizard);
        wizardBackBtn.addEventListener('click', () => goToSlide(0));
        wizardNextBtn.addEventListener('click', handleWizardNext);
        wizardFinishBtn.addEventListener('click', submitNewClass);
        wizardOverlay.addEventListener('click', (e) => { if (e.target === wizardOverlay) closeWizard(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && wizardOverlay.style.visibility === 'visible') closeWizard(); });
        const searchInput = wizardOverlay.querySelector('#wizardSearchInput');
        if (window.Utils && typeof window.Utils.debounce === 'function') {
            const debounced = window.Utils.debounce((value) => filterStudentsWizard(value), 180);
            searchInput.addEventListener('input', (e) => debounced(e.target.value));
        } else {
            let debounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                const value = e.target.value;
                debounceTimer = setTimeout(() => filterStudentsWizard(value), 180);
            });
        }
    }

    function openClassCreationWizard() {
        ensureWizard();
        wizardOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
        wizardSlideIndex = 0;
        goToSlide(0);
        wizardNameInput.focus();
    }
    function closeWizard() { if (wizardOverlay){ wizardOverlay.style.visibility='hidden'; document.body.style.overflow=''; } }

    function goToSlide(index) {
        wizardSlideIndex = index;
        const slides = Array.from(wizardTrack.querySelectorAll('.slide'));
        slides.forEach(sl => sl.classList.toggle('active', Number(sl.dataset.index) === index));
        // Mirror registration button logic
        wizardBackBtn.style.display = index === 0 ? 'none' : 'inline-block';
        wizardBackBtn.disabled = index === 0;
        if (index < WIZARD_TOTAL_SLIDES - 1) {
            wizardNextBtn.style.display = 'inline-block';
            wizardFinishBtn.classList.add('finish-hidden');
        } else {
            wizardNextBtn.style.display = 'none';
            wizardFinishBtn.classList.remove('finish-hidden');
        }
        const actionsContainer = document.getElementById('wizardActions');
        if (actionsContainer) {
            if (index === 0) actionsContainer.classList.add('single-right');
            else actionsContainer.classList.remove('single-right');
        }
        if (index === 1 && wizardStudentContainer && wizardStudentContainer.dataset.loaded !== 'true') {
            loadStudentsIntoWizard();
        }
        // Focus appropriate input similar to registration
        requestAnimationFrame(() => {
            if (index === 0) wizardNameInput?.focus();
            else if (index === 1) document.getElementById('wizardSearchInput')?.focus();
        });
    }

    function handleWizardNext() {
        const name = wizardNameInput.value.trim();
        if (!name) {
            wizardErrorName.textContent = 'Name is required.';
            wizardNameInput.focus();
            return;
        }
        wizardErrorName.textContent = '';
        wizardClassName = name;
        goToSlide(1);
    }

    function collectClassName() { return wizardClassName.trim(); }
    function collectSelectedStudents() { return Array.from(wizardSelections); }

    async function submitNewClass() {

        const className = collectClassName();

        if (!className) { alert('Class name missing.'); goToSlide(0); return; }

        const selectedIds = collectSelectedStudents();

        if (selectedIds.length === 0) {
            if (!confirm('No students selected. Create an empty ready class?')) return;
        }

        var result = await fetch(serverBaseUrl + ENDPOINTS.class_students, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                class_name: className,
                student_ids: selectedIds
            })
        });

        if (!result.ok) {
            const errorText = await result.text();
            console.error('[Class Creation] Server error response', { errorText });
        }

        wizardFinishBtn.disabled = true;
        wizardFinishBtn.textContent = 'Creating...';
        // Debug logging for class creation flow
        const creationStartTs = Date.now();
        console.log('[Class Creation] Starting submitNewClass', {
            className,
            selectedIdsCount: selectedIds.length,
            selectedIds: selectedIds.slice(0, 25), // limit log size
            timestamp: new Date(creationStartTs).toISOString()
        });
        console.time('[Class Creation] apiCreateClass duration');
        apiCreateClass(className, selectedIds, teacherEmail).then(data => {
            const newClassId = data.class_id || data.id;
            console.log('[Class Creation] Created class ID:', newClassId);
            console.log('[Class Creation] API success', {
                className,
                newClassId,
                rawResponse: data
            });
            renderClassItem(className);
            console.log('[Class Creation] Rendered class item for', className);
            classIdByName.set(className, newClassId);
            readyClasses.add(className);
            classStudentAssignments.set(className, new Set(selectedIds));
            const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').trim() === className);
            if (btn) {
                btn.dataset.classId = newClassId;
                updateClassStatusUI(btn);
                flashReadyBadge(btn);
            }
            closeWizard();
        }).catch(err => {
            console.error('[Class Creation] API failure', {
                className,
                error: err && err.message ? err.message : err
            });
            alert('Failed to create class: ' + err.message);
        }).finally(() => {
            console.timeEnd('[Class Creation] apiCreateClass duration');
            console.log('[Class Creation] Finalizing submitNewClass', {
                className,
                totalSelected: selectedIds.length,
                elapsedMs: Date.now() - creationStartTs
            });
            wizardSelections.clear();
            wizardClassName = '';
            wizardFinishBtn.disabled = false;
            wizardFinishBtn.textContent = 'Finish';
        });
    }

    // Student loading for wizard
    async function loadStudentsIntoWizard() {
        if (!wizardStudentContainer) return;
        wizardStudentContainer.innerHTML = '<p class="loading-hint">Loading...</p>';
        try {
            const students = await (window.Students?.fetchAll?.() || Promise.resolve([]));
            wizardStudentContainer.innerHTML='';
            renderStudentsInWizard(students);
            wizardStudentContainer.dataset.loaded='true';
        } catch (e) {
            console.error('Wizard student fetch failed', e);
            wizardStudentContainer.innerHTML = '<p style="color:#b91c1c;">Network error loading students.</p>';
        }
    }

    function renderStudentsInWizard(students) {
        if (!Array.isArray(students) || students.length === 0) { wizardStudentContainer.innerHTML='<p class="muted">No students found.</p>'; return; }
        const list = document.createElement('ul');
        list.style.listStyle='none'; list.style.margin='0'; list.style.padding='0';
        wizardStudentIndex = new Map();
        students.forEach((s, idx) => {
            const li = document.createElement('li');
            li.className='list-item';
            const splitNames = (window.Students?.splitNames || (()=>({ fullName: '' })))(s);
            const facultyNumber = s.faculty_number;
            const studentId = (window.Students?.idForStudent ? window.Students.idForStudent(s, 'wizard', idx) : (facultyNumber || splitNames.fullName || `wizard_${idx}`));
            wizardStudentIndex.set(studentId, { fullName: splitNames.fullName, facultyNumber: facultyNumber || '' });
            const checkbox = document.createElement('input');
            checkbox.type='checkbox'; checkbox.className='studentSelect';
            checkbox.id = `wizardStudent_${idx}`;
            const label = document.createElement('label');
            label.htmlFor = checkbox.id; label.textContent = `${splitNames.fullName} ${facultyNumber || ''}`.trim();
            li.appendChild(checkbox); li.appendChild(label);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) { wizardSelections.add(studentId); li.classList.add('selected'); }
                else { wizardSelections.delete(studentId); li.classList.remove('selected'); }
            });
            li.addEventListener('click', (e)=>{ if (e.target===checkbox || e.target.tagName==='LABEL') return; checkbox.checked=!checkbox.checked; checkbox.dispatchEvent(new Event('change')); });
            if (wizardSelections.has(studentId)) { checkbox.checked=true; li.classList.add('selected'); }
            list.appendChild(li);
        });
        wizardStudentContainer.innerHTML='';
        wizardStudentContainer.appendChild(list);
    }

    function filterStudentsWizard(query) {
        const q = (query||'').trim().toLowerCase();
        if (!wizardStudentContainer) return;
        const items = wizardStudentContainer.querySelectorAll('li.list-item');
        if (!q) {
            // Reset visibility and hide 'no match' message entirely for empty query
            items.forEach(li=> li.style.display='');
            const msgElExisting = wizardStudentContainer.querySelector('#wizardNoMatch');
            if (msgElExisting) msgElExisting.style.display = 'none';
            return;
        }
        const tokens = q.split(/\s+/).filter(Boolean);
        items.forEach(li=>{
            const text = li.textContent.toLowerCase();
            const matches = tokens.every(t=> text.includes(t));
            li.style.display = matches? '' : 'none';
        });
        // Show message if none
        if (!wizardStudentContainer.querySelector('#wizardNoMatch')) {
            const msg = document.createElement('p'); msg.id='wizardNoMatch'; msg.textContent='No matching students.'; msg.style.display='none'; msg.style.fontStyle='italic'; msg.style.color='#6b7280'; wizardStudentContainer.appendChild(msg);
        }
        const anyVisible = Array.from(items).some(li=> li.style.display !== 'none');
        const msgEl = wizardStudentContainer.querySelector('#wizardNoMatch'); if (msgEl) msgEl.style.display = anyVisible ? 'none':'block';
    }

    function openAddStudentsPopup() { addStudentsFromDatabase(); }
    function handleClassButtonClick(buttonEl) {
        currentClassButton = buttonEl;
        const raw = getRawClassNameFromButton(buttonEl);
        currentClassName = raw;
        if (!buttonEl.dataset.className) buttonEl.dataset.className = raw;
        if (!buttonEl.dataset.originalLabel) buttonEl.dataset.originalLabel = raw;
        const className = raw;
        if (readyClasses.has(className)) { openReadyClassPopup(); }
        else { openAddStudentsPopup(); }
    }

    // --- Manage Students overlay (replaces ready-class overlay) ---
    let manageStudentsOverlay = null;
    let manageStudentsListEl = null;
    let studentCache = [];
    let studentIndex = new Map(); // id -> full student object
    let studentInfoOverlay = null; // single-student details overlay
    let manageStudentsScrollPos = 0; // preserve scroll when drilling into a student

    function ensureManageStudentsOverlay() {
        if (manageStudentsOverlay) return manageStudentsOverlay;
        manageStudentsOverlay = document.createElement('div');
        manageStudentsOverlay.id = 'manageStudentsOverlay';
        manageStudentsOverlay.className = 'overlay';
        manageStudentsOverlay.style.visibility = 'hidden';
        manageStudentsOverlay.innerHTML = `
            <div class="ready-class-popup" role="dialog" aria-modal="true" aria-labelledby="manageStudentsTitle">
                <h2 id="manageStudentsTitle">Manage Students</h2>
                <button type="button" id="closeManageOverlayBtn" class="close-small" aria-label="Close" style="top:10px; right:12px;">×</button>
                <div id="manageStudentsList" class="manage-students-list"></div>
                <div class="manage-footer-actions">
                    <button type="button" id="backToReadyBtn" class="role-button">Back</button>
                    <button type="button" id="addStudentManageBtn" class="role-button" aria-label="Add Students">Add Students</button>
                </div>
            </div>`;
        document.body.appendChild(manageStudentsOverlay);
        manageStudentsListEl = manageStudentsOverlay.querySelector('#manageStudentsList');
        const backBtn = manageStudentsOverlay.querySelector('#backToReadyBtn');
        const closeBtn = manageStudentsOverlay.querySelector('#closeManageOverlayBtn');
        const addBtn = manageStudentsOverlay.querySelector('#addStudentManageBtn');
        backBtn?.addEventListener('click', () => returnToReadyClassPopup(currentClassName));
        closeBtn?.addEventListener('click', () => closeAllClassOverlays());
        addBtn?.addEventListener('click', () => openAddStudentsToClass(currentClassName));
        manageStudentsOverlay.addEventListener('click', (e) => { if (e.target === manageStudentsOverlay) returnToReadyClassPopup(currentClassName); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && manageStudentsOverlay.style.visibility === 'visible') returnToReadyClassPopup(currentClassName); });
        return manageStudentsOverlay;
    }

    async function fetchStudentsCache() {
        try {
            await (window.Students?.fetchAll?.() || Promise.resolve([]));
            studentCache = window.Students?.getCache?.() || [];
            studentIndex = window.Students?.getIndex?.() || new Map();
            return studentCache;
        } catch (e) {
            console.warn('Failed to load student cache', e);
            return [];
        }
    }

    function renderManageStudentsForClass(className) {
        if (!manageStudentsListEl) return;
        manageStudentsListEl.innerHTML = '';
        // Prefer per-class stored student objects
        const students = loadClassStudents(className) || [];
        if (students.length > 0) {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            ul.style.margin = '0';
            students.forEach(s => {
                const li = document.createElement('li');
                li.className = 'list-item';
                const studentId = s.facultyNumber || s.fullName || '';
                li.dataset.studentId = studentId;
                // Two-line fixed layout: name on top, faculty number below
                const wrap = document.createElement('div');
                wrap.className = 'student-card-text';
                const nameEl = document.createElement('span');
                nameEl.className = 'student-name';
                nameEl.textContent = s.fullName || '';
                const facEl = document.createElement('span');
                facEl.className = 'student-fac';
                facEl.textContent = s.facultyNumber || '';
                wrap.appendChild(nameEl);
                wrap.appendChild(facEl);
                li.appendChild(wrap);
                li.addEventListener('click', () => openStudentInfoOverlay(studentId, className));
                ul.appendChild(li);
            });
            manageStudentsListEl.appendChild(ul);
            return;
        }
        // Fallback to in-memory id set + cache index
        const set = classStudentAssignments.get(className);
        if (!set || set.size === 0) {
            const p = document.createElement('p');
            p.className = 'muted';
            p.textContent = 'No students assigned to this class.';
            manageStudentsListEl.appendChild(p);
            return;
        }
        const ul = document.createElement('ul');
        ul.style.listStyle = 'none';
        ul.style.padding = '0';
        ul.style.margin = '0';
        Array.from(set).forEach((id) => {
            const info = studentIndex.get(id) || { fullName: id, faculty_number: '' };
            const li = document.createElement('li');
            li.className = 'list-item';
            li.dataset.studentId = id;
            const wrap = document.createElement('div');
            wrap.className = 'student-card-text';
            const nameEl = document.createElement('span');
            nameEl.className = 'student-name';
            nameEl.textContent = info.fullName || '';
            const facEl = document.createElement('span');
            facEl.className = 'student-fac';
            facEl.textContent = info.faculty_number || '';
            wrap.appendChild(nameEl);
            wrap.appendChild(facEl);
            li.appendChild(wrap);
            li.addEventListener('click', () => openStudentInfoOverlay(id, className));
            ul.appendChild(li);
        });
        manageStudentsListEl.appendChild(ul);
    }

    async function openManageStudentsOverlay(className) {

        console.log('[Manage Students] Opening overlay for class:', className);

        ensureManageStudentsOverlay();

        console.log('[Manage Students] Ensured overlay exists');

        // Hide ready overlay to avoid stacking
        if (readyPopupOverlay) readyPopupOverlay.style.visibility = 'hidden';

        console.log('[Manage Students] Hidden ready class overlay');

        // Ensure we have students cache
        await fetchStudentsCache();

        console.log('[Manage Students] Fetched student cache, count:', studentCache.length);

        // Title reflect class name
        const titleEl = manageStudentsOverlay.querySelector('#manageStudentsTitle');
        if (titleEl) titleEl.textContent = `Manage Students — ${className}`;

        console.log('[Manage Students] Rendering students for class:', className);

        renderManageStudentsForClass(className);

        console.log('[Manage Students] Rendered students, showing overlay');

        manageStudentsOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }

    function closeManageStudentsOverlay() {
        if (!manageStudentsOverlay) return;
        manageStudentsOverlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
    }

    function returnToReadyClassPopup(className) {
        closeManageStudentsOverlay();
        openReadyClassPopup(className || currentClassName);
    }

    // ---- Single Student Info Overlay ----
    function ensureStudentInfoOverlay() {
        if (studentInfoOverlay) return studentInfoOverlay;
        studentInfoOverlay = document.createElement('div');
        studentInfoOverlay.id = 'studentInfoOverlay';
        studentInfoOverlay.className = 'overlay';
        studentInfoOverlay.style.visibility = 'hidden';
        document.body.appendChild(studentInfoOverlay);
        studentInfoOverlay.addEventListener('click', (e) => {
            if (e.target === studentInfoOverlay) {
                closeStudentInfoOverlay();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && studentInfoOverlay.style.visibility === 'visible') {
                closeStudentInfoOverlay();
            }
        });
        return studentInfoOverlay;
    }

    function buildStudentInfoContent(studentObj, studentId, className) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ready-class-popup student-info-popup';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.innerHTML = '';
        const h2 = document.createElement('h2');
        h2.textContent = 'Student Info';
        wrapper.appendChild(h2);
        const nameP = document.createElement('p');
        nameP.textContent = `Full Name: ${studentObj.fullName || studentObj.full_name || ''}`;
        nameP.style.margin = '0 0 8px 0';
        wrapper.appendChild(nameP);
        const facultyP = document.createElement('p');
        facultyP.textContent = `Faculty Number: ${studentObj.faculty_number || studentObj.facultyNumber || ''}`;
        facultyP.style.margin = '0 0 12px 0';
        wrapper.appendChild(facultyP);
        // Optional extra fields (exclude id per new requirement)
        if (studentObj.email) {
            const emailP = document.createElement('p');
            emailP.textContent = `Email: ${studentObj.email}`;
            emailP.style.margin = '0 0 10px 0';
            wrapper.appendChild(emailP);
        }
        // Attended classes counter (per-class, live)
        const attended = getStudentAttendanceCountForClass(className || currentClassName, studentId);
        const attendedP = document.createElement('p');
        attendedP.setAttribute('data-attendance-counter', '');
        attendedP.textContent = `Attended Classes: ${attended}`;
        attendedP.style.margin = '10px 0 0 0';
        attendedP.style.fontWeight = '700';
        attendedP.style.fontSize = '1.15rem';
        attendedP.style.letterSpacing = '.5px';
        wrapper.appendChild(attendedP);

        // Attendance History button (full width)
        const historyBtn = document.createElement('button');
        historyBtn.type = 'button';
        historyBtn.className = 'role-button attendance-history-btn';
        historyBtn.textContent = 'Attendance History';
        historyBtn.style.marginTop = '16px';
        historyBtn.style.width = '100%';
        historyBtn.addEventListener('click', () => openAttendanceHistoryOverlay(className || currentClassName, studentId));
        wrapper.appendChild(historyBtn);
        return wrapper;
    }


    function openStudentInfoOverlay(studentId, className) {
        ensureStudentInfoOverlay();
        // Preserve scroll of manage overlay
        if (manageStudentsListEl) manageStudentsScrollPos = manageStudentsListEl.scrollTop;
        // Hide manage overlay without destroying it
        if (manageStudentsOverlay) manageStudentsOverlay.style.visibility = 'hidden';
        const info = studentIndex.get(studentId) || { fullName: studentId };
        // Clear and insert new content
        studentInfoOverlay.innerHTML = '';
        const content = buildStudentInfoContent(info, studentId, className);
        studentInfoOverlay.appendChild(content);
        // Store context for live updates
        studentInfoOverlay.dataset.studentId = String(studentId);
        studentInfoOverlay.dataset.className = String(className || currentClassName || '');
        studentInfoOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }

    function closeStudentInfoOverlay() {
        if (!studentInfoOverlay) return;
        studentInfoOverlay.style.visibility = 'hidden';
        // Restore manage overlay exactly as it was
        if (manageStudentsOverlay) {
            manageStudentsOverlay.style.visibility = 'visible';
            if (manageStudentsListEl) manageStudentsListEl.scrollTop = manageStudentsScrollPos;
        }
        document.body.style.overflow = 'hidden'; // keep modal context since manage overlay is still open
    }

    // ---- Attendance History Overlay ----
    let attendanceHistoryOverlay = null;
    function ensureAttendanceHistoryOverlay() {
        if (attendanceHistoryOverlay) return attendanceHistoryOverlay;
        attendanceHistoryOverlay = document.createElement('div');
        attendanceHistoryOverlay.id = 'attendanceHistoryOverlay';
        attendanceHistoryOverlay.className = 'overlay';
        attendanceHistoryOverlay.style.visibility = 'hidden';
        attendanceHistoryOverlay.innerHTML = `
            <div class="attendance-history-popup" role="dialog" aria-modal="true" aria-labelledby="attendanceHistoryTitle">
                <h2 id="attendanceHistoryTitle">Attendance History</h2>
                <button type="button" id="closeAttendanceHistoryBtn" class="close-small" aria-label="Close">×</button>
                <div id="attendanceHistoryList" class="attendance-history-list"></div>
                <div class="manage-footer-actions">
                    <button type="button" id="attendanceHistoryBackBtn" class="role-button">Back</button>
                </div>
            </div>`;
        document.body.appendChild(attendanceHistoryOverlay);
        const closeBtn = attendanceHistoryOverlay.querySelector('#closeAttendanceHistoryBtn');
        const backBtn = attendanceHistoryOverlay.querySelector('#attendanceHistoryBackBtn');
        closeBtn?.addEventListener('click', () => returnToManageStudentsFromHistory());
        backBtn?.addEventListener('click', () => returnToStudentInfoOverlay());
        attendanceHistoryOverlay.addEventListener('click', (e) => { if (e.target === attendanceHistoryOverlay) returnToManageStudentsFromHistory(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && attendanceHistoryOverlay.style.visibility === 'visible') returnToManageStudentsFromHistory(); });
        return attendanceHistoryOverlay;
    }
    function renderAttendanceHistoryList(className, studentId) {
        const container = document.getElementById('attendanceHistoryList');
        if (!container) return;
        const sessions = loadAttendanceLog(className, studentId);
        container.innerHTML = '';
        if (!Array.isArray(sessions) || sessions.length === 0) {
            const p = document.createElement('p');
            p.className = 'muted';
            p.textContent = 'No attendance records.';
            container.appendChild(p);
            return;
        }
        const ul = document.createElement('ul');
        ul.className = 'attendance-history-ul';
        sessions.slice().reverse().forEach((sess) => {
            const li = document.createElement('li');
            li.className = 'attendance-history-item';
            const joined = new Date(sess.joinAt || sess.leaveAt || Date.now());
            const left = new Date(sess.leaveAt || sess.joinAt || Date.now());
            const timeOpts = { hour: 'numeric', minute: '2-digit' };
            const dateOpts = { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' };
            const joinTime = joined.toLocaleTimeString([], timeOpts);
            const leaveTime = left.toLocaleTimeString([], timeOpts);
            const joinDate = joined.toLocaleDateString([], dateOpts);
            const leaveDate = left.toLocaleDateString([], dateOpts);

            const row1 = document.createElement('div');
            row1.className = 'att-row';
            const joinLabel = document.createElement('span');
            joinLabel.className = 'att-label att-label-joined';
            joinLabel.textContent = 'Joined';
            const joinVal = document.createElement('span');
            joinVal.className = 'att-value';
            joinVal.textContent = `${joinTime} — ${joinDate}`;
            row1.appendChild(joinLabel);
            row1.appendChild(joinVal);

            const row2 = document.createElement('div');
            row2.className = 'att-row';
            const leaveLabel = document.createElement('span');
            leaveLabel.className = 'att-label att-label-left';
            leaveLabel.textContent = 'Left';
            const leaveVal = document.createElement('span');
            leaveVal.className = 'att-value';
            leaveVal.textContent = `${leaveTime} — ${leaveDate}`;
            row2.appendChild(leaveLabel);
            row2.appendChild(leaveVal);

            li.appendChild(row1);
            li.appendChild(row2);
            ul.appendChild(li);
        });
        container.appendChild(ul);
    }
    function openAttendanceHistoryOverlay(className, studentId) {
        ensureAttendanceHistoryOverlay();
        // Hide student info overlay while viewing history
        if (studentInfoOverlay) studentInfoOverlay.style.visibility = 'hidden';
        // Title detail
        const titleEl = attendanceHistoryOverlay.querySelector('#attendanceHistoryTitle');
        if (titleEl) titleEl.textContent = 'Attendance History';
        renderAttendanceHistoryList(className, studentId);
        attendanceHistoryOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
        attendanceHistoryOverlay.dataset.studentId = String(studentId);
        attendanceHistoryOverlay.dataset.className = String(className || currentClassName || '');
    }
    function returnToStudentInfoOverlay() {
        closeAttendanceHistoryOverlay();
        if (studentInfoOverlay) studentInfoOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }
    function closeAttendanceHistoryOverlay() {
        if (!attendanceHistoryOverlay) return;
        attendanceHistoryOverlay.style.visibility = 'hidden';
    }

    function returnToManageStudentsFromHistory() {
        closeAttendanceHistoryOverlay();
        if (studentInfoOverlay) studentInfoOverlay.style.visibility = 'hidden';
        if (manageStudentsOverlay) {
            manageStudentsOverlay.style.visibility = 'visible';
            if (manageStudentsListEl) manageStudentsListEl.scrollTop = manageStudentsScrollPos;
        }
        document.body.style.overflow = 'hidden';
    }
    // Close every class-related overlay and return to base Classes view.
    function closeAllClassOverlays() {
        if (readyPopupOverlay) readyPopupOverlay.style.visibility = 'hidden';
        if (manageStudentsOverlay) manageStudentsOverlay.style.visibility = 'hidden';
        if (studentInfoOverlay) studentInfoOverlay.style.visibility = 'hidden';
        if (scannerOverlay) closeScannerOverlay();
        document.body.style.overflow = '';
    }




    // Per-class storage: each class has its own item with an array of student objects
    function classItemKey(className) {
        if (!teacherEmail) return null;
        const normEmail = normalizeEmail(teacherEmail);
        return `teacher:class:${normEmail}:${encodeURIComponent(className)}`;
    }





    async function loadClassStudents(className, classId) {

        console.log("loadClassStudents", { className, classId });
        console.log("Waiting for a result...");

        let result = await fetch(`${serverBaseUrl + ENDPOINTS.class_students}?class_id=${encodeURIComponent(classId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (result.ok) {
            let data = await result.json();
            let students = data.students;
            localStorage.setItem(`${className}:students`, JSON.stringify(students));
            console.log("Fetched students:", students);
            return students;
        }else{
            console.error("Failed to fetch class students", result.status);
        }

        return null;
    }

    function isStudentInClass(className, studentId) {
        if (!className || !studentId) return false;

        const classId = getClassIdByName(className);
        const stored = loadClassStudents(className, classId);

        if (stored.length > 0) {
            const found = stored.some(s => {
                const id = (s.facultyNumber || s.fullName || '').trim();
                return id && id === String(studentId).trim();
            });
            if (found) return true;
        }
        // Fallback: check assignments set
        const set = classStudentAssignments.get(className);
        if (set && set.size > 0) {
            if (set.has(String(studentId).trim())) return true;
        }
        return false;
    }
    function getStudentAttendanceCountForClass(className, studentId) {
        const classId = classIdByName.get(className);
        if (!classId) return 0;
        const cache = attendanceCountCache.get(classId);
        if (cache && cache.has(studentId)) return cache.get(studentId);
        apiFetchClassAttendance(classId).then(data => {
            const map = new Map();
            const list = data.attendances || data.items || [];
            list.forEach(r => { if (r.student_id) map.set(String(r.student_id), Number(r.count || r.attendance_count || 0)); });
            attendanceCountCache.set(classId, map);
            updateStudentInfoOverlayCount(studentId, className);
        }).catch(() => {});
        return 0;
    }
    function updateStudentInfoOverlayCount(studentId, className, forcedValue) {
        if (!studentInfoOverlay || studentInfoOverlay.style.visibility !== 'visible') return;
        const overlayStudentId = studentInfoOverlay?.dataset?.studentId || '';
        const overlayClass = studentInfoOverlay?.dataset?.className || '';
        if (overlayStudentId && overlayClass && (overlayStudentId !== String(studentId) || overlayClass !== String(className))) return;
        const counterEl = studentInfoOverlay.querySelector('[data-attendance-counter]');
        if (!counterEl) return;
        const val = Number.isFinite(forcedValue) ? forcedValue : getStudentAttendanceCountForClass(className, studentId);
        counterEl.textContent = `Attended Classes: ${val}`;
    }

    // --- Add Students to Existing Class Overlay ---
    let addStudentsClassOverlay = null;
    let addStudentsListEl = null;
    let addStudentsSelections = new Set();
    function ensureAddStudentsClassOverlay() {
        if (addStudentsClassOverlay) return addStudentsClassOverlay;
        addStudentsClassOverlay = document.createElement('div');
        addStudentsClassOverlay.id = 'addStudentsClassOverlay';
        addStudentsClassOverlay.className = 'overlay';
        addStudentsClassOverlay.style.visibility = 'hidden';
        addStudentsClassOverlay.innerHTML = `
            <div class="ready-class-popup add-students-popup" role="dialog" aria-modal="true" aria-labelledby="addStudentsTitle">
                <h2 id="addStudentsTitle">Add Students</h2>
                <button type="button" id="closeAddStudentsClassBtn" class="close-small" aria-label="Close" style="top:10px; right:12px;">×</button>
                <div class="add-students-body">
                    <input type="text" id="addStudentsSearchInput" placeholder="Search..." />
                    <div id="addStudentsList" class="add-students-list"></div>
                </div>
                <div class="add-students-footer">
                    <button type="button" id="confirmAddStudentsBtn" class="role-button primary" aria-label="Add Selected">Add</button>
                </div>
            </div>`;
        document.body.appendChild(addStudentsClassOverlay);
        addStudentsListEl = addStudentsClassOverlay.querySelector('#addStudentsList');
        // Events
        const closeBtn = addStudentsClassOverlay.querySelector('#closeAddStudentsClassBtn');
        const searchInput = addStudentsClassOverlay.querySelector('#addStudentsSearchInput');
        const confirmBtn = addStudentsClassOverlay.querySelector('#confirmAddStudentsBtn');
        closeBtn?.addEventListener('click', () => closeAddStudentsToClass());
        if (confirmBtn) {
            confirmBtn.textContent = 'Add (0)';
            confirmBtn.addEventListener('click', () => finalizeAddStudentsToClass());
        }
        searchInput?.addEventListener('input', (e) => filterAddStudentsList(e.target.value));
        addStudentsClassOverlay.addEventListener('click', (e) => { if (e.target === addStudentsClassOverlay) closeAddStudentsToClass(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && addStudentsClassOverlay.style.visibility === 'visible') closeAddStudentsToClass(); });
        return addStudentsClassOverlay;
    }
    async function openAddStudentsToClass(className) {
        if (!className) return;
        ensureAddStudentsClassOverlay();
        addStudentsSelections.clear();
        const confirmBtn = addStudentsClassOverlay.querySelector('#confirmAddStudentsBtn');
        if (confirmBtn) confirmBtn.textContent = 'Add (0)';
        // Load students (reuse fetchStudentsCache + studentIndex build from manage overlay)
        await fetchStudentsCache();
        renderAddStudentsList(className);
        updateAddStudentsCounter();
        addStudentsClassOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
        const searchInput = addStudentsClassOverlay.querySelector('#addStudentsSearchInput');
        searchInput?.focus();
    }
    function closeAddStudentsToClass() {
        if (addStudentsClassOverlay) addStudentsClassOverlay.style.visibility = 'hidden';
        // Keep body overflow hidden if manage overlay still open
        if (!manageStudentsOverlay || manageStudentsOverlay.style.visibility !== 'visible') {
            document.body.style.overflow = '';
        }
    }
    function renderAddStudentsList(className) {
        if (!addStudentsListEl) return;
        // Build existing set from assignments map and as a fallback from per-class stored students
        const existingSet = new Set([...(classStudentAssignments.get(className) || new Set())]);
        try {
            const stored = loadClassStudents(className) || [];
            stored.forEach(s => {
                const id = (s.facultyNumber || s.fullName || '').trim();
                if (id) existingSet.add(id);
            });
        } catch(_) {}
        const studentsArray = studentCache || [];
        if (!Array.isArray(studentsArray) || studentsArray.length === 0) {
            addStudentsListEl.innerHTML = '<p class="muted" style="text-align:center;">No students available.</p>';
            return;
        }
        const ul = document.createElement('ul');
        ul.style.listStyle='none'; ul.style.margin='0'; ul.style.padding='0';
        studentsArray.forEach((s, idx) => {
            const li = document.createElement('li');
            li.className='list-item';
            const parts = (window.Students?.splitNames || (()=>({ fullName: '' })))(s);
            const facultyNumber = s.faculty_number;
            const studentId = (window.Students?.idForStudent ? window.Students.idForStudent(s, 'add', idx) : (facultyNumber || parts.fullName || `add_${idx}`));

            if (existingSet.has(studentId)) {
                // Render without checkbox, with two-line text and 'Already in' badge
                li.classList.add('already-in');
                const textWrap = document.createElement('div');
                textWrap.className = 'student-card-text';
                const nameEl = document.createElement('span');
                nameEl.className = 'student-name';
                nameEl.textContent = parts.fullName;
                const facEl = document.createElement('span');
                facEl.className = 'student-fac';
                facEl.textContent = facultyNumber || '';
                textWrap.appendChild(nameEl);
                textWrap.appendChild(facEl);
                const badge = document.createElement('span');
                badge.className = 'already-in-badge';
                badge.textContent = 'Already in';
                li.appendChild(textWrap);
                li.appendChild(badge);
                ul.appendChild(li);
                return;
            }

            const checkbox = document.createElement('input');
            checkbox.type='checkbox';
            checkbox.id = `addStudent_${idx}`;
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            // Two-line text inside the label for better touch target
            const wrap = document.createElement('div');
            wrap.className = 'student-card-text';
            const nameEl = document.createElement('span');
            nameEl.className = 'student-name';
            nameEl.textContent = parts.fullName;
            const facEl = document.createElement('span');
            facEl.className = 'student-fac';
            facEl.textContent = facultyNumber || '';
            wrap.appendChild(nameEl);
            wrap.appendChild(facEl);
            label.appendChild(wrap);

            checkbox.addEventListener('change', () => {
                if (checkbox.checked) { addStudentsSelections.add(studentId); li.classList.add('selected'); }
                else { addStudentsSelections.delete(studentId); li.classList.remove('selected'); }
                updateAddStudentsCounter();
            });
            li.addEventListener('click', (e)=>{
                if (e.target === checkbox || e.target.tagName === 'LABEL' || (e.target && e.target.closest('label'))) return;
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });
            li.appendChild(checkbox); li.appendChild(label);
            ul.appendChild(li);
        });
        addStudentsListEl.innerHTML='';
        addStudentsListEl.appendChild(ul);
    }
    function updateAddStudentsCounter() {
        const confirmBtn = addStudentsClassOverlay?.querySelector('#confirmAddStudentsBtn');
        if (confirmBtn) confirmBtn.textContent = `Add (${addStudentsSelections.size})`;
    }
    function filterAddStudentsList(query) {
        const q = (query||'').trim().toLowerCase();
        if (!addStudentsListEl) return;
        const items = addStudentsListEl.querySelectorAll('li.list-item');
        if (!q) { items.forEach(li=> li.style.display=''); return; }
        const tokens = q.split(/\s+/).filter(Boolean);
        items.forEach(li => {
            const text = li.textContent.toLowerCase();
            const matches = tokens.every(t => text.includes(t));
            li.style.display = matches ? '' : 'none';
        });
    }
    function finalizeAddStudentsToClass() {
        const className = currentClassName;
        if (!className || addStudentsSelections.size === 0) { closeAddStudentsToClass(); return; }
        if (!classStudentAssignments.has(className)) classStudentAssignments.set(className, new Set());
        const assignSet = classStudentAssignments.get(className);
        const newlyAdded = [];
        addStudentsSelections.forEach(id => { if (!assignSet.has(id)) { assignSet.add(id); newlyAdded.push(id); } });
        // Persist assignments
        // Update per-class student objects list
        const existingStudentsObjects = loadClassStudents(className) || [];
        // Normalize and merge new student records, preserving faculty numbers for scanner matching.
        newlyAdded.forEach(id => {
            const info = studentIndex.get(id) || { fullName: id, faculty_number: '' };
            // Prefer faculty_number (server field) then fallback to facultyNumber (client), else empty.
            const facultyNum = info.faculty_number || info.facultyNumber || '';
            const fullName = info.fullName || info.full_name || id;
            const obj = { fullName, facultyNumber: facultyNum };
            // Prevent duplicates by either facultyNumber (if present) or fullName.
            const duplicate = existingStudentsObjects.some(s => {
                const existingFac = s.facultyNumber || '';
                if (facultyNum && existingFac && existingFac === facultyNum) return true;
                return s.fullName === fullName;
            });
            if (!duplicate) existingStudentsObjects.push(obj);
        });
        // Ensure class marked ready if it wasn't (adding students post-creation should not leave it unready).
        if (!readyClasses.has(className)) {
            readyClasses.add(className);
            // Update button UI instantly.
            const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').trim() === className);
            if (btn) updateClassStatusUI(btn);
        }
        // Re-render manage list to reflect additions
        if (manageStudentsOverlay && manageStudentsOverlay.style.visibility === 'visible') {
            renderManageStudentsForClass(className);
        }
        // If attendance overlay is open for this class, refresh its list so newly added students appear immediately.
        if (attendanceOverlay && attendanceOverlay.style.visibility === 'visible') {
            renderAttendanceForClass(className);
        }
        closeAddStudentsToClass();
    }


    // --- Students overlay (blurred background) and fetch/display logic ---
    let studentsOverlay = document.getElementById('overlay');

    // Create/upgrade overlay lazily if missing or incomplete
    

    const openStudentsOverlay = () => {
        if (!studentsOverlay) return;
        studentsOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
        
    };




    // splitStudentNames now provided by Students module






    const closeStudentsOverlay = () => {
        if (!studentsOverlay) return;
        studentsOverlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
    };

    // Bind Close button functionality for the students overlay
    const closeOverlayBtn = document.getElementById('closeOverlayBtn');
    if (closeOverlayBtn) {
        closeOverlayBtn.addEventListener('click', () => {
            closeStudentsOverlay();
        });
        // Allow Escape key already handled globally; space/enter auto-trigger button
    }





    // Persistent selection state across filtering
    const studentSelection = new Set();
    // Cache of all rendered student items for filtering without DOM rebuild
    let allStudentItems = [];

    function handleStudentSelect(id, li, checkbox) {
        if (!id) return;
        if (studentSelection.has(id)) {
            studentSelection.delete(id);
            li.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
        } else {
            studentSelection.add(id);
            li.classList.add('selected');
            if (checkbox) checkbox.checked = true;
        }
    }

    function updateUISelections() {
        allStudentItems.forEach(({ li, checkbox, id }) => {
            const selected = studentSelection.has(id);
            li.classList.toggle('selected', selected);
            if (checkbox) checkbox.checked = selected;
        });
    }

    function filterStudents(query) {
        const q = (query || '').trim().toLowerCase();
        if (!q) {
            allStudentItems.forEach(({ li }) => { li.style.display = ''; });
            updateUISelections();
            const msgEl = document.getElementById('noStudentsMessage');
            if (msgEl) msgEl.style.display = 'none';
            return;
        }
        const tokens = q.split(/\s+/).filter(Boolean);
        allStudentItems.forEach(({ li, name, facultyNumber }) => {
            const haystack = `${name || ''} ${facultyNumber || ''}`;
            const matches = window.Utils?.textIncludesTokens ? window.Utils.textIncludesTokens(haystack, tokens) : tokens.every(t => haystack.toLowerCase().includes(t));
            li.style.display = matches ? '' : 'none';
        });
        updateUISelections();
        const anyVisible = allStudentItems.some(i => i.li.style.display !== 'none');
        let msgEl = document.getElementById('noStudentsMessage');
        if (!msgEl) {
            const body = document.getElementById('overlayMainSectionBody');
            if (body) {
                msgEl = document.createElement('p');
                msgEl.id = 'noStudentsMessage';
                msgEl.textContent = 'No matching students.';
                msgEl.style.marginTop = '12px';
                msgEl.style.fontStyle = 'italic';
                msgEl.style.color = '#6b7280';
                body.appendChild(msgEl);
            }
        }
        if (msgEl) msgEl.style.display = anyVisible ? 'none' : 'block';
    }

    // Expose for potential external use
    window.handleStudentSelect = handleStudentSelect;
    window.filterStudents = filterStudents;
    window.updateUISelections = updateUISelections;

    const renderStudents = (students) => {
        const main_section_body = document.getElementById('overlayMainSectionBody');

        if (!main_section_body) return;

        main_section_body.innerHTML = '';
        allStudentItems = [];

        if (!Array.isArray(students) || students.length === 0) {
            main_section_body.innerHTML = '<p>No students found.</p>';
            return;
        }

        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        students.forEach((s, idx) => {
            const li = document.createElement('li');
            li.className = 'list-item';
            const splitNames = (window.Students?.splitNames || (()=>({ fullName: '' })))(s);
            const facultyNumber = s.faculty_number;
            const studentId = (window.Students?.idForStudent ? window.Students.idForStudent(s, 'student', idx) : (facultyNumber || splitNames.fullName || `student_${idx}`));
            
            li.dataset.studentId = studentId;
            li.dataset.name = splitNames.fullName;
            if (facultyNumber) li.dataset.facultyNumber = facultyNumber;

            const div = document.createElement('div');
            div.style.width = '100%';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'start';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'studentSelect';
            const checkboxId = `studentSelect_${idx}`;
            checkbox.id = checkboxId;
            checkbox.dataset.studentId = studentId;
            checkbox.dataset.name = splitNames.fullName;
            if (facultyNumber) checkbox.dataset.facultyNumber = facultyNumber;

            const label = document.createElement('label');
            label.htmlFor = checkboxId;
            label.textContent = `${splitNames.fullName}  ${facultyNumber || ''}`.trim();
            label.style.margin = '0px';

            div.appendChild(checkbox);
            div.appendChild(label);
            li.appendChild(div);

            checkbox.addEventListener('change', () => {
                handleStudentSelect(studentId, li, checkbox);
            });
            li.addEventListener('click', (e) => {
                // Avoid double toggling when clicking directly on the checkbox OR its label.
                // Label click triggers checkbox click + change; letting li handle it would cause two toggles cancelling each other.
                if (e.target === checkbox || e.target.tagName === 'LABEL') return;
                handleStudentSelect(studentId, li, checkbox);
            });

            if (studentSelection.has(studentId)) {
                li.classList.add('selected');
                checkbox.checked = true;
            }

            list.appendChild(li);
            allStudentItems.push({ li, checkbox, id: studentId, name: splitNames.fullName, facultyNumber });
        });

        main_section_body.appendChild(list);
        // Provide reusable "no results" message element (hidden by default)
        let existingMsg = document.getElementById('noStudentsMessage');
        if (!existingMsg) {
            const msg = document.createElement('p');
            msg.id = 'noStudentsMessage';
            msg.textContent = 'No matching students.';
            msg.style.display = 'none';
            msg.style.marginTop = '12px';
            msg.style.fontStyle = 'italic';
            msg.style.color = '#6b7280';
            main_section_body.appendChild(msg);
        }
    };

    // Expose selected students helper (adjacent improvement)
    window.getSelectedStudents = function() {

        var selectedStudentsArray = Array.from(studentSelection);

        console.log("Selected Students Array:", selectedStudentsArray);

        var selectedStudentsMap = selectedStudentsArray.map(id => {
            
        });

        return Array.from(studentSelection).map(id => {
            const item = allStudentItems.find(i => i.id === id);
            return {
                id,
                fullName: item?.name || '',
                facultyNumber: item?.facultyNumber || ''
            };
        });
    };






    // Frontend cannot run SQL; this calls the server to run SELECT * FROM students
    async function addStudentsFromDatabase() {
        openStudentsOverlay();
        const container = document.getElementById('overlayMainSectionBody');
        if (container) container.innerHTML = '<p>Loading...</p>';
        try {
            const students = await (window.Students?.fetchAll?.() || Promise.resolve([]));
            renderStudents(students);
            const searchInput = studentsOverlay.querySelector('#overlaySearchInput');
            if (searchInput) {
                searchInput.setAttribute('aria-label', 'Search students by name or faculty number');
            }
            if (searchInput && !searchInput.dataset.bound) {
                if (window.Utils && typeof window.Utils.debounce === 'function') {
                    const debounced = window.Utils.debounce((value) => filterStudents(value), 180);
                    searchInput.addEventListener('input', (e) => debounced(e.target.value));
                } else {
                    let debounceTimer = null;
                    searchInput.addEventListener('input', (e) => {
                        const value = e.target.value;
                        clearTimeout(debounceTimer);
                        debounceTimer = setTimeout(() => filterStudents(value), 180);
                    });
                }
                searchInput.dataset.bound = 'true';
            }
            if (searchInput && searchInput.value) {
                filterStudents(searchInput.value);
            }
        } catch (err) {
            console.error('Failed to fetch students:', err);
            if (container) container.innerHTML = `<p style="color:#b91c1c;">Failed to load students. It may be blocked by CORS or the server is unavailable.</p>`;
        }
    }






    const attachNewClassButtonBehavior = (buttonEl) => {
        if (!buttonEl) return;
        const animate = () => {
            buttonEl.classList.add('clicked');
            setTimeout(() => buttonEl.classList.remove('clicked'), 340);
        };
        buttonEl.addEventListener('mousedown', animate);
        buttonEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') animate(); });
        buttonEl.addEventListener('click', (e) => {
            e.preventDefault();
            handleClassButtonClick(buttonEl);
        });
    };






    // Removed unused legacy persistClasses function (replaced by per-class item storage)





    function renderClassItem(name, id) {
        const li = document.createElement('li');
        const btn = document.createElement('button');

        btn.className = 'newClassBtn';
        btn.textContent = name;
        btn.dataset.className = name;
        btn.dataset.originalLabel = name;

        attachNewClassButtonBehavior(btn);

        li.appendChild(btn);
        classList?.appendChild(li);

        // Apply readiness if already stored
        if (readyClasses.has(name)) updateClassStatusUI(btn);

        loadClassStudents(name, id); // Preload students for this class
    };





    const loadClasses = async () => {
        
        console.log("Fetching class names from server...");
        let result = await fetch(`${serverBaseUrl + ENDPOINTS.createClass}?teacherEmail=${encodeURIComponent(teacherEmail)}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
        });

        console.log("Parsing response...");
        result = await result.json();
        console.log("Response received:", result);
        
        console.log("Rendering class items...");
        const classesMap = new Map();
        result.classes.forEach(_class => {
            classesMap.set(_class.id, _class.name);
            renderClassItem(_class.name, _class.id);
        });

        localStorage.setItem('classesMap', JSON.stringify(Array.from(classesMap.entries())));

        ensureClassesContainerVisible();
    };



    const loadReadyClasses = () => {

        const classButtons = Array.from(document.querySelectorAll('.newClassBtn'));

        // console.log("[loadReadyClasses] Checking ready classes from storage...");

        const storedClassesMap = getStoredClassesMap();

        // console.log("[loadReadyClasses] Stored Classes Map:", storedClassesMap);

        if(!storedClassesMap){
            console.error("[loadReadyClasses] No stored classes map found.");
            return;
        }

        for(const [id, name] of storedClassesMap.entries()){
            const storedClass = localStorage.getItem(`${name}:students`);
            let storedClassArray = null;
            
            if(storedClass){
                storedClassArray = JSON.parse(storedClass);
                // console.log("[loadReadyClasses] Parsed stored class students for", name, ":", storedClassArray);
            }
            
            // console.log("[loadReadyClasses] Stored class students for", name, ":", storedClass);

            if(storedClassArray && storedClassArray.length > 0){
                // console.log("[loadReadyClasses] Class", name, "is marked as ready. Lenghth:", storedClassArray.length);
                readyClasses.add(name);
            }
        } 

        for(const btn of classButtons){
            if(readyClasses.has(btn.dataset.className)){
                updateClassStatusUI(btn);
            }
        }

    }


    const getStoredClassesMap = () => {

        var storedClassesMap;

        try{
            storedClassesMap = new Map(JSON.parse(localStorage.getItem('classesMap')));
        }catch(e){
            console.error("Error retrieving stored classesMap:", e);
            return;
        }
        
        return storedClassesMap;
    }




    function getClassIdByName(className) {
        const storedClassesMap = getStoredClassesMap();

        if(!storedClassesMap){
            console.error("No stored classes map found.");
            return null;
        }

        for (const [id, name] of storedClassesMap.entries()) {
            if ((name).trim() === className) {
                return id;
            }
        }

        console.error("Class ID not found for class name:", className);
        return null;
    }







    function ensureClassesContainerVisible() {
        const sec = document.getElementById('classesSection');
        if (!sec) return;
        const style = window.getComputedStyle(sec);
        if (style.display === 'none') {
            sec.style.display = 'flex';
        }
        const list = document.getElementById('classList');
        if (list) {
            const listStyle = window.getComputedStyle(list);
            if (listStyle.display === 'none') list.style.display = 'flex';
        }
    }






    // Removed legacy loadClassesStudents; per-class items are loaded via loadClasses()






    // Attach behavior to any pre-existing .newClassBtn (if present in HTML)
    classList?.querySelectorAll('.newClassBtn').forEach(attachNewClassButtonBehavior);

    console.log("Loading classes...");
    loadClasses();
    console.log("Loading ready classes...");
    loadReadyClasses();

    // Handle bfcache/pageshow and ensure styles reflect current storage state
    window.addEventListener('pageshow', (ev) => {
        try {
            ensureClassesContainerVisible();
            // Recompute readiness from storage each time pageshow fires (bfcache restores stale DOM)
            
            // Update styling on any existing class buttons
            const buttons = Array.from(classList?.querySelectorAll('.newClassBtn') || []);
            buttons.forEach(b => updateClassStatusUI(b));

            // If DOM is clearly stale (e.g., mismatch with storage), rebuild the list
            const namesInDom = buttons.map(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').replace(/✓\s*Ready/g, '').trim()).filter(Boolean);
            const anyMismatch = namesInDom.some((n, i) => {
                const btn = buttons[i];
                const shouldBeReady = readyClasses.has(n);
                const isReadyClass = btn?.classList.contains('class-ready');
                return shouldBeReady !== isReadyClass;
            });
            if (ev?.persisted || anyMismatch) {
                // Clear existing class items except the New Class button
                Array.from(classList?.querySelectorAll('li') || []).forEach(li => {
                    const hasAdd = !!li.querySelector('#addClassBtn');
                    if (!hasAdd) li.remove();
                });
                
                loadClasses();
                classList?.querySelectorAll('.newClassBtn')?.forEach(b => updateClassStatusUI(b));
            }
        } catch (e) { console.warn('pageshow handler error', e); }
    });

    addBtn?.addEventListener('click', () => {
        // Open the class creation wizard (replaces legacy modal)
        openClassCreationWizard();
    });

    // Wire Add Students overlay button to add selected students and mark ready
    const addStudentsOverlayBtn = document.getElementById('addStudentsOverlayBtn');
    if (addStudentsOverlayBtn && !addStudentsOverlayBtn.dataset.bound) {
        addStudentsOverlayBtn.addEventListener('click', async () => {

            console.log("\n");

            const selected = window.getSelectedStudents?.() || [];
            console.log('Selected students to add:', selected);

            const className = currentClassName.trim();
            const classId = getClassIdByName(className);

            if (!className) {
                addStudentsOverlayBtn.classList.add('pulse-warn');
                setTimeout(() => addStudentsOverlayBtn.classList.remove('pulse-warn'), 600);
                return;
            }

            if (selected.length === 0) {
                addStudentsOverlayBtn.classList.add('pulse-warn');
                setTimeout(() => addStudentsOverlayBtn.classList.remove('pulse-warn'), 600);
                return;
            }

            // Merge with existing students stored for the class
            var classStudents;
            var storedClassStudents = localStorage.getItem(`${className}:students`);
            console.log('Existing class students from localStorage:', storedClassStudents);

            if(!storedClassStudents){
                console.error("No existing class students found in localStorage for class:", className);
                classStudents = [];
            }else{
                classStudents = JSON.parse(storedClassStudents);
            }

            console.log('Existing students in class:', classStudents);

            const byFac = new Map();

            classStudents.forEach(student => {
                const key = student.facultyNumber.trim();

                if (key){
                    byFac.set(key, { 
                        fullName: student.fullName, 
                        facultyNumber: student.facultyNumber
                    });
                } 
            });

            selected.forEach(student => {
                const key = student.facultyNumber.trim();

                if (!key) return;

                const fullName = student.fullName;
                const facultyNumber = student.facultyNumber;

                if (!byFac.has(key)){
                    byFac.set(key, { fullName, facultyNumber });
                } 
            });



            const merged = Array.from(byFac.values());
            console.log("Merged Students Array:", merged);


            
            merged.forEach(student => {
                console.log(`- ${student.fullName} (${student.facultyNumber})`);
            });

            localStorage.setItem(`${className}:students`, JSON.stringify(merged));

            var response = await fetch(`${serverBaseUrl + ENDPOINTS.class_students}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    classId: classId,
                    students: merged
                })
            });

            if(response.ok){
                console.log("Successfully synced students to server for class:", className);
            } else {
                console.error("Failed to sync students to server for class:", className);
            }

            // Mark ready and persist
            readyClasses.add(className);
            // Update UI state for the button of this class
            const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').trim() === className);
            if (btn) updateClassStatusUI(btn);
            // Close overlay and clear selection
            closeStudentsOverlay();
            studentSelection.clear();
        });
        addStudentsOverlayBtn.dataset.bound = 'true';
    }






    // Cleanup legacy storage so only per-class items remain
    (function cleanupLegacyClassStorage(){
        try {
            if (!teacherEmail) return;
            const keyList = storageKey(teacherEmail);
            const keyAssignments = storageKey(teacherEmail) + ':assignments';
            if (keyList) localStorage.removeItem(keyList);
            if (keyAssignments) localStorage.removeItem(keyAssignments);
        } catch(e){ console.warn('Legacy storage cleanup failed', e); }
    })();

    // Apply ready styling to rendered classes
    classList?.querySelectorAll('.newClassBtn').forEach(b => updateClassStatusUI(b));

    /* =============================
       Attendance Table Export (XLSX)
       ============================= */
    function getActiveClassName() {
        // Prefer currentClassButton dataset
        if (currentClassButton) {
            const fromBtn = (currentClassButton.dataset.className || currentClassButton.dataset.originalLabel || currentClassButton.textContent || '')
                .replace(/✓\s*Ready/g, '')
                .trim();
            if (fromBtn) return fromBtn;
        }
        // Try ready popup title
        const titleEl = document.querySelector('#readyClassTitle');
        if (titleEl && titleEl.textContent) {
            const fromTitle = titleEl.textContent.replace(/✓\s*Ready/g, '').trim();
            if (fromTitle) return fromTitle;
        }
        // Fallback to global currentClassName
        return (currentClassName || '').trim();
    }
    function ensureXlsxLoaded() {
        if (window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
        if (ensureXlsxLoaded._promise) return ensureXlsxLoaded._promise;
        const sources = [
            'javascript/xlsx.full.min.js',
            '/javascript/xlsx.full.min.js',
            './xlsx.full.min.js',
            '/xlsx.full.min.js',
            'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
            'https://unpkg.com/xlsx/dist/xlsx.full.min.js',
            'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
        ];
        // Silenced verbose logs for production readiness
        ensureXlsxLoaded._promise = new Promise((resolve, reject) => {
            let i = 0;
            const tryNext = () => {
                if (i >= sources.length) {
                    console.error('[Attendance Export] Failed to load XLSX library from all sources.');
                    reject(new Error('XLSX load failure'));
                    return;
                }
                const src = sources[i++];
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.onload = () => {
                    if (window.XLSX) {
                        // XLSX library loaded
                        resolve(window.XLSX);
                    } else {
                        // Try next source
                        tryNext();
                    }
                };
                script.onerror = () => {
                    // Failed to load this source, try next
                    script.remove();
                    tryNext();
                };
                document.head.appendChild(script);
            };
            tryNext();
        });
        return ensureXlsxLoaded._promise;
    }

    function formatDateTime(ms) {
        if (!ms && ms !== 0) return '';
        const d = new Date(ms);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    }

    function collectAttendanceEntriesForClass(className) {
        const students = loadClassStudents(className) || [];
        const entries = [];
        students.forEach((s, idx) => {
            const studentId = (s.facultyNumber || s.fullName || '').trim();
            if (!studentId) {
                console.warn('[Attendance Export] Skipping student with missing ID (facultyNumber/fullName).');
                return;
            }
            const logs = loadAttendanceLog(className, studentId) || [];
            logs.forEach(sess => {
                if (!sess) return;
                const joinMs = sess.joinAt || sess.leaveAt || null;
                const leaveMs = sess.leaveAt || sess.joinAt || null;
                if (!joinMs) return; // require at least a join timestamp
                entries.push({
                    studentName: s.fullName || '',
                    facultyNumber: s.facultyNumber || '',
                    joinedAt: joinMs,
                    leftAt: leaveMs
                });
            });
        });
        return entries;
    }

    function sortAttendanceEntries(entries) {
        entries.sort((a, b) => {
            const aDate = new Date(a.joinedAt);
            const bDate = new Date(b.joinedAt);
            const diff = aDate - bDate;
            if (diff !== 0) return diff;
            // Same timestamp; sort by name alphabetically
            return (a.studentName || '').localeCompare(b.studentName || '');
        });
        return entries;
    }

    function buildWorksheetData(entries) {
        const header = ['Student Name', 'Faculty Number', 'Joined Time', 'Left Time'];
        return [header, ...entries.map(e => [
            e.studentName,
            e.facultyNumber,
            formatDateTime(e.joinedAt),
            formatDateTime(e.leftAt)
        ])];
    }

    async function generateAndDownloadAttendanceXlsx(className, entries) {
        const XLSX = await ensureXlsxLoaded().catch(err => {
            console.error('[Attendance Export] XLSX load failed. Cannot generate .xlsx.', err);
            return null;
        });
        if (!XLSX) {
            alert('Unable to load XLSX library. Attendance export failed.');
            return;
        }
        const wsData = buildWorksheetData(entries);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
        const safeClass = (className || 'class').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'class';
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const filename = `attendance_export_${safeClass}_${yyyy}-${mm}-${dd}.xlsx`;
        XLSX.writeFile(wb, filename);
    }

    function handleDownloadAttendanceTable(className) {
        const resolvedNow = getActiveClassName();
        const targetClass = (className || resolvedNow || currentClassName || '').trim();
        if (!targetClass) {
            console.warn('[Attendance Export] No class selected. Aborting export.');
            alert('Select a class first.');
            return;
        }
        const entries = collectAttendanceEntriesForClass(targetClass);
        const sorted = sortAttendanceEntries(entries);
        generateAndDownloadAttendanceXlsx(targetClass, sorted);
    }
});

