// Interface language. The app is written in Spanish; in English every text node
// and label attribute is translated on the fly (also the ones the app writes
// later, through a MutationObserver), so the rest of the code stays unchanged.
// Game titles, descriptions and other user content are left as they are.
const I18n = {
    lang: 'es',
    attributes: ['placeholder', 'aria-label', 'title', 'alt'],
    texts: new WeakMap(), // text node -> { src, out }
    attrs: new WeakMap(), // element -> { attribute: { src, out } }

    init(saved) {
        const browser = (navigator.languages && navigator.languages[0]) || navigator.language || 'es';
        this.patchDialogs();
        this.setLanguage(saved || (/^es\b/i.test(browser) ? 'es' : 'en'));
    },

    get locale() {
        return this.lang === 'en' ? 'en' : 'es';
    },

    setLanguage(lang) {
        this.lang = lang === 'en' ? 'en' : 'es';
        document.documentElement.lang = this.lang;
        this.walk(document.body);
        if (!this.observer) {
            this.observer = new MutationObserver((mutations) => this.onMutations(mutations));
            this.observer.observe(document.body, {
                subtree: true,
                childList: true,
                characterData: true,
                attributes: true,
                attributeFilter: this.attributes,
            });
        }
        const button = document.getElementById('lang-btn');
        if (button) {
            // The button shows the language it switches to.
            button.querySelector('span').textContent = this.lang === 'es' ? 'EN' : 'ES';
            button.setAttribute('aria-label', this.lang === 'es' ? 'Cambiar idioma a inglés' : 'Cambiar idioma a español');
            this.translateAttribute(button, 'aria-label');
        }
    },

    // Translates a Spanish text (exact sentences first, then patterns with values).
    tr(text) {
        if (this.lang === 'es' || typeof text !== 'string') {
            return text;
        }
        const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        const core = match[2];
        if (!core) {
            return text;
        }
        const key = core.replace(/\s+/g, ' ');
        let out = this.lookup(key);
        if (out === undefined && /\n/.test(core)) {
            out = core.split('\n').map((line) => this.tr(line)).join('\n');
        }
        return out === undefined ? text : match[1] + out + match[3];
    },

    lookup(key) {
        const dict = I18nEnglish.text;
        if (Object.prototype.hasOwnProperty.call(dict, key)) {
            return dict[key];
        }
        for (const [pattern, replacement] of I18nEnglish.patterns) {
            const found = pattern.exec(key);
            if (found) {
                return typeof replacement === 'function'
                    ? replacement(...found.slice(1).map((part) => (part === undefined ? part : this.tr(part))))
                    : key.replace(pattern, replacement);
            }
        }
        return undefined;
    },

    // Text inside text areas is user input; their placeholder is still translated.
    skip(node, attribute) {
        const element = node.nodeType === 1 ? node : node.parentElement;
        return !element || !!element.closest(attribute ? 'script, style, [data-no-i18n]' : 'script, style, textarea, [data-no-i18n]');
    },

    walk(root) {
        if (!root || this.skip(root)) {
            return;
        }
        if (root.nodeType === 3) {
            this.translateText(root);
            return;
        }
        if (root.nodeType !== 1) {
            return;
        }
        for (const name of this.attributes) {
            if (root.hasAttribute(name)) {
                this.translateAttribute(root, name);
            }
        }
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => (node.nodeType === 1 && node.matches('script, style, [data-no-i18n]')
                ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
        });
        let node = walker.nextNode();
        while (node) {
            if (node.nodeType === 3) {
                if (node.parentElement.tagName !== 'TEXTAREA') {
                    this.translateText(node);
                }
            } else {
                for (const name of this.attributes) {
                    if (node.hasAttribute(name)) {
                        this.translateAttribute(node, name);
                    }
                }
            }
            node = walker.nextNode();
        }
    },

    translateText(node) {
        const data = node.data;
        let record = this.texts.get(node);
        if (!record || data !== record.out) {
            record = { src: data };
            this.texts.set(node, record);
        }
        record.out = this.lang === 'es' ? record.src : this.tr(record.src);
        if (data !== record.out) {
            node.data = record.out;
        }
    },

    translateAttribute(element, name) {
        const value = element.getAttribute(name);
        let all = this.attrs.get(element);
        if (!all) {
            all = {};
            this.attrs.set(element, all);
        }
        let record = all[name];
        if (!record || value !== record.out) {
            record = all[name] = { src: value };
        }
        record.out = this.lang === 'es' ? record.src : this.tr(record.src);
        if (value !== record.out) {
            element.setAttribute(name, record.out);
        }
    },

    onMutations(mutations) {
        for (const mutation of mutations) {
            if (mutation.type === 'characterData') {
                if (!this.skip(mutation.target)) {
                    this.translateText(mutation.target);
                }
            } else if (mutation.type === 'attributes') {
                if (!this.skip(mutation.target, true) && mutation.target.hasAttribute(mutation.attributeName)) {
                    this.translateAttribute(mutation.target, mutation.attributeName);
                }
            } else {
                mutation.addedNodes.forEach((node) => this.walk(node));
            }
        }
    },

    // alert / confirm / prompt messages come from the app in Spanish too.
    patchDialogs() {
        for (const name of ['alert', 'confirm', 'prompt']) {
            const original = window[name];
            window[name] = (message, ...rest) => original.call(window, this.tr(message), ...rest);
        }
    },
};
