/**
 * Student UI Module
 * 
 * Handles student list rendering and selection UI.
 * Generic, reusable student list rendering.
 */

/**
 * Render a list of students in a container
 * @param {HTMLElement} container - Container element
 * @param {Array<Object>} students - Array of student objects
 * @param {Object} options - Rendering options
 * @param {Function} options.onSelect - Selection handler
 * @param {boolean} options.showCheckbox - Whether to show checkboxes
 * @param {Set<string>} options.selectedIds - Set of selected student IDs
 * @param {Function} options.onItemClick - Item click handler
 */
export function renderStudentList(container, students, options = {}) {
    if (!container) return;

    const {
        onSelect,
        showCheckbox = true,
        selectedIds = new Set(),
        onItemClick
    } = options;

    container.innerHTML = '';

    if (!Array.isArray(students) || students.length === 0) {
        container.innerHTML = '<p>No students found.</p>';
        return;
    }

    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.padding = '0';
    list.style.margin = '0';

    students.forEach((s, idx) => {
        const li = document.createElement('li');
        li.className = 'list-item';
        const splitNames = (window.Students?.splitNames || (() => ({ fullName: '' })))(s);
        const facultyNumber = s.faculty_number;
        const studentId = (window.Students?.idForStudent
            ? window.Students.idForStudent(s, 'student', idx)
            : (facultyNumber || splitNames.fullName || `student_${idx}`));

        li.dataset.studentId = studentId;
        li.dataset.name = splitNames.fullName;
        if (facultyNumber) li.dataset.facultyNumber = facultyNumber;

        if (showCheckbox) {
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
                if (onSelect) onSelect(studentId, li, checkbox);
            });

            if (selectedIds.has(studentId)) {
                li.classList.add('selected');
                checkbox.checked = true;
            }
        } else {
            // Two-line layout without checkbox
            const wrap = document.createElement('div');
            wrap.className = 'student-card-text';

            const nameEl = document.createElement('span');
            nameEl.className = 'student-name';
            nameEl.textContent = splitNames.fullName;

            const facEl = document.createElement('span');
            facEl.className = 'student-fac';
            facEl.textContent = facultyNumber || '';

            wrap.appendChild(nameEl);
            wrap.appendChild(facEl);
            li.appendChild(wrap);
        }

        if (onItemClick) {
            li.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
                onItemClick(studentId, li);
            });
        } else if (showCheckbox) {
            li.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'LABEL') return;
                const checkbox = li.querySelector('input[type="checkbox"]');
                if (checkbox && onSelect) {
                    checkbox.checked = !checkbox.checked;
                    onSelect(studentId, li, checkbox);
                }
            });
        }

        list.appendChild(li);
    });

    container.appendChild(list);
}

/**
 * Filter student list by search query
 * @param {HTMLElement} container - Container element
 * @param {string} query - Search query
 */
export function filterStudentList(container, query) {
    if (!container) return;
    const q = (query || '').trim().toLowerCase();
    const items = container.querySelectorAll('li.list-item');

    if (!q) {
        items.forEach(li => li.style.display = '');
        return;
    }

    const tokens = q.split(/\s+/).filter(Boolean);
    items.forEach(li => {
        const text = li.textContent.toLowerCase();
        const matches = tokens.every(t => text.includes(t));
        li.style.display = matches ? '' : 'none';
    });
}
