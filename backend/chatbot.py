import os
import json
from openai import OpenAI

# ─── Initialize Groq client using OpenAI SDK ────────────────────────────────
# Groq is OpenAI API-compatible, just with a different base_url

_client: OpenAI | None = None

def _get_client() -> OpenAI:
    global _client
    if _client is None:
        # Supports both spellings — GROK_API_KEY (.env.local) and GROQ_API_KEY
        api_key = os.environ.get("GROK_API_KEY") or os.environ.get("GROQ_API_KEY", "")
        if not api_key:
            raise RuntimeError("GROK_API_KEY not found in environment.")
        _client = OpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )
    return _client


SYSTEM_PROMPT = """You are a clinical dermatology AI assistant for Neo AI, a skin disease detection platform.
Your job is to:
  - Explain AI diagnostic results in simple, clear, and professional medical language.
  - Help users understand the Grad-CAM XAI heatmap outputs.
  - Describe possible causes, environmental triggers, symptoms, and next steps.
  - Maintain a calm, empathetic, and professional medical tone.
  - Always remind users that you are an AI and they should consult a licensed dermatologist for definitive diagnosis.
You are NOT a replacement for professional medical care.

Formatting Rules:
- DO NOT use asterisks (*) or markdown bold/italic formatting (** or *).
- Avoid long paragraphs. 
- Present your explanation as a clean, easy-to-read numbered list of concise points."""


def generate_chat_response(user_text: str, history: list[dict] | None = None) -> str:
    """
    Calls Groq's llama-3.3-70b-versatile model via the OpenAI-compatible SDK.
    Maintains conversation history if provided.
    """
    try:
        client = _get_client()

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        if history:
            messages.extend(history)

        messages.append({"role": "user", "content": user_text})

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.6,
            max_tokens=512,
        )

        return response.choices[0].message.content

    except RuntimeError as e:
        # No API key — fall back to rule-based
        return _fallback_response(user_text)
    except Exception as e:
        return f"AI assistant temporarily unavailable: {str(e)}"


def _fallback_response(query: str) -> str:
    """Simple rule-based fallback when Groq API is not available."""
    q = query.lower()
    if "melanoma" in q or "cancer" in q:
        return "Melanoma is a serious skin cancer. Key warning signs include asymmetry, irregular borders, multiple colors, diameter >6mm (ABCDE rule). Seek urgent dermatology consultation."
    if "heatmap" in q or "grad-cam" in q or "xai" in q:
        return "The Grad-CAM heatmap highlights pixel regions the model focused on. Red = highest attention, Blue = low attention."
    if "confidence" in q or "accuracy" in q:
        return "Confidence reflects the model's probability estimate. Above 85% indicates a strong signal, though clinical biopsy remains the gold standard."
    if "treatment" in q or "cure" in q:
        return "Treatment depends on the diagnosis. Only a licensed dermatologist can prescribe medications. Check the Next Steps tab on the results page."
    return "I can help you understand your diagnosis, heatmaps, or dermatological conditions. What would you like to know?"
