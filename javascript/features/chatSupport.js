import { showOverlay, hideOverlay, getOverlay } from '../ui/overlays.js';
import { SERVER_BASE_URL } from '../config/api.js'; // Fallback if you use full URLs

export function initSupportChat() {
    const openBtn = document.getElementById('openSupportChatBtn');
    const closeBtn = document.getElementById('closeSupportChatBtn');
    const overlay = getOverlay('supportChatOverlay'); 
    const sendBtn = document.getElementById('sendChatBtn');
    const input = document.getElementById('chatInput');
    const historyContainer = document.getElementById('chatHistoryContainer');

    // We keep track of the history exactly as your backend expects it
    let chatHistory = [];
    let isSending = false; // To prevent multiple simultaneous sends

    // --- Overlay Toggles ---
    openBtn?.addEventListener('click', () => {
        if (overlay) {
            showOverlay(overlay);
        }
    });

    closeBtn?.addEventListener('click', () => {
        if (overlay) hideOverlay(overlay);
    });

    // --- Chat Logic ---
    const appendMessage = (role, text) => {
        const msgEl = document.createElement('div');
        msgEl.className = `chat-message ${role}`;
        msgEl.textContent = text;
        historyContainer.appendChild(msgEl);
        
        // Auto-scroll to the bottom
        historyContainer.scrollTop = historyContainer.scrollHeight;
    };

    const sendMessage = async () => {

        if(isSending) return; // Prevent multiple sends

        const text = input.value.trim();

        if(!text) return;
        
        isSending = true;

        // Render user message instantly and lock inputs
        appendMessage('user', text);
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        try {
            const response = await fetch(`${SERVER_BASE_URL}/support/chat`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: text, 
                    history: chatHistory 
                })
            });

            if (!response.ok) {
                let serverError = 'Failed to fetch from chat API';
                try {
                    // Try to read the exact error message from the server
                    const errData = await response.json();
                    serverError = errData.error || errData.message || errData.details || serverError;
                } catch (e) {
                    serverError = await response.text() || serverError;
                }
                throw new Error(`Server Error (${response.status}): ${serverError}`);
            }

            const data = await response.json();
            
            // Render the AI response
            appendMessage('model', data.reply);
            
            // Save to history array for the NEXT request context
            chatHistory.push({ role: 'user', content: text });
            chatHistory.push({ role: 'model', content: data.reply });

        } catch (error) {
            console.error("Support Chat Error:", error);
            appendMessage('error', 'Network error. Please try again later.');
        } finally {
            // Unlock inputs
            isSending = false;
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
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
}