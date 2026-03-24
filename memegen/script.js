import { GoogleGenerativeAI } from "@google/generative-ai";

const ELEMENTS = {
    apiKey: document.getElementById('apiKey'),
    fileInput: document.getElementById('fileInput'),
    dropZone: document.getElementById('dropZone'),
    aiPrompt: document.getElementById('aiPrompt'),
    generateTextBtn: document.getElementById('generateTextBtn'),
    generateImgBtn: document.getElementById('generateImgBtn'),
    geminiBtn: document.getElementById('geminiBtn'),
    aiCaptionsList: document.getElementById('aiCaptionsList'),
    topText: document.getElementById('topText'),
    bottomText: document.getElementById('bottomText'),
    fontSize: document.getElementById('fontSize'),
    textStyle: document.getElementById('textStyle'),
    downloadBtn: document.getElementById('downloadBtn'),
    memeCanvas: document.getElementById('memeCanvas'),
    placeholder: document.getElementById('placeholder')
};

const ctx = ELEMENTS.memeCanvas.getContext('2d');
let currentImage = null;

// --- Initialization ---

// Handle file selection
ELEMENTS.dropZone.addEventListener('click', () => ELEMENTS.fileInput.click());
ELEMENTS.fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

ELEMENTS.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    ELEMENTS.dropZone.classList.add('dragover');
});

ELEMENTS.dropZone.addEventListener('dragleave', () => {
    ELEMENTS.dropZone.classList.remove('dragover');
});

ELEMENTS.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    ELEMENTS.dropZone.classList.remove('dragover');
    handleFile(e.dataTransfer.files[0]);
});

// Real-time Canvas Updates
const inputs = [ELEMENTS.topText, ELEMENTS.bottomText, ELEMENTS.fontSize, ELEMENTS.textStyle];
inputs.forEach(input => {
    input.addEventListener('input', drawMeme);
});

// AI Generation Logic
ELEMENTS.generateTextBtn.addEventListener('click', generateFreeCaptions);
ELEMENTS.generateImgBtn.addEventListener('click', generateFreeImage);
ELEMENTS.geminiBtn.addEventListener('click', generateAICaptions);

// Download Logic
ELEMENTS.downloadBtn.addEventListener('click', downloadMeme);

// --- Functions ---

function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            ELEMENTS.placeholder.classList.add('hidden');
            ELEMENTS.downloadBtn.disabled = false;
            drawMeme();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Generate Image via Pollinations (No Key)
async function generateFreeImage() {
    const prompt = ELEMENTS.aiPrompt.value.trim();
    if (!prompt) {
        alert("Enter a description to generate an image!");
        return;
    }

    ELEMENTS.generateImgBtn.disabled = true;
    ELEMENTS.generateImgBtn.innerText = "...";

    const imgUrl = `https://pollinations.ai/p/${encodeURIComponent(prompt)}?width=1000&height=1000&seed=${Math.floor(Math.random() * 1000)}`;
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
        currentImage = img;
        ELEMENTS.placeholder.classList.add('hidden');
        ELEMENTS.downloadBtn.disabled = false;
        ELEMENTS.generateImgBtn.disabled = false;
        ELEMENTS.generateImgBtn.innerText = "AI Image (Free)";
        drawMeme();
    };
    img.src = imgUrl;
}

// Generate Captions via Pollinations (No Key)
async function generateFreeCaptions() {
    const vibe = ELEMENTS.aiPrompt.value.trim() || "funny meme";
    ELEMENTS.generateTextBtn.disabled = true;
    ELEMENTS.generateTextBtn.innerText = "...";

    try {
        const prompt = `Generate 3 funny meme captions (top and bottom text) for a meme about: "${vibe}". Return ONLY a JSON array: [{"top":"...", "bottom":"..."}, ...]`;
        const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
        const text = await response.text();
        
        const jsonStr = text.replace(/```json|```/g, '').trim();
        const captions = JSON.parse(jsonStr);
        displayCaptions(captions);
    } catch (e) {
        console.error(e);
        alert("Failed to get free captions.");
    } finally {
        ELEMENTS.generateTextBtn.disabled = false;
        ELEMENTS.generateTextBtn.innerText = "AI Caption (Free)";
    }
}

