/**
 * Student Storage Module
 * 
 * Handles localStorage operations for student data.
 * Manages per-class student lists stored in localStorage.
 */

function looksLikeFacultyNumber(value) {
    const normalized = String(value || '').trim();
    return /^[A-Za-z0-9]{9}$/.test(normalized);
}

function decodeBase64Utf8(input) {
    try {
        const normalized = String(input || '').trim().replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const raw = atob(padded);
        const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (_) {
        return '';
    }
}

function decodeFacultyCandidate(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    if (looksLikeFacultyNumber(raw)) return raw;

    // Optional app-level hook.
    try {
        if (typeof window.decryptStudentFacultyNumber === 'function') {
            const decrypted = String(window.decryptStudentFacultyNumber(raw) || '').trim();
            if (looksLikeFacultyNumber(decrypted)) return decrypted;
        }
    } catch (_) {}

    // Optional object hook.
    try {
        if (window.StudentCrypto && typeof window.StudentCrypto.decryptFacultyNumber === 'function') {
            const decrypted = String(window.StudentCrypto.decryptFacultyNumber(raw) || '').trim();
            if (looksLikeFacultyNumber(decrypted)) return decrypted;
        }
    } catch (_) {}

    if (raw.toLowerCase().startsWith('enc:')) {
        const decoded = String(decodeBase64Utf8(raw.slice(4)) || '').trim();
        if (looksLikeFacultyNumber(decoded)) return decoded;
    }

    const decoded = String(decodeBase64Utf8(raw) || '').trim();
    if (looksLikeFacultyNumber(decoded)) return decoded;

    return '';
}

function studentFacultyCandidates(student) {
    return [
        student?.faculty_number,
        student?.facultyNumber,
        student?.faculty,
        student?.decrypted_faculty_number,
        student?.plain_faculty_number,
        student?.original_faculty_number,
        student?.encrypted_faculty_number,
        student?.faculty_number_encrypted
    ];
}

export function resolveStudentFacultyNumber(student) {
    if (!student || typeof student !== 'object') return '';
    const candidates = studentFacultyCandidates(student);

    for (const candidate of candidates) {
        const raw = String(candidate || '').trim();
        if (looksLikeFacultyNumber(raw)) return raw;
    }

    for (const candidate of candidates) {
        const decoded = decodeFacultyCandidate(candidate);
        if (decoded) return decoded;
    }

    const fallbackId = String(student?.id || student?.student_id || '').trim();
    return fallbackId || '';
}

function normalizeStudentRecord(student) {
    if (!student || typeof student !== 'object') return student;
    const facultyNumber = resolveStudentFacultyNumber(student);
    if (!facultyNumber) return { ...student };
    return {
        ...student,
        faculty_number: facultyNumber
    };
}

function normalizeStudents(students) {
    if (!Array.isArray(students)) return [];
    return students.map(normalizeStudentRecord);
}

/**
 * Save class students to localStorage
 * @param {string} className - Class name
 * @param {Array<Object>} students - Array of student objects
 */
export function saveClassStudents(className, students) {
    try {
        const key = `${className}:students`;
        const normalizedStudents = normalizeStudents(students);
        localStorage.setItem(key, JSON.stringify(normalizedStudents));
    } catch (e) {
        console.error(`Error saving class students for "${className}":`, e);
    }
}

/**
 * Load class students from localStorage
 * @param {string} className - Class name
 * @returns {Array<Object>|null} Array of student objects or null if not found/error
 */
export function loadClassStudentsFromStorage(className) {
    try {
        const key = `${className}:students`;
        const stored = localStorage.getItem(key);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return null;

        const normalizedStudents = normalizeStudents(parsed);
        try {
            const before = JSON.stringify(parsed);
            const after = JSON.stringify(normalizedStudents);
            if (before !== after) {
                localStorage.setItem(key, after);
            }
        } catch (_) {}

        return normalizedStudents;
    } catch (e) {
        console.error(`Error loading class students from storage for "${className}":`, e);
        return null;
    }
}

/**
 * Add new students to storage (replaces existing list)
 * @param {string} className - Class name
 * @param {Array<Object>} students - Array of student objects
 */
export function addNewStudentsToStorage(className, students) {
    saveClassStudents(className, students);
}

/**
 * Get student info by faculty number from a list
 * @param {string} facultyNumber - Faculty number
 * @param {Array<Object>} studentsList - Array of student objects
 * @returns {Object|null} Student object or null if not found
 */
export function getStudentInfoForFacultyNumber(facultyNumber, studentsList) {
    if (!Array.isArray(studentsList)) return null;
    const target = String(facultyNumber || '').trim();
    if (!target) return null;
    return (
        studentsList.find(student => {
            const fac = resolveStudentFacultyNumber(student) || student?.id || student?.student_id;
            return String(fac || '').trim() === target;
        }) || null
    );
}
