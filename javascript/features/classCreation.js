/**
 * Class Creation Feature Module
 * 
 * Handles the 2-slide class creation wizard:
 * Slide 1: Class name input
 * Slide 2: Student selection with search/filter
 */

import { createClass } from '../api/classApi.js';
import { fetchAllStudents } from '../api/studentApi.js';
import {
    getWizardSelections,
    clearWizardSelections,
    getWizardClassName,
    setWizardClassName,
    getWizardStudentIndex,
    setWizardStudentIndex,
    setClassId,
    setClassReady,
    setClassStudentAssignments,
    ensureClassStudentAssignments
} from '../state/appState.js';
import { showOverlay, hideOverlay, getOverlay } from '../ui/overlays.js';
import { renderClassItem, updateClassStatusUI, flashReadyBadge } from '../ui/classUI.js';
import { getTeacherEmail } from '../config/api.js';

const WIZARD_TOTAL_SLIDES = 2;
let createClassSlideIndex = 0;
let createClassFiltersInitialized = false;

// DOM references (cached on first access)
function getCreateClassOverlay() { return getOverlay('createClassOverlay'); }
function getCreateClassSlideTrack() { return document.getElementById('createClassSlidesTrack'); }
function getCreateClassNameInput() { return document.getElementById('createClassNameInput'); }
function getCreateClassErrorName() { return document.getElementById('createClassErrorName'); }
function getCreateClassBackBtn() { return document.getElementById('createClassBackBtn'); }
function getCreateClassNextBtn() { return document.getElementById('createClassNextBtn'); }
function getCreateClassFinishBtn() { return document.getElementById('createClassFinishBtn'); }
function getCreateClassStudentContainer() { return document.getElementById('createClassStudentsBody'); }
function getCreateClassCloseBtn() { return document.getElementById('createClassCloseBtn'); }
function getCreateClassSearchInput() { return document.getElementById('createClassSearchInput'); }

/**
 * Navigate to a specific slide in the wizard
 * @param {number} index - Slide index (0 or 1)
 */
function goToSlide(index) {
    createClassSlideIndex = index;
    const slideTrack = getCreateClassSlideTrack();
    if (!slideTrack) return;
    
    const slides = Array.from(slideTrack.querySelectorAll('.slide'));
    slides.forEach(sl => sl.classList.toggle('active', Number(sl.dataset.index) === index));
    
    const backBtn = getCreateClassBackBtn();
    const nextBtn = getCreateClassNextBtn();
    const finishBtn = getCreateClassFinishBtn();
    
    if (backBtn) {
        backBtn.style.display = index === 0 ? 'none' : 'inline-block';
        backBtn.disabled = index === 0;
    }
    
    if (index < WIZARD_TOTAL_SLIDES - 1) {
        if (nextBtn) nextBtn.style.display = 'inline-block';
        if (finishBtn) finishBtn.classList.add('finish-hidden');
    } else {
        if (nextBtn) nextBtn.style.display = 'none';
        if (finishBtn) finishBtn.classList.remove('finish-hidden');
    }
    
    const actionsContainer = document.getElementById('wizardActions');
    if (actionsContainer) {
        if (index === 0) actionsContainer.classList.add('single-right');
        else actionsContainer.classList.remove('single-right');
    }
    
    const container = getCreateClassStudentContainer();
    if (index === 1 && container && container.dataset.loaded !== 'true') {
        loadStudentsIntoWizard();
    }
    
    // Focus appropriate input
    requestAnimationFrame(() => {
        if (index === 0) {
            getCreateClassNameInput()?.focus();
        } else if (index === 1) {
            getCreateClassSearchInput()?.focus();
        }
    });
}

/**
 * Handle "Next" button click (validate name and advance)
 */
function handleWizardNext() {
    const nameInput = getCreateClassNameInput();
    const errorEl = getCreateClassErrorName();
    
    if (!nameInput || !errorEl) return;
    
    const name = nameInput.value.trim();
    if (!name) {
        errorEl.textContent = 'Name is required.';
        nameInput.focus();
        return;
    }
    errorEl.textContent = '';
    setWizardClassName(name);
    goToSlide(1);
}

/**
 * Collect class name from wizard
 * @returns {string} Class name
 */
function collectClassName() {
    return getWizardClassName().trim();
}

/**
 * Collect selected student IDs from wizard
 * @returns {Array<string>} Array of student IDs
 */
function collectSelectedStudents() {
    return Array.from(getWizardSelections());
}

/**
 * Submit new class creation
 */
