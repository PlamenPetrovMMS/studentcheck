/**
 * Scanner Feature Module
 * 
 * Handles QR code scanner initialization and management.
 * Manages camera access and QR code scanning.
 */

import {
    getCurrentScanMode,
    setCurrentScanMode,
    getHtml5QrCode,
    setHtml5QrCode,
    getLastScanAt,
    setLastScanAt,
    getCurrentClass,
    clearStudentTimestamps,
    setStudentTimestamp
} from '../state/appState.js';
import { loadClassStudentsFromStorage } from '../storage/studentStorage.js';
import { initAttendanceStateForClass, handleScannedCode } from './attendance.js';
import { showOverlay, hideOverlay, getOverlay } from '../ui/overlays.js';

// Cache for html5-qrcode load promise
let html5qrcodeLoadPromise = null;

/**
 * Stop all camera tracks (safety cleanup)
 */
export function stopAllCameraTracks() {
    try {
        const videos = document.querySelectorAll('#qr-reader video, #cameraContainer video, video');
        videos.forEach(v => {
            try {
                const s = v.srcObject;
                if (s && typeof s.getTracks === 'function') {
                    s.getTracks().forEach(t => {
                        try { t.stop(); } catch (_) { }
                    });
                }
                v.srcObject = null;
            } catch (_) { }
        });
    } catch (_) { }
}

/**
 * Ensure html5-qrcode library is loaded
 * @returns {Promise<Object>} Html5Qrcode constructor
 */
function ensureHtml5QrcodeLoaded() {
    if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);
    if (html5qrcodeLoadPromise) return html5qrcodeLoadPromise;
    const sources = [
        'https://unpkg.com/html5-qrcode@latest/minified/html5-qrcode.min.js',
        'https://unpkg.com/html5-qrcode@latest/html5-qrcode.min.js',
        'https://cdn.jsdelivr.net/npm/html5-qrcode@latest/minified/html5-qrcode.min.js',
        'https://cdn.jsdelivr.net/npm/html5-qrcode@latest/html5-qrcode.min.js'
    ];
    html5qrcodeLoadPromise = new Promise((resolve, reject) => {
        const tryNext = (i) => {
            if (i >= sources.length) {
                reject(new Error('Failed to load html5-qrcode library'));
                return;
            }
            const script = document.createElement('script');
            script.src = sources[i];
            script.async = true;
            script.onload = () => resolve(window.Html5Qrcode);
            script.onerror = () => { script.remove(); tryNext(i + 1); };
            document.head.appendChild(script);
        };
        tryNext(0);
    });
    return html5qrcodeLoadPromise;
}

/**
 * Handle radio button change for scan mode
 * @param {'joining'|'leaving'} mode - Scan mode
 */
export function handleRadioChange(mode) {
    setCurrentScanMode(mode);
    const cam = document.getElementById('cameraContainer');
    if (cam) cam.setAttribute('data-mode', mode);
}

/**
 * Initialize scanner with QR code reader
 * @param {'joining'|'leaving'} mode - Scan mode
 * @param {string} className - Class name
 * @param {Function} onScanCallback - Callback for scanned codes
 * @returns {Promise<void>} Initialization promise
 */
export function initializeScanner(mode, className, onScanCallback) {
    const classStudents = loadClassStudentsFromStorage(className);
    initAttendanceStateForClass(className, classStudents);

    // Initialize student timestamps
    classStudents.forEach(student => {
        setStudentTimestamp(student.faculty_number, null, null);
    });

    return ensureHtml5QrcodeLoaded().then((Html5Qrcode) => {
        const container = document.getElementById('qr-reader');
        if (!container) {
            throw new Error('QR container not found');
        }

        const html5QrCode = new Html5Qrcode('qr-reader');
        setHtml5QrCode(html5QrCode);

        const onScanSuccess = (decodedText, decodedResult) => {
            const now = Date.now();
            const lastScan = getLastScanAt();
            if (now - lastScan > 300) {
                setLastScanAt(now);
                if (onScanCallback) {
                    const liveMode = getCurrentScanMode();
                    onScanCallback(decodedText, liveMode, className);
                }
            }
        };

        const onScanError = (errorMessage, error) => {
            // Ignore frequent decode errors
            return;
        };

        return html5QrCode.start(
            { facingMode: 'environment' },
            {
                fps: 24,
                qrbox: { width: 220, height: 220 },
                aspectRatio: 1.0,
                disableFlip: true
            },
            onScanSuccess,
            onScanError
        ).catch((e) => {
            console.error('Scanner initialization error:', e);
            if (container) {
                container.innerHTML = '<p style="color:#b91c1c; text-align:center;">Unable to start camera scanner.</p>';
            }
        });
    });
}

