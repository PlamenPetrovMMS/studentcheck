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
    let studentsOverlay = document.getElementById('studentsOverlay');
    const ensureStudentsOverlay = () => {
        if (studentsOverlay) return studentsOverlay;
        studentsOverlay = document.createElement('div');
        studentsOverlay.id = 'studentsOverlay';
        studentsOverlay.className = 'overlay hidden';
        studentsOverlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true" aria-labelledby="studentsTitle">
                <h2 id="studentsTitle" style="margin-top:0;margin-bottom:10px;">Students</h2>
                <div id="studentsContent" style="max-height:50vh; overflow:auto;">
                    <p>Loading...</p>
                </div>
                <div class="modal-actions">
                    <button type="button" id="closeStudentsBtn" class="secondary">Close</button>
                </div>
            </div>`;
        document.body.appendChild(studentsOverlay);

        const closeBtn = studentsOverlay.querySelector('#closeStudentsBtn');
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
        ensureStudentsOverlay();
        studentsOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const closeStudentsOverlay = () => {
        studentsOverlay?.classList.add('hidden');
        document.body.style.overflow = '';
    };

    const renderStudents = (students) => {
        const container = studentsOverlay.querySelector('#studentsContent');
        if (!container) return;
        container.innerHTML = '';
        if (!Array.isArray(students) || students.length === 0) {
            container.innerHTML = '<p>No students found.</p>';
            return;
        }
        // Inject a tiny style block once for selected highlighting if not present
        if (!document.getElementById('studentSelectStyles')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'studentSelectStyles';
            styleTag.textContent = `
                .student-item { display: flex; align-items: center; transition: background-color 140ms ease, box-shadow 140ms ease; }
                .student-item.selected { background: #eef6ff; box-shadow: inset 0 0 0 1px #93c5fd; }
                .student-item label { cursor: pointer; }
                .student-item input[type="checkbox"] { vertical-align: middle; }
            `;
            document.head.appendChild(styleTag);
        }
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
            li.className = 'student-item';

            const fullName = s.full_name;
            const facultyNumber = s.faculty_number;

            const div = document.createElement('div');
            div.style.width = '100%';
            div.style.display = 'flex';
            div.style.alignItems = 'center';
            div.style.justifyContent = 'center';

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

            div.appendChild(checkbox);
            div.appendChild(label);
            li.appendChild(div);

            // Highlight on selection
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    li.classList.add('selected');
                } else {
                    li.classList.remove('selected');
                }
            });
            list.appendChild(li);
        });
        container.appendChild(list);
    };

    // Frontend cannot run SQL; this calls the server to run SELECT * FROM students
    async function addStudentsFromDatabase() {
        openStudentsOverlay();
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
            console.log('Fetched students:', data);
            console.log('Rendering students...');
            const studentsData = data.students;
            console.log('Students data to render:', studentsData);
            renderStudents(studentsData);
        } catch (err) {
            console.error('Failed to fetch students:', err);
            if (container) container.innerHTML = `<p style="color:#b91c1c;">Failed to load students. It may be blocked by CORS or the server is unavailable.</p>`;
        }
    }

    // Lazy-create a generic action popup overlay
    let actionOverlay = document.getElementById('classActionOverlay');
    const ensureActionOverlay = () => {
        if (actionOverlay) return actionOverlay;
        actionOverlay = document.createElement('div');
        actionOverlay.id = 'classActionOverlay';
        actionOverlay.className = 'overlay hidden';
        actionOverlay.innerHTML = `
            <div class="modal" role="dialog" aria-modal="true">
                <div class="modal-body">
                    <h2 id="classActionTitle" style="margin-top:0;margin-bottom:10px;font-size:1.15rem;">Class</h2>
                    <p id="classActionText" style="margin:0 0 8px 0; color:#374151;">Choose an action for this class.</p>
                </div>
                <div class="modal-actions">
                    <button type="button" id="closeClassActionBtn" class="secondary">Close</button>
                </div>
            </div>`;
        document.body.appendChild(actionOverlay);

        const closeBtn = actionOverlay.querySelector('#closeClassActionBtn');
        closeBtn?.addEventListener('click', () => closeActionOverlay());
        actionOverlay.addEventListener('click', (e) => {
            if (e.target === actionOverlay) closeActionOverlay();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !actionOverlay.classList.contains('hidden')) {
                closeActionOverlay();
            }
        });
        return actionOverlay;
    };

    const openActionOverlay = (className) => {
        ensureActionOverlay();
        const title = actionOverlay.querySelector('#classActionTitle');
        const text = actionOverlay.querySelector('#classActionText');
        if (title) title.textContent = `Class: ${className}`;
        if (text) text.textContent = `You clicked on "${className}".`;
        actionOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    };

    const closeActionOverlay = () => {
        actionOverlay?.classList.add('hidden');
        document.body.style.overflow = '';
    };

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
            if (Array.isArray(names)) {
                names.forEach(renderClassItem);
            }
        } catch (e) {
            console.warn('Failed to load classes:', e);
        }
    };

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

