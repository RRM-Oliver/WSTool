const { PDFDocument } = PDFLib;

// Initialize pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const editorSection = document.getElementById('editor-section');
const fileListContainer = document.getElementById('file-list');
const bulkActions = document.getElementById('bulk-actions');
const filesCountBadge = document.getElementById('files-count-badge');
const processAllBtn = document.getElementById('process-all-btn');
const downloadZipBtn = document.getElementById('download-zip-btn');
const resetBtn = document.getElementById('reset-btn');

let filesQueue = []; // Array of { file, status, resultPdf, resultCover, id, settings: { title, author, subject, keywords, quality, extractCover } }

// Drag and drop handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFiles(e.target.files);
    }
});

resetBtn.addEventListener('click', () => {
    if (confirm('Clear all files?')) {
        resetEditor();
    }
});

function formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function handleFiles(fileList) {
    const newFiles = Array.from(fileList).filter(file => file.type === 'application/pdf');
    
    if (newFiles.length === 0) {
        alert('Please upload PDF files.');
        return;
    }

    for (const file of newFiles) {
        const id = Math.random().toString(36).substr(2, 9);
        
        // Extract initial metadata
        let initialMeta = { title: '', author: '', subject: '', keywords: '' };
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            initialMeta = {
                title: pdfDoc.getTitle() || '',
                author: pdfDoc.getAuthor() || '',
                subject: pdfDoc.getSubject() || '',
                keywords: (pdfDoc.getKeywords() || '').split(';').join(', ')
            };
        } catch (e) {
            console.warn('Could not read metadata for', file.name);
        }

        filesQueue.push({
            file: file,
            status: 'pending',
            resultPdf: null,
            resultCover: null,
            id: id,
            settings: {
                ...initialMeta,
                quality: 85,
                extractCover: false
            }
        });
    }

    updateUI();
    dropZone.classList.add('hidden');
    editorSection.classList.remove('hidden');
}

function updateUI() {
    renderFileList();
    filesCountBadge.textContent = `${filesQueue.length} ${filesQueue.length === 1 ? 'File' : 'Files'}`;
    bulkActions.classList.toggle('hidden', filesQueue.length === 0);
    
    const someDone = filesQueue.some(f => f.status === 'done');
    downloadZipBtn.classList.toggle('hidden', !someDone);
}

