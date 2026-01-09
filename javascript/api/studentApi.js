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
    try {
        const result = await fetch(`${SERVER_BASE_URL + ENDPOINTS.students}`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        });

        if (result.ok) {
            const data = await result.json();
            const students = data.students || data || [];
            console.log('[fetchAllStudents] Students fetched from server:', students);
            return Array.isArray(students) ? students : [];
        } else {
            console.error('[fetchAllStudents] Server returned error:', result.status, result.statusText);
            throw new Error(`Failed to fetch students: ${result.status} ${result.statusText}`);
        }
    } catch (e) {
        console.error('[fetchAllStudents] Fetch error:', e);
        throw e; // Re-throw to allow caller to handle
    }
}
