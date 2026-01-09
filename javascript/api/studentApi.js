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
            console.log('[fetchAllStudents] RAW response:', data);
            
            const students = data.students || data || [];
            console.log('[fetchAllStudents] Parsed students:', students);
            console.log('[fetchAllStudents] Students count:', students?.length);
            
            const finalStudents = Array.isArray(students) ? students : [];
            console.log('[fetchAllStudents] Final students array:', {
                count: finalStudents.length,
                sampleStudent: finalStudents[0] || null,
                sampleStudentKeys: finalStudents[0] ? Object.keys(finalStudents[0]) : []
            });
            
            // Note: fetchAllStudents returns data but does not write to global state
            // Callers are responsible for storing the returned array
            console.log('[fetchAllStudents] Returning students array (not stored in global state)');
            
            return finalStudents;
        } else {
            console.error('[fetchAllStudents] Server returned error:', result.status, result.statusText);
            throw new Error(`Failed to fetch students: ${result.status} ${result.statusText}`);
        }
    } catch (e) {
        console.error('[fetchAllStudents] Fetch error:', e);
        throw e; // Re-throw to allow caller to handle
    }
}
