import { showOverlay, hideOverlay, getOverlay } from '../ui/overlays.js';
import { SERVER_BASE_URL } from '../config/api.js'; // Fallback if you use full URLs

export function initSupportChat() {
    const openBtn = document.getElementById('openSupportChatBtn');
    const closeBtn = document.getElementById('closeSupportChatBtn');
    const languageBtn = document.getElementById('supportChatLanguageBtn');
    const overlay = getOverlay('supportChatOverlay'); 
    const sendBtn = document.getElementById('sendChatBtn');
    const input = document.getElementById('chatInput');
    const historyContainer = document.getElementById('chatHistoryContainer');

    // We keep track of the history exactly as your backend expects it
    let chatHistory = [];
    let isSending = false; // To prevent multiple simultaneous sends

    const updateLanguageButtonLabel = () => {
        if (!languageBtn) return;
        const label = window.i18n && typeof window.i18n.t === 'function'
            ? window.i18n.t('language_change_title')
            : 'Change Language';
        languageBtn.textContent = label;
        languageBtn.setAttribute('aria-label', label);
    };

    // --- Overlay Toggles ---
    openBtn?.addEventListener('click', () => {
        if (overlay) {
            updateLanguageButtonLabel();
            showOverlay(overlay);
        }
    });

    closeBtn?.addEventListener('click', () => {
        if (overlay) hideOverlay(overlay);
    });

    languageBtn?.addEventListener('click', () => {
        updateLanguageButtonLabel();
        if (window.i18n && typeof window.i18n.openLanguageMenu === 'function') {
            window.i18n.openLanguageMenu();
        }
    });

    overlay?.addEventListener('click', (event) => {
        if (event.target === overlay) {
            hideOverlay(overlay);
        }
    });

    // --- Chat Logic ---
    const splitModelMessage = (text) => {
        const normalized = String(text || '').trim();
        if (!normalized) return [];

        const paragraphParts = normalized
            .split(/\n\s*\n/)
            .map(part => part.trim())
            .filter(Boolean);

        const chunks = [];
        paragraphParts.forEach((part) => {
            const sentences = part.match(/[^.!?\n]+[.!?]+(?:["')\]]+)?|[^.!?\n]+$/g) || [part];
            let buffer = [];

            sentences
                .map(sentence => sentence.trim())
                .filter(Boolean)
                .forEach((sentence, index) => {
                    buffer.push(sentence);
                    const isLast = index === sentences.length - 1;
                    if (buffer.length >= 2 || isLast) {
                        chunks.push(buffer.join(' '));
                        buffer = [];
                    }
                });
        });

        return chunks.length > 0 ? chunks : [normalized];
    };

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const getModelChunkDelayMs = (text) => {
        const length = String(text || '').trim().length;
        const baseDelay = 320;
        const variableDelay = Math.min(1400, length * 14);
        return baseDelay + variableDelay;
    };

    const appendMessage = async (role, text) => {
        const parts = role === 'model' ? splitModelMessage(text) : [text];

        for (let index = 0; index < parts.length; index += 1) {
            const part = parts[index];
            const msgEl = document.createElement('div');
            msgEl.className = `chat-message ${role}`;
            msgEl.textContent = part;
            historyContainer.appendChild(msgEl);

            // Shorter chunks land faster; longer ones pause longer before the next bubble.
            if (role === 'model' && index < parts.length - 1) {
                await delay(getModelChunkDelayMs(part));
            }
        }
        
        // Auto-scroll to the bottom
        historyContainer.scrollTop = historyContainer.scrollHeight;
    };

    const sendMessage = async () => {

        if(isSending) return; // Prevent multiple sends

        const text = input.value.trim();

        if(!text) return;
        
        isSending = true;

        // Render user message instantly and lock inputs
        await appendMessage('user', text);
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;


        const maxRetries = 3;
        let delay = 1000; // Start with 1 second delay for retries
        let lastError = null;

        for(let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(`${SERVER_BASE_URL}/support/chat`, { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        message: text, 
                        history: chatHistory 
                    })
                });

                if(response.status == 503 && attempt < maxRetries - 1){
                    await new Promise(res => setTimeout(res, delay)); // Wait before retrying
                    delay *= 2;
                    continue; // Retry the request
                }


                if (!response.ok) {
                    let serverError = 'Failed to fetch from chat API';
                    try {
                        // Try to read the exact error message from the server
                        const errData = await response.json();
                        serverError = errData.error || errData.message || errData.details || serverError;
                    } catch (e) {
                        serverError = await response.text() || serverError;
                    }
                    const err = new Error(`Server Error (${response.status}): ${serverError}`);
                    err.status = response.status;
                    throw err;
                }

                const data = await response.json();
                
                // Render the AI response
                await appendMessage('model', data.reply);
                
                // Save to history array for the NEXT request context
                chatHistory.push({ role: 'user', content: text });
                chatHistory.push({ role: 'model', content: data.reply });

            } catch (error) {
                lastError = error;
                if(error.status !== 503 || attempt >= maxRetries - 1) {
                    await new Promise(res => setTimeout(res, delay)); // Wait before showing error
                    delay *= 2;
                }
            }

            if (lastError) {
                console.error("Support Chat Error:", lastError);
                const userMessage = lastError.status === 503
                    ? "The AI service is overloaded. Please try again in a moment."
                    : "Network error. Please try again later.";
                await appendMessage('error', userMessage);
            }

            isSending = false;
            input.disabled = false;
            sendBtn.disabled = false;
            return;
        }
    };

    // --- Event Listeners for sending ---
    sendBtn?.addEventListener('click', sendMessage);
    
    input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });

    updateLanguageButtonLabel();
}
