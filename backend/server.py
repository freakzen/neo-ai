from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
from dotenv import load_dotenv
from pathlib import Path

# ─── Load .env.local from project root (one level above backend/) ────────────
_root = Path(__file__).parent.parent
load_dotenv(_root / ".env.local")
load_dotenv(_root / ".env")  # also try plain .env

from inference import run_hybrid_inference
from explain   import generate_gradcam, generate_segmentation_mask
from chatbot   import generate_chat_response

app = FastAPI(
    title="Neo AI — Dermatology API",
    description="Hybrid Explainable Deep Learning Framework for Skin Disease Detection (Groq backend)",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    text: str
    history: list[dict] | None = None   # optional conversation context


# ─── Health ──────────────────────────────────────────────────────────────────
@app.get("/")
def health():
    groq_key_set = bool(os.environ.get("GROQ_API_KEY"))
    return {
        "status": "Neo AI API v2.1 is running",
        "groq_key_loaded": groq_key_set,
    }


# ─── Predict ─────────────────────────────────────────────────────────────────
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file.")

    image_bytes = await file.read()

    result   = run_hybrid_inference(image_bytes)
    heatmap  = generate_gradcam(image_bytes, model_name="Hybrid", predicted_index=0)
    seg      = generate_segmentation_mask(image_bytes)

    return {
        "predictions":  result["predictions"],
        "explanation":  result["explanation"],
        "triggers":     result.get("triggers", ""),
        "heatmap":      heatmap,
        "segmentation": seg,
    }


# ─── Explain only ────────────────────────────────────────────────────────────
@app.post("/explain")
async def explain(
    file: UploadFile = File(...),
    model: str = "Hybrid",
    predicted_index: int = 0,
):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload an image file.")
    image_bytes = await file.read()
    return generate_gradcam(image_bytes, model_name=model, predicted_index=predicted_index)


# ─── Chat (proxied through backend so API key stays secure) ──────────────────
@app.post("/chat")
async def chat(req: ChatRequest):
    reply = generate_chat_response(req.text, req.history)
    return {"reply": reply}


# ─── Entry point ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
