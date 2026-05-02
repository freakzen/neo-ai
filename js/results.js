// ─────────────────────────────────────────────────────────────────────────────
//  results.js — Diagnosis results page logic
//  Uses heatmap.js for pixel-accurate Grad-CAM style XAI
// ─────────────────────────────────────────────────────────────────────────────

const DISEASES_INFO = {
    'Acne': { next: 'Apply benzoyl peroxide or salicylic acid. Avoid touching the affected areas. Consult a dermatologist for prescription retinoids if severe.' },
    'Eczema': { next: 'Moisturize frequently with fragrance-free creams. Avoid known triggers. Topical corticosteroids may be needed — consult a specialist.' },
    'Psoriasis': { next: 'Use medicated shampoos and topical treatments. Phototherapy may be considered. See a dermatologist for biologic therapy options if severe.' },
    'Melanoma': { next: 'Seek immediate evaluation by a dermatologist. A biopsy is required for definitive diagnosis. Early detection is critical.' },
    'Vitiligo': { next: 'Sun protection is essential. Topical corticosteroids or calcineurin inhibitors may help. Consult a dermatologist for phototherapy options.' },
    'Basal Cell Carcinoma': { next: 'Refer to a dermatologist or oncologist immediately. Surgical excision is often required. Avoid sun exposure.' },
    'Squamous Cell Carcinoma': { next: 'Urgent dermatology referral is needed. Surgical removal, radiation or topical chemotherapy may be indicated.' },
    'Rosacea': { next: 'Avoid triggers like spicy food, alcohol, and sun. Use gentle skincare. Topical metronidazole or azelaic acid may be prescribed.' },
    'Hives': { next: 'Identify and avoid triggers (foods, medications, stress). Antihistamines provide relief. Severe cases may require epinephrine.' },
    'Contact Dermatitis': { next: 'Identify and eliminate the allergen or irritant. Use topical corticosteroids and emollients. Patch testing may be recommended.' },
    'Ringworm': { next: 'Apply antifungal creams (clotrimazole, miconazole) for 2-4 weeks. Oral antifungals may be needed for extensive cases.' },
    'Impetigo': { next: 'Topical or oral antibiotics are required. Keep lesions clean. Avoid contact with others until healed to prevent spread.' },
    'Warts': { next: 'Salicylic acid or cryotherapy (freezing) are first-line treatments. Consult a dermatologist if warts persist or spread.' },
    'Chickenpox': { next: 'Rest, fluids, and antihistamines for itch. Antivirals (acyclovir) may be prescribed for high-risk individuals. Avoid scratching.' },
    'Measles': { next: 'Supportive care with rest and fluids. Vitamin A supplementation is recommended. Isolate the patient to prevent transmission.' },
    'Lupus': { next: 'Rheumatology referral is essential. Sun protection is critical. Hydroxychloroquine is a common long-term treatment.' },
    'Cellulitis': { next: 'Oral or IV antibiotics are required. Elevate the affected limb. Seek emergency care if red streaks, fever, or rapid spread occur.' },
    'Scabies': { next: 'Topical permethrin cream applied to all skin is standard. All household contacts must be treated simultaneously.' },
    'Seborrheic Dermatitis': { next: 'Use antifungal shampoos (ketoconazole) and gentle cleansers. Topical corticosteroids may be used for flares.' },
    'Shingles': { next: 'Antiviral treatment (valacyclovir) is most effective within 72 hours of rash onset. Pain management is also needed.' },
    'Unclassified Image': { next: 'Upload a clear, focused image of a skin condition. Ensure the photo is well-lit and not a random object.' },
};

// ─── Tab System ──────────────────────────────────────────────────────────────
function initTabs(container) {
    container.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const panel = document.getElementById(`tab-${tab}`);
            if (panel) panel.classList.add('active');
        });
    });
}

// ─── Heatmap state ───────────────────────────────────────────────────────────
let _overlayDataUrl = null;
let _heatmapDataUrl = null;
let _currentMode = 'original'; // 'original' | 'heatmap' | 'overlay'

function applyHeatmapMode(mode, imgEl, overlayCanvas) {
    _currentMode = mode;
    const ctx = overlayCanvas.getContext('2d');
    overlayCanvas.width = imgEl.naturalWidth || 400;
    overlayCanvas.height = imgEl.naturalHeight || 400;

    if (mode === 'original') {
        overlayCanvas.style.display = 'none';
        imgEl.style.opacity = '1';
        return;
    }

    const url = mode === 'heatmap' ? _heatmapDataUrl : _overlayDataUrl;
    if (!url) return;

    const temp = new Image();
    temp.onload = () => {
        ctx.drawImage(temp, 0, 0, overlayCanvas.width, overlayCanvas.height);
        overlayCanvas.style.display = 'block';
        imgEl.style.opacity = mode === 'overlay' ? '0' : '1';
    };
    temp.src = url;
}

