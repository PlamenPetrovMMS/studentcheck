/**
 * Student API Module
 * 
 * Handles all student-related API calls to the server.
 * Pure functions that return promises.
 */

import { SERVER_BASE_URL, ENDPOINTS } from '../config/api.js';
import { setAllStudents, getAllStudents } from '../state/appState.js';

/**
 * Fetch all students from the database
 * @returns {Promise<Array<Object>>} Array of student objects
 */
export async function fetchAllStudents() {
    // Check shared state cache first
    const cached = getAllStudents();
    if (cached && Array.isArray(cached) && cached.length > 0) {
        console.log('[fetchAllStudents] Returning cached students', {
            count: cached.length,
            source: 'shared state cache'
        });
        return cached;
    }
    
    // Check localStorage as fallback before fetching
    try {
        const stored = localStorage.getItem('allStudents');
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
                console.log('[fetchAllStudents] Loading from localStorage', {
                    count: parsed.length,
                    source: 'localStorage'
                });
                setAllStudents(parsed);
                return parsed;
            }
        }
    } catch (e) {
        console.warn('[fetchAllStudents] Failed to load from localStorage:', e);
    }
    
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
            
            // CRITICAL: Store in shared state for use across modules
            setAllStudents(finalStudents);
            console.log('[fetchAllStudents] Students stored in shared state (appState.allStudents)');
            
            // Also cache in localStorage for persistence across page loads
            try {
                localStorage.setItem('allStudents', JSON.stringify(finalStudents));
                console.log('[fetchAllStudents] Students also cached in localStorage');
            } catch (e) {
                console.warn('[fetchAllStudents] Failed to cache in localStorage:', e);
            }
            
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
