// AliExpress affiliate ads (Portals). Never shown while playing.
//
// Lists (one ad per line, pasted exactly as the AliExpress "Ad center" gives it):
//   static/ads/general.txt  main menu, game start and the "Productos" catalog
//   static/ads/mandos.txt   controllers: "Mando y teclado" page and the catalog
// A line looks like:
//   <a href="https://s.click.aliexpress.com/e/_xxx" target="_blank"><img src="//ae-pic-a1.aliexpress-media.com/kf/xxx.jpg_80x80.jpg" /></a>
// Optionally followed by " | name | label" (shown under the picture).
// The HTML is never inserted as is: only the link and the picture are read.
//
// "Memory": each ad's last showing is saved, so the least recently seen come
// first (randomly among equals) and the whole list is seen before repeats.
const Ads = {
    lists: { general: 'static/ads/general.txt', mandos: 'static/ads/mandos.txt' },
    rotateMs: 5000,
    // Game start ad: at most once every 3 minutes, never on the game that
    // reopens when the app starts.
    interstitialEvery: 3 * 60 * 1000,
    closeDelay: 3,
    cache: {},

    // Hidden switch (see App.onLogoTap): stored on this device only.
    get off() {
        try {
            return localStorage.getItem('gemuboy:adsOff') === '1';
        } catch (error) {
            return false;
        }
    },

    setOff(off) {
        try {
            if (off) {
                localStorage.setItem('gemuboy:adsOff', '1');
            } else {
                localStorage.removeItem('gemuboy:adsOff');
            }
        } catch (ignored) { }
    },

    load(name) {
        if (!this.cache[name]) {
            this.cache[name] = fetch(this.lists[name], { cache: 'no-cache' })
                .then((response) => (response.ok ? response.text() : ''))
                .then((text) => this.parse(text, name))
                .catch(() => []);
            // Retry next time if it failed (offline at start).
            this.cache[name].then((list) => { if (!list.length) delete this.cache[name]; });
        }
        return this.cache[name];
    },

    // Reads the link and the picture of each line. Plain lines
    // "name | https://link | https://image | label" are accepted too.
    parse(text, list) {
        const ads = [];
        for (const raw of text.split(/\r?\n/)) {
            const line = raw.trim();
            if (!line || line.startsWith('#')) {
                continue;
            }
            let url = '';
            let image = '';
            let extra = [];
            const href = /href\s*=\s*["']([^"']+)["']/i.exec(line);
            if (href) {
                url = href[1];
                const src = /<img[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(line);
                image = src ? src[1] : '';
                const after = line.replace(/^[\s\S]*<\/a>/i, '');
                extra = after.split('|').map((cell) => cell.trim()).filter(Boolean);
            } else {
                const cells = line.split('|').map((cell) => cell.trim());
                const at = cells.findIndex((cell) => /^https:\/\//i.test(cell));
                if (at < 0) {
                    continue;
                }
                url = cells[at];
                image = cells[at + 1] || '';
                extra = [cells.slice(0, at).join(' '), cells[at + 2] || ''].filter(Boolean);
            }
            if (image.startsWith('//')) {
                image = 'https:' + image;
            }
            if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) {
                continue;
            }
            ads.push({
                url,
                image: /^https:\/\/[^\s"'<>]+$/i.test(image) ? image : '',
                name: (extra[0] || '').slice(0, 80),
                label: (extra[1] || '').slice(0, 40),
                list,
            });
        }
        return ads;
    },

    // AliExpress pictures come as "…jpg_80x80.jpg": ask for a bigger size for
    // sharp images, falling back to the original if that size doesn't exist.
    imageUrl(ad, size) {
        return ad.image.replace(/_\d+x\d+\.(jpe?g|png|webp)$/i, `_${size}x${size}.$1`);
    },

    picture(ad, size, eager) {
        const img = document.createElement('img');
        img.alt = ad.name || 'Producto de AliExpress';
        img.loading = eager ? 'eager' : 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
            if (img.src !== ad.image) {
                img.src = ad.image;
            } else {
                img.remove();
            }
        };
        img.src = this.imageUrl(ad, size);
        return img;
    },

    seen() {
        try {
            return JSON.parse(localStorage.getItem('gemuboy:adsSeen') || '{}');
        } catch (error) {
            return {};
        }
    },

    markSeen(ad) {
        try {
            const seen = this.seen();
            seen[ad.url] = Date.now();
            localStorage.setItem('gemuboy:adsSeen', JSON.stringify(seen));
        } catch (ignored) { }
    },

    shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    },

    // Least recently shown first, random among equals (never seen = 0).
    order(ads) {
        const seen = this.seen();
        return ads
            .map((ad) => ({ ad, key: (seen[ad.url] || 0) + Math.random() * 1000 }))
            .sort((a, b) => a.key - b.key)
            .map((item) => item.ad);
    },

    link(ad, where, position) {
        const a = document.createElement('a');
        a.href = ad.url;
        a.target = '_blank';
        a.rel = 'sponsored noopener noreferrer';
        a.addEventListener('click', () => {
            Analytics.event('ad_click', { ad: ad.name || ad.url, list: ad.list, page: where, position });
        });
        return a;
    },

    note: 'Enlaces de afiliado: si compras, GBoy-JS recibe una pequeña comisión sin costo extra para ti.',

    // ------------------------------------------------------------ carousel
    // A strip of square products that scrolls by itself (menu and controllers page).
    async carousel(container, list, where) {
        if (!container) {
            return;
        }
        this.stop(container);
        container.hidden = true;
        container.innerHTML = '';
        if (!navigator.onLine || this.off) {
            return;
        }
        const ads = this.order(await this.load(list)).slice(0, 12);
        if (!ads.length) {
            return;
        }
        container.innerHTML = `
            <div class="ads-head"><span>🔥 Ofertas para gamers</span>
                <button type="button" class="ads-all" data-action="page" data-page-target="products">Ver productos ›</button></div>
            <div class="ads-track"></div>
            <p class="ads-note"></p>`;
        container.querySelector('.ads-note').textContent = this.note;
        const track = container.querySelector('.ads-track');
        ads.forEach((ad, index) => {
            const card = this.link(ad, where, index + 1);
            card.className = 'ad';
            const pic = document.createElement('span');
            pic.className = 'ad-img';
            if (ad.image) {
                pic.appendChild(this.picture(ad, 220, index < 3));
            }
            card.appendChild(pic);
            const caption = document.createElement('span');
            caption.className = 'ad-caption';
            caption.dataset.noI18n = '';
            caption.textContent = ad.label || ad.name;
            caption.hidden = !caption.textContent;
            card.appendChild(caption);
            track.appendChild(card);
        });
        container.hidden = false;

        // Ads that come into view count as seen.
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                    const ad = ads[[...track.children].indexOf(entry.target)];
                    if (ad && !entry.target.dataset.viewed) {
                        entry.target.dataset.viewed = '1';
                        this.markSeen(ad);
                        Analytics.event('ad_view', { ad: ad.name || ad.url, list: ad.list, page: where });
                    }
                }
            }
        }, { root: track, threshold: 0.6 });
        [...track.children].forEach((card) => observer.observe(card));

        // Auto-scroll one card at a time, paused while touched.
        const state = { observer };
        container.adsState = state;
        const pause = () => { state.pausedUntil = Date.now() + this.rotateMs * 2; };
        track.addEventListener('pointerdown', pause, { passive: true });
        track.addEventListener('touchstart', pause, { passive: true });
        state.timer = setInterval(() => {
            if (!container.offsetParent || document.hidden || Date.now() < (state.pausedUntil || 0)) {
                return;
            }
            const card = track.firstElementChild;
            const step = card ? card.offsetWidth + 10 : track.clientWidth;
            const end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
            track.scrollTo({ left: end ? 0 : track.scrollLeft + step, behavior: 'smooth' });
        }, this.rotateMs);
    },

    stop(container) {
        if (container && container.adsState) {
            clearInterval(container.adsState.timer);
            cancelAnimationFrame(container.adsState.frame);
            container.adsState.observer.disconnect();
            container.adsState = null;
        }
    },

    // -------------------------------------------------------------- marquee
    // Main menu: an endless belt of products from both lists, mixed at random
    // (least recently seen first), drifting from left to right. It pauses while
    // touched and for a moment after, so a product can be tapped calmly.
    speed: 28, // pixels per second

    async marquee(container, where) {
        if (!container) {
            return;
        }
        this.stop(container);
        container.hidden = true;
        container.innerHTML = '';
        if (!navigator.onLine || this.off) {
            return;
        }
        const [general, mandos] = await Promise.all([this.load('general'), this.load('mandos')]);
        const ads = this.order([...general, ...mandos]).slice(0, 24);
        if (!ads.length) {
            return;
        }
        container.innerHTML = `
            <div class="ads-head"><span>🔥 Ofertas para gamers</span>
                <button type="button" class="ads-all" data-action="page" data-page-target="products">Ver productos ›</button></div>
            <div class="ads-marquee"><div class="ads-belt"></div></div>
            <p class="ads-note"></p>`;
        container.querySelector('.ads-note').textContent = this.note;
        const viewport = container.querySelector('.ads-marquee');
        const belt = container.querySelector('.ads-belt');
        container.hidden = false;

        // One "lap" holds every ad, repeated until it is wider than the screen;
        // the belt holds two laps so the loop has no seam.
        const cardWidth = (viewport.clientWidth - 20) / 3 + 10;
        const perLap = Math.max(ads.length, Math.ceil(viewport.clientWidth / cardWidth) + 1);
        const lap = Array.from({ length: perLap }, (_, i) => ads[i % ads.length]);
        [...lap, ...lap].forEach((ad, index) => {
            const card = this.link(ad, where, (index % perLap) + 1);
            card.className = 'ad';
            card.style.width = (cardWidth - 10) + 'px'; // three in view
            card.dataset.ad = String(index % ads.length);
            const pic = document.createElement('span');
            pic.className = 'ad-img';
            if (ad.image) {
                pic.appendChild(this.picture(ad, 220, index < 4));
            }
            card.appendChild(pic);
            const caption = document.createElement('span');
            caption.className = 'ad-caption';
            caption.dataset.noI18n = '';
            caption.textContent = ad.label || ad.name;
            caption.hidden = !caption.textContent;
            card.appendChild(caption);
            belt.appendChild(card);
        });

        // Products that come fully into view count as seen (once per showing).
        const viewed = new Set();
        const observer = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const i = Number(entry.target.dataset.ad);
                if (entry.isIntersecting && !viewed.has(i)) {
                    viewed.add(i);
                    this.markSeen(ads[i]);
                    Analytics.event('ad_view', { ad: ads[i].name || ads[i].url, list: ads[i].list, page: where });
                }
            }
        }, { root: viewport, threshold: 0.9 });
        [...belt.children].forEach((card) => observer.observe(card));

        const state = { observer, x: null, last: 0, pausedUntil: 0, velocity: 0, drag: null };
        container.adsState = state;
        const half = () => belt.scrollWidth / 2;
        // Keeps the belt position inside one lap, so it loops in both directions.
        const wrap = () => {
            const h = half();
            if (h) {
                while (state.x >= 0) state.x -= h;
                while (state.x < -h) state.x += h;
            }
        };
        const draw = () => { belt.style.transform = `translate3d(${state.x}px, 0, 0)`; };

        // Swipe: the belt follows the finger (or mouse) sideways, and keeps some
        // momentum after letting go. Vertical swipes still scroll the menu.
        viewport.addEventListener('pointerdown', (ev) => {
            state.drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, start: state.x, moved: false, lastX: ev.clientX, lastT: performance.now() };
            state.velocity = 0;
            state.pausedUntil = Infinity;
        });
        viewport.addEventListener('pointermove', (ev) => {
            const drag = state.drag;
            if (!drag || ev.pointerId !== drag.id || state.x === null) {
                return;
            }
            const dx = ev.clientX - drag.x;
            if (!drag.moved) {
                if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(ev.clientY - drag.y)) {
                    return;
                }
                drag.moved = true;
                try {
                    viewport.setPointerCapture(ev.pointerId);
                } catch (ignored) { }
            }
            const now = performance.now();
            const dt = Math.max(1, now - drag.lastT);
            state.velocity = ((ev.clientX - drag.lastX) / dt) * 1000; // px/s
            drag.lastX = ev.clientX;
            drag.lastT = now;
            state.x = drag.start + dx;
            wrap();
            drag.start = state.x - dx;
            draw();
        });
        const release = (ev) => {
            const drag = state.drag;
            if (!drag || ev.pointerId !== drag.id) {
                return;
            }
            state.drag = null;
            // A swipe must not open the product under the finger.
            if (drag.moved) {
                state.blockClickUntil = performance.now() + 400;
            } else {
                state.velocity = 0;
            }
            if (performance.now() - drag.lastT > 120) {
                state.velocity = 0; // finger stopped before lifting
            }
            state.pausedUntil = performance.now() + 2500;
        };
        viewport.addEventListener('pointerup', release);
        viewport.addEventListener('pointercancel', release);
        viewport.addEventListener('click', (ev) => {
            if (performance.now() < (state.blockClickUntil || 0)) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        }, { capture: true });
        viewport.addEventListener('dragstart', (ev) => ev.preventDefault());

        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        const step = (now) => {
            if (container.adsState !== state) {
                return; // replaced or stopped
            }
            state.frame = requestAnimationFrame(step);
            if (!half()) {
                return;
            }
            if (state.x === null) {
                state.x = -half(); // start one lap to the left, moving right
            }
            const dt = Math.min(0.1, (now - (state.last || now)) / 1000);
            state.last = now;
            if (state.drag) {
                return;
            }
            // Momentum after a swipe, slowing down.
            if (Math.abs(state.velocity) > 5) {
                state.x += state.velocity * dt;
                state.velocity *= Math.pow(0.04, dt);
                wrap();
                draw();
                return;
            }
            if (!container.offsetParent || document.hidden || now < state.pausedUntil) {
                return;
            }
            state.x += dt * this.speed * (reduced ? 0.4 : 1);
            wrap();
            draw();
        };
        state.frame = requestAnimationFrame(step);
    },

    // ------------------------------------------------------------- catalog
    async catalog(container) {
        if (this.off) {
            container.innerHTML = '';
            return;
        }
        container.innerHTML = '<p class="note">Cargando productos…</p>';
        const [mandos, general] = await Promise.all([this.load('mandos'), this.load('general')]);
        container.innerHTML = '';
        if (!mandos.length && !general.length) {
            container.innerHTML = `<p class="empty">${navigator.onLine ? 'Todavía no hay productos.' : 'Conéctate a internet para ver los productos.'}</p>`;
            return;
        }
        const section = (title, ads, where, keepOrder) => {
            if (!ads.length) {
                return;
            }
            if (title) {
                const h = document.createElement('h2');
                h.textContent = title;
                container.appendChild(h);
            }
            const grid = document.createElement('div');
            grid.className = 'products';
            (keepOrder ? ads : this.order(ads)).forEach((ad, index) => {
                const card = this.link(ad, where, index + 1);
                card.className = 'product';
                const pic = document.createElement('span');
                pic.className = 'ad-img';
                if (ad.image) {
                    pic.appendChild(this.picture(ad, 350, index < 6));
                }
                card.appendChild(pic);
                const text = document.createElement('span');
                text.className = 'product-text';
                if (ad.name) {
                    const name = document.createElement('strong');
                    name.dataset.noI18n = '';
                    name.textContent = ad.name;
                    text.appendChild(name);
                }
                if (ad.label) {
                    const label = document.createElement('small');
                    label.dataset.noI18n = '';
                    label.textContent = ad.label;
                    text.appendChild(label);
                }
                const cta = document.createElement('em');
                cta.textContent = 'Ver en AliExpress ›';
                text.appendChild(cta);
                card.appendChild(text);
                grid.appendChild(card);
            });
            container.appendChild(grid);
        };
        // Both lists mixed at random (least recently seen first).
        section('', this.shuffle([...mandos, ...general]), 'products', true);
        const note = document.createElement('p');
        note.className = 'ads-note';
        note.textContent = this.note;
        container.appendChild(note);
        Analytics.event('products_open', { count: mandos.length + general.length });
    },

    // ---------------------------------------------------- game start ad
    // Pauses the game behind a dialog with one product; the ✕ appears after
    // 3 seconds and closing it resumes the game.
    async interstitial(app) {
        if (!navigator.onLine || this.off || Date.now() - (this.lastInterstitial || 0) < this.interstitialEvery) {
            return;
        }
        const ads = this.order(await this.load('general'));
        const ad = ads[0];
        if (!ad || !app.engine) {
            return;
        }
        this.lastInterstitial = Date.now();
        this.markSeen(ad);
        const dialog = document.getElementById('ad-dialog');
        const slot = dialog.querySelector('.ad-slot');
        slot.innerHTML = '';
        const card = this.link(ad, 'game-start', 1);
        card.className = 'ad-big';
        const pic = document.createElement('span');
        pic.className = 'ad-img';
        if (ad.image) {
            pic.appendChild(this.picture(ad, 350, true));
        }
        card.appendChild(pic);
        const text = document.createElement('span');
        text.className = 'product-text';
        if (ad.name || ad.label) {
            const name = document.createElement('strong');
            name.dataset.noI18n = '';
            name.textContent = [ad.name, ad.label].filter(Boolean).join(' · ');
            text.appendChild(name);
        }
        const cta = document.createElement('em');
        cta.textContent = 'Ver en AliExpress ›';
        text.appendChild(cta);
        card.appendChild(text);
        slot.appendChild(card);

        const close = dialog.querySelector('.ad-close');
        let left = this.closeDelay;
        close.disabled = true;
        close.textContent = String(left);
        clearInterval(this.countdown);
        this.countdown = setInterval(() => {
            left--;
            if (left > 0) {
                close.textContent = String(left);
            } else {
                clearInterval(this.countdown);
                close.disabled = false;
                close.textContent = '✕';
            }
        }, 1000);
        app.adShowing = true;
        Controls.releaseAll();
        Input.releaseAll();
        dialog.hidden = false;
        Analytics.event('ad_view', { ad: ad.name || ad.url, list: ad.list, page: 'game-start' });
    },

    closeInterstitial(app) {
        const dialog = document.getElementById('ad-dialog');
        if (dialog.hidden || dialog.querySelector('.ad-close').disabled) {
            return;
        }
        dialog.hidden = true;
        app.adShowing = false;
        app.lastTime = performance.now();
        app.unlockAudio(true);
    },
};
