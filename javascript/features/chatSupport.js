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
                    await new Promise(res => setTimeout(res, dalay)); // Wait before retrying
                    dalay *= 2;
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
                appendMessage('model', data.reply);
                
                // Save to history array for the NEXT request context
                chatHistory.push({ role: 'user', content: text });
                chatHistory.push({ role: 'model', content: data.reply });

            } catch (error) {
                lastError = error;
                if(error.status !== 503 || attempt >= maxRetries - 1) {
                    await new Promise(res => setTimeout(res, dalay)); // Wait before showing error
                    delay *= 2;
                }
            }

            if (lastError) {
                console.error("Support Chat Error:", lastError);
                const userMessage = lastError.status === 503
                    ? "The AI service is overloaded. Please try again in a moment."
                    : "Network error. Please try again later.";
                appendMessage('error', userMessage);
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
}