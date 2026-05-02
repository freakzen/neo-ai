/**
 * api_keys.js
 *
 * Your key starts with "gsk_" → this is a Groq key (https://console.groq.com)
 * Groq keys  → endpoint: https://api.groq.com/openai/v1/chat/completions
 * xAI keys   → endpoint: https://api.x.ai/v1/chat/completions  (start with "xai-")
 *
 * The code auto-detects based on the prefix.
 */
const API_CONFIG = {
    GROK_API_KEY: process.env.GROQ_API_KEY,

    GROK_MODEL: 'llama-3.3-70b-versatile',
    GROK_VISION_MODEL: 'meta-llama/llama-4-scout-17b-16e-instruct',

    GROQ_ENDPOINT: 'https://api.groq.com/openai/v1/chat/completions',
    XAI_ENDPOINT: 'https://api.x.ai/v1/chat/completions',

    BACKEND_URL: 'http://localhost:8000',
};

/** Returns the correct base URL depending on key prefix */
function getApiEndpoint() {
    const key = API_CONFIG.GROK_API_KEY || '';
    return key.startsWith('gsk_') ? API_CONFIG.GROQ_ENDPOINT : API_CONFIG.XAI_ENDPOINT;
}


