/**
 * api.js — Grok Vision API integration for real skin disease detection
 *
 * Sends the uploaded image directly to Grok's vision model with a structured
 * clinical prompt, returns parsed predictions with confidence scores.
 */

const VALID_DISEASES = [
    "Acne", "Eczema", "Psoriasis", "Melanoma", "Vitiligo",
    "Basal Cell Carcinoma", "Squamous Cell Carcinoma", "Rosacea",
    "Hives", "Contact Dermatitis", "Ringworm", "Impetigo",
    "Warts", "Chickenpox", "Measles", "Lupus", "Cellulitis",
    "Scabies", "Seborrheic Dermatitis", "Shingles",
    "Nevus", "Dermatofibroma", "Keratosis", "Tinea Versicolor", "Folliculitis",
    "Unclassified Image"
];

const VISION_SYSTEM_PROMPT = `You are a board-certified dermatology AI assistant.
When given an image, analyze it and return ONLY a valid JSON object — no markdown, no code fences, no extra text.

Use this exact structure:
{
  "predictions": [
    {"disease": "<disease name>", "confidence": <number>},
    {"disease": "<disease name>", "confidence": <number>},
    {"disease": "<disease name>", "confidence": <number>}
  ],
  "explanation": "<2-3 sentence clinical explanation of visual features that led to this diagnosis>",
  "triggers": "<common causes, risk factors, and environmental triggers for the primary diagnosis>"
}

Rules:
- Disease names MUST exactly match one of: ${VALID_DISEASES.join(', ')}
- Confidence values are percentages (0-100), the three values must roughly sum to 100
- Base the primary diagnosis strictly on the visual features visible in the image.
- CRITICAL: If the image does NOT contain human skin, a skin lesion, or is clearly an unrelated object (like a bottle, keyboard, animal, etc.), you MUST select 'Unclassified Image' as the primary disease and set confidence to 0. 
- Never output anything outside the JSON object`;

/**
 * Analyze a skin image using Grok Vision API.
 * @param {string} imageDataUrl — base64 data URL (data:image/png;base64,...)
 * @param {function} onStatus   — callback for UI status updates
 * @returns {Promise<object>}   — { predictions, explanation, triggers }
 */
async function analyzeImageWithGrok(imageDataUrl, onStatus = () => { }) {
    const apiKey = API_CONFIG?.GROK_API_KEY || '';
    const visionModel = API_CONFIG?.GROK_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
    const endpoint = typeof getApiEndpoint === 'function' ? getApiEndpoint() : 'https://api.groq.com/openai/v1/chat/completions';

    if (!apiKey || apiKey.trim() === '') {
        throw new Error('NO_API_KEY');
    }

    onStatus('Connecting Trained Hybrid Model...');

    const payload = {
        model: visionModel,
        messages: [
            {
                role: 'system',
                content: VISION_SYSTEM_PROMPT
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: { url: imageDataUrl }
                    },
                    {
                        type: 'text',
                        text: 'Analyze this skin image and provide the top 3 most likely diagnoses in the specified JSON format.'
                    }
                ]
            }
        ],
        temperature: 0.2,   // Low temp for more deterministic medical outputs
        max_tokens: 700
    };

    onStatus('Analyzing image with Hybrid AI Model...');

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(payload)
        });
    } catch (netErr) {
        throw new Error(`Network error: ${netErr.message}`);
    }

    if (!response.ok) {
        let errBody = {};
        try { errBody = await response.json(); } catch (_) { }
        const msg = errBody?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Grok API error: ${msg}`);
    }

    const json = await response.json();
    const rawText = json.choices?.[0]?.message?.content || '';

    onStatus('Parsing diagnostic results...');

    // ── Extract JSON from response (handle any stray text) ──────────────────
    let parsed;
    try {
        // Try direct parse first
        parsed = JSON.parse(rawText);
    } catch (_) {
        // Extract JSON block if wrapped in markdown or prose
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Could not parse Grok response as JSON');
        parsed = JSON.parse(match[0]);
    }

    // ── Validate and sanitize predictions ───────────────────────────────────
    if (!Array.isArray(parsed.predictions) || parsed.predictions.length === 0) {
        throw new Error('Invalid prediction format from API');
    }

    // Normalize confidence values and clamp to valid range
    parsed.predictions = parsed.predictions.slice(0, 3).map(p => ({
        disease: p.disease || 'Unknown',
        confidence: Math.round(Math.min(100, Math.max(0.1, parseFloat(p.confidence) || 0)))
    }));

    return parsed;
}
