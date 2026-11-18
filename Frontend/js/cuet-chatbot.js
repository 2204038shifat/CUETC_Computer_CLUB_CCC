document.addEventListener('DOMContentLoaded', () => {
    // Prevent duplicate initialization if script is accidentally loaded twice
    if (document.getElementById('cuetChatbotToggle')) return;

    const MAX_HISTORY_MESSAGES = 10;
    const MAX_MESSAGE_LENGTH = 2000;
    const CLIENT_TIMEOUT_MS = 50000;

    // Inject Chatbot HTML (preserving existing design & element IDs/classes)
    const chatbotHTML = `
        <button class="chatbot-toggle-btn" id="cuetChatbotToggle" aria-label="Open Chatbot" title="CUET Computer Club Assistant">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
        </button>
        <div class="chatbot-window" id="cuetChatbotWindow" role="dialog" aria-label="CUET Computer Club Assistant">
            <div class="chatbot-header">
                <span style="display: flex; align-items: center; gap: 8px;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                    CUET Computer Club Assistant
                </span>
                <span class="chatbot-close" id="cuetChatbotClose" aria-label="Close Chatbot" role="button" tabindex="0">&times;</span>
            </div>
            <div class="chatbot-messages" id="cuetChatbotMessages" aria-live="polite">
                <div class="chat-bubble bot">Hello! I'm the CUET Computer Club AI Assistant. Ask me about club events, contests, news, registrations, or any programming, tech, and general question — in English, Bangla, or Banglish!</div>
            </div>
            <div class="chat-typing" id="cuetChatTyping">Assistant is typing...</div>
            <form class="chatbot-input-area" id="cuetChatbotForm">
                <input type="text" id="cuetChatbotInput" class="chatbot-input" placeholder="Ask a question..." maxlength="${MAX_MESSAGE_LENGTH}" autocomplete="off" required>
                <button type="submit" id="cuetChatbotSend" class="chatbot-send" aria-label="Send Message">
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
    const sendBtn = document.getElementById('cuetChatbotSend');
    const messagesEl = document.getElementById('cuetChatbotMessages');
    const typingEl = document.getElementById('cuetChatTyping');

    let conversationHistory = [];
    let isWindowOpen = false;
    let isSending = false;

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function escapeHtml(raw) {
        return String(raw)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Safely formats plain text / lightweight Markdown after HTML escaping
     * to completely prevent XSS / HTML / script injection.
     */
    function formatSafeMarkdown(rawText) {
        const text = String(rawText || '');
        const codeBlocks = [];

        // 1. Extract fenced code blocks before inline formatting
        let safe = escapeHtml(text).replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
            const idx = codeBlocks.length;
            codeBlocks.push(`<pre class="chat-code-block"><code>${code.trim()}</code></pre>`);
            return `@@CODEBLOCK_${idx}@@`;
        });

        // 2. Inline code
        const inlineCodes = [];
        safe = safe.replace(/`([^`\n]+)`/g, (_, code) => {
            const idx = inlineCodes.length;
            inlineCodes.push(`<code class="chat-inline-code">${code}</code>`);
            return `@@INLINECODE_${idx}@@`;
        });

        // 3. Safe bold & italic
        safe = safe
            .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?]|$)/g, '$1<em>$2</em>');

        // 4. Line breaks
        safe = safe.replace(/\r?\n/g, '<br>');

        // 5. Restore inline code & fenced code blocks
        safe = safe.replace(/@@INLINECODE_(\d+)@@/g, (_, i) => inlineCodes[Number(i)] || '');
        safe = safe.replace(/@@CODEBLOCK_(\d+)@@/g, (_, i) => codeBlocks[Number(i)] || '');

        return safe;
    }

    function setLoadingState(loading) {
        isSending = loading;
        sendBtn.disabled = loading;
        input.disabled = loading;
        typingEl.style.display = loading ? 'block' : 'none';
        if (loading) {
            scrollToBottom();
        } else if (isWindowOpen) {
            input.focus();
        }
    }

    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = `chat-bubble ${role}`;

        if (role === 'user') {
            // User messages are always rendered as plain escaped text
            div.textContent = text;
        } else {
            div.innerHTML = formatSafeMarkdown(text);
        }

        messagesEl.appendChild(div);
        scrollToBottom();
        return div;
    }

    function addErrorMessage(errorText, failedUserMessage) {
        const div = document.createElement('div');
        div.className = 'chat-bubble bot chat-bubble-error';

        const msgSpan = document.createElement('div');
        msgSpan.textContent = errorText;
        div.appendChild(msgSpan);

        if (failedUserMessage) {
            const retryBtn = document.createElement('button');
            retryBtn.type = 'button';
            retryBtn.className = 'chat-retry-btn';
            retryBtn.textContent = 'Retry';
            retryBtn.addEventListener('click', () => {
                if (isSending) return;
                div.remove();
                sendMessageToServer(failedUserMessage, { appendUserBubble: false });
            });
            div.appendChild(retryBtn);
        }

        messagesEl.appendChild(div);
        scrollToBottom();
        return div;
    }

    function getStatusFallbackError(status) {
        if (status === 400) return 'Your message could not be processed. Please shorten or rephrase it and try again.';
        if (status === 429) return 'Too many requests right now. Please wait a moment and try again.';
        if (status === 504) return 'The response took too long. Please try again.';
        if (status === 502 || status === 503) return 'The AI service is experiencing temporary high demand. Please try again in a moment.';
        return "Sorry, I'm unable to respond right now. Please try again in a moment.";
    }

    async function sendMessageToServer(msg, { appendUserBubble = true } = {}) {
        if (isSending) return;

        if (appendUserBubble) {
            addMessage(msg, 'user');
        }

        setLoadingState(true);

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller
            ? setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS)
            : null;

        try {
            const res = await fetch('/api/chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: msg,
                    history: conversationHistory
                }),
                signal: controller ? controller.signal : undefined
            });

            if (timeoutId) clearTimeout(timeoutId);

            let data = null;
            try {
                data = await res.json();
            } catch (_parseErr) {
                data = null;
            }

            setLoadingState(false);

            if (!res.ok || !data || !data.success) {
                const errMsg = (data && (data.error || data.message)) || getStatusFallbackError(res.status);
                addErrorMessage(errMsg, res.status === 400 ? null : msg);
                return;
            }

            const replyText = typeof data.reply === 'string' && data.reply.trim()
                ? data.reply
                : "I received an empty response. Please try asking again.";

            addMessage(replyText, 'bot');
            conversationHistory.push({ role: 'user', text: msg });
            conversationHistory.push({ role: 'assistant', text: replyText });

            if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
                conversationHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES);
            }
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            setLoadingState(false);

            const isAbort = err && err.name === 'AbortError';
            const friendlyMsg = isAbort
                ? 'The request timed out. Please try again.'
                : "Sorry, I'm unable to connect to the server right now. Please check your connection and try again.";
            addErrorMessage(friendlyMsg, msg);
        }
    }

    function openWindow() {
        isWindowOpen = true;
        windowEl.classList.add('active');
        scrollToBottom();
        if (!isSending) input.focus();
    }

    function closeWindow() {
        isWindowOpen = false;
        windowEl.classList.remove('active');
    }

    toggleBtn.addEventListener('click', () => {
        if (isWindowOpen) closeWindow();
        else openWindow();
    });

    closeBtn.addEventListener('click', closeWindow);
    closeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            closeWindow();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSending) return;

        const msg = input.value.trim();
        if (!msg) return;

        if (msg.length > MAX_MESSAGE_LENGTH) {
            addErrorMessage(`Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`, null);
            return;
        }

        input.value = '';
        await sendMessageToServer(msg, { appendUserBubble: true });
    });
});