function drawMeme() {
    if (!currentImage) return;

    // Set canvas size to match image or a reasonable limit
    const MAX_SIZE = 1000;
    let width = currentImage.width;
    let height = currentImage.height;

    if (width > MAX_SIZE || height > MAX_SIZE) {
        const ratio = Math.min(MAX_SIZE / width, MAX_SIZE / height);
        width *= ratio;
        height *= ratio;
    }

    ELEMENTS.memeCanvas.width = width;
    ELEMENTS.memeCanvas.height = height;

    // Draw background image
    ctx.drawImage(currentImage, 0, 0, width, height);

    // Text settings
    const fontVal = ELEMENTS.fontSize.value;
    const style = ELEMENTS.textStyle.value;
    
    ctx.textAlign = 'center';
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = fontVal / 10;

    if (style === 'classic') {
        ctx.font = `bold ${fontVal}px Impact, sans-serif`;
        ctx.textTransform = 'uppercase';
    } else {
        ctx.font = `700 ${fontVal}px 'Inter', sans-serif`;
    }

    // Draw Top Text
    const top = (style === 'classic' ? ELEMENTS.topText.value.toUpperCase() : ELEMENTS.topText.value);
    if (top) {
        ctx.textBaseline = 'top';
        ctx.strokeText(top, width / 2, 20);
        ctx.fillText(top, width / 2, 20);
    }

    // Draw Bottom Text
    const bottom = (style === 'classic' ? ELEMENTS.bottomText.value.toUpperCase() : ELEMENTS.bottomText.value);
    if (bottom) {
        ctx.textBaseline = 'bottom';
        ctx.strokeText(bottom, width / 2, height - 20);
        ctx.fillText(bottom, width / 2, height - 20);
    }
}

async function generateAICaptions() {
    const key = ELEMENTS.apiKey.value.trim();
    if (!key) {
        alert("Please enter a Gemini API Key first.");
        return;
    }

    const promptText = ELEMENTS.aiPrompt.value.trim() || "funny";
    ELEMENTS.geminiBtn.disabled = true;
    ELEMENTS.geminiBtn.innerText = "Thinking...";

    try {
        const genAI = new GoogleGenerativeAI(key);
        // Using -latest to ensure we get the most recent version
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 

        // Convert current image to base64 for Gemini
        const base64Data = ELEMENTS.memeCanvas.toDataURL('image/jpeg', 0.8).split(',')[1];

        const result = await model.generateContent([
            `Analyze this image and generate 3 short, hilarious meme captions (top and bottom text style) based on this vibe: "${promptText}". 
             Format your response as a JSON array of objects like this: [{"top": "TEXT", "bottom": "TEXT"}]. 
             Only return the JSON array, nothing else.`,
            { inlineData: { data: base64Data, mimeType: "image/jpeg" } }
        ]);

        const response = await result.response;
        const text = response.text();
        console.log("Gemini Response:", text);
        
        // Clean markdown if AI includes it
        const jsonStr = text.replace(/```json|```/g, '').trim();
        const captions = JSON.parse(jsonStr);

        displayCaptions(captions);
    } catch (error) {
        console.error("AI Error:", error);
        alert("Wait, AI failed: " + error.message);
    } finally {
        ELEMENTS.geminiBtn.disabled = false;
        ELEMENTS.geminiBtn.innerText = "Gemini AI (Requires Key)";
    }
}

function displayCaptions(captions) {
    ELEMENTS.aiCaptionsList.innerHTML = '';
    ELEMENTS.aiCaptionsList.classList.remove('hidden');

    captions.forEach(cap => {
        const el = document.createElement('div');
        el.className = 'caption-item';
        el.innerHTML = `<strong>Top:</strong> ${cap.top}<br><strong>Bottom:</strong> ${cap.bottom}`;
        el.onclick = () => {
            ELEMENTS.topText.value = cap.top;
            ELEMENTS.bottomText.value = cap.bottom;
            drawMeme();
        };
        ELEMENTS.aiCaptionsList.appendChild(el);
    });
}

function downloadMeme() {
    const link = document.createElement('a');
    link.download = `meme-${Date.now()}.png`;
    link.href = ELEMENTS.memeCanvas.toDataURL('image/png');
    link.click();
}