async function submitNewClass() {
    const className = collectClassName();
    if (!className) {
        alert('Class name missing.');
        goToSlide(0);
        return;
    }

    const selectedIds = collectSelectedStudents();
    if (selectedIds.length === 0) {
        if (!confirm('No students selected. Create an empty ready class?')) return;
    }

    const finishBtn = getCreateClassFinishBtn();
    if (finishBtn) {
        finishBtn.disabled = true;
        finishBtn.textContent = 'Creating...';
    }

    const teacherEmail = getTeacherEmail();
    
    try {
        const data = await createClass(className, selectedIds, teacherEmail);
        const newClassId = data.class_id || data.id;
        
        // Update state
        setClassId(className, newClassId);
        setClassReady(className, true);
        setClassStudentAssignments(className, new Set(selectedIds));
        
        // Render class button
        const classList = document.getElementById('classList');
        if (classList) {
            renderClassItem(className, newClassId, classList, null, null);
        }
        
        // Update button UI
        const btn = Array.from(document.querySelectorAll('.newClassBtn')).find(b => {
            const btnName = (b.dataset.className || b.dataset.originalLabel || b.textContent || '').trim();
            return btnName === className;
        });
        if (btn) {
            btn.dataset.classId = newClassId;
            updateClassStatusUI(btn);
            flashReadyBadge(btn);
        }
        
        closeClassCreationWizard();
    } catch (err) {
        console.error('[Class Creation] API failure', err);
        alert('Failed to create class: ' + (err.message || err));
    } finally {
        if (finishBtn) {
            finishBtn.disabled = false;
            finishBtn.textContent = 'Finish';
        }
        clearWizardSelections();
        setWizardClassName('');
    }
}

/**
 * Load students into wizard (slide 2)
 */
async function loadStudentsIntoWizard() {
    const container = getCreateClassStudentContainer();
    if (!container) return;
    
    container.innerHTML = '<p class="loading-hint">Loading...</p>';
    
    try {
        const students = await fetchAllStudents();
        container.innerHTML = '';
        renderStudentsInWizard(students);
        container.dataset.loaded = 'true';
        ensureCreateClassFiltersInitialized();
    } catch (e) {
        console.error('Wizard student fetch failed', e);
        container.innerHTML = '<p style="color:#b91c1c;">Network error loading students.</p>';
    }
}

/**
 * Render students in wizard with checkboxes
 * @param {Array<Object>} students - Array of student objects
 */
function renderStudentsInWizard(students) {
    const container = getCreateClassStudentContainer();
    if (!container) return;
    
    if (!Array.isArray(students) || students.length === 0) {
        container.innerHTML = '<p class="muted">No students found.</p>';
        return;
    }
    
    const list = document.createElement('ul');
    list.style.listStyle = 'none';
    list.style.margin = '0';
    list.style.padding = '0';
    
    const wizardSelections = getWizardSelections();
    const studentIndex = new Map();
    setWizardStudentIndex(studentIndex);
    
    students.forEach((s, idx) => {
        const li = document.createElement('li');
        li.className = 'list-item';
        const splitNames = (window.Students?.splitNames || (() => ({ fullName: '' })))(s);
        const facultyNumber = s.faculty_number;
        const studentId = (window.Students?.idForStudent
            ? window.Students.idForStudent(s, 'wizard', idx)
            : (facultyNumber || splitNames.fullName || `wizard_${idx}`));
        
        studentIndex.set(studentId, { fullName: splitNames.fullName, facultyNumber: facultyNumber || '' });
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'studentSelect';
        checkbox.id = `wizardStudent_${idx}`;
        
        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = `${splitNames.fullName} ${facultyNumber || ''}`.trim();
        
        li.appendChild(checkbox);
        li.appendChild(label);
        
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                wizardSelections.add(studentId);
                li.classList.add('selected');
            } else {
                wizardSelections.delete(studentId);
                li.classList.remove('selected');
            }
        });
        
        li.addEventListener('click', (e) => {
            if (e.target === checkbox || e.target.tagName === 'LABEL') return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        });
        
        if (wizardSelections.has(studentId)) {
            checkbox.checked = true;
            li.classList.add('selected');
        }
        
        list.appendChild(li);
    });
    
    container.innerHTML = '';
    container.appendChild(list);
}

/**
 * Filter students in wizard by search query
 * @param {string} query - Search query
 */
function filterStudentsWizard(query) {
    const container = getCreateClassStudentContainer();
    if (!container) return;
    
    const q = (query || '').trim().toLowerCase();
    const items = container.querySelectorAll('li.list-item');
    
    if (!q) {
        items.forEach(li => li.style.display = '');
        const msgEl = container.querySelector('#wizardNoMatch');
        if (msgEl) msgEl.style.display = 'none';
        return;
    }
    
    const tokens = q.split(/\s+/).filter(Boolean);
    items.forEach(li => {
        const text = li.textContent.toLowerCase();
        const matches = tokens.every(t => text.includes(t));
        li.style.display = matches ? '' : 'none';
    });
    
    // Show/hide "no match" message
    // Fixed: Changed wizardStudentContainer to createClassStudentContainer
    let msgEl = container.querySelector('#wizardNoMatch');
    if (!msgEl) {
        msgEl = document.createElement('p');
        msgEl.id = 'wizardNoMatch';
        msgEl.textContent = 'No matching students.';
        msgEl.style.display = 'none';
        msgEl.style.fontStyle = 'italic';
        msgEl.style.color = '#6b7280';
        container.appendChild(msgEl);
    }
    
    const anyVisible = Array.from(items).some(li => li.style.display !== 'none');
    msgEl.style.display = anyVisible ? 'none' : 'block';
}

/**
 * Filter students by dropdown selects (stub - only uses search for now)
 */
