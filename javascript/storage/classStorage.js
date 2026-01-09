/**
 * Class Storage Module
 * 
 * Handles localStorage operations for class data.
 * Manages class maps, class IDs, and class item keys.
 */

import { normalizeEmail, getTeacherEmail } from '../config/api.js';

/**
 * Generate localStorage key for a class item
 * @param {string} className - Class name
 * @param {string|null} teacherEmail - Teacher email (optional, will fetch if not provided)
 * @returns {string|null} Storage key or null if email unavailable
 */
export function classItemKey(className, teacherEmail = null) {
    const email = teacherEmail || getTeacherEmail();
    if (!email) return null;
    const normEmail = normalizeEmail(email);
    return `teacher:class:${normEmail}:${encodeURIComponent(className)}`;
}

/**
 * Save classes map to localStorage
 * @param {Map<id, name>} classesMap - Map of class IDs to names
 */
export function saveClassesMap(classesMap) {
    try {
        localStorage.setItem('classesMap', JSON.stringify(Array.from(classesMap.entries())));
    } catch (e) {
        console.error('Error saving classes map:', e);
    }
}

/**
 * Get stored classes map from localStorage
 * @returns {Map<id, name>|null} Classes map or null if not found/error
 */
export function getStoredClassesMap() {
    try {
        const stored = localStorage.getItem('classesMap');
        if (!stored) return null;
        return new Map(JSON.parse(stored));
    } catch (e) {
        console.error('Error retrieving stored classesMap:', e);
        return null;
    }
}

/**
 * Get class ID by class name from localStorage
 * @param {string} className - Class name
 * @returns {number|null} Class ID or null if not found
 */
export function getClassIdByNameFromStorage(className) {
    const storedClassesMap = getStoredClassesMap();
    
    if (!storedClassesMap) {
        console.error('No stored classes map found.');
        return null;
    }
    
    for (const [id, name] of storedClassesMap.entries()) {
        if (name.trim() === className.trim()) {
            return id;
        }
    }
    
    console.error('Class ID not found for class name:', className);
    return null;
}
