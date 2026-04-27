document.addEventListener('DOMContentLoaded', () => {
    const checkBtn = document.getElementById('checkBtn');
    const btnLoader = document.getElementById('btnLoader');
    const urlsInput = document.getElementById('urls');
    const resultsList = document.getElementById('resultsList');
    const statsCard = document.getElementById('statsCard');
    const pagesCountEl = document.getElementById('pagesCount');
    const errorsCountEl = document.getElementById('errorsCount');
    const fixedCountEl = document.getElementById('fixedCount');

    let dictionary = null;
    let ignoredSpelling = new Set();
    let ignoredLinks = new Set();
    
    const PROXIES = [
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url=',
        'https://api.codetabs.com/v1/proxy?quest='
    ];
    
    const IGNORE_WORDS = new Set([
        'css', 'html', 'js', 'json', 'url', 'uri', 'api', 'svg', 'utf', 'xml', 'id', 'class', 'href', 'src', 'alt',
        'aria', 'viewport', 'favicon', 'github', 'google', 'bootstrap', 'vanilla', 'npm', 'npx', 'cdn',
        'http', 'https', 'www', 'com', 'org', 'net', 'io', 'gov', 'edu', 'php', 'asp', 'aspx', 'jsp',
        'padding', 'margin', 'border', 'flex', 'grid', 'rgba', 'hsl', 'rgb', 'px', 'rem', 'em', 'vh', 'vw'
    ]);

    const DOC_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.csv'];

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
        ignoredSpelling.clear();
        ignoredLinks.clear();
        
        let totalProcessedErrors = 0;

        for (const url of urls) {
            try {
                const pageResult = await checkPage(url);
                totalProcessedErrors += pageResult.errors.length;
                renderPageResult(url, pageResult);
            } catch (error) {
                renderError(url, error.message);
            }
        }

        updateGlobalStats();
        pagesCountEl.textContent = urls.length;
        statsCard.classList.remove('hidden');
        stopLoading();
    });

    async function checkPage(url) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        let lastError = null;
        let html = null;

        for (const proxy of PROXIES) {
            try {
                const cacheBustUrl = fullUrl + (fullUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
                const response = await fetch(`${proxy}${encodeURIComponent(cacheBustUrl)}`);
                if (response.ok) {
                    html = await response.text();
                    if (html && html.trim().length > 0) break;
                }
                lastError = `Proxy ${proxy} returned ${response.status}`;
            } catch (e) {
                lastError = e.message;
            }
        }

        if (!html) throw new Error(`Failed to fetch content. Last error: ${lastError}`);
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        if (doc.querySelector('parsererror')) throw new Error('Failed to parse the page HTML.');

        const domain = new URL(fullUrl).hostname;
        const errors = [];

        const getLineNum = (element) => {
            const snippet = element.outerHTML;
            const index = html.indexOf(snippet);
            if (index === -1) {
                const startTag = snippet.match(/^<[^>]+>/)?.[0];
                if (startTag) {
                    const fallbackIndex = html.indexOf(startTag);
                    if (fallbackIndex !== -1) return html.substring(0, fallbackIndex).split('\n').length;
                }
                return '??';
            }
            return html.substring(0, index).split('\n').length;
        };

        // 1. Spell Checking
        const textSelectors = 'h1, h2, h3, h4, h5, h6, p, li, a, span, button, label, em, strong, b, i, u, s, strike, del, blockquote, cite, q, figcaption, summary, address, legend, th, td, dt, dd, caption, option';
        doc.querySelectorAll(textSelectors).forEach(el => {
            const text = Array.from(el.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent.trim()).join(' ');
            if (text) {
                const words = text.match(/\b[A-Za-z'’]+\b/g);
                if (words) {
                    words.forEach(word => {
                        const cleanWord = word.replace('’', "'");
                        if (cleanWord.length < 2 || IGNORE_WORDS.has(cleanWord.toLowerCase())) return;
                        if (!dictionary.check(cleanWord)) {
                            errors.push({ type: 'spelling', value: word, cleanValue: cleanWord, tag: el.tagName.toLowerCase(), context: text, line: getLineNum(el) });
                        }
                    });
                }
            }
        });

        // 2. Attribute Spelling
        doc.querySelectorAll('[alt], [title], [aria-label], [aria-description], [aria-placeholder], [placeholder]').forEach(el => {
            ['alt', 'title', 'aria-label', 'aria-description', 'aria-placeholder', 'placeholder'].forEach(attr => {
                const val = el.getAttribute(attr);
                if (val) {
                    const words = val.match(/\b[A-Za-z'’]+\b/g);
                    if (words) {
                        words.forEach(word => {
                            const cleanWord = word.replace('’', "'");
                            if (cleanWord.length < 2 || IGNORE_WORDS.has(cleanWord.toLowerCase())) return;
                            if (!dictionary.check(cleanWord)) {
                                errors.push({ type: 'spelling', value: word, cleanValue: cleanWord, tag: `${el.tagName.toLowerCase()} [${attr}]`, context: val, line: getLineNum(el) });
                            }
                        });
                    }
                }
            });
        });

        // 3. Link Validation
        doc.querySelectorAll('a').forEach(el => {
            const href = el.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            const target = el.getAttribute('target');
            let isExternal = false;
            let isDoc = false;
            try {
                const linkUrl = new URL(href, fullUrl);
                isExternal = linkUrl.hostname !== domain;
                isDoc = DOC_EXTENSIONS.some(ext => linkUrl.pathname.toLowerCase().endsWith(ext));
            } catch (e) {
                isExternal = href.includes('://') && !href.includes(domain);
                isDoc = DOC_EXTENSIONS.some(ext => href.toLowerCase().split('?')[0].endsWith(ext));
            }

            if (isDoc) {
                if (target !== '_blank') errors.push({ type: 'link', value: href, msg: 'Document link should open in new tab', tag: 'a [doc]', line: getLineNum(el) });
            } else if (isExternal) {
                if (target !== '_blank') errors.push({ type: 'link', value: href, msg: 'External link should open in new tab', tag: 'a [external]', line: getLineNum(el) });
            } else if (target === '_blank') {
                errors.push({ type: 'link', value: href, msg: 'Internal link should stay in same window', tag: 'a [internal]', line: getLineNum(el) });
            }
        });

        return { errors };
    }

    function renderPageResult(url, result) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-result';
        pageDiv.dataset.url = url;
        
        const spellingErrors = result.errors.filter(e => e.type === 'spelling');
        const linkErrors = result.errors.filter(e => e.type === 'link');

        pageDiv.innerHTML = `
            <div class="page-header">
                <span class="page-url">${url}</span>
                <span class="typo-count">${result.errors.length} Errors</span>
            </div>
            <div class="error-categories">
                ${spellingErrors.length > 0 ? `
                    <div class="category-section">
                        <h4 class="category-title">Spelling Errors (${spellingErrors.length})</h4>
                        <div class="typo-grid">${spellingErrors.map(err => renderErrorCard(err)).join('')}</div>
                    </div>
                ` : ''}
                ${linkErrors.length > 0 ? `
                    <div class="category-section">
                        <h4 class="category-title">Link Errors (${linkErrors.length})</h4>
                        <div class="typo-grid">${linkErrors.map(err => renderErrorCard(err)).join('')}</div>
                    </div>
                ` : ''}
            </div>
        `;

        pageDiv.querySelectorAll('.typo-item').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                const value = card.dataset.value;
                const set = type === 'spelling' ? ignoredSpelling : ignoredLinks;
                
                if (set.has(value)) {
                    set.delete(value);
                } else {
                    set.add(value);
                }
                
                syncIgnoredCards();
                updateGlobalStats();
            });
        });

        resultsList.appendChild(pageDiv);
    }

    function renderErrorCard(err) {
        return `
            <div class="typo-item ${err.type}-error" 
                 data-type="${err.type}" 
                 data-value="${err.type === 'spelling' ? err.cleanValue : err.value}" 
                 title="Click to ignore all instances">
                <div class="typo-meta">
                    <span class="context-tag">${err.tag}</span>
                    <span class="line-tag">Line ${err.line}</span>
                </div>
                <span class="misspelled-word">${err.type === 'spelling' ? err.value : 'Link Error'}</span>
                <span class="context-text">${err.type === 'spelling' ? `"...${highlightWord(err.context, err.value)}..."` : err.msg}</span>
                ${err.type === 'link' ? `<code class="link-code">${err.value}</code>` : ''}
                <div class="ignore-overlay">Ignored</div>
            </div>
        `;
    }

    function syncIgnoredCards() {
        document.querySelectorAll('.typo-item').forEach(card => {
            const type = card.dataset.type;
            const value = card.dataset.value;
            const isIgnored = type === 'spelling' ? ignoredSpelling.has(value) : ignoredLinks.has(value);
            card.classList.toggle('ignored', isIgnored);
        });
    }

    function updateGlobalStats() {
        const allCards = document.querySelectorAll('.typo-item');
        const ignoredCards = document.querySelectorAll('.typo-item.ignored');
        
        errorsCountEl.textContent = allCards.length - ignoredCards.length;
        fixedCountEl.textContent = ignoredCards.length;

        // Also update page-level counts
        document.querySelectorAll('.page-result').forEach(page => {
            const pageCards = page.querySelectorAll('.typo-item');
            const pageIgnored = page.querySelectorAll('.typo-item.ignored');
            const count = pageCards.length - pageIgnored.length;
            const countEl = page.querySelector('.typo-count');
            countEl.textContent = `${count} ${count === 1 ? 'Error' : 'Errors'}`;
            countEl.classList.toggle('zero', count === 0);
        });
    }

    function highlightWord(text, word) {
        const index = text.toLowerCase().indexOf(word.toLowerCase());
        if (index === -1) return text;
        const start = Math.max(0, index - 30);
        const end = Math.min(text.length, index + word.length + 30);
        return `${text.substring(start, index)}<mark>${text.substring(index, index + word.length)}</mark>${text.substring(index + word.length, end)}`;
    }

    function renderError(url, message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'page-result';
        errorDiv.innerHTML = `<div class="page-header"><span class="page-url">${url}</span><span class="typo-count">Error</span></div><p style="color: var(--error-color); padding: 1rem;">${message}</p>`;
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
        checkBtn.querySelector('span').textContent = 'Run Fresh Scan';
    }
});
