/**
 * Class API Module
 * 
 * Handles all class-related API calls to the server.
 * Pure functions that return promises.
 */

import { SERVER_BASE_URL, ENDPOINTS, getTeacherEmail } from '../config/api.js';
import { saveClassesMap } from '../storage/classStorage.js';
import { saveClassStudents } from '../storage/studentStorage.js';

/**
 * Create a new class
 * @param {string} name - Class name
 * @param {Array<string>} studentIds - Array of student IDs
 * @param {string} teacherEmail - Teacher email
 * @returns {Promise<{class_id: number}>} Created class data
 */
export async function createClass(name, studentIds, teacherEmail) {
    console.log('[API] Creating class:', name, 'with students:', studentIds);
    const res = await fetch(SERVER_BASE_URL + ENDPOINTS.createClass, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, students: studentIds, teacherEmail })
    });
    if (!res.ok) throw new Error('Class create failed');
    return res.json();
}

/**
 * Fetch all classes for a teacher
 * @param {string} teacherEmail - Teacher email
 * @returns {Promise<{classes: Array<{id: number, name: string}>}>} Classes data
 */
export async function fetchClasses(teacherEmail) {
    if (!teacherEmail) {
        throw new Error('Teacher email is required');
    }
    
    const result = await fetch(
        `${SERVER_BASE_URL + ENDPOINTS.createClass}?teacherEmail=${encodeURIComponent(teacherEmail)}`,
        {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }
    );
    
    if (!result.ok) {
        throw new Error(`Failed to fetch classes: ${result.status} ${result.statusText}`);
    }
    
    const data = await result.json();
    return data;
}

/**
 * Fetch students for a class
 * @param {number} classId - Class ID
 * @param {string} className - Class name (for storage)
 * @returns {Promise<Array<Object>>} Array of student objects
 */
export async function fetchClassStudents(classId, className) {
    console.log('[fetchClassStudents] Fetching students for class', {
        classId,
        classIdType: typeof classId,
        className
    });
    
    const result = await fetch(
        `${SERVER_BASE_URL + ENDPOINTS.class_students}?class_id=${encodeURIComponent(classId)}`,
        {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        }
    );

    if (result.ok) {
        const data = await result.json();
        console.log('[fetchClassStudents] RAW response:', data);
        
        const students = data.students;
        console.log('[fetchClassStudents] Parsed students:', students);
        console.log('[fetchClassStudents] Students count:', students?.length);
        
        // Save to localStorage
        if (className) {
            console.log('[fetchClassStudents] Writing students to localStorage', {
                target: `localStorage["${className}:students"]`,
                count: students?.length
            });
            saveClassStudents(className, students);
        }
        
        console.log('[fetchClassStudents] Returning students array', {
            count: students?.length,
            sampleStudent: students?.[0] || null
        });
        
        return students;
    } else {
        console.error('[fetchClassStudents] Failed to fetch class students', {
            status: result.status,
            statusText: result.statusText,
            classId,
            className
        });
        return null;
    }
}

/**
 * Add students to a class
 * @param {number} classId - Class ID
 * @param {Array<Object>} students - Array of student objects
 * @returns {Promise<Response>} Fetch response
 */
export async function addStudentsToClass(classId, students) {
    const response = await fetch(`${SERVER_BASE_URL + ENDPOINTS.class_students}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            classId: classId,
            students: students
        })
    });

    if (response.ok) {
        console.log(`[addStudentsToClass] Successfully added students to class in the database.`);
    } else {
        console.error(`[addStudentsToClass] Failed to add students. Status:`, response.status);
    }
    
    return response;
}

/**
 * Remove a student from a class
 * @param {number} classId - Class ID
 * @param {string} facultyNumber - Student faculty number
 * @param {string} teacherEmail - Teacher email
 * @returns {Promise<{success: boolean}>} Response data
 */
export async function removeStudentFromClass(classId, facultyNumber, teacherEmail) {
    const requestBody = {
        class_id: classId,
        faculty_number: facultyNumber,
        teacherEmail: teacherEmail
    };

    const response = await fetch(`${SERVER_BASE_URL}/class_students/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
            const errorText = await response.text();
            console.error('[removeStudentFromClass] Error response text:', errorText);
        }
        throw new Error(errorMessage);
    }

    return await response.json();
}
