/**
 * Student API Module
 * 
 * Handles all student-related API calls to the server.
 * Pure functions that return promises.
 */

import { SERVER_BASE_URL, ENDPOINTS } from '../config/api.js';

/**
 * Fetch all students from the database
 * @returns {Promise<Array<Object>>} Array of student objects
 */
export async function fetchAllStudents() {
    console.log('[fetchAllStudents] Fetching all students from server...');
    const result = await fetch(`${SERVER_BASE_URL + ENDPOINTS.students}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    });

    if (result.ok) {
        const data = await result.json();
        const students = data.students;
        console.log('[fetchAllStudents] Students fetched from server:', students);
        return students;
    }

    return [];
}
