/**
 * Export Feature Module
 * 
 * Handles attendance table export to XLSX format.
 */

import { getActiveClassName } from '../utils/helpers.js';
import { getClassIdByNameFromStorage } from '../storage/classStorage.js';
import { loadClassStudentsFromStorage } from '../storage/studentStorage.js';
import { fetchClassStudents } from '../api/classApi.js';

// Cache for XLSX load promise
let xlsxLoadPromise = null;

/**
 * Ensure XLSX library is loaded
 * @returns {Promise<Object>} XLSX library object
 */
function ensureXlsxLoaded() {
    if (window.XLSX && window.XLSX.utils) return Promise.resolve(window.XLSX);
    if (xlsxLoadPromise) return xlsxLoadPromise;
    const sources = [
        'javascript/xlsx.full.min.js',
        '/javascript/xlsx.full.min.js',
        './xlsx.full.min.js',
        '/xlsx.full.min.js',
        'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
        'https://unpkg.com/xlsx/dist/xlsx.full.min.js',
        'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
    ];
    xlsxLoadPromise = new Promise((resolve, reject) => {
        let i = 0;
        const tryNext = () => {
            if (i >= sources.length) {
                console.error('[Attendance Export] Failed to load XLSX library from all sources.');
                reject(new Error('XLSX load failure'));
                return;
            }
            const src = sources[i++];
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => {
                if (window.XLSX) {
                    resolve(window.XLSX);
                } else {
                    tryNext();
                }
            };
            script.onerror = () => {
                script.remove();
                tryNext();
            };
            document.head.appendChild(script);
        };
        tryNext();
    });
    return xlsxLoadPromise;
}

/**
 * Format timestamp to "YYYY-MM-DD HH:MM"
 * @param {number} ms - Timestamp in milliseconds
 * @returns {string} Formatted date string
 */
function formatDateTime(ms) {
    if (!ms && ms !== 0) return '';
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

/**
 * Load attendance log for a student (stub - returns empty array)
 * @param {string} className - Class name
 * @param {string} studentId - Student ID
 * @returns {Array} Empty array (attendance logs not implemented)
 */
function loadAttendanceLog(className, studentId) {
    // TODO: Implement attendance log loading from server/storage
    return [];
}

/**
 * Collect attendance entries for a class
 * @param {string} className - Class name
 * @returns {Array<Object>} Array of attendance entries
 */
async function collectAttendanceEntriesForClass(className) {
    // Fixed: Get classId first, then load students
    const classId = getClassIdByNameFromStorage(className);
    let students = loadClassStudentsFromStorage(className);
    
    // If not in storage, fetch from API
    if (!students || students.length === 0) {
        if (classId) {
            students = await fetchClassStudents(classId, className);
        }
    }
    
    if (!students || students.length === 0) {
        return [];
    }
    
    const entries = [];
    students.forEach((s) => {
        const studentId = (s.facultyNumber || s.faculty_number || s.fullName || '').trim();
        if (!studentId) {
            console.warn('[Attendance Export] Skipping student with missing ID.');
            return;
        }
        const logs = loadAttendanceLog(className, studentId) || [];
        logs.forEach(sess => {
            if (!sess) return;
            const joinMs = sess.joinAt || sess.leaveAt || null;
            const leaveMs = sess.leaveAt || sess.joinAt || null;
            if (!joinMs) return;
            entries.push({
                studentName: s.fullName || s.full_name || '',
                facultyNumber: s.facultyNumber || s.faculty_number || '',
                joinedAt: joinMs,
                leftAt: leaveMs
            });
        });
    });
    return entries;
}

/**
 * Sort attendance entries by join time, then name
 * @param {Array<Object>} entries - Attendance entries
 * @returns {Array<Object>} Sorted entries
 */
function sortAttendanceEntries(entries) {
    entries.sort((a, b) => {
        const aDate = new Date(a.joinedAt);
        const bDate = new Date(b.joinedAt);
        const diff = aDate - bDate;
        if (diff !== 0) return diff;
        return (a.studentName || '').localeCompare(b.studentName || '');
    });
    return entries;
}

/**
 * Build worksheet data array
 * @param {Array<Object>} entries - Attendance entries
 * @returns {Array<Array>} Worksheet data (rows)
 */
function buildWorksheetData(entries) {
    const header = ['Student Name', 'Faculty Number', 'Joined Time', 'Left Time'];
    return [header, ...entries.map(e => [
        e.studentName,
        e.facultyNumber,
        formatDateTime(e.joinedAt),
        formatDateTime(e.leftAt)
    ])];
}

/**
 * Generate and download attendance XLSX file
 * @param {string} className - Class name
 * @param {Array<Object>} entries - Attendance entries
 */
async function generateAndDownloadAttendanceXlsx(className, entries) {
    const XLSX = await ensureXlsxLoaded().catch(err => {
        console.error('[Attendance Export] XLSX load failed. Cannot generate .xlsx.', err);
        return null;
    });
    if (!XLSX) {
        alert('Unable to load XLSX library. Attendance export failed.');
        return;
    }
    const wsData = buildWorksheetData(entries);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const safeClass = (className || 'class').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'class';
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const filename = `attendance_export_${safeClass}_${yyyy}-${mm}-${dd}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/**
 * Handle download attendance table
 * @param {string} className - Class name (optional)
 */
export async function handleDownloadAttendanceTable(className) {
    const resolvedNow = getActiveClassName();
    const targetClass = (className || resolvedNow || '').trim();
    if (!targetClass) {
        console.warn('[Attendance Export] No class selected. Aborting export.');
        alert('Select a class first.');
        return;
    }
    const entries = await collectAttendanceEntriesForClass(targetClass);
    const sorted = sortAttendanceEntries(entries);
    await generateAndDownloadAttendanceXlsx(targetClass, sorted);
}
