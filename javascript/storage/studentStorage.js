/**
 * Student Storage Module
 * 
 * Handles localStorage operations for student data.
 * Manages per-class student lists stored in localStorage.
 */

/**
 * Save class students to localStorage
 * @param {string} className - Class name
 * @param {Array<Object>} students - Array of student objects
 */
export function saveClassStudents(className, students) {
    try {
        const key = `${className}:students`;
        localStorage.setItem(key, JSON.stringify(students));
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
        const students = JSON.parse(stored);
        return Array.isArray(students) ? students : null;
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
    console.log(`[addNewStudentsToStorage] Stored new students list for class "${className}" in localStorage.`);
}

/**
 * Get student info by faculty number from a list
 * @param {string} facultyNumber - Faculty number
 * @param {Array<Object>} studentsList - Array of student objects
 * @returns {Object|null} Student object or null if not found
 */
export function getStudentInfoForFacultyNumber(facultyNumber, studentsList) {
    if (!Array.isArray(studentsList)) return null;
    return studentsList.find(student => student.faculty_number === facultyNumber) || null;
}