function filterCreateClassStudentsBySelects(levelValue, facultyValue, specializationValue, groupValue, searchInputValue) {
    // Currently only uses search input - dropdown filters not fully implemented
    filterStudentsWizard(searchInputValue);
}

/**
 * Reset all filters
 */
function resetCreateClassFilters() {
    const levelSelect = document.getElementById('createClassFilterLevel');
    const facultySelect = document.getElementById('createClassFilterFaculty');
    const specializationSelect = document.getElementById('createClassFilterSpecialization');
    const groupSelect = document.getElementById('createClassFilterGroup');
    const searchInput = getCreateClassSearchInput();
    
    if (levelSelect) levelSelect.value = '';
    if (facultySelect) facultySelect.value = '';
    if (specializationSelect) specializationSelect.value = '';
    if (groupSelect) groupSelect.value = '';
    if (searchInput) searchInput.value = '';
    
    const container = getCreateClassStudentContainer();
    if (container) {
        const items = container.querySelectorAll('li.list-item');
        items.forEach(li => li.style.display = '');
    }
}

/**
 * Ensure filter event listeners are initialized (idempotent)
 */
function ensureCreateClassFiltersInitialized() {
    if (createClassFiltersInitialized) return;
    createClassFiltersInitialized = true;
    
    const levelSelect = document.getElementById('createClassFilterLevel');
    const facultySelect = document.getElementById('createClassFilterFaculty');
    const specializationSelect = document.getElementById('createClassFilterSpecialization');
    const groupSelect = document.getElementById('createClassFilterGroup');
    const resetBtn = document.getElementById('createClassResetFiltersBtn');
    const searchInput = getCreateClassSearchInput();
    
    if (searchInput) {
        if (window.Utils && typeof window.Utils.debounce === 'function') {
            const debounced = window.Utils.debounce((value) => filterStudentsWizard(value), 180);
            searchInput.addEventListener('input', (e) => debounced(e.target.value));
        } else {
            let debounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => filterStudentsWizard(e.target.value), 180);
            });
        }
    }
    
    if (levelSelect) {
        levelSelect.addEventListener('change', () => {
            filterCreateClassStudentsBySelects(
                levelSelect.value,
                facultySelect?.value || '',
                specializationSelect?.value || '',
                groupSelect?.value || '',
                searchInput?.value || ''
            );
        });
    }
    
    if (facultySelect) {
        facultySelect.addEventListener('change', () => {
            filterCreateClassStudentsBySelects(
                levelSelect?.value || '',
                facultySelect.value,
                specializationSelect?.value || '',
                groupSelect?.value || '',
                searchInput?.value || ''
            );
        });
    }
    
    if (specializationSelect) {
        specializationSelect.addEventListener('change', () => {
            filterCreateClassStudentsBySelects(
                levelSelect?.value || '',
                facultySelect?.value || '',
                specializationSelect.value,
                groupSelect?.value || '',
                searchInput?.value || ''
            );
        });
    }
    
    if (groupSelect) {
        groupSelect.addEventListener('change', () => {
            filterCreateClassStudentsBySelects(
                levelSelect?.value || '',
                facultySelect?.value || '',
                specializationSelect?.value || '',
                groupSelect.value,
                searchInput?.value || ''
            );
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', resetCreateClassFilters);
    }
}

/**
 * Open class creation wizard
 */
export function openClassCreationWizard() {
    const overlay = getCreateClassOverlay();
    const closeBtn = getCreateClassCloseBtn();
    const backBtn = getCreateClassBackBtn();
    const nextBtn = getCreateClassNextBtn();
    const finishBtn = getCreateClassFinishBtn();
    const searchInput = getCreateClassSearchInput();
    
    if (!overlay) return;
    
    // Wire event listeners (idempotent - safe to call multiple times)
    if (closeBtn) {
        closeBtn.addEventListener('click', closeClassCreationWizard);
    }
    if (backBtn) {
        backBtn.addEventListener('click', () => goToSlide(0));
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', handleWizardNext);
    }
    if (finishBtn) {
        finishBtn.addEventListener('click', submitNewClass);
    }
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeClassCreationWizard();
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOverlayVisible(overlay)) {
            closeClassCreationWizard();
        }
    });
    
    if (searchInput) {
        if (window.Utils && typeof window.Utils.debounce === 'function') {
            const debounced = window.Utils.debounce((value) => filterStudentsWizard(value), 180);
            searchInput.addEventListener('input', (e) => debounced(e.target.value));
        } else {
            let debounceTimer = null;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => filterStudentsWizard(e.target.value), 180);
            });
        }
    }
    
    showOverlay(overlay);
    goToSlide(0);
    getCreateClassNameInput()?.focus();
}

/**
 * Close class creation wizard
 */
export function closeClassCreationWizard() {
    const overlay = getCreateClassOverlay();
    if (overlay) {
        hideOverlay(overlay);
    }
    clearWizardSelections();
    setWizardClassName('');
}

/**
 * Check if overlay is visible (helper)
 */
function isOverlayVisible(overlay) {
    return overlay && overlay.style.visibility === 'visible';
}
