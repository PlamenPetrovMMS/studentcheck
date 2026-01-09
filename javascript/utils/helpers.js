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
