/**
 * API Configuration Module
 * 
 * Centralizes API endpoint definitions and server configuration.
 * Provides helper functions for accessing API-related constants.
 */

// Server base URL for all API calls
export const SERVER_BASE_URL = 'https://studentcheck-server.onrender.com';

// API endpoint paths
export const ENDPOINTS = {
    createClass: '/classes',
    deleteClass: '/classes',
    updateClass: '/classes',
    attendance: '/attendance',
    class_students: '/class_students',
    students: '/students',
    updateCompletedClassesCount: '/update_completed_classes_count',
    saveStudentTimestamps: '/save_student_timestamps',
    // Fixed: Added missing endpoint for class attendance summary
    classAttendanceSummary: (classId) => `/attendance/summary?class_id=${classId}`,
    attendanceTimestamps: (classId) => `/attendance/timestamps?class_id=${classId}`,
    attendanceHistory: (classId, studentId, facultyNumber) => {
        const params = new URLSearchParams();
        if (classId) params.append('class_id', classId);
        if (studentId) params.append('student_id', studentId);
        if (facultyNumber) params.append('faculty_number', facultyNumber);
        return `/attendance/history?${params.toString()}`;
    },
    getStudentAttendanceCount: (classId, studentId) =>
        `/get_student_attendance_count?class_id=${classId}&student_id=${studentId}`
};

/**
 * Get the current teacher's email from localStorage
 * @returns {string|null} Teacher email or null if not found
 */
export function getTeacherEmail() {
    const email = localStorage.getItem('teacherEmail') || null;
    if (!email) {
        console.error('No teacher email found in localStorage for session.');
    }
    return email;
}

/**
 * Normalize email address (trim and lowercase)
 * @param {string} email - Email to normalize
 * @returns {string} Normalized email
 */
export function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
}