/**
 * Close scanner overlay
 * @param {Function} onClosed - Callback when closed
 * @returns {Promise<void>} Close promise
 */
export function closeScanner(onClosed) {
    const finish = () => {
        const scannerOverlay = getOverlay('scannerOverlay');
        if (scannerOverlay) hideOverlay(scannerOverlay);
        stopAllCameraTracks();
        try {
            if (typeof onClosed === 'function') onClosed();
        } catch (_) { }
    };

    const html5QrCode = getHtml5QrCode();
    if (html5QrCode) {
        return html5QrCode.stop().then(() => {
            html5QrCode.clear();
            setHtml5QrCode(null);
            finish();
        }).catch(() => {
            try {
                html5QrCode.clear();
            } catch (_) { }
            setHtml5QrCode(null);
            stopAllCameraTracks();
            finish();
        });
    } else {
        stopAllCameraTracks();
        finish();
        return Promise.resolve();
    }
}

/**
 * Set scan mode
 * @param {'joining'|'leaving'} mode - Scan mode
 */
export function setScanMode(mode) {
    setCurrentScanMode(mode);
    const cam = document.getElementById('cameraContainer');
    if (cam) cam.setAttribute('data-mode', mode);
}

/**
 * Open scanner overlay and start scanning
 * @param {string} className - Class name
 */
export function openScannerOverlay(className) {
    const scannerOverlay = getOverlay('scannerOverlay');
    const readyPopupOverlay = getOverlay('readyClassPopupOverlay');
    const current = getCurrentClass();
    
    if (!scannerOverlay) return;
    
    clearStudentTimestamps();
    
    const closeBtn = scannerOverlay.querySelector('#closeScannerBtn');
    closeBtn?.addEventListener('click', () => {
        const event = new CustomEvent('closeScannerDiscardRequested');
        document.dispatchEvent(event);
    });
    
    scannerOverlay.addEventListener('click', (e) => {
        // Prevent accidental close on backdrop
        return;
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && scannerOverlay.style.visibility === 'visible') {
            e.stopPropagation();
            e.preventDefault();
        }
    });
    
    const radios = scannerOverlay.querySelectorAll('input[name="scanMode"]');
    radios.forEach(r => r.addEventListener('change', (ev) => {
        const mode = ev.target.value === 'leaving' ? 'leaving' : 'joining';
        setScanMode(mode);
    }));
    
    const stopBtn = scannerOverlay.querySelector('#scannerStopBtn');
    stopBtn?.addEventListener('click', () => {
        const event = new CustomEvent('openAttendanceOverlay', { detail: { className: className || current.name } });
        document.dispatchEvent(event);
    });
    
    const closeActionBtn = scannerOverlay.querySelector('#scannerCloseBtn');
    closeActionBtn?.addEventListener('click', () => {
        const event = new CustomEvent('closeScannerRequested');
        document.dispatchEvent(event);
    });
    
    if (readyPopupOverlay) hideOverlay(readyPopupOverlay);
    
    const titleEl = scannerOverlay.querySelector('#scannerTitle');
    if (titleEl) {
        const displayName = (className || current.name || '').trim();
        titleEl.textContent = displayName;
    }
    
    setScanMode('joining');
    const joinRadio = scannerOverlay.querySelector('#scanJoin');
    const leaveRadio = scannerOverlay.querySelector('#scanLeave');
    if (joinRadio) joinRadio.checked = true;
    if (leaveRadio) leaveRadio.checked = false;
    
    showOverlay(scannerOverlay);
    
    initializeScanner('joining', className || current.name, (decodedText, mode, clsName) => {
        handleScannedCode(decodedText, mode, clsName, null);
    });
}
