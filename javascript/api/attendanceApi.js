/**
 * Attendance API Module
 * 
 * Handles all attendance-related API calls to the server.
 * Pure functions that return promises.
 */

import { SERVER_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Mark attendance for a student
 * @param {number} classId - Class ID
 * @param {string} studentId - Student ID
 * @returns {Promise<Object>} Response data
 */
export async function markAttendance(classId, studentId) {
    const res = await fetch(SERVER_BASE_URL + ENDPOINTS.attendance, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: classId, student_id: studentId })
    });
    if (!res.ok) throw new Error('Attendance mark failed');
    return res.json();
}

/**
 * Fetch class attendance summary
 * @param {number} classId - Class ID
 * @returns {Promise<{attendances: Array}|{items: Array}>} Attendance data
 */
export async function fetchClassAttendance(classId) {
    const res = await fetch(SERVER_BASE_URL + ENDPOINTS.classAttendanceSummary(classId), {
        headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('Attendance summary fetch failed');
    return res.json();
}

/**
 * Save attendance data for multiple students
 * @param {number} classId - Class ID
 * @param {Array<number>} studentIds - Array of student IDs
 * @returns {Promise<Response>} Fetch response
 */
export async function saveAttendanceData(classId, studentIds) {
    const response = await fetch(SERVER_BASE_URL + ENDPOINTS.attendance, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            class_id: classId,
            student_ids: studentIds
        })
    });

    if (response.ok) {
        console.log('[saveAttendanceData] Attendance data saved successfully.');
    } else {
        console.error('[saveAttendanceData] Failed to save attendance data. Status:', response.status);
    }

    return response;
}

/**
 * Save student timestamps to database
 * @param {number} classId - Class ID
 * @param {string} facultyNumber - Faculty number
 * @param {number|null} joinedAt - Join timestamp (ms)
 * @param {number|null} leftAt - Leave timestamp (ms)
 * @returns {Promise<Response>} Fetch response
 */
export async function saveStudentTimestamp(classId, facultyNumber, joinedAt, leftAt) {
    // Fixed: Added await keyword
    const response = await fetch(SERVER_BASE_URL + ENDPOINTS.saveStudentTimestamps, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            class_id: classId,
            faculty_number: facultyNumber,
            joined_at: joinedAt,
            left_at: leftAt
        })
    });
    return response;
}

/**
 * Update completed classes count
 * @param {number} classId - Class ID
 * @returns {Promise<Response>} Fetch response
 */
export async function updateCompletedClassesCount(classId) {
    const response = await fetch(SERVER_BASE_URL + ENDPOINTS.updateCompletedClassesCount, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            class_id: classId
        })
    });
    return response;
}
