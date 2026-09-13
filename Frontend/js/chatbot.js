document.addEventListener('DOMContentLoaded', () => {
    // Inject Chatbot HTML
    const chatbotHTML = `
        <div class="chatbot-toggle-btn" id="chatbotToggle">💬</div>
        <div class="chatbot-window" id="chatbotWindow">
            <div class="chatbot-header">
                <span>CUET CC Assistant</span>
                <span class="chatbot-close" id="chatbotClose">&times;</span>
            </div>
            <div class="chatbot-messages" id="chatbotMessages">
                <div class="chat-bubble bot">Hello! I am the CUET Computer Club AI Assistant. How can I help you today?</div>
            </div>
            <div class="chat-typing" id="chatTyping">Assistant is typing...</div>
            <form class="chatbot-input-area" id="chatbotForm">
                <input type="text" id="chatbotInput" class="chatbot-input" placeholder="Ask a question..." autocomplete="off" required>
                <button type="submit" class="chatbot-send">➤</button>
            </form>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', chatbotHTML);

    const toggleBtn = document.getElementById('chatbotToggle');
    const closeBtn = document.getElementById('chatbotClose');
    const windowEl = document.getElementById('chatbotWindow');
    const form = document.getElementById('chatbotForm');
    const input = document.getElementById('chatbotInput');
    const messagesEl = document.getElementById('chatbotMessages');
    const typingEl = document.getElementById('chatTyping');

    let conversation = [];

    toggleBtn.addEventListener('click', () => {
        windowEl.classList.add('active');
        input.focus();
    });

    closeBtn.addEventListener('click', () => {
        windowEl.classList.remove('active');
    });

    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = \`chat-bubble \${role}\`;
        
        // Basic formatting for newlines and bold
        let formattedText = text
            .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
            .replace(/\\n/g, '<br>');

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

        try {
            // Send request to backend
            const res = await fetch('http://localhost:5000/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg, conversation })
            });
            
            const data = await res.json();
            typingEl.style.display = 'none';

            if (!res.ok) {
                addMessage(data.error || "Sorry, I'm unable to respond right now. Please try again later.", 'bot');
            } else {
                addMessage(data.reply, 'bot');
                // Store in history
                conversation.push({ role: 'user', text: msg });
                conversation.push({ role: 'assistant', text: data.reply });
            }
        } catch (err) {
            console.error('Chat error:', err);
            typingEl.style.display = 'none';
            addMessage("Sorry, I'm unable to connect to the server right now. Please try again later.", 'bot');
        }
    });
});
