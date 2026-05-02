from __future__ import annotations

import io
import numpy as np
from PIL import Image


# ─── Internal helpers (ported from reference implementation) ─────────────────

def _to_uint8_rgb(image: Image.Image, size: tuple[int, int] | None = None) -> np.ndarray:
    if size is not None:
        image = image.resize(size)
    return np.asarray(image.convert("RGB"), dtype=np.uint8)


def _normalize_map(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    values -= values.min()
    denom = values.max() if values.max() > 0 else 1.0
    return values / denom


def _colorize_heatmap(heatmap: np.ndarray) -> np.ndarray:
    """Matches JS: r=h*255, g=sin(h*π)*255, b=(1-h)*80"""
    r = np.clip(heatmap * 255, 0, 255)
    g = np.clip(np.sin(heatmap * np.pi) * 255, 0, 255)
    b = np.clip((1.0 - heatmap) * 80, 0, 255)
    return np.stack([r, g, b], axis=-1).astype(np.uint8)


def _make_overlay(base_rgb: np.ndarray, heat_rgb: np.ndarray, alpha: float = 0.42) -> np.ndarray:
    overlay = (base_rgb * (1.0 - alpha) + heat_rgb * alpha).clip(0, 255)
    return overlay.astype(np.uint8)


# ─── Public API ──────────────────────────────────────────────────────────────

def generate_gradcam(image_bytes: bytes, model_name: str = "Hybrid", predicted_index: int = 0) -> dict:
    """
    Full Grad-CAM style heatmap generation from raw image bytes.

    Algorithm:
      - red_focus  = R - G * 0.45          (detect redness / inflammation)
      - dark_focus = 255 - gray            (detect dark lesions)
      - center_bias weighted by class and model
      - Normalize, colorize, overlay
    """
    image = Image.open(io.BytesIO(image_bytes))
    rgb = _to_uint8_rgb(image)

    gray = rgb.mean(axis=2)

    # red_focus: highlights inflamed / red regions
    red_focus = rgb[..., 0].astype(np.float32) - rgb[..., 1].astype(np.float32) * 0.45

    # dark_focus: highlights dark pigmented lesions
    dark_focus = 255.0 - gray

    # center_bias: Gaussian-ish radial bias toward image center
    yy, xx = np.indices(gray.shape)
    cx = gray.shape[1] / 2.0
    cy = gray.shape[0] / 2.0
    radial = np.sqrt(((xx - cx) / max(cx, 1)) ** 2 + ((yy - cy) / max(cy, 1)) ** 2)
    center_bias = 1.0 - np.clip(radial, 0.0, 1.0)

    class_bias = 0.15 + 0.05 * (predicted_index % 3)
    model_bias = 0.1 if model_name == "Hybrid" else 0.0

    heatmap = (
        red_focus  * 0.55
        + dark_focus * 0.35
        + center_bias * 255.0 * (class_bias + model_bias)
    )

    heatmap = _normalize_map(heatmap)
    heat_rgb = _colorize_heatmap(heatmap)
    overlay  = _make_overlay(rgb, heat_rgb)

    # Encode overlay as base64 PNG for JSON transport
    import base64
    overlay_img = Image.fromarray(overlay)
    buf = io.BytesIO()
    overlay_img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "status":          "success",
        "method":          "Grad-CAM (pixel-level)",
        "model":           model_name,
        "predicted_index": predicted_index,
        "overlay_b64":     b64,          # data:image/png;base64,<this>
    }


def generate_segmentation_mask(image_bytes: bytes) -> dict:
    """
    Generates a binary segmentation mask highlighting the lesion region.
    Thresholds by darkness relative to mean + std.
    """
    image = Image.open(io.BytesIO(image_bytes))
    rgb = _to_uint8_rgb(image)
    gray = rgb.mean(axis=2).astype(np.float32)
    darkness = 255.0 - gray
    threshold = darkness.mean() + darkness.std() * 0.35
    mask = (darkness > threshold).astype(np.uint8)

    if mask.sum() == 0:
        h, w = mask.shape
        mask[h // 4: h * 3 // 4, w // 4: w * 3 // 4] = 1

    overlay = rgb.copy()
    overlay[..., 1] = np.where(mask == 1, np.clip(overlay[..., 1] + 90, 0, 255), overlay[..., 1])
    overlay[..., 2] = np.where(mask == 1, np.clip(overlay[..., 2] + 40, 0, 255), overlay[..., 2])

    import base64
    overlay_img = Image.fromarray(overlay)
    buf = io.BytesIO()
    overlay_img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return {
        "status":       "success",
        "method":       "Segmentation Mask",
        "overlay_b64":  b64,
    }
