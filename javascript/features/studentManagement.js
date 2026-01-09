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
import { getTeacherEmail } from '../config/api.js';

// Module state
let studentIndex = new Map(); // id -> full student object
let studentInfoOverlay = null;
let manageStudentsScrollPos = 0;
let manageStudentsOverlayInitialized = false;
let attendanceHistoryOverlayInitialized = false;
let addStudentsOverlayInitialized = false;
let addStudentsSelections = new Set();

// DOM helpers
function getManageStudentsOverlay() { return getOverlay('manageStudentsOverlay'); }
function getManageStudentsListEl() { return document.getElementById('manageStudentsList'); }
function getAddStudentsClassOverlay() { return getOverlay('addStudentsClassOverlay'); }
function getAddStudentsListEl() { return document.getElementById('addStudentsList'); }
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
    
    console.log('[Class Overlay Render] Invoked', {
        className,
        selectedClassId,
        selectedClassIdType: typeof selectedClassId,
        timestamp: new Date().toISOString()
    });
    
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
        
        console.log('[Class Overlay Render] Initial localStorage check', {
            className,
            studentsFromStorage: students,
            studentsCount: students?.length || 0,
            studentsSource: 'localStorage'
        });
        
        // If localStorage is empty, fetch from API
        if (!students || students.length === 0) {
            console.log(`[${module}] No students in localStorage for "${className}", fetching from API...`);
            
            // Resolve classId to fetch from API
            const classId = await resolveClassId(className);
            
            console.log('[Class Overlay Render] Resolved classId for API fetch', {
                className,
                resolvedClassId: classId,
                resolvedClassIdType: typeof classId,
                selectedClassId,
                selectedClassIdType: typeof selectedClassId
            });
            
            if (classId) {
                try {
                    console.log('[Class Overlay Render] Calling fetchClassStudents', {
                        classId,
                        className
                    });
                    
                    const fetched = await fetchClassStudents(classId, className);
                    students = fetched || [];
                    
                    console.log('[Class Overlay Render] After fetchClassStudents', {
                        className,
                        fetchedStudents: fetched,
                        studentsCount: students.length,
                        sampleStudent: students[0] || null
                    });
                    
                    // WORKAROUND: If fetch returned empty but we have students in localStorage,
                    // the server inserts may still be processing. Wait and retry once.
                    if (students.length === 0) {
                        const storedStudents = loadClassStudentsFromStorage(className);
                        if (storedStudents && storedStudents.length > 0) {
                            console.log('[Class Overlay Render] Empty fetch but localStorage has students, retrying after delay', {
                                className,
                                classId,
                                storedCount: storedStudents.length
                            });
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            
                            try {
                                const retryFetched = await fetchClassStudents(classId, className, 1);
                                if (retryFetched && retryFetched.length > 0) {
                                    students = retryFetched;
                                    console.log('[Class Overlay Render] Retry successful', {
                                        className,
                                        studentsCount: students.length
                                    });
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
                    
                    console.log(`[${module}] Fetched ${students.length} students from API for class:`, className);
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
                        console.log(`[${module}] Using localStorage fallback after fetch failure`, {
                            className,
                            storedCount: storedStudents.length
                        });
                        students = storedStudents;
                    } else {
                        students = [];
                    }
                }
            } else {
                console.warn(`[${module}] No classId found for "${className}", cannot fetch from API`);
                students = [];
            }
        } else {
            console.log(`[${module}] Loaded ${students.length} students from localStorage for class:`, className);
        }

        // Clear loading state
        listEl.innerHTML = '';

        console.log('[Class Overlay Render] Computed class students', {
            className,
            selectedClassId,
            resultCount: students?.length || 0,
            classStudents: students,
            studentsSource: students?.length > 0 ? (students[0] ? 'localStorage or API' : 'unknown') : 'none'
        });

        // Render students if we have any
        if (students && students.length > 0) {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.padding = '0';
            ul.style.margin = '0';

            students.forEach(student => {
                const li = document.createElement('li');
                li.className = 'list-item';
                const studentId = student.faculty_number || student.facultyNumber;
                li.dataset.studentId = studentId;

                const wrap = document.createElement('div');
                wrap.className = 'student-card-text';

                const nameEl = document.createElement('span');
                nameEl.className = 'student-name';
                nameEl.textContent = student.full_name || student.fullName;

                const facEl = document.createElement('span');
                facEl.className = 'student-fac';
                facEl.textContent = student.faculty_number || student.facultyNumber;

                wrap.appendChild(nameEl);
                wrap.appendChild(facEl);
                li.appendChild(wrap);
                li.addEventListener('click', () => openStudentInfoOverlay(studentId, className));

                ul.appendChild(li);
            });

            listEl.appendChild(ul);
            return;
        }

        // Fallback to in-memory id set if no students from storage/API
        const assignments = getClassStudentAssignments(className);
        
        console.log('[Class Overlay Render] Checking in-memory assignments fallback', {
            className,
            assignments,
            assignmentsSize: assignments?.size || 0,
            assignmentsType: assignments?.constructor?.name
        });
        
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
            await openAddStudentsToClass(current.name);
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
    console.log('[Class Overlay Open] Opening manage students overlay', {
        className,
        timestamp: new Date().toISOString()
    });
    
    ensureManageStudentsOverlayInitialized();

    const current = getCurrentClass();
    console.log('[Class Overlay Open] Current class before set', {
        name: current.name,
        id: current.id,
        idType: typeof current.id
    });
    
    setCurrentClass(className, current.id, current.button);
    
    const currentAfterSet = getCurrentClass();
    console.log('[Class Overlay Open] Current class after set', {
        name: currentAfterSet.name,
        id: currentAfterSet.id,
        idType: typeof currentAfterSet.id
    });

    // Hide ready overlay to avoid stacking
    const readyPopupOverlay = getOverlay('readyClassPopupOverlay');
    if (readyPopupOverlay) hideOverlay(readyPopupOverlay);

    // Title reflect class name
    const overlay = getManageStudentsOverlay();
    const titleEl = overlay?.querySelector('#manageStudentsTitle');
    if (titleEl) titleEl.textContent = `Manage Students — ${className}`;

    // Show overlay immediately (renderManageStudentsForClass will show loading state)
    if (overlay) {
        console.log('[Class Overlay Open] Showing overlay, will render students list');
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

        alert('Student removed from class successfully.');
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
    const listEl = getAddStudentsListEl();
    if (!listEl) return;

    const q = (query || '').trim().toLowerCase();
    const items = listEl.querySelectorAll('li.list-item');

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

/**
 * Filter by dropdown selects (stub - only uses search)
 */
function filterAddStudentsListBySelects(levelValue, facultyValue, specializationValue, groupValue, searchInputValue) {
    filterAddStudentsList(searchInputValue);
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

    const listEl = getAddStudentsListEl();
    if (listEl) {
        const items = listEl.querySelectorAll('li.list-item');
        items.forEach(li => li.style.display = '');
    }
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

    searchInput?.addEventListener('input', (e) => filterAddStudentsList(e.target.value));

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

/**
 * Open add students to class overlay
 * @param {string} className - Class name
 */
export async function openAddStudentsToClass(className) {
    closeManageStudentsOverlay();

    if (!className) return;

    ensureAddStudentsOverlayInitialized();

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
    searchInput?.focus();
}

/**
 * Close add students to class overlay
 */
function closeAddStudentsToClass() {
    const overlay = getAddStudentsClassOverlay();
    if (overlay) hideOverlay(overlay, false);
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
async function renderAddStudentsList(className) {
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

    // Read all students from shared state first
    console.log('[Render Add Students] Preparing to get all students', {
        className,
        classId,
        classStudentsCount: classStudents?.length || 0
    });
    
    // Check shared state first
    allStudents = getAllStudents();
    const currentClass = getCurrentClass();
    
    console.log('[Render Add Students] Checking shared state for all students', {
        className,
        selectedClassId: currentClass.id,
        allStudentsInState: allStudents,
        countInState: allStudents?.length || 0,
        source: allStudents ? 'shared state' : 'not cached'
    });
    
    // If not in shared state, fetch and store
    if (!allStudents || !Array.isArray(allStudents) || allStudents.length === 0) {
        console.log('[Render Add Students] All students not in shared state, fetching...');
        try {
            allStudents = await fetchAllStudents();
            console.log('[Render Add Students] All students fetched and stored in shared state:', {
                count: allStudents?.length || 0,
                sampleStudent: allStudents?.[0] || null,
                source: 'API -> shared state'
            });
        } catch (e) {
            console.error('[Render Add Students] Failed to fetch all students:', e);
            fetchError = true;
            allStudents = [];
        }
    } else {
        console.log('[Render Add Students] Using all students from shared state cache:', {
            count: allStudents.length,
            source: 'shared state cache'
        });
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

    // Show empty state message if class has no assigned students
    const emptyStateMsg = (!classStudents || classStudents.length === 0) ? (() => {
        const msg = document.createElement('p');
        msg.className = 'muted';
        msg.style.textAlign = 'center';
        msg.style.padding = '10px 0';
        msg.style.marginBottom = '10px';
        msg.textContent = 'No students assigned to this class yet. Select students below to add them.';
        return msg;
    })() : null;

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

    // Append empty state message (if present) and student list
    if (emptyStateMsg) {
        listEl.appendChild(emptyStateMsg);
    }
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
        const studentInfo = getStudentInfoForFacultyNumber(facultyNumber, studentsFromDatabase);

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

    const classId = getClassIdByName(className);
    if (classId && newlyAddedStudents.length > 0) {
        try {
            const response = await addStudentsToClass(classId, newlyAddedStudents);
            console.log('[finalizeAddStudentsToClass] Students added to class (request sent)', {
                className,
                classId,
                status: response.status,
                studentsCount: newlyAddedStudents.length
            });
            
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
                
                console.log('[finalizeAddStudentsToClass] Verified students after insert', {
                    className,
                    classId,
                    verifiedCount: verifiedStudents?.length || 0,
                    expectedCount: newlyAddedStudents.length
                });
                
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
