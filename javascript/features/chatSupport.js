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

    console.log('[Debug Chat] openBtn found:', openBtn);
    console.log('[Debug Chat] overlay found:', overlay);

    // Global click detector (catches the click even if the HTML ID is wrong)
    document.body.addEventListener('click', (e) => {
        const clickedEl = e.target.closest('button, a, div');
        // Check if the element you clicked contains the word 'support'
        if (clickedEl && clickedEl.textContent && clickedEl.textContent.toLowerCase().includes('support')) {
            alert(`Support button clicked!\n\nIts actual HTML ID is: "${clickedEl.id}"\n\nThe script expects the ID: "openSupportChatBtn"`);
        }
    });

    // --- Overlay Toggles ---
    openBtn?.addEventListener('click', () => {
        console.log('[Debug Chat] openBtn clicked. Overlay exists?', !!overlay);
        if (overlay) {
            showOverlay(overlay);
        } else {
            console.error('[Debug Chat] Cannot show overlay because it was not found in the DOM.');
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
        const text = input.value.trim();
        if (!text) return;

        // Render user message instantly and lock inputs
        appendMessage('user', text);
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        try {
            // Assuming the frontend runs on the same domain, or use SERVER_BASE_URL + '/support/chat'
            const response = await fetch('/support/chat', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: text, 
                    history: chatHistory 
                })
            });

            if (!response.ok) throw new Error('Failed to fetch from chat API');

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