function renderFileList() {
    fileListContainer.innerHTML = '';
    filesQueue.forEach((item) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-item-header">
                <div class="file-info-mini">
                    <svg class="file-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                        <div class="file-name">${item.file.name}</div>
                        <div class="file-meta">${formatSize(item.file.size)}</div>
                    </div>
                </div>
                <button class="btn-icon remove-btn" title="Remove">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            <div class="item-settings">
                <div class="item-quality-control">
                    <label class="item-input-field">
                        <span>Quality: ${item.settings.quality}%</span>
                        <input type="range" class="item-quality-slider" min="50" max="100" value="${item.settings.quality}">
                    </label>
                    <label class="checkbox-item">
                        <input type="checkbox" class="item-extract-cover" ${item.settings.extractCover ? 'checked' : ''}>
                        <span>Extract Cover</span>
                    </label>
                </div>
                <div class="item-meta-grid">
                    <div class="item-input-field">
                        <label>Title</label>
                        <input type="text" class="item-meta-title" value="${item.settings.title}" placeholder="Title">
                    </div>
                    <div class="item-input-field">
                        <label>Author</label>
                        <input type="text" class="item-meta-author" value="${item.settings.author}" placeholder="Author">
                    </div>
                    <div class="item-input-field">
                        <label>Subject</label>
                        <input type="text" class="item-meta-subject" value="${item.settings.subject}" placeholder="Subject">
                    </div>
                    <div class="item-input-field">
                        <label>Keywords</label>
                        <input type="text" class="item-meta-keywords" value="${item.settings.keywords}" placeholder="Keywords">
                    </div>
                </div>
            </div>

            <div class="item-actions-footer">
                <div class="item-status-pill status-${item.status}">
                    ${item.status === 'done' ? 'Ready' : item.status === 'processing' ? 'Processing...' : item.status === 'error' ? 'Error' : 'Pending'}
                </div>
                <div class="action-group">
                    <button class="btn btn-primary btn-small process-single-btn" ${item.status === 'processing' ? 'disabled' : ''}>
                        ${item.status === 'done' ? 'Re-process' : 'Process'}
                    </button>
                    ${item.status === 'done' ? `
                        <button class="btn btn-secondary btn-small download-pdf-btn">Download PDF</button>
                        ${item.resultCover ? `<button class="btn btn-secondary btn-small download-cover-btn">Cover</button>` : ''}
                    ` : ''}
                </div>
            </div>
        `;

        // Listeners for individual settings
        fileItem.querySelector('.item-quality-slider').oninput = (e) => {
            item.settings.quality = e.target.value;
            fileItem.querySelector('label span').textContent = `Quality: ${item.settings.quality}%`;
        };
        fileItem.querySelector('.item-extract-cover').onchange = (e) => item.settings.extractCover = e.target.checked;
        fileItem.querySelector('.item-meta-title').oninput = (e) => item.settings.title = e.target.value;
        fileItem.querySelector('.item-meta-author').oninput = (e) => item.settings.author = e.target.value;
        fileItem.querySelector('.item-meta-subject').oninput = (e) => item.settings.subject = e.target.value;
        fileItem.querySelector('.item-meta-keywords').oninput = (e) => item.settings.keywords = e.target.value;

        fileItem.querySelector('.remove-btn').onclick = () => {
            filesQueue = filesQueue.filter(f => f.id !== item.id);
            if (filesQueue.length === 0) resetEditor(); else updateUI();
        };

        fileItem.querySelector('.process-single-btn').onclick = () => processItem(item);
        
        const dlPdf = fileItem.querySelector('.download-pdf-btn');
        if (dlPdf) dlPdf.onclick = () => downloadSingleItem(item, 'pdf');
        
        const dlCover = fileItem.querySelector('.download-cover-btn');
        if (dlCover) dlCover.onclick = () => downloadSingleItem(item, 'cover');

        fileListContainer.appendChild(fileItem);
    });
}

async function processItem(item) {
    item.status = 'processing';
    updateUI();

    try {
        const quality = item.settings.quality / 100;
        const result = await compressSinglePdf(item.file, quality, item.settings);
        item.resultPdf = result.pdfBlob;
        
        if (item.settings.extractCover) {
            item.resultCover = await extractFirstPageAsImage(item.file, quality);
        } else {
            item.resultCover = null;
        }
        item.status = 'done';
    } catch (err) {
        console.error(`Error processing ${item.file.name}:`, err);
        item.status = 'error';
    }
    updateUI();
}

async function processAll() {
    const pendingItems = filesQueue.filter(f => f.status !== 'processing');
    for (const item of pendingItems) {
        await processItem(item);
    }
}

async function compressSinglePdf(file, quality, settings) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    
    const { jsPDF } = window.jspdf;
    let finalPdfDoc = null;

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const imgData = canvas.toDataURL('image/jpeg', quality);
        const orientation = viewport.width > viewport.height ? 'l' : 'p';
        
        if (i === 1) {
            finalPdfDoc = new jsPDF({ orientation, unit: 'pt', format: [viewport.width, viewport.height] });
        } else {
            finalPdfDoc.addPage([viewport.width, viewport.height], orientation);
        }
        finalPdfDoc.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
    }

    const pdfOutput = finalPdfDoc.output('arraybuffer');
    const metaPdf = await PDFDocument.load(pdfOutput);

    metaPdf.setTitle(settings.title || '');
    metaPdf.setAuthor(settings.author || '');
    metaPdf.setSubject(settings.subject || '');
    metaPdf.setKeywords((settings.keywords || '').split(',').map(k => k.trim()).filter(k => k));

    const pdfBytes = await metaPdf.save();
    return { pdfBlob: new Blob([pdfBytes], { type: 'application/pdf' }) };
}

async function extractFirstPageAsImage(file, quality) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

async function downloadZip() {
    const zip = new JSZip();
    filesQueue.forEach(item => {
        if (item.status === 'done' && item.resultPdf) {
            const baseName = item.file.name.replace(/\.pdf$/i, '');
            zip.file(`${baseName}-compressed.pdf`, item.resultPdf);
            if (item.resultCover) zip.file(`${baseName}-cover.jpg`, item.resultCover);
        }
    });
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bulk-pdfs-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
}

function downloadSingleItem(item, type) {
    const blob = type === 'pdf' ? item.resultPdf : item.resultCover;
    const baseName = item.file.name.replace(/\.pdf$/i, '');
    const ext = type === 'pdf' ? '-compressed.pdf' : '-cover.jpg';
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}${ext}`;
    link.click();
    URL.revokeObjectURL(url);
}

function resetEditor() {
    filesQueue = [];
    fileInput.value = '';
    dropZone.classList.remove('hidden');
    editorSection.classList.add('hidden');
}

processAllBtn.addEventListener('click', processAll);
downloadZipBtn.addEventListener('click', downloadZip);
