// Add click logging and behavior for dynamically created "New Class" buttons
document.addEventListener('DOMContentLoaded', () => {
    const classList = document.getElementById('classList');
    const addBtn = document.getElementById('addClassBtn');
    // Determine current teacher email from session
    let teacherEmail = null;
    // Use ONLY sessionStorage to determine active teacher; no persistent fallback.
    try {
        const raw = sessionStorage.getItem('teacherData');
        teacherEmail = raw ? (JSON.parse(raw)?.email || null) : null;
    } catch (e) {
        console.warn('Failed to parse teacherData from sessionStorage:', e);
    }

    const storageKey = (email) => email ? `teacher:classes:${email}` : null;

    // --- Per-class readiness state ---
    const readyClasses = new Set(); // class name strings
    const classStudentAssignments = new Map(); // className -> Set(studentIds)
    let currentClassButton = null;
    let currentClassName = '';
    let wizardClassName = '';
    let wizardSelections = new Set();
    let wizardStudentIndex = new Map(); // id -> { fullName, facultyNumber }

    function updateClassStatusUI(btn) {
        const button = btn || currentClassButton;
        if (!button) return;
        const className = (button.dataset.className || button.dataset.originalLabel || button.textContent || '').trim();
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

    function startScanner() {
        console.log('startScanner() invoked - TODO implement scanner logic');
        alert('Scanner starting... (stub)');
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
                </div>
                <button type="button" id="closeReadyPopupBtn" class="close-small" aria-label="Close">×</button>
            </div>`;
        document.body.appendChild(readyPopupOverlay);
        const manageBtn = readyPopupOverlay.querySelector('#manageStudentsBtn');
        const scannerBtn = readyPopupOverlay.querySelector('#startScannerBtn');
        const closeBtn = readyPopupOverlay.querySelector('#closeReadyPopupBtn');
        manageBtn?.addEventListener('click', () => {
            // Replace the current ready overlay with Manage Students overlay
            const className = currentClassName || (currentClassButton ? (currentClassButton.dataset.className || currentClassButton.dataset.originalLabel || currentClassButton.textContent || '') : '');
            closeReadyClassPopup();
            openManageStudentsOverlay((className || '').trim());
        });
        scannerBtn?.addEventListener('click', () => { startScanner(); });
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
                const rawFromBtn = currentClassButton ? (currentClassButton.dataset.className || currentClassButton.dataset.originalLabel || currentClassButton.textContent || '') : '';
                const name = (currentClassName || rawFromBtn || '').replace(/✓\s*Ready/g, '').trim();
                titleEl.textContent = name || 'Class';
            }
        }
        readyPopupOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }
    function closeReadyClassPopup() { if (!readyPopupOverlay) return; readyPopupOverlay.style.visibility = 'hidden'; document.body.style.overflow = ''; }

    // ---- CLASS CREATION WIZARD ----
    let wizardOverlay = null;
    let wizardTrack = null; // slides container
    let wizardSlideIndex = 0;
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
                                <label for="wizardClassName">Class name</label>
                                <input id="wizardClassName" type="text" placeholder="e.g. Physics Group A" required />
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
        let debounceTimer = null;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const value = e.target.value;
            debounceTimer = setTimeout(() => filterStudentsWizard(value), 180);
        });
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
            wizardErrorName.textContent = 'Class name is required.';
            wizardNameInput.focus();
            return;
        }
        wizardErrorName.textContent = '';
        wizardClassName = name;
        goToSlide(1);
    }

    function collectClassName() { return wizardClassName.trim(); }
    function collectSelectedStudents() { return Array.from(wizardSelections); }

    function submitNewClass() {
        const className = collectClassName();
        if (!className) { alert('Class name missing.'); goToSlide(0); return; }
        const selectedIds = collectSelectedStudents();
        if (selectedIds.length === 0) {
            if (!confirm('No students selected. Create an empty ready class?')) return;
        }
        // Create class UI item
        renderClassItem(className);
        readyClasses.add(className);
        classStudentAssignments.set(className, new Set(selectedIds));
        // Build and persist per-class student objects { fullName, facultyNumber }
        const studentsForClass = selectedIds.map(id => {
            const s = wizardStudentIndex.get(id) || {};
            return { fullName: s.fullName || '', facultyNumber: s.facultyNumber || '' };
        });
        persistClassStudents(className, studentsForClass);
        // Persist readiness only (no legacy class list or assignments object)
        persistReadyClasses();
        // Update button style
        const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => (b.dataset.className || b.dataset.originalLabel || b.textContent || '').trim() === className);
        if (btn) {
            updateClassStatusUI(btn);
            flashReadyBadge(btn);
        }
        closeWizard();
        wizardSelections.clear();
        wizardClassName='';
    }

    // Student loading for wizard
    async function loadStudentsIntoWizard() {
        if (!wizardStudentContainer) return;
        wizardStudentContainer.innerHTML = '<p class="loading-hint">Loading...</p>';
        try {
            const resp = await fetch('https://studentcheck-server.onrender.com/students', { method:'GET', headers:{'Accept':'application/json'} });
            if (!resp.ok) { wizardStudentContainer.innerHTML = '<p style="color:#b91c1c;">Failed to load students.</p>'; return; }
            const data = await resp.json();
            wizardStudentContainer.innerHTML='';
            renderStudentsInWizard(data.students);
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
            const splitNames = splitStudentNames(s);
            const facultyNumber = s.faculty_number;
            const studentId = facultyNumber || splitNames.fullName || `wizard_${idx}`;
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
    function setClassReady(className, studentIds) {
        readyClasses.add(className); if (studentIds) classStudentAssignments.set(className, new Set(studentIds)); persistReadyClasses(); }
    function handleClassButtonClick(buttonEl) {
        currentClassButton = buttonEl;
        const raw = (buttonEl.dataset.className || buttonEl.dataset.originalLabel || buttonEl.textContent || '')
            .replace(/✓\s*Ready/g, '')
            .trim();
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
                </div>
            </div>`;
        document.body.appendChild(manageStudentsOverlay);
        manageStudentsListEl = manageStudentsOverlay.querySelector('#manageStudentsList');
        const backBtn = manageStudentsOverlay.querySelector('#backToReadyBtn');
        const closeBtn = manageStudentsOverlay.querySelector('#closeManageOverlayBtn');
        backBtn?.addEventListener('click', () => returnToReadyClassPopup(currentClassName));
        closeBtn?.addEventListener('click', () => closeAllClassOverlays());
        manageStudentsOverlay.addEventListener('click', (e) => { if (e.target === manageStudentsOverlay) returnToReadyClassPopup(currentClassName); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && manageStudentsOverlay.style.visibility === 'visible') returnToReadyClassPopup(currentClassName); });
        return manageStudentsOverlay;
    }

    async function fetchStudentsCache() {
        if (studentCache && studentCache.length > 0) return studentCache;
        try {
            const resp = await fetch('https://studentcheck-server.onrender.com/students', { method:'GET', headers:{'Accept':'application/json'} });
            if (!resp.ok) return [];
            const data = await resp.json();
            studentCache = Array.isArray(data.students) ? data.students : [];
            // Build quick index by our ID scheme (faculty_number preferred)
            studentIndex = new Map();
            studentCache.forEach((s, idx) => {
                const splitNames = splitStudentNames(s);
                const id = s.faculty_number || splitNames.fullName || `s_${idx}`;
                // store full object plus normalized name
                studentIndex.set(id, { ...s, fullName: splitNames.fullName });
            });
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
                const label = document.createElement('label');
                label.textContent = `${s.fullName || ''} ${s.facultyNumber || ''}`.trim();
                label.style.margin = '0';
                li.appendChild(label);
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
            const label = document.createElement('label');
            label.textContent = `${info.fullName} ${info.faculty_number || ''}`.trim();
            label.style.margin = '0';
            li.appendChild(label);
            li.addEventListener('click', () => openStudentInfoOverlay(id, className));
            ul.appendChild(li);
        });
        manageStudentsListEl.appendChild(ul);
    }

    async function openManageStudentsOverlay(className) {
        ensureManageStudentsOverlay();
        // Hide ready overlay to avoid stacking
        if (readyPopupOverlay) readyPopupOverlay.style.visibility = 'hidden';
        // Ensure we have students cache
        await fetchStudentsCache();
        // Title reflect class name
        const titleEl = manageStudentsOverlay.querySelector('#manageStudentsTitle');
        if (titleEl) titleEl.textContent = `Manage Students — ${className || currentClassName || 'Class'}`;
        renderManageStudentsForClass(className || currentClassName);
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

    function buildStudentInfoContent(studentObj, studentId) {
        const wrapper = document.createElement('div');
        wrapper.className = 'ready-class-popup student-info-popup';
        wrapper.setAttribute('role', 'dialog');
        wrapper.setAttribute('aria-modal', 'true');
        wrapper.innerHTML = '';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'close-small';
        closeBtn.setAttribute('aria-label','Close');
        closeBtn.textContent = '×';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '10px';
        closeBtn.style.right = '12px';
        closeBtn.addEventListener('click', () => closeAllClassOverlays());
        wrapper.appendChild(closeBtn);
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
        // Attended classes counter (stub logic for now)
        const attended = getStudentAttendanceCount(studentObj);
        const attendedP = document.createElement('p');
        attendedP.textContent = `Attended Classes: ${attended}`;
        attendedP.style.margin = '4px 0 0 0';
        attendedP.style.fontWeight = '600';
        wrapper.appendChild(attendedP);
        return wrapper;
    }

    // Stub attendance counter – replace with real logic when attendance tracking is implemented.
    function getStudentAttendanceCount(studentObj) {
        // Use faculty_number as stable key; fallback to full name.
        const key = studentObj.faculty_number || studentObj.facultyNumber || studentObj.fullName || studentObj.full_name || '';
        if (!key) return 0;
        // Future: read from localStorage or server. For now, always 0.
        // Example future key pattern: `attendance:${teacherEmail}:${key}`.
        return 0;
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
        const content = buildStudentInfoContent(info, studentId);
        studentInfoOverlay.appendChild(content);
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

    function restoreManageStudentsOverlay(classId) {
        closeStudentInfoOverlay();
        if (manageStudentsOverlay) {
            manageStudentsOverlay.style.visibility = 'visible';
            if (manageStudentsListEl) manageStudentsListEl.scrollTop = manageStudentsScrollPos;
        }
    }

    // Close every class-related overlay and return to base Classes view.
    function closeAllClassOverlays() {
        if (readyPopupOverlay) readyPopupOverlay.style.visibility = 'hidden';
        if (manageStudentsOverlay) manageStudentsOverlay.style.visibility = 'hidden';
        if (studentInfoOverlay) studentInfoOverlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
    }

    function persistReadyClasses() {
        if (!teacherEmail) return; const key = storageKey(teacherEmail) + ':ready';
        try { localStorage.setItem(key, JSON.stringify(Array.from(readyClasses))); } catch(e){ console.warn('Persist readyClasses failed', e); }
    }
    function loadReadyClasses() {
        if (!teacherEmail) return; const key = storageKey(teacherEmail) + ':ready';
        try { const raw = localStorage.getItem(key); if (!raw) return; const arr = JSON.parse(raw); if (Array.isArray(arr)) arr.forEach(n=> readyClasses.add(n)); } catch(e){ console.warn('Load readyClasses failed', e); }
    }

    // Persisting class-to-students assignments for robustness across reloads
    function persistAssignments() {
        if (!teacherEmail) return; const key = storageKey(teacherEmail) + ':assignments';
        try {
            const obj = {};
            classStudentAssignments.forEach((set, name) => { obj[name] = Array.from(set); });
            localStorage.setItem(key, JSON.stringify(obj));
        } catch (e) { console.warn('Persist assignments failed', e); }
    }
    function loadAssignments() {
        if (!teacherEmail) return; const key = storageKey(teacherEmail) + ':assignments';
        try {
            const raw = localStorage.getItem(key); if (!raw) return;
            const obj = JSON.parse(raw);
            if (obj && typeof obj === 'object') {
                Object.keys(obj).forEach(name => {
                    const arr = Array.isArray(obj[name]) ? obj[name] : [];
                    classStudentAssignments.set(name, new Set(arr));
                });
            }
        } catch (e) { console.warn('Load assignments failed', e); }
    }

    // Per-class storage: each class has its own item with an array of student objects
    function classItemKey(className) {
        if (!teacherEmail) return null;
        return `teacher:class:${teacherEmail}:${encodeURIComponent(className)}`;
    }
    function persistClassStudents(className, studentsArray) {
        const key = classItemKey(className);
        if (!key) return;
        try {
            const payload = { name: className, students: Array.isArray(studentsArray) ? studentsArray : [] };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) { console.warn('Persist class students failed', e); }
    }
    function loadClassStudents(className) {
        const key = classItemKey(className);
        if (!key) return [];
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return [];
            const obj = JSON.parse(raw);
            const arr = Array.isArray(obj?.students) ? obj.students : [];
            return arr.map(s => ({ fullName: s.fullName || s.name || '', facultyNumber: s.facultyNumber || s.faculty_number || '' }));
        } catch (e) { console.warn('Load class students failed', e); return []; }
    }

    // --- Students overlay (blurred background) and fetch/display logic ---
    let studentsOverlay = document.getElementById('overlay');

    // Create/upgrade overlay lazily if missing or incomplete
    

    const openStudentsOverlay = () => {
        if (!studentsOverlay) return;
        studentsOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
        console.log("Overlay visibility applied:", studentsOverlay);
    };




    // Robust helper: accepts a student object or a raw full name string.
    // Returns both an object with parts and an array of parts for flexible usage.
    function splitStudentNames(input) {
        const raw = (typeof input === 'string') ? input : (input?.full_name || '');
        if (!raw) {
            return { parts: [], firstName: '', middleName: '', lastName: '', fullName: '' };
        }
        const parts = raw.trim().split(/\s+/).filter(Boolean);
        let firstName = '';
        let middleName = '';
        let lastName = '';
        if (parts.length === 1) {
            firstName = parts[0];
        } else if (parts.length === 2) {
            [firstName, lastName] = parts;
        } else if (parts.length >= 3) {
            firstName = parts[0];
            lastName = parts[parts.length - 1];
            middleName = parts.slice(1, -1).join(' ');
        }
        const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
        return { parts, firstName, middleName, lastName, fullName };
    }






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






    let lastStudentsData = [];
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
            const haystackName = (name || '').toLowerCase();
            const haystackFaculty = (facultyNumber || '').toLowerCase();
            const matches = tokens.every(t => haystackName.includes(t) || haystackFaculty.includes(t));
            li.style.display = matches ? '' : 'none';
        });
        updateUISelections();
        const anyVisible = allStudentItems.some(i => i.li.style.display !== 'none');
        let msgEl = document.getElementById('noStudentsMessage');
        if (!msgEl) {
            // Create message element lazily if missing (e.g. after prior cleanup)
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
        console.log('Rendering students:', students);
        const main_section_body = document.getElementById('overlayMainSectionBody');
        if (!main_section_body) return;
        main_section_body.innerHTML = '';
        allStudentItems = [];
        if (!Array.isArray(students) || students.length === 0) {
            main_section_body.innerHTML = '<p>No students found.</p>';
            lastStudentsData = [];
            return;
        }
        lastStudentsData = students;

        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

        students.forEach((s, idx) => {
            const li = document.createElement('li');
            li.className = 'list-item';
            const splitNames = splitStudentNames(s);
            const facultyNumber = s.faculty_number;
            const studentId = facultyNumber || splitNames.fullName || `student_${idx}`;
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
            const resp = await fetch('https://studentcheck-server.onrender.com/students', {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!resp.ok) {
                const text = await resp.text();
                if (container) container.innerHTML = `<p style="color:#b91c1c;">Failed to load students: ${resp.status} ${resp.statusText}</p><pre style="white-space:pre-wrap;">${text}</pre>`;
                return;
            }
            const data = await resp.json();
            renderStudents(data.students);
            // Wire up search after initial render
            const searchInput = studentsOverlay.querySelector('#overlaySearchInput');
            if (searchInput) {
                searchInput.setAttribute('aria-label', 'Search students by name or faculty number');
            }
            if (searchInput && !searchInput.dataset.bound) {
                let debounceTimer = null;
                searchInput.addEventListener('input', (e) => {
                    const value = e.target.value;
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => filterStudents(value), 180);
                });
                searchInput.dataset.bound = 'true';
            }
            // If there is already a query present, apply it
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






    const persistClasses = () => {
        if (!teacherEmail) return;
        const key = storageKey(teacherEmail);
        const names = Array.from(classList?.querySelectorAll('.newClassBtn') || [])
            .map(btn => (btn.dataset.className || btn.dataset.originalLabel || btn.textContent || '').replace(/✓\s*Ready/g, '').trim())
            .filter(Boolean);
        try {
            localStorage.setItem(key, JSON.stringify(names));
        } catch (e) {
            console.warn('Failed to persist classes:', e);
        }
    };





    const renderClassItem = (name) => {
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
    };





    const loadClasses = () => {
        if (!teacherEmail) return;
        const prefix = `teacher:class:${teacherEmail}:`;
        try {
            const classNames = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(prefix)) {
                    const raw = localStorage.getItem(k);
                    try {
                        const obj = JSON.parse(raw);
                        const name = obj?.name || decodeURIComponent(k.slice(prefix.length));
                        if (name && !classNames.includes(name)) classNames.push(name);
                    } catch {}
                }
            }
            classNames.forEach(renderClassItem);
        } catch (e) {
            console.warn('Failed to load classes (per-class items):', e);
        }
    };






    const loadClassesStudents = () => {
        var classes = localStorage.getItem(storageKey(teacherEmail));
        if(!classes){
            console.error("No classes found for this teacher.");
            return;
        }
        for(var i = 0; i < classes.length; i++){
            
        }
    }






    // Build a reusable overlay + modal dialog dynamically (no HTML changes needed)
    let overlay = document.getElementById('classOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'classOverlay';
        overlay.className = 'overlay hidden';
        overlay.style.visibility = 'hidden'; // ensure hidden initial state
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="createClassTitle">
                <form id="createClassForm">
                    <h2 id="createClassTitle" style="margin:0 0 12px 0; font-size:1.25rem;">Create Class</h2>
                    <input id="classNameInput" aria-label="Class name" name="className" type="text" required minlength="2" maxlength="64" placeholder="Class name" />
                    <div class="modal-actions">
                        <button type="submit" id="createClassBtn">Create</button>
                        <button type="button" id="cancelCreateBtn" class="secondary">Cancel</button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(overlay);
    }

    const form = overlay.querySelector('#createClassForm');
    const input = overlay.querySelector('#classNameInput');
    const cancelBtn = overlay.querySelector('#cancelCreateBtn');

    const openModal = () => {
        overlay.classList.remove('hidden');
        overlay.style.visibility = 'visible';
        input.value = '';
        input.focus();
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        overlay.classList.add('hidden');
        overlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
    };

    // Attach behavior to any pre-existing .newClassBtn (if present in HTML)
    classList?.querySelectorAll('.newClassBtn').forEach(attachNewClassButtonBehavior);

    // Load any previously saved classes for this teacher
    loadClasses();

    loadClassesStudents();

    addBtn?.addEventListener('click', () => {
        // Replace old modal flow with wizard
        openClassCreationWizard();
    });

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (name.length < 2) {
            input.focus();
            return;
        }
        // Append new class item with the provided name and persist
        renderClassItem(name);
        // Do not persist legacy class list anymore
        closeModal();
    });

    cancelBtn?.addEventListener('click', () => {
        closeModal();
    });

    // Close when clicking outside the modal content
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });

    // Close with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
            closeModal();
        }
    });

    // Wire Add Students overlay button to set readiness if selection present
    const addStudentsOverlayBtn = document.getElementById('addStudentsOverlayBtn');
    if (addStudentsOverlayBtn && !addStudentsOverlayBtn.dataset.bound) {
        addStudentsOverlayBtn.addEventListener('click', () => {
            const selected = window.getSelectedStudents?.() || [];
            if (selected.length > 0) {
                setClassReady();
            } else {
                // Provide subtle feedback if no selection
                addStudentsOverlayBtn.classList.add('pulse-warn');
                setTimeout(() => addStudentsOverlayBtn.classList.remove('pulse-warn'), 600);
            }
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

    // Load readiness and apply to existing classes
    loadReadyClasses();
    classList?.querySelectorAll('.newClassBtn').forEach(b => updateClassStatusUI(b));
});

