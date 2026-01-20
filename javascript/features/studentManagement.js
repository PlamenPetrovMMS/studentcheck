/**
 * Student Management Feature Module
 * 
 * Handles student add/remove/info/history management.
 * Manages manage students overlay, student info overlay, attendance history, and add students overlay.
 */

import { removeStudentFromClass as apiRemoveStudentFromClass, addStudentsToClass } from '../api/classApi.js';
import { fetchAllStudents } from '../api/studentApi.js';
import { fetchClassStudents } from '../api/classApi.js';
import { getStudentAttendanceCountForClass } from './attendance.js';
import {
    getCurrentClass,
    setCurrentClass,
    getClassStudentAssignments,
    ensureClassStudentAssignments,
    removeStudentFromClassAssignments,
    setClassReady,
    getClassIdByName,
    setClassId,
    getAllStudents,
    setAllStudents
} from '../state/appState.js';
import { loadClassStudentsFromStorage, addNewStudentsToStorage, getStudentInfoForFacultyNumber } from '../storage/studentStorage.js';
import { getClassIdByNameFromStorage, getStoredClassesMap } from '../storage/classStorage.js';
import { fetchClasses } from '../api/classApi.js';
import { showOverlay, hideOverlay, getOverlay, openConfirmOverlay } from '../ui/overlays.js';
import { updateClassStatusUI } from '../ui/classUI.js';
import { renderAttendanceForClass } from '../ui/attendanceUI.js';
import { getTeacherEmail, SERVER_BASE_URL, ENDPOINTS } from '../config/api.js';

// Module state
let studentIndex = new Map(); // id -> full student object
let studentInfoOverlay = null;
let manageStudentsScrollPos = 0;
let manageStudentsOverlayInitialized = false;
let attendanceHistoryOverlayInitialized = false;
let addStudentsOverlayInitialized = false;
let addStudentsReturnToManage = false;