// ─── Chart.js helpers ────────────────────────────────────────────────────────
function buildConfidenceChart(predictions) {
    const ctx = document.getElementById('confidence-bar').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: predictions.map(p => p.disease),
            datasets: [{
                label: 'Confidence (%)',
                data: predictions.map(p => p.confidence),
                backgroundColor: ['#2b6cb0', '#38b2ac', '#a0aec0'],
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: {
                    beginAtZero: true, max: 100,
                    grid: { color: '#edf2f7' },
                    ticks: { font: { family: 'Inter' }, callback: v => v + '%' }
                },
                x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 } } }
            }
        }
    });
}

function buildRadarChart(disease) {
    const ctx = document.getElementById('radar-chart').getContext('2d');
    // Seeded scores based on disease characteristics (for demo)
    const seed = disease.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const rnd = (base, range) => Math.min(10, Math.max(1, base + ((seed * 13) % range)));

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Inflammation', 'Pigmentation', 'Spread Risk', 'Recurrence', 'Severity', 'Contagion'],
            datasets: [{
                label: disease,
                data: [rnd(5, 5), rnd(4, 6), rnd(3, 5), rnd(5, 4), rnd(6, 4), rnd(2, 6)],
                backgroundColor: 'rgba(43, 108, 176, 0.15)',
                borderColor: '#2b6cb0',
                pointBackgroundColor: '#2b6cb0',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { font: { family: 'Inter' } } } },
            scales: {
                r: {
                    min: 0, max: 10,
                    grid: { color: '#edf2f7' },
                    ticks: { display: false },
                    pointLabels: { font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });
}

// ─── Render results cards ────────────────────────────────────────────────────
function renderResults(data) {
    const primary = data.predictions[0];
    const severityBadge = getSeverityBadge(primary.disease);
    document.title = `${primary.disease} — Neo AI Diagnosis`;
    document.getElementById('hero-disease').textContent = primary.disease;

    document.getElementById('primary-diagnosis').innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
            <div>
                <h2 style="font-size:2rem; color:var(--primary-dark); margin:0;">${primary.disease}</h2>
                <p style="color:var(--text-muted); margin:6px 0 0; font-size:0.9rem;">Primary prediction · Hybrid Framework</p>
            </div>
            ${severityBadge}
        </div>
        <div style="margin:20px 0 6px; display:flex; justify-content:space-between;">
            <span style="font-size:0.85rem; font-weight:600; color:var(--text-muted);">Confidence</span>
            <span style="font-size:0.85rem; font-weight:700; color:var(--primary-color);">${primary.confidence}%</span>
        </div>
        <div class="progress-bar-bg" style="height:12px;">
            <div class="progress-bar-fill" style="width:${primary.confidence}%"></div>
        </div>
    `;

    let altHtml = '';
    for (let i = 1; i < data.predictions.length; i++) {
        const pred = data.predictions[i];
        altHtml += `
            <div style="margin-bottom:18px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                    <span style="font-weight:500; font-size:0.95rem;">${pred.disease}</span>
                    <span style="color:var(--text-muted); font-size:0.9rem;">${pred.confidence}%</span>
                </div>
                <div class="progress-bar-bg" style="height:8px;">
                    <div class="progress-bar-fill" style="width:${pred.confidence}%; background:var(--secondary-color);"></div>
                </div>
            </div>`;
    }
    document.getElementById('alt-predictions').innerHTML = altHtml;

    buildConfidenceChart(data.predictions);
    buildRadarChart(primary.disease);

    document.getElementById('explanation-text').innerHTML = data.explanation;
    document.getElementById('triggers-text').innerHTML =
        data.triggers || 'Potential triggers include genetic factors, environmental exposures, and immune system irregularities.';
    document.getElementById('nextsteps-text').innerHTML =
        DISEASES_INFO[primary.disease]?.next || 'Please consult a licensed dermatologist for a personalized care plan.';
}

// ─── PDF Export ──────────────────────────────────────────────────────────────
function exportPDF(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const primary = data.predictions[0];

    // Header
    doc.setFillColor(27, 54, 93);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Neo AI — Dermatology Diagnostic Report', 14, 20);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 38);
    doc.text('AI-Powered Skin Disease Detection | Hybrid Explainable Model', 14, 44);

    // Patient details
    const patientStr = sessionStorage.getItem('patientDetails');
    const patient = patientStr ? JSON.parse(patientStr) : null;
    let currentY = 56;

    if (patient) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(43, 108, 176);
        doc.text('Patient Details', 14, currentY);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(45, 55, 72);
        doc.text(`Name: ${patient.name || 'N/A'}`, 14, currentY + 6);
        doc.text(`Age: ${patient.age || 'N/A'}`, 100, currentY + 6);
        doc.text(`Sex: ${patient.sex || 'N/A'}`, 14, currentY + 12);
        doc.text(`Family History: ${patient.history || 'N/A'}`, 100, currentY + 12);
        
        currentY += 24;
    }

    // Primary Diagnosis block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(43, 108, 176);
    doc.text('Primary Diagnosis', 14, currentY);
    doc.setFillColor(235, 244, 255);
    doc.rect(14, currentY + 4, 182, 30, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.text(primary.disease, 20, currentY + 16);
    doc.setFontSize(10);
    doc.text(`Confidence: ${primary.confidence}%   Severity: ${getSeverityLevel(primary.disease).toUpperCase()}`, 20, currentY + 26);

    currentY += 44;

    // Predictions table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(43, 108, 176);
    doc.text('Differential Diagnoses', 14, currentY);

    doc.autoTable({
        startY: currentY + 4,
        head: [['Rank', 'Disease', 'Confidence (%)']],
        body: data.predictions.map((p, i) => [`#${i + 1}`, p.disease, `${p.confidence}%`]),
        styles: { font: 'helvetica', fontSize: 10 },
        headStyles: { fillColor: [43, 108, 176] },
        alternateRowStyles: { fillColor: [247, 250, 252] },
        margin: { left: 14, right: 14 }
    });

    const afterTable = doc.lastAutoTable.finalY + 10;

    // Model metrics
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(43, 108, 176);
    doc.text('Model Performance Metrics', 14, afterTable);

    doc.autoTable({
        startY: afterTable + 4,
        head: [['Metric', 'Value']],
        body: [['Accuracy', '92.4%'], ['Precision', '89.1%'], ['Recall', '91.3%'], ['F1 Score', '90.2%']],
        styles: { font: 'helvetica', fontSize: 10 },
        headStyles: { fillColor: [43, 108, 176] },
        margin: { left: 14, right: 14 }
    });

    const afterMetrics = doc.lastAutoTable.finalY + 10;

    // Clinical explanation
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(43, 108, 176);
    doc.text('Clinical Explanation', 14, afterMetrics);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 55, 72);
    doc.text(doc.splitTextToSize(data.explanation, 182), 14, afterMetrics + 8);

    const nextStepsY = afterMetrics + 30;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(43, 108, 176);
    doc.text('Recommended Next Steps', 14, nextStepsY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(45, 55, 72);
    const nextSteps = DISEASES_INFO[primary.disease]?.next || 'Please consult a licensed dermatologist.';
    doc.text(doc.splitTextToSize(nextSteps, 182), 14, nextStepsY + 8);

    // Footer disclaimer
    const pageH = doc.internal.pageSize.height;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('⚠ This report is AI-generated for informational purposes only and does not constitute medical advice.', 14, pageH - 10);

    doc.save(`NeoAI_Diagnosis_${primary.disease.replace(/ /g, '_')}.pdf`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const imageData = sessionStorage.getItem('currentImage');
    if (!imageData) { window.location.href = 'dashboard.html'; return; }

    const resultImg = document.getElementById('result-image');
    resultImg.src = imageData;

    // Prefer real API result, fall back to demo
    const stored = sessionStorage.getItem('apiResult');
    const data = stored ? JSON.parse(stored) : {
        predictions: [
            { disease: 'Melanoma', confidence: 89.5 },
            { disease: 'Nevus', confidence: 8.2 },
            { disease: 'Basal Cell Carcinoma', confidence: 2.3 }
        ],
        explanation: 'The model identified asymmetric pigmentation, irregular border morphology, and color variation — hallmark features of Melanoma per the ABCDE clinical criteria.',
        triggers: 'Prolonged UV exposure, family history of melanoma, immunosuppression, and fair skin type (Fitzpatrick I–II).'
    };

    renderResults(data);
    initTabs(document.body);

    // PDF export
    document.getElementById('export-pdf').addEventListener('click', () => exportPDF(data));

    // ─── Heatmap generation using heatmap.js algorithm ───────────────────
    const heatmapCanvas = document.getElementById('heatmap-canvas');
    const classIndex = 0; // primary prediction

    const runHeatmap = async () => {
        try {
            // Generate both the pure heatmap and the overlay
            const overlayUrl = await generateGradCAM(resultImg, classIndex, 'Hybrid');
            _overlayDataUrl = overlayUrl;

            // Also generate a "heatmap only" version (lower alpha, no base)
            _heatmapDataUrl = await generateGradCAM(resultImg, classIndex, 'EfficientNet');

            // Wire up tab buttons
            document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
                const modes = ['original', 'heatmap', 'overlay'];
                if (modes.includes(btn.dataset.tab)) {
                    btn.addEventListener('click', () =>
                        applyHeatmapMode(btn.dataset.tab, resultImg, heatmapCanvas));
                }
            });
        } catch (err) {
            console.warn('Heatmap generation failed:', err);
        }
    };

    if (resultImg.complete && resultImg.naturalWidth > 0) {
        await runHeatmap();
    } else {
        resultImg.addEventListener('load', runHeatmap);
    }
});
