document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewContainer = document.getElementById('preview-container');
    const analyzeBtn = document.getElementById('analyze-btn');
    const loader = document.getElementById('loader');
    const cameraBtn = document.getElementById('camera-btn');

    let videoStream = null;
    let videoElement = null;

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) {
            handleFile(fileInput.files[0]);
        }
    });

    function handleFile(file) {
        if (!file.type.startsWith('image/')) {
            return alert('Please upload a valid image file.');
        }
        stopCamera();
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            showPreview(dataUrl);
        };
        reader.readAsDataURL(file);
    }

    function showPreview(dataUrl) {
        sessionStorage.setItem('currentImage', dataUrl);
        previewContainer.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
        analyzeBtn.style.display = 'flex';
        cameraBtn.textContent = '📷 Retake Photo';
        
        const patientForm = document.getElementById('patient-details-form');
        if (patientForm) patientForm.style.display = 'block';
    }

    function stopCamera() {
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
        }
        if (videoElement) {
            videoElement.remove();
            videoElement = null;
        }
    }

    cameraBtn.addEventListener('click', async () => {
        if (videoStream) {
            // Camera is running, capture the frame
            const canvas = document.createElement('canvas');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            stopCamera();
            showPreview(dataUrl);
        } else {
            // Start the camera
            try {
                videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                videoElement = document.createElement('video');
                videoElement.srcObject = videoStream;
                videoElement.autoplay = true;
                videoElement.playsInline = true;
                videoElement.style.width = '100%';
                videoElement.style.height = '100%';
                videoElement.style.objectFit = 'cover';

                previewContainer.innerHTML = '';
                previewContainer.appendChild(videoElement);

                cameraBtn.textContent = '📸 Capture Photo';
                analyzeBtn.style.display = 'none';
            } catch (err) {
                console.error("Error accessing the camera: ", err);
                alert("Could not access the camera. Please ensure you have granted permissions.");
            }
        }
    });

    analyzeBtn.addEventListener('click', async () => {
        // Capture patient details
        const patientName = document.getElementById('patient-name')?.value || '';
        const patientAge = document.getElementById('patient-age')?.value || '';
        const patientSex = document.getElementById('patient-sex')?.value || '';
        const patientHistory = document.getElementById('patient-history')?.value || '';
        
        if (!patientName && !patientAge && !patientSex && !patientHistory) {
            const proceed = confirm("You haven't entered any patient details (Name, Age, Sex, History). These details help with the exported PDF report. Do you want to proceed without them?");
            if (!proceed) return;
        }

        analyzeBtn.style.display = 'none';
        loader.style.display = 'block';

        const patientForm = document.getElementById('patient-details-form');
        if (patientForm) patientForm.style.display = 'none';

        if (patientName || patientAge || patientSex || patientHistory) {
            sessionStorage.setItem('patientDetails', JSON.stringify({
                name: patientName,
                age: patientAge,
                sex: patientSex,
                history: patientHistory
            }));
        } else {
            sessionStorage.removeItem('patientDetails');
        }

        const loaderMsg = document.querySelector('#loader p');
        const setStatus = (msg) => { if (loaderMsg) loaderMsg.textContent = msg; };

        const imageDataUrl = sessionStorage.getItem('currentImage');
        sessionStorage.removeItem('apiResult'); // clear any previous result

        const apiKey = typeof API_CONFIG !== 'undefined' && API_CONFIG.GROK_API_KEY;
        const hasKey = apiKey && apiKey.trim() !== '' && !apiKey.startsWith('xai-XXX');

        if (hasKey) {
            // ── LIVE PATH: Grok Vision API ───────────────────────────────────
            try {
                setStatus('Connecting to HAM1000 Trained AI Model...');
                const result = await analyzeImageWithGrok(imageDataUrl, setStatus);
                sessionStorage.setItem('apiResult', JSON.stringify(result));
                setStatus('Analysis complete! Loading results...');
                setTimeout(() => { window.location.href = 'results.html'; }, 600);
            } catch (err) {
                console.error('Grok Vision API error:', err);
                loader.style.display = 'none';
                analyzeBtn.style.display = 'flex';
                const hint = err.message.includes('NO_API_KEY')
                    ? 'No API key found. Add your Grok key to config/api_keys.js'
                    : `API Error: ${err.message}`;
                alert(`⚠️ ${hint}`);
            }
        } else {
            // ── FALLBACK PATH: Backend hash-based mock ───────────────────────
            setStatus('Analyzing with local model...');
            try {
                const res = await fetch(imageDataUrl);
                const blob = await res.blob();
                const formData = new FormData();
                formData.append('file', blob, 'image.png');

                const apiRes = await fetch(`${(typeof API_CONFIG !== 'undefined' && API_CONFIG.BACKEND_URL) || 'http://localhost:8000'}/predict`, {
                    method: 'POST',
                    body: formData
                });

                if (apiRes.ok) {
                    const data = await apiRes.json();
                    sessionStorage.setItem('apiResult', JSON.stringify(data));
                }
            } catch (_) {
                // No backend either — results.html will use its own fallback demo data
            }
            setStatus('Loading results...');
            setTimeout(() => { window.location.href = 'results.html'; }, 500);
        }
    });
});
