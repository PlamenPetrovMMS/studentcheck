/**
 * Application State Management Module
 * 
 * Centralizes all shared application state (Maps, Sets, current selections).
 * Provides getters and setters for controlled state access.
 * All state mutations should go through this module.
 */

// Class ID lookup: className -> classId
const classIdByName = new Map();

// Attendance count cache: classId -> Map<studentId, count>
const attendanceCountCache = new Map();

// Classes with students assigned (ready for scanning)
const readyClasses = new Set();

// In-memory student assignments: className -> Set<studentIds>
const classStudentAssignments = new Map();

// Current class selection
let currentClassButton = null;
let currentClassName = '';
let currentClassId = '';

// Class creation wizard state
const wizardSelections = new Set();
let wizardClassName = '';
const wizardStudentIndex = new Map(); // id -> { fullName, facultyNumber }

// Student timestamp tracking: faculty_number -> { joined_at, left_at }
let studentTimestamps = new Map();

// Attendance state per class: Map<className, Map<studentId, 'none'|'joined'|'completed'>>
const attendanceState = new Map();

// UI dot index for attendance overlay: Map<studentId, HTMLElement>
let attendanceDotIndex = new Map();

// Scanner state
let currentScanMode = 'joining';
let html5QrCode = null;
let lastScanAt = 0;

// All students cache (shared across modules)
let allStudents = null;

// ========== Class ID Management ==========

/**
 * Get class ID by class name
 * @param {string} className - Class name
 * @returns {number|null} Class ID or null if not found
 */
export function getClassIdByName(className) {
    return classIdByName.get(className) || null;
}

/**
 * Set class ID for a class name
 * @param {string} className - Class name
 * @param {number} classId - Class ID
 */
export function setClassId(className, classId) {
    classIdByName.set(className, classId);
}

/**
 * Check if class ID exists for a class name
 * @param {string} className - Class name
 * @returns {boolean} True if class ID exists
 */
export function hasClassId(className) {
    return classIdByName.has(className);
}

// ========== Attendance Count Cache ==========

/**
 * Get attendance count cache for a class
 * @param {number} classId - Class ID
 * @returns {Map<studentId, count>|undefined} Attendance count map
 */
export function getAttendanceCountCache(classId) {
    return attendanceCountCache.get(classId);
}

/**
 * Set attendance count cache for a class
 * @param {number} classId - Class ID
 * @param {Map<studentId, count>} counts - Attendance count map
 */
export function setAttendanceCountCache(classId, counts) {
    attendanceCountCache.set(classId, counts);
}

// ========== Ready Classes Management ==========

/**
 * Check if a class is ready (has students assigned)
 * @param {string} className - Class name
 * @returns {boolean} True if class is ready
 */
export function isClassReady(className) {
    return readyClasses.has(className);
}

/**
 * Mark a class as ready or not ready
 * @param {string} className - Class name
 * @param {boolean} ready - Ready state
 */
export function setClassReady(className, ready) {
    if (ready) {
        readyClasses.add(className);
    } else {
        readyClasses.delete(className);
    }
}

/**
 * Get all ready class names
 * @returns {Set<string>} Set of ready class names
 */
export function getReadyClasses() {
    return readyClasses;
}

// ========== Class Student Assignments ==========

/**
 * Get student assignments for a class
 * @param {string} className - Class name
 * @returns {Set<studentId>|undefined} Set of student IDs
 */
export function getClassStudentAssignments(className) {
    return classStudentAssignments.get(className);
}

/**
 * Set student assignments for a class
 * @param {string} className - Class name
 * @param {Set<studentId>} studentIds - Set of student IDs
 */
export function setClassStudentAssignments(className, studentIds) {
    classStudentAssignments.set(className, studentIds);
}

/**
 * Ensure class has an assignments set, create if missing
 * @param {string} className - Class name
 * @returns {Set<studentId>} Set of student IDs
 */
export function ensureClassStudentAssignments(className) {
    if (!classStudentAssignments.has(className)) {
        classStudentAssignments.set(className, new Set());
    }
    return classStudentAssignments.get(className);
}

/**
 * Add a student to class assignments
 * @param {string} className - Class name
 * @param {string} studentId - Student ID
 */
export function addStudentToClass(className, studentId) {
    const set = ensureClassStudentAssignments(className);
    set.add(studentId);
}

/**
 * Remove a student from class assignments
 * @param {string} className - Class name
 * @param {string} studentId - Student ID
 */
export function removeStudentFromClassAssignments(className, studentId) {
    const set = classStudentAssignments.get(className);
    if (set) {
        set.delete(studentId);
    }
}

// ========== Current Class Selection ==========

/**
 * Get current class selection
 * @returns {{button: HTMLElement|null, name: string, id: string}} Current class info
 */
export function getCurrentClass() {
    return {
        button: currentClassButton,
        name: currentClassName,
        id: currentClassId
    };
}

/**
 * Set current class selection
 * @param {string} name - Class name
 * @param {string} id - Class ID
 * @param {HTMLElement|null} button - Class button element
 */
export function setCurrentClass(name, id, button) {
    currentClassName = name || '';
    currentClassId = id || '';
    currentClassButton = button || null;
}

/**
 * Clear current class selection
 */
