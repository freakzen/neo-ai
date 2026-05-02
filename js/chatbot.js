document.addEventListener('DOMContentLoaded', () => {
    const chatInput  = document.getElementById('chat-input');
    const chatSend   = document.getElementById('chat-send');
    const chatWindow = document.getElementById('chat-window');

    // Holds conversation history for context (Grok / OpenAI messages format)
    const conversationHistory = [
        {
            role: 'system',
            content: `You are a clinical dermatology AI assistant for Neo AI, a skin disease detection platform.
Your job is to:
  - Explain AI diagnostic results in simple, clear, and professional medical language.
  - Help users understand the Grad-CAM XAI heatmap outputs.
  - Describe possible causes, environmental triggers, symptoms, and next steps.
  - Maintain a calm, empathetic, and professional medical tone.
  - Always remind users that you are an AI and they should consult a licensed dermatologist for definitive diagnosis.
You are NOT a replacement for professional medical care.`
        }
    ];

    function addMessage(html, isUser = false) {
        const div = document.createElement('div');
        div.style.cssText = `
            padding: 14px 18px;
            max-width: 82%;
            line-height: 1.6;
            box-shadow: var(--shadow-sm);
            font-size: 0.95rem;
            border-radius: ${isUser ? '20px 20px 5px 20px' : '20px 20px 20px 5px'};
            align-self: ${isUser ? 'flex-end' : 'flex-start'};
            background: ${isUser ? 'var(--primary-color)' : 'var(--surface-color)'};
            color: ${isUser ? 'white' : 'var(--text-main)'};
            border: ${isUser ? 'none' : '1px solid var(--border-color)'};
        `;
        div.innerHTML = html;
        chatWindow.appendChild(div);
        chatWindow.scrollTop = chatWindow.scrollHeight;
        return div;
    }

    function addTypingIndicator() {
        const div = addMessage('<span style="letter-spacing:3px;">•••</span>', false);
        div.id = 'typing-indicator';
        return div;
    }

    // In-memory history for context (sent to backend)
    const chatHistory = [];

    async function callGrokAPI(userMessage) {
        const apiKey   = API_CONFIG?.GROK_API_KEY || '';
        const model    = API_CONFIG?.GROK_MODEL   || 'llama-3.3-70b-versatile';
        const endpoint = typeof getApiEndpoint === 'function' ? getApiEndpoint() : 'https://api.groq.com/openai/v1/chat/completions';
        const backend  = API_CONFIG?.BACKEND_URL  || 'http://localhost:8000';

        // Push user message into history
        chatHistory.push({ role: 'user', content: userMessage });

        // ── 1. Try backend proxy first (key stays secure) ────────────────────
        try {
            const res = await fetch(`${backend}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: userMessage, history: chatHistory.slice(-10) }),
                signal: AbortSignal.timeout(8000)
            });
            if (res.ok) {
                const json  = await res.json();
                const reply = json.reply || '';
                chatHistory.push({ role: 'assistant', content: reply });
                return reply;
            }
        } catch (_) { /* backend unavailable, fall through */ }

        // ── 2. Direct Groq call (key from api_keys.js) ───────────────────────
        if (apiKey && !apiKey.startsWith('xai-XXX')) {
            try {
                const messages = [
                    { role: 'system', content: `You are a clinical dermatology AI for Neo AI. Answer medically, professionally, and concisely.` },
                    ...chatHistory.slice(-10)
                ];
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 512 })
                });
                if (res.ok) {
                    const json  = await res.json();
                    const reply = json.choices[0].message.content;
                    chatHistory.push({ role: 'assistant', content: reply });
                    return reply;
                }
                const err = await res.json().catch(() => ({}));
                return `⚠️ API error (${res.status}): ${err?.error?.message || 'check your API key'}.`;
            } catch (e) {
                return `⚠️ Could not reach Groq: ${e.message}`;
            }
        }

        // ── 3. Rule-based fallback ────────────────────────────────────────────
        return getFallbackResponse(userMessage);
    }

    // ─── Fallback rule-based responses (no API key needed) ──────────────────
    function getFallbackResponse(query) {
        const q = query.toLowerCase();

        if (q.includes('melanoma') || q.includes('cancer') || q.includes('malignant'))
            return 'Melanoma is a serious skin cancer originating from melanocytes. Key warning signs include asymmetry, irregular borders, multiple colors, diameter >6mm, and evolving appearance (ABCDE rule). Please seek an urgent dermatology consultation and consider a biopsy.';

        if (q.includes('heatmap') || q.includes('grad-cam') || q.includes('xai') || q.includes('explain'))
            return 'The Grad-CAM heatmap highlights pixel regions the model focused on to make its decision. <strong>Red areas = highest attention</strong> (abnormal features), <strong>blue areas = low attention</strong>. It is generated by computing the weighted gradient of the predicted class score with respect to the final convolutional feature map.';

        if (q.includes('confidence') || q.includes('accurate') || q.includes('sure'))
            return 'The confidence score reflects the model\'s probability estimate for that disease class after softmax normalization. Our hybrid framework combines EfficientNet feature extraction with API validation — scoring above 85% typically indicates a strong signal, though clinical biopsy remains the gold standard.';

        if (q.includes('treatment') || q.includes('cure') || q.includes('medicine'))
            return 'Treatment recommendations depend on the specific diagnosis and severity. As an AI, I can provide educational context — but only a licensed dermatologist can prescribe treatments. Please use the "Next Steps" tab on the results page for guidance specific to your diagnosis.';

        if (q.includes('trigger') || q.includes('cause'))
            return 'Common skin condition triggers include UV exposure, stress, allergens, genetics, immune dysfunction, and hygiene factors. The "Triggers & Context" tab on the results page has diagnosis-specific information.';

        if (q.includes('pdf') || q.includes('report') || q.includes('export'))
            return 'Click the "⬇ Export PDF Report" button at the top of the Results page to download a full clinical diagnostic report including predictions, metrics, explanation, and recommended next steps.';

        return 'I am ready to help you understand your diagnosis, the heatmap visualization, or general dermatological information. What would you like to know?';
    }

    // ─── Send message handler ────────────────────────────────────────────────
    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        addMessage(text, true);
        chatInput.value = '';
        chatSend.disabled = true;

        const indicator = addTypingIndicator();

        const reply = await callGrokAPI(text);

        indicator.remove();
        addMessage(reply, false);
        chatSend.disabled = false;
        chatInput.focus();
    }

    chatSend.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });
});