function showToast(message, tone = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-bubble toast-${tone} toast-wide`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 1400);
}
let addStudentsSelections = new Set();
let addStudentsRequestId = 0;

// DOM helpers
function getManageStudentsOverlay() { return getOverlay('manageStudentsOverlay'); }
function getManageStudentsListEl() { return document.getElementById('manageStudentsList'); }
function getAddStudentsClassOverlay() { return getOverlay('addStudentsClassOverlay'); }
function getAddStudentsListEl() {
    const overlay = getAddStudentsClassOverlay();
    const scoped = overlay?.querySelector('#addStudentsList');
    return scoped || document.getElementById('addStudentsList');
}
function getAttendanceHistoryOverlay() { return getOverlay('attendanceHistoryOverlay'); }

/**
 * Load attendance log for a student (stub - returns empty array)
 * @param {string} className - Class name
 * @param {string} studentId - Student ID
 * @returns {Array} Empty array (attendance logs not implemented)
 */
function loadAttendanceLog(className, studentId) {
    // TODO: Implement attendance log loading from server/storage
    return [];
}

/**
 * Render manage students list for a class
 * @param {string} className - Class name
 */
export async function renderManageStudentsForClass(className) {
    const module = 'STUDENT_MANAGEMENT';
    const functionName = 'renderManageStudentsForClass';
    
    const current = getCurrentClass();
    const selectedClassId = current.id;
    
    const listEl = getManageStudentsListEl();
    if (!listEl) {
        console.error(`[${module}] List element not found for class:`, className);
        return;
    }

    // Show loading state initially
    listEl.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">Loading students...</p>';

    try {
        // First, try to load from localStorage (fast path)
        let students = loadClassStudentsFromStorage(className);
        
        // If localStorage is empty, fetch from API
        if (!students || students.length === 0) {
            
            // Resolve classId to fetch from API
            const classId = await resolveClassId(className);
            
            if (classId) {
                try {
                    const fetched = await fetchClassStudents(classId, className);
                    students = fetched || [];
                    
                    // WORKAROUND: If fetch returned empty but we have students in localStorage,
                    // the server inserts may still be processing. Wait and retry once.
                    if (students.length === 0) {
                        const storedStudents = loadClassStudentsFromStorage(className);
                        if (storedStudents && storedStudents.length > 0) {
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            
                            try {
                                const retryFetched = await fetchClassStudents(classId, className, 1);
                                if (retryFetched && retryFetched.length > 0) {
                                    students = retryFetched;
                                }
                            } catch (retryError) {
                                console.warn('[Class Overlay Render] Retry failed, using localStorage fallback', {
                                    className,
                                    error: retryError.message
                                });
                                // Use localStorage as fallback if retry fails
                                students = storedStudents;
                            }
                        }
                    }
                    
                } catch (e) {
                    console.error(`[${module}] Failed to fetch class students from API:`, {
                        className,
                        classId,
                        error: e.message,
                        status: e.status || 'unknown'
                    });
                    // Fallback to localStorage if fetch fails
                    const storedStudents = loadClassStudentsFromStorage(className);
                    if (storedStudents && storedStudents.length > 0) {
                        students = storedStudents;
                    } else {
                        students = [];
                    }
                }
            } else {
                console.warn(`[${module}] No classId found for "${className}", cannot fetch from API`);
                students = [];
            }
        }

        // Clear loading state
        listEl.innerHTML = '';

        // Render students if we have any
        if (students && students.length > 0) {
            let nameLookup = null;
            const needsNames = students.some(s => !(s.full_name || s.fullName));
            if (needsNames) {
                try {
                    const all = await fetchAllStudents({ forceRefresh: true });
                    nameLookup = new Map();
                    (all || []).forEach(s => {
                        const name = s.full_name || s.fullName || '';
                        const fac = String(s.faculty_number || s.facultyNumber || '').trim();
                        const id = String(s.id || s.student_id || '').trim();
                        if (fac) nameLookup.set(fac, name);
                        if (id) nameLookup.set(id, name);
                    });
                } catch (_) {
                    nameLookup = null;
                }
            }

            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            ul.style.margin = '0';

            students.forEach(student => {
                const li = document.createElement('li');
                li.className = 'list-item';
                const studentId = student.faculty_number || student.facultyNumber || student.id || student.student_id;
                li.dataset.studentId = studentId;
                const fullName = student.full_name || student.fullName || (nameLookup ? nameLookup.get(String(studentId || '').trim()) : '') || '';

                const wrap = document.createElement('div');
                wrap.className = 'student-card-text';

                const nameEl = document.createElement('span');
                nameEl.className = 'student-name';
                nameEl.textContent = fullName;

                const facEl = document.createElement('span');
                facEl.className = 'student-fac';
                facEl.textContent = student.faculty_number || student.facultyNumber || studentId || '';

                wrap.appendChild(nameEl);
                wrap.appendChild(facEl);
                li.appendChild(wrap);
                li.addEventListener('click', () => openStudentInfoOverlay(studentId, className));

                if (studentId) {
                    studentIndex.set(String(studentId), {
                        fullName,
                        faculty_number: student.faculty_number || student.facultyNumber || ''
                    });
                }

                ul.appendChild(li);
            });

            listEl.appendChild(ul);
            return;
        }

        // Fallback to in-memory id set if no students from storage/API
        const assignments = getClassStudentAssignments(className);
        
        if (assignments && assignments.size > 0) {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            ul.style.margin = '0';

            Array.from(assignments).forEach((id) => {
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

            listEl.appendChild(ul);
            return;
        }

        // Show empty state if no students found
        console.warn('[Class Overlay Render] Early exit - showing empty state', {
            reason: 'no students found from any source',
            className,
            selectedClassId,
            checkedLocalStorage: true,
            checkedAPI: true,
            checkedAssignments: true
        });
        
        const p = document.createElement('p');
        p.className = 'muted';
        p.style.textAlign = 'center';
        p.style.padding = '20px';
        p.textContent = 'No students assigned to this class.';
        listEl.appendChild(p);
        
    } catch (error) {
        console.error(`[${module}] Error rendering manage students list:`, {
            className,
            selectedClassId,
            error: error.message,
            stack: error.stack
        });
        listEl.innerHTML = '<p class="muted" style="text-align:center; padding:20px; color:red;">Error loading students. Please try again.</p>';
    }
}

/**
 * Ensure manage students overlay is initialized (idempotent)
 */
function ensureManageStudentsOverlayInitialized() {
    if (manageStudentsOverlayInitialized) return;
    manageStudentsOverlayInitialized = true;

    const overlay = getManageStudentsOverlay();
    if (!overlay) return;

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            const current = getCurrentClass();
            returnToReadyClassPopup(current.name);
        }
    });

    const backBtn = overlay.querySelector('#backToReadyBtn');
    const closeBtn = overlay.querySelector('#closeManageOverlayBtn');
    const addBtn = overlay.querySelector('#addStudentManageBtn');

    backBtn?.addEventListener('click', () => {
        const current = getCurrentClass();
        returnToReadyClassPopup(current.name);
    });

    closeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeAllClassOverlays();
    });

        addBtn?.addEventListener('click', async () => {
            const current = getCurrentClass();
            await openAddStudentsToClass(current.name, { returnToManage: true });
        });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOverlayVisible(overlay)) {
            const current = getCurrentClass();
            returnToReadyClassPopup(current.name);
        }
    });
}

/**
 * Open manage students overlay
 * @param {string} className - Class name
 */
export async function openManageStudentsOverlay(className) {
    ensureManageStudentsOverlayInitialized();

    const current = getCurrentClass();
    
    setCurrentClass(className, current.id, current.button);
    
    const currentAfterSet = getCurrentClass();

    // Hide ready overlay to avoid stacking
    const readyPopupOverlay = getOverlay('readyClassPopupOverlay');
    if (readyPopupOverlay) hideOverlay(readyPopupOverlay);

    const overlay = getManageStudentsOverlay();
    const titleEl = overlay?.querySelector('#manageStudentsTitle');
    if (titleEl) titleEl.textContent = 'Students';

    // Show overlay immediately (renderManageStudentsForClass will show loading state)
    if (overlay) {
        showOverlay(overlay);
    }

    // Render students list (async, will fetch from API if needed)
    try {
        await renderManageStudentsForClass(className);
    } catch (e) {
        console.error('[openManageStudentsOverlay] Failed to render students list:', className, e);
        // Error handling is done inside renderManageStudentsForClass
    }
}

/**
 * Close manage students overlay
 */
function closeManageStudentsOverlay() {
    const overlay = getManageStudentsOverlay();
    if (overlay) {
        hideOverlay(overlay);
    }
}

/**
 * Return to ready class popup from manage students
 * @param {string} className - Class name
 */
function returnToReadyClassPopup(className) {
    closeManageStudentsOverlay();
    // This will be handled by the main file's ready popup handler
    const event = new CustomEvent('openReadyClassPopup', { detail: { className } });
    document.dispatchEvent(event);
}

/**
 * Ensure student info overlay exists
 * @returns {HTMLElement} Overlay element
 */
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
        if (e.key === 'Escape' && isOverlayVisible(studentInfoOverlay)) {
            closeStudentInfoOverlay();
        }
    });
    
    return studentInfoOverlay;
}

/**
 * Build student info content HTML
 * @param {Object} studentObj - Student object
 * @param {string} studentId - Student ID
 * @param {string} className - Class name
 * @returns {HTMLElement} Content wrapper element
 */
function buildStudentInfoContent(studentObj, studentId, className) {
    const wrapper = document.createElement('div');
    wrapper.className = 'ready-class-popup student-info-popup';
    wrapper.setAttribute('role', 'dialog');
    wrapper.setAttribute('aria-modal', 'true');
    wrapper.innerHTML = '';

    const h2 = document.createElement('h2');
    h2.textContent = 'Student Info';
    wrapper.appendChild(h2);

    // Get student data from storage if available
    const classStudents = loadClassStudentsFromStorage(className);
    let studentData = studentObj;
    if (classStudents && Array.isArray(classStudents)) {
        const found = classStudents.find(s => (s.faculty_number || s.id) === String(studentId));
        if (found) studentData = found;
    }

    const nameP = document.createElement('p');
    nameP.textContent = `Full Name: ${studentData.fullName || studentData.full_name || ''}`;
    nameP.style.margin = '0 0 8px 0';
    wrapper.appendChild(nameP);

    const facultyP = document.createElement('p');
    facultyP.textContent = `Faculty Number: ${studentData.faculty_number || studentData.facultyNumber || ''}`;
    facultyP.style.margin = '0 0 12px 0';
    wrapper.appendChild(facultyP);

    if (studentData.email) {
        const emailP = document.createElement('p');
        emailP.textContent = `Email: ${studentData.email}`;
        emailP.style.margin = '0 0 10px 0';
        wrapper.appendChild(emailP);
    }

    // Attended classes counter (per-class, live)
    const current = getCurrentClass();
    const attended = getStudentAttendanceCountForClass(className || current.name, studentId, null);
    const attendedP = document.createElement('p');
    attendedP.setAttribute('data-attendance-counter', '');
    attendedP.textContent = `Attended Classes: ${attended}`;
    attendedP.style.margin = '10px 0 0 0';
    attendedP.style.fontWeight = '700';
    attendedP.style.fontSize = '1.15rem';
    attendedP.style.letterSpacing = '.5px';
    wrapper.appendChild(attendedP);

    // Attendance History button
    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'role-button attendance-history-btn';
    historyBtn.textContent = 'Attendance History';
    historyBtn.style.marginTop = '16px';
    historyBtn.style.width = '100%';
    historyBtn.addEventListener('click', () => {
        openAttendanceHistoryOverlay(className || current.name, studentId);
    });
    wrapper.appendChild(historyBtn);

    // Remove from class button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'role-button danger';
    removeBtn.textContent = 'Remove from Class';
    removeBtn.style.marginTop = '12px';
    removeBtn.style.width = '100%';
    removeBtn.style.backgroundColor = '#dc2626';
    removeBtn.style.color = 'white';
    removeBtn.style.border = 'none';
    removeBtn.style.cursor = 'pointer';
    removeBtn.addEventListener('mouseover', () => {
        removeBtn.style.backgroundColor = '#991b1b';
    });
    removeBtn.addEventListener('mouseout', () => {
        removeBtn.style.backgroundColor = '#dc2626';
    });
    removeBtn.addEventListener('click', () => {
        openConfirmOverlay(
            `Are you sure you want to remove ${studentData.fullName || studentData.full_name || 'this student'} from the class?`,
            () => removeStudentFromClass(studentId, className || current.name),
            () => { /* cancelled */ }
        );
    });
    wrapper.appendChild(removeBtn);

    return wrapper;
}

/**
 * Open student info overlay
 * @param {string} studentId - Student ID
 * @param {string} className - Class name
 */
export function openStudentInfoOverlay(studentId, className) {
    ensureStudentInfoOverlay();

    // Preserve scroll of manage overlay
    const listEl = getManageStudentsListEl();
    if (listEl) manageStudentsScrollPos = listEl.scrollTop;

    // Hide manage overlay without destroying it
    const manageOverlay = getManageStudentsOverlay();
    if (manageOverlay) hideOverlay(manageOverlay, false);

    const info = studentIndex.get(studentId) || { fullName: studentId };
    studentInfoOverlay.innerHTML = '';
    const content = buildStudentInfoContent(info, studentId, className);
    studentInfoOverlay.appendChild(content);
    studentInfoOverlay.dataset.studentId = String(studentId);
    studentInfoOverlay.dataset.className = String(className || getCurrentClass().name || '');
    showOverlay(studentInfoOverlay, false);
}

/**
 * Close student info overlay
 */
function closeStudentInfoOverlay() {
    if (!studentInfoOverlay) return;
    hideOverlay(studentInfoOverlay, false);
    
    // Restore manage overlay
    const manageOverlay = getManageStudentsOverlay();
    if (manageOverlay) {
        showOverlay(manageOverlay, false);
        const listEl = getManageStudentsListEl();
        if (listEl) listEl.scrollTop = manageStudentsScrollPos;
    }
}

/**
 * Remove student from class
 * @param {string} facultyNumber - Faculty number
 * @param {string} className - Class name
 */
export async function removeStudentFromClass(facultyNumber, className) {
    const classId = getClassIdByName(className);
    if (!classId) {
        console.error('[removeStudentFromClass] Unable to get class ID for class:', className);
        alert('Error: Class ID not found.');
        return;
    }

    const teacherEmail = getTeacherEmail();

    try {
        await apiRemoveStudentFromClass(classId, facultyNumber, teacherEmail);

        // Update UI: remove from storage
        const classStudents = loadClassStudentsFromStorage(className);
        if (classStudents && Array.isArray(classStudents)) {
            const filtered = classStudents.filter(s => 
                s.faculty_number !== String(facultyNumber) && s.id !== String(facultyNumber)
            );
            addNewStudentsToStorage(className, filtered);
        }

        // Update in-memory assignments
        removeStudentFromClassAssignments(className, String(facultyNumber));

        // Close overlays and refresh
        closeStudentInfoOverlay();
        const manageOverlay = getManageStudentsOverlay();
        if (manageOverlay && isOverlayVisible(manageOverlay)) {
            await renderManageStudentsForClass(className);
        }

        showToast('Student removed', 'error');
    } catch (error) {
        console.error('[removeStudentFromClass] Error:', error.message);
        alert('Failed to remove student: ' + error.message);
    }
}

/**
 * Render attendance history list
 * @param {string} className - Class name
 * @param {string} studentId - Student ID
 */
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

/**
 * Ensure attendance history overlay is initialized (idempotent)
 */
function ensureAttendanceHistoryOverlayInitialized() {
    if (attendanceHistoryOverlayInitialized) return;
    attendanceHistoryOverlayInitialized = true;

    const overlay = getAttendanceHistoryOverlay();
    if (!overlay) return;

    const closeBtn = overlay.querySelector('#closeAttendanceHistoryBtn');
    const backBtn = overlay.querySelector('#attendanceHistoryBackBtn');

    closeBtn?.addEventListener('click', () => returnToManageStudentsFromHistory());
    backBtn?.addEventListener('click', () => returnToStudentInfoOverlay());

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) returnToManageStudentsFromHistory();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOverlayVisible(overlay)) {
            returnToManageStudentsFromHistory();
        }
    });
}

/**
 * Open attendance history overlay
 * @param {string} className - Class name
 * @param {string} studentId - Student ID
 */
export function openAttendanceHistoryOverlay(className, studentId) {
    ensureAttendanceHistoryOverlayInitialized();

    // Hide student info overlay
    if (studentInfoOverlay) hideOverlay(studentInfoOverlay, false);

    const overlay = getAttendanceHistoryOverlay();
    const titleEl = overlay?.querySelector('#attendanceHistoryTitle');
    if (titleEl) titleEl.textContent = 'Attendance History';

    renderAttendanceHistoryList(className, studentId);

    if (overlay) {
        showOverlay(overlay, false);
        overlay.dataset.studentId = String(studentId);
        overlay.dataset.className = String(className || getCurrentClass().name || '');
    }
}

/**
 * Return to student info overlay from history
 */
function returnToStudentInfoOverlay() {
    const overlay = getAttendanceHistoryOverlay();
    if (overlay) hideOverlay(overlay, false);
    if (studentInfoOverlay) showOverlay(studentInfoOverlay, false);
}

/**
 * Close attendance history overlay
 */
function closeAttendanceHistoryOverlay() {
    const overlay = getAttendanceHistoryOverlay();
    if (overlay) hideOverlay(overlay, false);
}

/**
 * Return to manage students from history
 */
function returnToManageStudentsFromHistory() {
    closeAttendanceHistoryOverlay();
    if (studentInfoOverlay) hideOverlay(studentInfoOverlay, false);
    const manageOverlay = getManageStudentsOverlay();
    if (manageOverlay) {
        showOverlay(manageOverlay, false);
        const listEl = getManageStudentsListEl();
        if (listEl) listEl.scrollTop = manageStudentsScrollPos;
    }
}

/**
 * Filter add students list by query
 * @param {string} query - Search query
 */
function filterAddStudentsList(query) {
    requestAddStudentsWithFilters({
        search: query || ''
    });
}

/**
 * Filter by dropdown selects (stub - only uses search)
 */
function filterAddStudentsListBySelects(levelValue, facultyValue, specializationValue, groupValue, searchInputValue) {
    requestAddStudentsWithFilters({
        level: levelValue,
        faculty: facultyValue,
        specialization: specializationValue,
        group: groupValue,
        search: searchInputValue
    });
}

/**
 * Reset add students filters
 */
function resetAddStudentsFilters() {
    const levelSelect = document.getElementById('addStudentsFilterLevel');
    const facultySelect = document.getElementById('addStudentsFilterFaculty');
    const specializationSelect = document.getElementById('addStudentsFilterSpecialization');
    const groupSelect = document.getElementById('addStudentsFilterGroup');
    const searchInput = document.getElementById('addStudentsSearchInput');

    if (levelSelect) levelSelect.value = '';
    if (facultySelect) facultySelect.value = '';
    if (specializationSelect) specializationSelect.value = '';
    if (groupSelect) groupSelect.value = '';
    if (searchInput) searchInput.value = '';

    requestAddStudentsWithFilters();
}

/**
 * Update add students counter
 */
function updateAddStudentsCounter() {
    const overlay = getAddStudentsClassOverlay();
    const confirmBtn = overlay?.querySelector('#addStudentsOverlayBtn');
    if (confirmBtn) {
        confirmBtn.textContent = `Add (${addStudentsSelections.size})`;
    }
}

/**
 * Ensure add students overlay is initialized (idempotent)
 */
function ensureAddStudentsOverlayInitialized() {
    if (addStudentsOverlayInitialized) return;
    addStudentsOverlayInitialized = true;

    const overlay = getAddStudentsClassOverlay();
    if (!overlay) return;

    const closeBtn = overlay.querySelector('#closeAddStudentsClassBtn');
    const searchInput = overlay.querySelector('#addStudentsSearchInput');
    const confirmBtn = overlay.querySelector('#addStudentsOverlayBtn');
    const resetBtn = overlay.querySelector('#addStudentsResetFiltersBtn');
    const levelSelect = overlay.querySelector('#addStudentsFilterLevel');
    const facultySelect = overlay.querySelector('#addStudentsFilterFaculty');
    const specializationSelect = overlay.querySelector('#addStudentsFilterSpecialization');
    const groupSelect = overlay.querySelector('#addStudentsFilterGroup');

    closeBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeAddStudentsToClass();
    });

    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            const current = getCurrentClass();
            finalizeAddStudentsToClass(current.name);
        });
    }

    if (searchInput) {
        if (window.Utils && typeof window.Utils.debounce === 'function') {
            const debounced = window.Utils.debounce((value) => filterAddStudentsList(value), 250);
            searchInput.addEventListener('input', (e) => debounced(e.target.value));
        } else {
            let debounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => filterAddStudentsList(e.target.value), 250);
            });
        }
    }

    levelSelect?.addEventListener('change', () => {
        filterAddStudentsListBySelects(
            levelSelect.value,
            facultySelect?.value || '',
            specializationSelect?.value || '',
            groupSelect?.value || '',
            searchInput?.value || ''
        );
    });

    facultySelect?.addEventListener('change', () => {
        filterAddStudentsListBySelects(
            levelSelect?.value || '',
            facultySelect.value,
            specializationSelect?.value || '',
            groupSelect?.value || '',
            searchInput?.value || ''
        );
    });

    specializationSelect?.addEventListener('change', () => {
        filterAddStudentsListBySelects(
            levelSelect?.value || '',
            facultySelect?.value || '',
            specializationSelect.value,
            groupSelect?.value || '',
            searchInput?.value || ''
        );
    });

    groupSelect?.addEventListener('change', () => {
        filterAddStudentsListBySelects(
            levelSelect?.value || '',
            facultySelect?.value || '',
            specializationSelect?.value || '',
            groupSelect.value,
            searchInput?.value || ''
        );
    });

    resetBtn?.addEventListener('click', resetAddStudentsFilters);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAddStudentsToClass();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOverlayVisible(overlay)) {
            closeAddStudentsToClass();
        }
    });
}

function collectAddStudentsFilters(overrides = {}) {
    const levelSelect = document.getElementById('addStudentsFilterLevel');
    const facultySelect = document.getElementById('addStudentsFilterFaculty');
    const specializationSelect = document.getElementById('addStudentsFilterSpecialization');
    const groupSelect = document.getElementById('addStudentsFilterGroup');
    const searchInput = document.getElementById('addStudentsSearchInput');

    return {
        level: overrides.level ?? (levelSelect?.value || ''),
        faculty: overrides.faculty ?? (facultySelect?.value || ''),
        specialization: overrides.specialization ?? (specializationSelect?.value || ''),
        group: overrides.group ?? (groupSelect?.value || ''),
        search: overrides.search ?? (searchInput?.value || '')
    };
}

async function requestAddStudentsWithFilters(overrides = {}) {
    const current = getCurrentClass();
    const className = current?.name || '';
    if (!className) return;

    const listEl = getAddStudentsListEl();
    if (listEl) {
        listEl.innerHTML = '<p class="muted" style="text-align:center;">Loading students...</p>';
    }

    const requestId = ++addStudentsRequestId;
    const filters = collectAddStudentsFilters(overrides);
    const params = new URLSearchParams();

    if (filters.level) params.append('level', filters.level);
    if (filters.faculty) params.append('faculty', filters.faculty);
    if (filters.specialization) params.append('specialization', filters.specialization);
    if (filters.group) params.append('group', filters.group);
    if (filters.search) params.append('search', filters.search);

    try {
        const url = `${SERVER_BASE_URL + ENDPOINTS.students}${params.toString() ? `?${params.toString()}` : ''}`;
        const result = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
        if (!result.ok) {
            throw new Error(`HTTP ${result.status}`);
        }
        const data = await result.json();
        const students = Array.isArray(data?.students) ? data.students : (Array.isArray(data) ? data : []);

        if (requestId !== addStudentsRequestId) return;
        await renderAddStudentsList(className, { studentsOverride: students });
    } catch (e) {
        if (requestId !== addStudentsRequestId) return;
        try {
            const fallback = await fetchAllStudents({ forceRefresh: true });
            await renderAddStudentsList(className, { studentsOverride: fallback });
        } catch (_) {
            if (listEl) {
                listEl.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">Unable to load students.</p>';
            }
        }
    }
}

/**
 * Open add students to class overlay
 * @param {string} className - Class name
 */
export async function openAddStudentsToClass(className, options = {}) {
    closeManageStudentsOverlay();

    if (!className) return;

    ensureAddStudentsOverlayInitialized();
    addStudentsReturnToManage = Boolean(options.returnToManage);

    const overlay = getAddStudentsClassOverlay();
    const confirmBtn = overlay?.querySelector('#addStudentsOverlayBtn');
    const searchInput = overlay?.querySelector('#addStudentsSearchInput');

    addStudentsSelections.clear();

    if (confirmBtn) confirmBtn.textContent = 'Add (0)';

    // Show overlay immediately with loading state
    if (overlay) {
        showOverlay(overlay, false);
    }

    // Render students list (async, with error handling)
    try {
        await renderAddStudentsList(className);
    } catch (e) {
        console.error('[openAddStudentsToClass] Failed to render students list:', className, e);
        // Ensure list container shows error state
        const listEl = getAddStudentsListEl();
        if (listEl) {
            listEl.innerHTML = '<p class="muted" style="text-align:center; padding:20px;">Unable to load students. Please try again.</p>';
        }
    }

    updateAddStudentsCounter();
    // Avoid auto-focus to prevent mobile keyboard opening unexpectedly
}

/**
 * Close add students to class overlay
 */
function closeAddStudentsToClass() {
    const overlay = getAddStudentsClassOverlay();
    if (overlay) hideOverlay(overlay, false);
    if (addStudentsReturnToManage) {
        addStudentsReturnToManage = false;
        const current = getCurrentClass();
        if (current?.name) {
            openManageStudentsOverlay(current.name);
            return;
        }
    }
    const manageOverlay = getManageStudentsOverlay();
    if (!manageOverlay || !isOverlayVisible(manageOverlay)) {
        document.body.style.overflow = '';
    }
}

/**
 * Resolve class ID with fallback logic
 * @param {string} className - Class name
 * @returns {Promise<number|null>} Class ID or null if not found
 */
async function resolveClassId(className) {
    // Try appState first
    let classId = getClassIdByName(className);
    if (classId) return classId;

    // Try localStorage
    classId = getClassIdByNameFromStorage(className);
    if (classId) {
        // Update appState for future lookups
        setClassId(className, classId);
        return classId;
    }

    // Last resort: fetch classes and update state
    try {
        const teacherEmail = getTeacherEmail();
        if (!teacherEmail) {
            console.error('[resolveClassId] No teacher email available');
            return null;
        }
        const data = await fetchClasses(teacherEmail);
        const classes = data.classes || [];
        const classesMap = new Map();
        
        for (const _class of classes) {
            classesMap.set(_class.id, _class.name);
            setClassId(_class.name, _class.id);
            if (_class.name === className) {
                return _class.id;
            }
        }
    } catch (e) {
        console.error('[resolveClassId] Failed to fetch classes:', e);
    }

    return null;
}

/**
 * Render add students list
 * @param {string} className - Class name
 */
async function renderAddStudentsList(className, options = {}) {
    const listEl = getAddStudentsListEl();
    if (!listEl) {
        console.error('[Render Add Students] List element not found');
        return;
    }

    // Show loading state
    listEl.innerHTML = '<p class="muted" style="text-align:center;">Loading students...</p>';

    // Resolve classId with fallbacks
    const classId = await resolveClassId(className);
    if (!classId) {
        console.error('[Render Add Students] No class ID found for class:', className);
        // Still try to show all students even without classId
    }

    // Build existing set from assignments map and stored students
    const assignments = getClassStudentAssignments(className);
    const existingSet = new Set([...(assignments || new Set())]);

    let classStudents = [];
    let allStudents = [];
    let fetchError = false;

    // Fetch class roster if classId is available
    if (classId) {
        try {
            const fetched = await fetchClassStudents(classId, className);
            classStudents = fetched || [];
            
            // Add to existing set
            if (classStudents && classStudents.length > 0) {
                classStudents.forEach(student => {
                    const id = (student.faculty_number || '').trim();
                    if (id) {
                        existingSet.add(id);
                    }
                });
            }
        } catch (e) {
            console.error('[Render Add Students] Failed to fetch class students:', className, e);
            fetchError = true;
            // Try loading from storage as fallback
            const stored = loadClassStudentsFromStorage(className);
            if (stored) {
                classStudents = stored;
            }
        }
    } else {
        // No classId, try storage only
        const stored = loadClassStudentsFromStorage(className);
        if (stored) {
            classStudents = stored;
        }
    }

    const { studentsOverride = null } = options;
    if (Array.isArray(studentsOverride)) {
        allStudents = studentsOverride;
    } else {
        // Always refresh from API when opening Add Students
        allStudents = getAllStudents();
        
        try {
            allStudents = await fetchAllStudents({ forceRefresh: true });
        } catch (e) {
            console.error('[Render Add Students] Failed to fetch all students:', e);
            fetchError = true;
            // Fallback to cached data if available
            allStudents = getAllStudents() || [];
        }
    }
    
    // Ensure allStudents is an array
    if (!Array.isArray(allStudents)) {
        allStudents = [];
    }

    // Clear loading state
    listEl.innerHTML = '';

    // If no students available at all, show empty state
    if (!allStudents || allStudents.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'muted';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.padding = '20px';
        if (fetchError) {
            emptyMsg.textContent = 'Unable to load students. Please check your connection and try again.';
        } else {
            emptyMsg.textContent = 'No students available in the database.';
        }
        listEl.appendChild(emptyMsg);
        return;
    }

    // Render the list of all students
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';

    allStudents.forEach((student, idx) => {
        const li = document.createElement('li');
        li.className = 'list-item';
        const parts = (window.Students?.splitNames || (() => ({ fullName: '' })))(student);
        const facultyNumber = student.faculty_number;
        const studentId = (window.Students?.idForStudent
            ? window.Students.idForStudent(student, 'add', idx)
            : (facultyNumber || parts.fullName || `add_${idx}`));

        if (existingSet.has(studentId)) {
            // Render without checkbox, with 'Already in' badge
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
        checkbox.type = 'checkbox';
        checkbox.id = `addStudent_${idx}`;
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
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
            if (checkbox.checked) {
                addStudentsSelections.add(studentId);
                li.classList.add('selected');
            } else {
                addStudentsSelections.delete(studentId);
                li.classList.remove('selected');
            }
            updateAddStudentsCounter();
        });

        li.addEventListener('click', (e) => {
            if (e.target === checkbox || e.target.tagName === 'LABEL' || (e.target && e.target.closest('label'))) return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        });

        li.appendChild(checkbox);
        li.appendChild(label);
        ul.appendChild(li);
    });

    listEl.appendChild(ul);
}

/**
 * Finalize adding students to class
 * @param {string} className - Class name
 */
export async function finalizeAddStudentsToClass(className) {
    if (!className || addStudentsSelections.size === 0) {
        closeAddStudentsToClass();
        return;
    }

    const assignSet = ensureClassStudentAssignments(className);

    const newlyAdded = [];
    addStudentsSelections.forEach(id => {
        if (!assignSet.has(id)) {
            assignSet.add(id);
            newlyAdded.push(id);
        }
    });

    const studentsFromDatabase = await fetchAllStudents();

    // Update per-class student objects list
    const existingStudentsInClass = loadClassStudentsFromStorage(className) || [];
    const newlyAddedStudents = [];

    newlyAdded.forEach(facultyNumber => {
        let studentInfo = getStudentInfoForFacultyNumber(facultyNumber, studentsFromDatabase);
        if (studentInfo && !studentInfo.full_name && !studentInfo.fullName) {
            const fallbackName = (studentInfo.fullName || studentInfo.full_name || '').trim();
            if (!fallbackName) {
                const fallback = (studentsFromDatabase || []).find(s => {
                    const fac = s.faculty_number || s.facultyNumber || s.id || s.student_id;
                    return String(fac || '').trim() === String(facultyNumber || '').trim();
                });
                if (fallback) studentInfo = fallback;
            }
        }

        // Prevent duplicates
        const duplicate = existingStudentsInClass.some(student => {
            const existingStudentFacultyNum = student.faculty_number;
            if (studentInfo && existingStudentFacultyNum && existingStudentFacultyNum === studentInfo.faculty_number) {
                return true;
            }
            return student.full_name === studentInfo.full_name;
        });

        if (!duplicate && studentInfo) {
            newlyAddedStudents.push(studentInfo);
        }
    });

    addNewStudentsToStorage(className, [...existingStudentsInClass, ...newlyAddedStudents]);

    const classId = await resolveClassId(className);
    let addedToServer = false;
    if (classId && newlyAddedStudents.length > 0) {
        try {
            const response = await addStudentsToClass(classId, newlyAddedStudents);
            addedToServer = true;
            
            // WORKAROUND: Server may not await inserts, so wait a bit then verify
            // This ensures inserts complete before we try to fetch the updated list
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Verify by fetching the class students again
            try {
                const verifyTimeout = setTimeout(() => {
                    console.warn('[finalizeAddStudentsToClass] Verification fetch timed out, proceeding anyway');
                }, 2000);
                
                const verifiedStudents = await fetchClassStudents(classId, className);
                clearTimeout(verifyTimeout);
                
                // If verification shows fewer students than expected, log warning but continue
                if (verifiedStudents && verifiedStudents.length < newlyAddedStudents.length) {
                    console.warn('[finalizeAddStudentsToClass] Verification shows fewer students than added', {
                        className,
                        classId,
                        addedCount: newlyAddedStudents.length,
                        verifiedCount: verifiedStudents.length,
                        note: 'Server inserts may still be processing'
                    });
                }
            } catch (verifyError) {
                console.warn('[finalizeAddStudentsToClass] Verification fetch failed, proceeding anyway', {
                    className,
                    classId,
                    error: verifyError.message
                });
                // Continue even if verification fails - server may still be processing
            }
            
        } catch (error) {
            console.error('[finalizeAddStudentsToClass] Failed to add students to class', {
                className,
                classId,
                error: error.message,
                status: error.status
            });
            alert(`Failed to add students to class: ${error.message}`);
            // Continue with UI update even if server call fails (optimistic update)
        }
    }

    if (newlyAddedStudents.length > 0 && addedToServer) {
        const noun = newlyAddedStudents.length === 1 ? 'student' : 'students';
        showToast(`Successfully added ${noun}`, 'success');
    }

    // Ensure class marked ready
    setClassReady(className, true);
    const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => {
        const btnName = (b.dataset.className || b.dataset.originalLabel || b.textContent || '').trim();
        return btnName === className;
    });
    if (btn) updateClassStatusUI(btn);

    // Re-render manage list
    const manageOverlay = getManageStudentsOverlay();
    if (manageOverlay && isOverlayVisible(manageOverlay)) {
        await renderManageStudentsForClass(className);
    }

    // Refresh attendance overlay if open
    const attendanceOverlay = getOverlay('attendanceOverlay');
    if (attendanceOverlay && isOverlayVisible(attendanceOverlay)) {
        renderAttendanceForClass(className, document.getElementById('attendanceList'));
    }

    closeAddStudentsToClass();
}

/**
 * Check if overlay is visible
 */
function isOverlayVisible(overlay) {
    return overlay && overlay.style.visibility === 'visible';
}

/**
 * Close all class overlays (helper for main file)
 */
function closeAllClassOverlays() {
    const readyPopupOverlay = getOverlay('readyClassPopupOverlay');
    const manageOverlay = getManageStudentsOverlay();
    const studentInfo = studentInfoOverlay;
    const scannerOverlay = getOverlay('scannerOverlay');

    if (readyPopupOverlay) hideOverlay(readyPopupOverlay);
    if (manageOverlay) hideOverlay(manageOverlay);
    if (studentInfo) hideOverlay(studentInfo);
    // Scanner has its own close function
    document.body.style.overflow = '';
}

// Export closeAllClassOverlays for main file
export { closeAllClassOverlays };