export function clearCurrentClass() {
    currentClassName = '';
    currentClassId = '';
    currentClassButton = null;
}

// ========== Wizard State ==========

/**
 * Get wizard selections
 * @returns {Set<studentId>} Set of selected student IDs
 */
export function getWizardSelections() {
    return wizardSelections;
}

/**
 * Clear wizard selections
 */
export function clearWizardSelections() {
    wizardSelections.clear();
}

/**
 * Get wizard class name
 * @returns {string} Wizard class name
 */
export function getWizardClassName() {
    return wizardClassName;
}

/**
 * Set wizard class name
 * @param {string} name - Class name
 */
export function setWizardClassName(name) {
    wizardClassName = name || '';
}

/**
 * Get wizard student index
 * @returns {Map<studentId, {fullName, facultyNumber}>} Student index map
 */
export function getWizardStudentIndex() {
    return wizardStudentIndex;
}

/**
 * Set wizard student index
 * @param {Map<studentId, {fullName, facultyNumber}>} index - Student index map
 */
export function setWizardStudentIndex(index) {
    wizardStudentIndex.clear();
    if (index instanceof Map) {
        index.forEach((value, key) => wizardStudentIndex.set(key, value));
    }
}

// ========== Student Timestamps ==========

/**
 * Get student timestamps map
 * @returns {Map<faculty_number, {joined_at, left_at}>} Timestamps map
 */
export function getStudentTimestamps() {
    return studentTimestamps;
}

/**
 * Set student timestamp
 * @param {string} facultyNumber - Faculty number
 * @param {number|null} joinedAt - Join timestamp (ms)
 * @param {number|null} leftAt - Leave timestamp (ms)
 */
export function setStudentTimestamp(facultyNumber, joinedAt, leftAt) {
    studentTimestamps.set(facultyNumber, {
        joined_at: joinedAt,
        left_at: leftAt
    });
}

/**
 * Get student timestamp
 * @param {string} facultyNumber - Faculty number
 * @returns {{joined_at: number|null, left_at: number|null}|undefined} Timestamp object
 */
export function getStudentTimestamp(facultyNumber) {
    return studentTimestamps.get(facultyNumber);
}

/**
 * Clear all student timestamps
 */
export function clearStudentTimestamps() {
    studentTimestamps.clear();
}

// ========== Attendance State ==========

/**
 * Get attendance state for a class
 * @param {string} className - Class name
 * @returns {Map<studentId, 'none'|'joined'|'completed'>|undefined} Attendance state map
 */
export function getAttendanceState(className) {
    return attendanceState.get(className);
}

/**
 * Ensure attendance state exists for a class
 * @param {string} className - Class name
 * @returns {Map<studentId, 'none'|'joined'|'completed'>} Attendance state map
 */
export function ensureAttendanceState(className) {
    if (!attendanceState.has(className)) {
        attendanceState.set(className, new Map());
    }
    return attendanceState.get(className);
}

/**
 * Clear attendance state for a class
 * @param {string} className - Class name
 */
export function clearAttendanceState(className) {
    attendanceState.delete(className);
}

// ========== Attendance Dot Index ==========

/**
 * Get attendance dot index
 * @returns {Map<studentId, HTMLElement>} Dot index map
 */
export function getAttendanceDotIndex() {
    return attendanceDotIndex;
}

/**
 * Set attendance dot index
 * @param {Map<studentId, HTMLElement>} index - Dot index map
 */
export function setAttendanceDotIndex(index) {
    attendanceDotIndex = index;
}

/**
 * Clear attendance dot index
 */
export function clearAttendanceDotIndex() {
    attendanceDotIndex = new Map();
}

// ========== Scanner State ==========

/**
 * Get current scan mode
 * @returns {'joining'|'leaving'} Scan mode
 */
export function getCurrentScanMode() {
    return currentScanMode;
}

/**
 * Set current scan mode
 * @param {'joining'|'leaving'} mode - Scan mode
 */
export function setCurrentScanMode(mode) {
    currentScanMode = (mode === 'leaving') ? 'leaving' : 'joining';
}

/**
 * Get Html5Qrcode instance
 * @returns {Html5Qrcode|null} QR code scanner instance
 */
export function getHtml5QrCode() {
    return html5QrCode;
}

/**
 * Set Html5Qrcode instance
 * @param {Html5Qrcode|null} instance - QR code scanner instance
 */
export function setHtml5QrCode(instance) {
    html5QrCode = instance;
}

/**
 * Get last scan timestamp
 * @returns {number} Last scan timestamp (ms)
 */
export function getLastScanAt() {
    return lastScanAt;
}

/**
 * Set last scan timestamp
 * @param {number} timestamp - Scan timestamp (ms)
 */
export function setLastScanAt(timestamp) {
    lastScanAt = timestamp;
}

// ========== All Students Cache ==========

/**
 * Get all students from shared cache
 * @returns {Array<Object>|null} Array of all students or null if not cached
 */
export function getAllStudents() {
    return allStudents;
}

/**
 * Set all students in shared cache
 * @param {Array<Object>} students - Array of all students
 */
export function setAllStudents(students) {
    allStudents = students;
        count: students?.length || 0,
        sampleStudent: students?.[0] || null
    });
}

/**
 * Clear all students cache
 */
export function clearAllStudents() {
    allStudents = null;
}
