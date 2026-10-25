// Affiliate ads carousel (AliExpress Portals) shown in the menu, never while
// playing. The ads come from static/ads.txt, one per line:
//   name | affiliate link | image | label (optional) | category (optional)
// Each time a carousel is shown it starts with ads not seen recently, so the
// player goes through the whole list before any repeats. A category (for
// example "mando") lets a page show related ads first.
const Ads = {
    file: 'static/ads.txt',
    rotateMs: 6000,
    maxSlides: 6,

    async load() {
        if (!this.loading) {
            this.loading = fetch(this.file, { cache: 'no-cache' })
                .then((response) => (response.ok ? response.text() : ''))
                .then((text) => this.parse(text))
                .catch(() => []);
        }
        this.list = await this.loading;
        return this.list;
    },

    parse(text) {
        const ads = [];
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) {
                continue;
            }
            const [name, url, image, label, category] = line.split('|').map((cell) => cell.trim());
            if (!name || !/^https:\/\/\S+$/i.test(url || '')) {
                continue;
            }
            ads.push({
                name: name.slice(0, 80),
                url,
                image: /^https:\/\/\S+$/i.test(image || '') ? image : '',
                label: (label || '').slice(0, 40),
                category: (category || '').toLowerCase(),
            });
        }
        return ads;
    },

    // Least recently shown first (random among equals), related category first.
    pick(category) {
        let seen = {};
        try {
            seen = JSON.parse(localStorage.getItem('gemuboy:adsSeen') || '{}');
        } catch (ignored) { }
        const score = (ad) => (seen[ad.url] || 0) + Math.random();
        const ordered = [...this.list].sort((a, b) => score(a) - score(b));
        if (category) {
            ordered.sort((a, b) => (b.category === category) - (a.category === category));
        }
        return ordered.slice(0, this.maxSlides);
    },

    markSeen(ad) {
        try {
            const seen = JSON.parse(localStorage.getItem('gemuboy:adsSeen') || '{}');
            seen[ad.url] = Date.now();
            localStorage.setItem('gemuboy:adsSeen', JSON.stringify(seen));
        } catch (ignored) { }
    },

    // Fills a container (an element with class "ads") with a carousel.
    async render(container, { category = '' } = {}) {
        if (!container) {
            return;
        }
        this.stop(container);
        container.hidden = true;
        container.innerHTML = '';
        if (!navigator.onLine) {
            return;
        }
        await this.load();
        if (!this.list.length) {
            return;
        }
        const slides = this.pick(category);
        container.innerHTML = `
            <div class="ads-head"><span>Patrocinado · AliExpress</span><span class="ads-dots"></span></div>
            <div class="ads-track"></div>
            <p class="ads-note">Enlace de afiliado: si compras, GBoy-JS recibe una pequeña comisión sin costo extra para ti.</p>`;
        const track = container.querySelector('.ads-track');
        const dots = container.querySelector('.ads-dots');
        slides.forEach((ad, index) => {
            const link = document.createElement('a');
            link.className = 'ad';
            link.href = ad.url;
            link.target = '_blank';
            link.rel = 'sponsored noopener noreferrer';
            link.innerHTML = `
                <span class="ad-img"></span>
                <span class="ad-text"><strong data-no-i18n></strong><small data-no-i18n></small><em>Ver en AliExpress ›</em></span>`;
            link.querySelector('strong').textContent = ad.name;
            const small = link.querySelector('small');
            small.textContent = ad.label;
            small.hidden = !ad.label;
            if (ad.image) {
                const img = document.createElement('img');
                img.alt = '';
                img.loading = index ? 'lazy' : 'eager';
                img.referrerPolicy = 'no-referrer';
                img.onerror = () => img.remove();
                img.src = ad.image;
                link.querySelector('.ad-img').appendChild(img);
            }
            link.addEventListener('click', () => {
                Analytics.event('ad_click', { ad: ad.name, category: ad.category, position: index + 1, page: category || 'main' });
            });
            track.appendChild(link);
            const dot = document.createElement('i');
            dots.appendChild(dot);
        });
        dots.hidden = slides.length < 2;
        container.hidden = false;

        // Current slide follows the scroll (swipe) and counts as seen.
        const state = { index: -1, slides, track, dots, category };
        container.adsState = state;
        const show = (index) => {
            if (index === state.index) {
                return;
            }
            state.index = index;
            [...dots.children].forEach((dot, i) => dot.classList.toggle('on', i === index));
            this.markSeen(slides[index]);
            Analytics.event('ad_view', { ad: slides[index].name, page: category || 'main' });
        };
        track.addEventListener('scroll', () => {
            show(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
        }, { passive: true });
        show(0);

        // Auto-advance, paused while the player touches the carousel.
        const pause = () => { state.pausedUntil = Date.now() + this.rotateMs * 2; };
        track.addEventListener('pointerdown', pause, { passive: true });
        track.addEventListener('touchstart', pause, { passive: true });
        if (slides.length > 1) {
            state.timer = setInterval(() => {
                // Not on screen (menu closed or another page): wait.
                if (!container.offsetParent || document.hidden || Date.now() < (state.pausedUntil || 0)) {
                    return;
                }
                const next = (state.index + 1) % slides.length;
                track.scrollTo({ left: next * track.clientWidth, behavior: 'smooth' });
            }, this.rotateMs);
        }
    },

    stop(container) {
        if (container && container.adsState) {
            clearInterval(container.adsState.timer);
            container.adsState = null;
        }
    },
};
