/**
 * heatmap.js — Grad-CAM style heatmap generator
 * Ported from the Python reference implementation:
 *   red_focus, dark_focus, center_bias, class_bias, normalize, colorize, overlay
 */

// ─── Normalize a Float32Array to [0, 1] ─────────────────────────────────────
function normalizeMap(arr) {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i] < min) min = arr[i];
        if (arr[i] > max) max = arr[i];
    }
    const denom = max > min ? max - min : 1.0;
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
        out[i] = (arr[i] - min) / denom;
    }
    return out;
}

// ─── Colorize a normalized heatmap ──────────────────────────────────────────
// Matches Python: r=h*255, g=sin(h*π)*255, b=(1-h)*80
function colorizeHeatmap(heatmap, W, H) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
        const h = heatmap[i];
        out[i * 4]     = Math.min(255, h * 255);
        out[i * 4 + 1] = Math.min(255, Math.sin(h * Math.PI) * 255);
        out[i * 4 + 2] = Math.min(255, (1.0 - h) * 80);
        out[i * 4 + 3] = 255;
    }
    return out;
}

// ─── Alpha-blend base image with heat_rgb ───────────────────────────────────
// Matches Python: overlay = base*(1-alpha) + heat*alpha, alpha=0.42
function makeOverlay(basePixels, heatPixels, W, H, alpha = 0.42) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
        const b = i * 4;
        out[b]     = Math.round(basePixels[b]     * (1 - alpha) + heatPixels[b]     * alpha);
        out[b + 1] = Math.round(basePixels[b + 1] * (1 - alpha) + heatPixels[b + 1] * alpha);
        out[b + 2] = Math.round(basePixels[b + 2] * (1 - alpha) + heatPixels[b + 2] * alpha);
        out[b + 3] = 255;
    }
    return out;
}

/**
 * Main entry-point.
 * @param {HTMLImageElement} imgEl      - Source image element
 * @param {number}           classIndex - Predicted class index (0-based)
 * @param {string}           modelName  - "Hybrid" | "EfficientNet" | etc.
 * @returns {Promise<string>}           - Data URL of the blended overlay
 */
async function generateGradCAM(imgEl, classIndex = 0, modelName = 'Hybrid') {
    // ── 1. Draw the image into a canvas to get raw pixels ──────────────────
    const W = imgEl.naturalWidth  || imgEl.width  || 400;
    const H = imgEl.naturalHeight || imgEl.height || 400;

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width  = W;
    srcCanvas.height = H;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(imgEl, 0, 0, W, H);

    const { data: px } = srcCtx.getImageData(0, 0, W, H); // Uint8ClampedArray

    // ── 2. Compute per-pixel scores (mirrors Python logic) ──────────────────
    const N = W * H;
    const redFocus  = new Float32Array(N);
    const darkFocus = new Float32Array(N);
    const centerBias = new Float32Array(N);

    const cx = W / 2.0;
    const cy = H / 2.0;

    for (let idx = 0; idx < N; idx++) {
        const p = idx * 4;
        const r = px[p];
        const g = px[p + 1];
        const b = px[p + 2];

        const grayVal = (r + g + b) / 3.0;

        // red_focus = R - G * 0.45
        redFocus[idx]  = r - g * 0.45;
        // dark_focus = 255 - gray
        darkFocus[idx] = 255.0 - grayVal;

        // radial distance normalized to image half-size
        const xi = (idx % W);
        const yi = Math.floor(idx / W);
        const radial = Math.sqrt(
            Math.pow((xi - cx) / Math.max(cx, 1), 2) +
            Math.pow((yi - cy) / Math.max(cy, 1), 2)
        );
        // center_bias = 1 - clamp(radial, 0, 1)
        centerBias[idx] = 1.0 - Math.min(1.0, Math.max(0.0, radial));
    }

    // ── 3. Combine maps with class and model biases ─────────────────────────
    // class_bias = 0.15 + 0.05 * (predicted_index % 3)
    const classBias = 0.15 + 0.05 * (classIndex % 3);
    // model_bias = 0.1 if Hybrid else 0
    const modelBias = modelName === 'Hybrid' ? 0.1 : 0.0;

    const heatmap = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        heatmap[i] = redFocus[i] * 0.55
                   + darkFocus[i] * 0.35
                   + centerBias[i] * 255.0 * (classBias + modelBias);
    }

    // ── 4. Normalize → [0, 1] ───────────────────────────────────────────────
    const normHeatmap = normalizeMap(heatmap);

    // ── 5. Colorize heatmap (R=h*255, G=sin(h*π)*255, B=(1-h)*80) ──────────
    const heatPixels = colorizeHeatmap(normHeatmap, W, H);

    // ── 6. Blend with original image (alpha = 0.42) ─────────────────────────
    const overlayPixels = makeOverlay(px, heatPixels, W, H, 0.42);

    // ── 7. Write result back to canvas and return data URL ──────────────────
    const outCanvas = document.createElement('canvas');
    outCanvas.width  = W;
    outCanvas.height = H;
    const outCtx = outCanvas.getContext('2d');
    const outImgData = new ImageData(overlayPixels, W, H);
    outCtx.putImageData(outImgData, 0, 0);

    return outCanvas.toDataURL('image/png');
}
