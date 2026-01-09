/**
 * Utility Helpers Module
 * 
 * Pure utility functions with no side effects.
 * These functions are stateless and can be used anywhere.
 */

import { getCurrentClass } from '../state/appState.js';

/**
 * Get the active class name from multiple sources (button, title, or state)
 * @returns {string} Active class name or empty string
 */
export function getActiveClassName() {
    const current = getCurrentClass();
    
    // Prefer currentClassButton dataset
    if (current.button) {
        const fromBtn = (current.button.dataset.className || 
                        current.button.dataset.originalLabel || 
                        current.button.textContent || '')
            .replace(/✓\s*Ready/g, '')
            .trim();
        if (fromBtn) return fromBtn;
    }
    
    // Try ready popup title
    const titleEl = document.querySelector('#readyClassTitle');
    if (titleEl && titleEl.textContent) {
        const fromTitle = titleEl.textContent.replace(/✓\s*Ready/g, '').trim();
        if (fromTitle) return fromTitle;
    }
    
    // Fallback to global currentClassName
    return (current.name || '').trim();
}

/**
 * Get normalized class name text from a class button
 * Purpose: Centralizes extraction from dataset/text and removes the "✓ Ready" suffix.
 * @param {HTMLElement} button - Class button element
 * @returns {string} Raw class name without status suffix
 */
export function getRawClassNameFromButton(button) {
    if (!button) return '';
    return (button.dataset.className || button.dataset.originalLabel || button.textContent || '')
        .replace(/✓\s*Ready/g, '')
        .trim();
}

/**
 * Error Handling Utilities
 * Centralized error logging and safe error message extraction.
 */

/**
 * Log an error with consistent formatting and context
 * @param {string} context - Context description (e.g., "closeScannerConfirm", "fetchClassStudents")
 * @param {Error|any} error - The error object
 * @param {Object} extra - Optional extra context data
 */
export function logError(context, error, extra = {}) {
    const message = error?.message || String(error);
    const stack = error?.stack;
    const extraStr = Object.keys(extra).length > 0 ? ` | Extra: ${JSON.stringify(extra)}` : '';
    console.error(`[${context}] Error: ${message}${extraStr}`, stack || '');
}

/**
 * Extract a safe user-friendly message from an error
 * @param {Error|any} error - The error object
 * @returns {string} Safe error message
 */
export function asUserMessage(error) {
    if (!error) return 'An unexpected error occurred';
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    return 'An unexpected error occurred';
}

/**
 * Check if error is an abort error (e.g., fetch abort)
 * @param {Error|any} error - The error object
 * @returns {boolean} True if abort error
 */
export function isAbortError(error) {
    return error?.name === 'AbortError' || error?.message?.includes('abort');
}

/**
 * Check if error is camera-related
 * @param {Error|any} error - The error object
 * @returns {boolean} True if camera error
 */
export function isCameraError(error) {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('camera') || 
           message.includes('permission') || 
           message.includes('notallowed') ||
           message.includes('notreadable');
}

/**
 * Serializes a timestamp to ISO 8601 string format for API requests.
 * Converts numbers (milliseconds) to ISO strings, handles null/undefined by returning undefined.
 * @param {number|Date|string|null|undefined} timestamp - Timestamp as number (ms), Date object, ISO string, or null/undefined
 * @returns {string|undefined} ISO 8601 string or undefined (never null)
 */
export function serializeTimestamp(timestamp) {
    if (timestamp === null || timestamp === undefined) {
        return undefined; // Return undefined instead of null to allow field omission
    }
    
    // If already a string, assume it's valid ISO format
    if (typeof timestamp === 'string') {
        return timestamp;
    }
    
    // If it's a number (milliseconds), convert to Date then ISO string
    if (typeof timestamp === 'number') {
        return new Date(timestamp).toISOString();
    }
    
    // If it's a Date object, convert to ISO string
    if (timestamp instanceof Date) {
        return timestamp.toISOString();
    }
    
    // Fallback: try to convert to number then to ISO
    const num = Number(timestamp);
    if (!isNaN(num)) {
        return new Date(num).toISOString();
    }
    
    // If we can't serialize, return undefined
    return undefined;
}
