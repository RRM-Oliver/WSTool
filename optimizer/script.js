document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const resultsSection = document.getElementById('resultsSection');
    const resultsGrid = document.getElementById('resultsGrid');
    const qualitySlider = document.getElementById('quality');
    const qualityValue = document.getElementById('qualityValue');
    const targetWidthInput = document.getElementById('targetWidth');
    const targetSizeSelect = document.getElementById('targetSize');
    const formatSelect = document.getElementById('format');
    const downloadAllBtn = document.getElementById('downloadAll');

    let processedFiles = [];

    // Update quality label
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = `${qualitySlider.value}%`;
    });

    // Handle drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('active'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('active'), false);
    });

    dropZone.addEventListener('drop', handleDrop, false);
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleDrop(e) {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    }

    function handleFiles(files) {
        if (files.length > 0) {
            resultsSection.hidden = false;
            Array.from(files).forEach(file => {
                const id = Date.now() + Math.random().toString(36).substr(2, 9);
                processImage(file, id);
            });
        }
    }

    function cleanFileName(name) {
        const lastDotIndex = name.lastIndexOf('.');
        const baseName = lastDotIndex !== -1 ? name.substring(0, lastDotIndex) : name;
        
        let clean = baseName
            .replace(/'/g, '')
            .replace(/[^a-zA-Z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
        
        return clean || 'optimized-image';
    }

    async function processImage(file, id, existingData = null) {
        const reader = new FileReader();
        
        // If re-optimizing, we might already have the original image object
        if (existingData) {
            runOptimization(existingData.originalImg, existingData.originalFile, id);
        } else {
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => runOptimization(img, file, id);
            };
        }
    }

    async function runOptimization(img, originalFile, id) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let targetWidth = parseInt(targetWidthInput.value);
        let width = img.width;
        let height = img.height;

        if (width > targetWidth) {
            const ratio = targetWidth / width;
            width = targetWidth;
            height = img.height * ratio;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const quality = parseInt(qualitySlider.value) / 100;
        const targetKB = parseInt(targetSizeSelect.value);
        const mimeType = formatSelect.value;
        const extension = mimeType === 'image/webp' ? '.webp' : '.jpg';
        
        let blob;
        if (targetKB > 0) {
            blob = await optimizeToSize(canvas, targetKB, mimeType);
        } else {
            blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
        }

        const cleanedName = cleanFileName(originalFile.name);
        const url = URL.createObjectURL(blob);
        
        const fileData = {
            id,
            originalFile,
            originalImg: img,
            name: cleanedName + extension,
            blob,
            url,
            width,
            height
        };

        // Update or Add
        const existingIndex = processedFiles.findIndex(f => f.id === id);
        if (existingIndex > -1) {
            // Revoke old URL
            URL.revokeObjectURL(processedFiles[existingIndex].url);
            processedFiles[existingIndex] = fileData;
        } else {
            processedFiles.push(fileData);
        }

        updateUI();
    }

    async function optimizeToSize(canvas, targetKB, mimeType) {
        let min = 0.1;
        let max = 1.0;
        let quality = 0.85;
        let bestBlob = null;
        const targetBytes = targetKB * 1024;

        for (let i = 0; i < 6; i++) {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, quality));
            bestBlob = blob;
            if (blob.size > targetBytes) {
                max = quality;
                quality = (min + quality) / 2;
            } else {
                min = quality;
                quality = (max + quality) / 2;
                if (blob.size > targetBytes * 0.95) break;
            }
        }
        return bestBlob;
    }

    function updateUI() {
        resultsGrid.innerHTML = '';
        processedFiles.forEach(file => {
            const card = createResultCard(file);
            resultsGrid.appendChild(card);
        });
        downloadAllBtn.hidden = processedFiles.length <= 1;
        resultsSection.hidden = processedFiles.length === 0;
    }

    function createResultCard(file) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="thumbnail-container">
                <img src="${file.url}" alt="${file.name}">
            </div>
            <div class="file-info">
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-meta">${file.width}x${file.height} • ${formatSize(file.blob.size)}</div>
            </div>
            <div class="card-actions">
                <a href="${file.url}" download="${file.name}" class="btn btn-primary btn-small">Download</a>
                <button class="btn btn-secondary btn-small re-opt-btn" data-id="${file.id}" title="Re-optimize with current settings">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
                <button class="btn btn-danger btn-small delete-btn" data-id="${file.id}" title="Remove image">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                </button>
            </div>
        `;

        card.querySelector('.re-opt-btn').onclick = () => processImage(file.originalFile, file.id, file);
        card.querySelector('.delete-btn').onclick = () => {
            processedFiles = processedFiles.filter(f => f.id !== file.id);
            URL.revokeObjectURL(file.url);
            updateUI();
        };

        return card;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    downloadAllBtn.addEventListener('click', async () => {
        if (!window.JSZip) {
            alert('Batch download library not loaded. Please wait a moment.');
            return;
        }
        const zip = new JSZip();
        processedFiles.forEach(file => {
            zip.file(file.name, file.blob);
        });
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'optimized-captures.zip';
        a.click();
        URL.revokeObjectURL(url);
    });
});
