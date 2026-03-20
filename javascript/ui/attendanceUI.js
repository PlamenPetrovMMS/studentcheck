/**
 * Attendance UI Module
 * 
 * Handles attendance overlay rendering and status dot updates.
 */

import { ensureAttendanceState, getAttendanceState, getAttendanceDotIndex, setAttendanceDotIndex } from '../state/appState.js';
import { loadClassStudentsFromStorage, resolveStudentFacultyNumber } from '../storage/studentStorage.js';

/**
 * Apply state class to attendance dot element
 * @param {HTMLElement} dotEl - Dot element
 * @param {string} state - State ('none'|'joined'|'completed')
 */
export function applyDotStateClass(dotEl, state) {
    if (!dotEl) return;
    dotEl.classList.remove('status-none', 'status-joined', 'status-completed');
    if (state === 'completed') {
        dotEl.classList.add('status-completed');
    } else if (state === 'joined') {
        dotEl.classList.add('status-joined');
    } else {
        dotEl.classList.add('status-none');
    }
}

/**
 * Render attendance list for a class
 * @param {string} className - Class name
 * @param {HTMLElement} container - Container element (attendanceList)
 */
export function renderAttendanceForClass(className, container) {
    if (!container) return;

    const students = loadClassStudentsFromStorage(className) || [];
    const stateMap = ensureAttendanceState(className);

    // Initialize state for all students
    students.forEach(student => {
        const facultyNumber = String(resolveStudentFacultyNumber(student) || '').trim();
        if (facultyNumber && !stateMap.has(facultyNumber)) {
            stateMap.set(facultyNumber, 'none');
        }
    });

    container.innerHTML = '';

    if (!students || students.length === 0) {
        const emptyText = (window.i18n && typeof window.i18n.t === 'function') ? window.i18n.t('no_students_in_class') : 'No students in this class.';
        container.innerHTML = `<p class="muted" style="text-align:center;">${emptyText}</p>`;
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'attendance-ul';

    const dotIndex = new Map();

    students.forEach(student => {
        const li = document.createElement('li');
        li.className = 'attendance-item';

        const name = document.createElement('span');
        name.className = 'attendance-name';
        const fullName = String(student?.full_name || student?.fullName || student?.name || '').trim();
        const facultyNumber = String(resolveStudentFacultyNumber(student) || '').trim();
        name.textContent = `${fullName} ${facultyNumber}`.trim();

        const dot = document.createElement('span');
        dot.className = 'status-dot';

        const state = (facultyNumber && stateMap.get(facultyNumber)) || 'none';
        applyDotStateClass(dot, state);

        li.appendChild(name);
        li.appendChild(dot);
        ul.appendChild(li);

        // Index by faculty_number for updates
        if (facultyNumber) {
            dotIndex.set(facultyNumber, dot);
        }
    });

    container.appendChild(ul);
    setAttendanceDotIndex(dotIndex);
}

/**
 * Update attendance dot for a student
 * @param {string} studentId - Student ID (faculty number)
 * @param {string} state - New state ('none'|'joined'|'completed')
 */
export function updateAttendanceDot(studentId, state) {
    const dotIndex = getAttendanceDotIndex();
    const dot = dotIndex.get(studentId);
    if (dot) {
        applyDotStateClass(dot, state);
    }
}
