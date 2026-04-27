document.addEventListener('DOMContentLoaded', () => {
    const checkBtn = document.getElementById('checkBtn');
    const btnLoader = document.getElementById('btnLoader');
    const urlsInput = document.getElementById('urls');
    const resultsList = document.getElementById('resultsList');
    const statsCard = document.getElementById('statsCard');
    const pagesCountEl = document.getElementById('pagesCount');
    const errorsCountEl = document.getElementById('errorsCount');

    let dictionary = null;
    const PROXIES = [
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ];
    
    // Technical terms to ignore (customizable)
    const IGNORE_WORDS = new Set([
        'css', 'html', 'js', 'json', 'url', 'uri', 'api', 'svg', 'utf', 'xml', 'id', 'class', 'href', 'src', 'alt',
        'aria', 'viewport', 'favicon', 'github', 'google', 'bootstrap', 'vanilla', 'npm', 'npx', 'cdn',
        'http', 'https', 'www', 'com', 'org', 'net', 'io', 'gov', 'edu', 'php', 'asp', 'aspx', 'jsp',
        'padding', 'margin', 'border', 'flex', 'grid', 'rgba', 'hsl', 'rgb', 'px', 'rem', 'em', 'vh', 'vw'
    ]);

    // Load Dictionary
    async function loadDictionary() {
        try {
            console.log('Loading dictionary...');
            const affResponse = await fetch('https://cdn.jsdelivr.net/gh/titoBouzout/Dictionaries@master/English%20(American).aff');
            if (!affResponse.ok) throw new Error('Failed to load .aff file');
            const affData = await affResponse.text();

            const dicResponse = await fetch('https://cdn.jsdelivr.net/gh/titoBouzout/Dictionaries@master/English%20(American).dic');
            if (!dicResponse.ok) throw new Error('Failed to load .dic file');
            const dicData = await dicResponse.text();

            dictionary = new Typo('en_US', affData, dicData);
            console.log('Dictionary loaded successfully');
        } catch (error) {
            console.error('Failed to load dictionary:', error);
            const errorMsg = document.createElement('p');
            errorMsg.style.color = 'var(--error-color)';
            errorMsg.style.padding = '1rem';
            errorMsg.textContent = `⚠️ Dictionary error: ${error.message}. Please check your internet connection or try refreshing.`;
            resultsList.prepend(errorMsg);
        }
    }

    loadDictionary();

    checkBtn.addEventListener('click', async () => {
        const urls = urlsInput.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
        if (urls.length === 0) {
            alert('Please enter at least one URL.');
            return;
        }

        if (!dictionary) {
            alert('Dictionary is still loading. Please wait a moment.');
            return;
        }

        startLoading();
        resultsList.innerHTML = '';
        let totalErrors = 0;

        for (const url of urls) {
            try {
                const pageResult = await checkPage(url);
                totalErrors += pageResult.errors.length;
                renderPageResult(url, pageResult);
            } catch (error) {
                renderError(url, error.message);
            }
        }

        pagesCountEl.textContent = urls.length;
        errorsCountEl.textContent = totalErrors;
        statsCard.classList.remove('hidden');
        stopLoading();
    });

    async function checkPage(url) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        let lastError = null;
        let html = null;

        for (const proxy of PROXIES) {
            try {
                const response = await fetch(`${proxy}${encodeURIComponent(fullUrl)}`);
                if (response.ok) {
                    html = await response.text();
                    if (html && html.trim().length > 0) break;
                }
                lastError = `Proxy ${proxy} returned ${response.status}`;
            } catch (e) {
                lastError = e.message;
            }
        }

        if (!html) {
            throw new Error(`Failed to fetch content after trying multiple proxies. Last error: ${lastError}`);
        }
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        if (doc.querySelector('parsererror')) {
            throw new Error('Failed to parse the page HTML.');
        }

        const extracted = [];
        
        // 1. Regular text elements
        const textSelectors = 'h1, h2, h3, h4, h5, h6, p, li, a, span, button, label, em, strong, b, i, u, s, strike, del, blockquote, cite, q, figcaption, summary, address, legend, th, td, dt, dd, caption';
        doc.querySelectorAll(textSelectors).forEach(el => {
            // Get direct text content only to avoid duplicates from nested elements
            const text = Array.from(el.childNodes)
                .filter(node => node.nodeType === 3)
                .map(node => node.textContent.trim())
                .join(' ');
            
            if (text) {
                extracted.push({ text, tag: el.tagName.toLowerCase(), context: el.outerHTML.substring(0, 100) + '...' });
            }
        });

        // 2. Form elements (Select options)
        doc.querySelectorAll('option').forEach(el => {
            if (el.textContent.trim()) {
                extracted.push({ text: el.textContent.trim(), tag: 'option', context: 'Select option' });
            }
        });

        // 3. Placeholders
        doc.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
            extracted.push({ text: el.getAttribute('placeholder'), tag: el.tagName.toLowerCase(), context: 'Placeholder attribute' });
        });

        // 4. Attributes (Alt, Title)
        doc.querySelectorAll('[alt], [title]').forEach(el => {
            if (el.getAttribute('alt')) {
                extracted.push({ text: el.getAttribute('alt'), tag: el.tagName.toLowerCase(), context: 'Alt attribute' });
            }
            if (el.getAttribute('title')) {
                extracted.push({ text: el.getAttribute('title'), tag: el.tagName.toLowerCase(), context: 'Title attribute' });
            }
        });

        // 5. ARIA Labels
        doc.querySelectorAll('[aria-label], [aria-description], [aria-placeholder]').forEach(el => {
            ['aria-label', 'aria-description', 'aria-placeholder'].forEach(attr => {
                const val = el.getAttribute(attr);
                if (val) {
                    extracted.push({ text: val, tag: el.tagName.toLowerCase(), context: `${attr} attribute` });
                }
            });
        });

        const typos = [];
        extracted.forEach(item => {
            const words = item.text.match(/\b[A-Za-z']+\b/g);
            if (words) {
                words.forEach(word => {
                    if (word.length < 2) return; // Skip single letters
                    if (IGNORE_WORDS.has(word.toLowerCase())) return;
                    
                    if (!dictionary.check(word)) {
                        typos.push({
                            word: word,
                            tag: item.tag,
                            context: item.text,
                            source: item.context
                        });
                    }
                });
            }
        });

        return { errors: typos };
    }

    function renderPageResult(url, result) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-result';
        
        const count = result.errors.length;
        const countClass = count === 0 ? 'zero' : '';

        pageDiv.innerHTML = `
            <div class="page-header">
                <span class="page-url">${url}</span>
                <span class="typo-count ${countClass}">${count} ${count === 1 ? 'Typo' : 'Typos'}</span>
            </div>
            ${count > 0 ? `
                <div class="typo-grid">
                    ${result.errors.map(err => `
                        <div class="typo-item">
                            <span class="context-tag">${err.tag}</span>
                            <span class="misspelled-word">${err.word}</span>
                            <span class="context-text">"...${highlightWord(err.context, err.word)}..."</span>
                        </div>
                    `).join('')}
                </div>
            ` : `
                <p style="color: var(--success-color); font-weight: 600; text-align: center; padding: 1rem;">
                    ✨ No spelling errors found on this page!
                </p>
            `}
        `;
        resultsList.appendChild(pageDiv);
    }

    function highlightWord(text, word) {
        const index = text.toLowerCase().indexOf(word.toLowerCase());
        if (index === -1) return text;
        const before = text.substring(0, index);
        const actualWord = text.substring(index, index + word.length);
        const after = text.substring(index + word.length);
        // Trim context for display
        const start = Math.max(0, index - 30);
        const end = Math.min(text.length, index + word.length + 30);
        return `${text.substring(start, index)}<mark>${actualWord}</mark>${text.substring(index + word.length, end)}`;
    }

    function renderError(url, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'page-result';
        errorDiv.innerHTML = `
            <div class="page-header">
                <span class="page-url">${url}</span>
                <span class="typo-count">Error</span>
            </div>
            <p style="color: var(--error-color);">${message}</p>
        `;
        resultsList.appendChild(errorDiv);
    }

    function startLoading() {
        checkBtn.disabled = true;
        btnLoader.classList.remove('hidden');
        checkBtn.querySelector('span').textContent = 'Scanning...';
    }

    function stopLoading() {
        checkBtn.disabled = false;
        btnLoader.classList.add('hidden');
        checkBtn.querySelector('span').textContent = 'Check Spelling';
    }
});
