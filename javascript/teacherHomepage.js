// Add click logging and behavior for dynamically created "New Class" buttons
document.addEventListener('DOMContentLoaded', () => {
    const classList = document.getElementById('classList');
    const addBtn = document.getElementById('addClassBtn');
    // Determine current teacher email from session
    let teacherEmail = null;
    // Prefer sessionStorage (current login); fallback to lastTeacherEmail in localStorage.
    try {
        const raw = sessionStorage.getItem('teacherData');
        teacherEmail = raw ? (JSON.parse(raw)?.email || null) : null;
        if (!teacherEmail) {
            const fallback = localStorage.getItem('lastTeacherEmail');
            if (fallback) teacherEmail = fallback;
        }
    } catch (e) {
        console.warn('Failed to parse teacherData from storage:', e);
        if (!teacherEmail) {
            const fallback = localStorage.getItem('lastTeacherEmail');
            if (fallback) teacherEmail = fallback;
        }
    }

    const storageKey = (email) => email ? `teacher:classes:${email}` : null;

    // --- Students overlay (blurred background) and fetch/display logic ---
    const studentsOverlay = document.getElementById('overlay');

    // Create/upgrade overlay lazily if missing or incomplete
    const ensureStudentsOverlay = () => {
        const buildMarkup = () => `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="studentsTitle">
                <div style="display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; margin-bottom:10px;">
                    <h2 id="studentsTitle" style="margin:0;">Students</h2>
                    <input id="studentSearchInput" type="text" placeholder="Search students..." aria-label="Search students" style="flex:1 1 220px; min-width:160px; padding:6px 8px; border:1px solid #d1d5db; border-radius:6px;" />
                </div>
                <div id="studentsContent" style="max-height:50vh; overflow:auto;">
                    <p>Loading...</p>
                </div>
                <div class="modal-actions">
                    <button type="button" id="closeStudentsBtn" class="secondary">Close</button>
                </div>
            </div>`;

        console.log("Attempting to create or upgrade students overlay.");
        if (!studentsOverlay) {
            console.log("Creating new overlay element.");
            studentsOverlay = document.createElement('div');
            studentsOverlay.id = 'studentsOverlay';
            studentsOverlay.className = 'overlay hidden';
            studentsOverlay.innerHTML = buildMarkup();
            document.body.appendChild(studentsOverlay);
        } else {
            // If we found a template or an incomplete node, upgrade it
            console.log("Upgrading existing overlay element if needed:");
            if(studentsOverlay.style.visibility !== 'visible'){
                studentsOverlay.style.visibility = 'visible';
                console.log("YES");
            }
        }

        // Ensure close handlers are wired (idempotent due to identical function references)
        const closeBtn = studentsOverlay.querySelector('#closeOverlayBtn');
        closeBtn?.addEventListener('click', () => closeStudentsOverlay());
        studentsOverlay.addEventListener('click', (e) => {
            if (e.target === studentsOverlay) closeStudentsOverlay();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !studentsOverlay.classList.contains('hidden')) {
                closeStudentsOverlay();
            }
        });
        return studentsOverlay;
    };

    const openStudentsOverlay = () => {
        const overlay_div = document.getElementsByClassName('overlay')[0];
        overlay_div.style.visibility = 'visible';
        console.log("Overlay visibility applied:", overlay_div);
    };

    const closeStudentsOverlay = () => {
        const overlay_div = document.getElementsByClassName('overlay')[0];
        overlay_div.style.visibility = 'hidden';
        document.body.style.overflow = '';
    };

    let lastStudentsData = [];
    const renderStudents = (students) => {
        console.log('Rendering students:', students);
        const main_section_body = document.getElementById('overlayMainSectionBody');
        if (!main_section_body) return;
        main_section_body.innerHTML = '';
        if (!Array.isArray(students) || students.length === 0) {
            main_section_body.innerHTML = '<p>No students found.</p>';
            return;
        }
        lastStudentsData = students;
        
        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';
        
        students.forEach((s, idx) => {
            const li = document.createElement('li');
            // li.style.width = '100%';
            li.style.display = 'flex';
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid #e5e7eb';
            li.className = 'list-item';

            console.log('Rendering student:', s);

            const fullName = s.full_name;
            const facultyNumber = s.faculty_number;

            const div = document.createElement('div');
            div.style.width = '100%';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';

            console.log("Creating div to store checkbox and label...");
            console.log(div);

            // Checkbox + label for selection
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.textContent = 'RANDOM';
            checkbox.className = 'studentSelect';
            const checkboxId = `studentSelect_${idx}`;
            checkbox.id = checkboxId;
            if (facultyNumber) checkbox.dataset.facultyNumber = facultyNumber;
            checkbox.dataset.name = fullName;
            
            const label = document.createElement('label');
            label.htmlFor = checkboxId;
            label.textContent = `${fullName}  ${facultyNumber}`;
            label.style.margin = '0px';

            div.appendChild(checkbox);
            div.appendChild(label);

            console.log("Appending checkbox and label to div...");
            console.log(div)

            li.appendChild(div);

            console.log("Appending div to list...");
            console.log(li);

            // Highlight on selection
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    li.classList.add('selected');
                } else {
                    li.classList.remove('selected');
                }
            });

            console.log("Added eventListener to checkbox...");

            list.appendChild(li);

            console.log("<li> appended to list");
            console.log(li);
        });
    };

    // Filter function for search input
    const applyStudentSearchFilter = (query) => {
        const q = query.trim().toLowerCase();
        if (!studentsOverlay || !studentsOverlay.querySelector('#studentsContent')) return;
        if (!q) {
            renderStudents(lastStudentsData);
            return;
        }
        const filtered = lastStudentsData.filter(s => {
            const nameCombined = `${s.full_name || ''}`.toLowerCase();
            const facultyStr = `${s.faculty_number || ''}`.toLowerCase();
            return nameCombined.includes(q) || facultyStr.includes(q);
        });
        renderStudents(filtered);
        // Restore the query after rerender
        const searchInput = studentsOverlay.querySelector('#studentSearchInput');
        if (searchInput) searchInput.value = query;
    };

    // Frontend cannot run SQL; this calls the server to run SELECT * FROM students
    async function addStudentsFromDatabase() {
        openStudentsOverlay();
        ensureStudentsOverlay();
        const container = studentsOverlay.querySelector('#studentsContent');
        if (container) container.innerHTML = '<p>Loading...</p>';
        try {
            console.log("Overlay applied")
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
            console.log('Fetched students:', data);
            console.log('Rendering students...');
            const studentsData = data.students;
            console.log('Students data to render:', studentsData);
            renderStudents(studentsData);
            // Wire up search after initial render
            const searchInput = studentsOverlay.querySelector('#studentSearchInput');
            if (searchInput && !searchInput.dataset.bound) {
                searchInput.addEventListener('input', (e) => {
                    applyStudentSearchFilter(e.target.value);
                });
                searchInput.dataset.bound = 'true';
            }
            // If there is already a query present, apply it
            if (searchInput && searchInput.value) {
                applyStudentSearchFilter(searchInput.value);
            }
        } catch (err) {
            console.error('Failed to fetch students:', err);
            if (container) container.innerHTML = `<p style="color:#b91c1c;">Failed to load students. It may be blocked by CORS or the server is unavailable.</p>`;
        }
    }

    const attachNewClassButtonBehavior = (buttonEl) => {
        if (!buttonEl) return;
        buttonEl.addEventListener('click', (e) => {
            e.preventDefault();
            // Directly load and display all students when a class is clicked
            addStudentsFromDatabase();
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
        overlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true">
                <form id="createClassForm">
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
        input.value = '';
        input.focus();
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        overlay.classList.add('hidden');
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
});

