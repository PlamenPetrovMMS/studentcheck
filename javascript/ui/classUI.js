/**
 * Class UI Module
 * 
 * Handles class button rendering and UI updates.
 * Manages class list display and status indicators.
 */

import { isClassReady, getCurrentClass } from '../state/appState.js';
import { getRawClassNameFromButton } from '../utils/helpers.js';

/**
 * Update class status UI (ready badge)
 * @param {HTMLElement} btn - Class button element
 */
export function updateClassStatusUI(btn) {
    const current = getCurrentClass();
    const button = btn || current.button;
    if (!button) return;
    const className = getRawClassNameFromButton(button);
    const isReady = isClassReady(className);
    if (isReady) {
        button.classList.add('class-ready');
    } else {
        button.classList.remove('class-ready');
    }
}

/**
 * Flash ready badge on a button
 * @param {HTMLElement} button - Class button element
 */
export function flashReadyBadge(button) {
    if (!button) return;
    const badge = document.createElement('div');
    badge.className = 'ready-badge';
    badge.textContent = '✓ Ready';
    button.appendChild(badge);
    setTimeout(() => {
        badge.remove();
    }, 2000);
}

/**
 * Attach click behavior to a class button
 * @param {HTMLElement} buttonEl - Class button element
 * @param {Function} onClickHandler - Click handler function
 */
export function attachNewClassButtonBehavior(buttonEl, onClickHandler) {
    if (!buttonEl) return;
    const animate = () => {
        buttonEl.classList.add('clicked');
        setTimeout(() => buttonEl.classList.remove('clicked'), 340);
    };
    buttonEl.addEventListener('mousedown', animate);
    buttonEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') animate();
    });
    buttonEl.addEventListener('click', (e) => {
        e.preventDefault();
        if (onClickHandler) onClickHandler(buttonEl);
    });
}

/**
 * Render a class item (button) in the class list
 * @param {string} name - Class name
 * @param {number} id - Class ID
 * @param {HTMLElement} classList - Class list container element
 * @param {Function} onClickHandler - Click handler function
 * @param {Function} loadStudentsFn - Function to preload students
 */
export function renderClassItem(name, id, classList, onClickHandler, loadStudentsFn) {
    const li = document.createElement('li');
    const btn = document.createElement('button');

    btn.className = 'newClassBtn';
    btn.textContent = name;
    btn.dataset.className = name;
    btn.dataset.originalLabel = name;

    attachNewClassButtonBehavior(btn, onClickHandler);

    li.appendChild(btn);
    classList?.appendChild(li);

    // Apply readiness if already stored
    if (isClassReady(name)) {
        updateClassStatusUI(btn);
    }

    // Preload students for this class
    if (loadStudentsFn) {
        loadStudentsFn(name, id);
    }
}

/**
 * Ensure classes container is visible
 */
export function ensureClassesContainerVisible() {
    const sec = document.getElementById('classesSection');
    if (!sec) return;
    const style = window.getComputedStyle(sec);
    if (style.display === 'none') {
        sec.style.display = 'flex';
    }
    const list = document.getElementById('classList');
    if (list) {
        const listStyle = window.getComputedStyle(list);
        if (listStyle.display === 'none') list.style.display = 'flex';
    }
}
