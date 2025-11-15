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

    // --- Class readiness state (single class scope per requirements) ---
    let classReady = false; // false until students added
    let currentClassButton = null; // track which class was interacted with

    function updateClassStatusUI() {
        if (!currentClassButton) return;
        if (classReady) {
            currentClassButton.classList.add('class-ready');
            // Preserve original name
            if (!currentClassButton.dataset.originalLabel) {
                currentClassButton.dataset.originalLabel = currentClassButton.textContent;
            }
            const base = currentClassButton.dataset.originalLabel;
            currentClassButton.textContent = `${base} ✓ Ready`;
        } else {
            currentClassButton.classList.remove('class-ready');
            if (currentClassButton.dataset.originalLabel) {
                currentClassButton.textContent = currentClassButton.dataset.originalLabel;
            }
        }
    }

    function openAddStudentsPopup() {
        // Reuse existing fetch + overlay logic
        addStudentsFromDatabase();
    }

    function startScanner() {
        console.log('startScanner() invoked - TODO implement scanner logic');
        alert('Scanner starting... (stub)');
    }

    // Ready class popup dynamic creation
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
        // Event wiring
        const manageBtn = readyPopupOverlay.querySelector('#manageStudentsBtn');
        const scannerBtn = readyPopupOverlay.querySelector('#startScannerBtn');
        const closeBtn = readyPopupOverlay.querySelector('#closeReadyPopupBtn');
        manageBtn?.addEventListener('click', () => {
            closeReadyClassPopup();
            openAddStudentsPopup();
        });
        scannerBtn?.addEventListener('click', () => {
            startScanner();
        });
        closeBtn?.addEventListener('click', () => closeReadyClassPopup());
        readyPopupOverlay.addEventListener('click', (e) => { if (e.target === readyPopupOverlay) closeReadyClassPopup(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeReadyClassPopup(); });
        return readyPopupOverlay;
    }

    function openReadyClassPopup() {
        ensureReadyPopup();
        readyPopupOverlay.style.visibility = 'visible';
        document.body.style.overflow = 'hidden';
    }

    function closeReadyClassPopup() {
        if (!readyPopupOverlay) return;
        readyPopupOverlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
    }

    function setClassReady() {
        if (!currentClassButton) return;
        classReady = true;
        updateClassStatusUI();
        closeStudentsOverlay();
    }

    function handleClassButtonClick(buttonEl) {
        currentClassButton = buttonEl;
        if (!classReady) {
            openAddStudentsPopup();
        } else {
            openReadyClassPopup();
        }
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
                if (e.target === checkbox) return; // avoid double toggle
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
            .map(btn => (btn.textContent || '').trim())
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
        attachNewClassButtonBehavior(btn);
        li.appendChild(btn);
        classList?.appendChild(li);
    };





    const loadClasses = () => {
        if (!teacherEmail) return;
        const key = storageKey(teacherEmail);
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const names = JSON.parse(raw);

            console.log('Loaded classes from storage:', names);

            if (Array.isArray(names)) {
                names.forEach(renderClassItem);
            }

        } catch (e) {
            console.warn('Failed to load classes:', e);
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
        openModal();
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
        persistClasses();
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

    // Initial UI sync (in case readiness changes before first click)
    updateClassStatusUI();
});

