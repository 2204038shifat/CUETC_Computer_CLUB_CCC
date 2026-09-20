document.addEventListener('DOMContentLoaded', () => {
    // Inject Chatbot HTML
    const chatbotHTML = `
        <button class="chatbot-toggle-btn" id="cuetChatbotToggle" aria-label="Open Chatbot" title="CUET Computer Club Assistant">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        </button>
        <div class="chatbot-window" id="cuetChatbotWindow">
            <div class="chatbot-header">
                <span style="display: flex; align-items: center; gap: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    CUET Computer Club Assistant
                </span>
                <span class="chatbot-close" id="cuetChatbotClose" aria-label="Close Chatbot">&times;</span>
            </div>
            <div class="chatbot-messages" id="cuetChatbotMessages">
                <div class="chat-bubble bot">Hello! I'm the CUET Computer Club Assistant. I can help you with events, contests, registrations, news, committee information, and other CUET Computer Club-related questions. How can I help you?</div>
            </div>
            <div class="chat-typing" id="cuetChatTyping">Assistant is typing...</div>
            <form class="chatbot-input-area" id="cuetChatbotForm">
                <input type="text" id="cuetChatbotInput" class="chatbot-input" placeholder="Ask a question..." autocomplete="off" required>
                <button type="submit" class="chatbot-send" aria-label="Send Message">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
            </form>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatbotHTML);

    const toggleBtn = document.getElementById('cuetChatbotToggle');
    const closeBtn = document.getElementById('cuetChatbotClose');
    const windowEl = document.getElementById('cuetChatbotWindow');
    const form = document.getElementById('cuetChatbotForm');
    const input = document.getElementById('cuetChatbotInput');
    const messagesEl = document.getElementById('cuetChatbotMessages');
    const typingEl = document.getElementById('cuetChatTyping');

    let conversationHistory = [];
    let isWindowOpen = false;

    toggleBtn.addEventListener('click', () => {
        isWindowOpen = !isWindowOpen;
        if (isWindowOpen) {
            windowEl.classList.add('active');
            input.focus();
        } else {
            windowEl.classList.remove('active');
        }
    });

    closeBtn.addEventListener('click', () => {
        windowEl.classList.remove('active');
        isWindowOpen = false;
    });

    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${role}`;
        
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        div.innerHTML = formattedText;
        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = input.value.trim();
        if (!msg) return;

        input.value = '';
        addMessage(msg, 'user');
        
        typingEl.style.display = 'block';
        messagesEl.scrollTop = messagesEl.scrollHeight;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

        try {
            const apiUrl = '/api/chatbot';
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, history: conversationHistory }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const data = await res.json();
            typingEl.style.display = 'none';

            if (!res.ok || !data.success) {
                addMessage(data.error || "Sorry, I'm unable to respond right now. Please try again in a moment.", 'bot');
            } else {
                addMessage(data.reply, 'bot');
                conversationHistory.push({ role: 'user', text: msg });
                conversationHistory.push({ role: 'assistant', text: data.reply });
                
                if (conversationHistory.length > 6) {
                    conversationHistory = conversationHistory.slice(-6);
                }
            }
        } catch (err) {
            clearTimeout(timeoutId);
            console.error('Chat error:', err);
            typingEl.style.display = 'none';
            if (err.name === 'AbortError') {
                addMessage("The response is taking too long. Please try again.", 'bot');
            } else {
                addMessage("Sorry, I'm unable to connect to the server right now. Please try again in a moment.", 'bot');
            }
        }
    });
});
