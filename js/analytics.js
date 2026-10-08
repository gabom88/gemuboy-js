// Google Analytics 4 (gtag.js). Loaded only when the "statistics" setting is on,
// never on localhost, and without advertising signals. Events are dropped while
// offline or disabled; gameplay never waits for it.
const Analytics = {
    id: 'G-6Y61JC2QR9',
    enabled: false,
    loaded: false,

    init(settings) {
        this.local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !/[?&]analytics=1\b/.test(location.search);
        this.setEnabled(settings.analytics);
    },

    setEnabled(enabled) {
        this.enabled = !!enabled && !this.local;
        // Official opt-out switch: stops gtag from sending anything.
        window['ga-disable-' + this.id] = !this.enabled;
        if (this.enabled && !this.loaded) {
            this.load();
        }
    },

    load() {
        this.loaded = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag() {
            window.dataLayer.push(arguments);
        };
        gtag('js', new Date());
        gtag('config', this.id, {
            allow_google_signals: false,
            allow_ad_personalization_signals: false,
            app_name: 'GBoy-JS',
            display_mode: matchMedia('(display-mode: standalone)').matches || navigator.standalone ? 'standalone' : 'browser',
        });
        const script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(this.id);
        document.head.appendChild(script);
    },

    // event('game_start', { game_title: 'Tetris', engine: 'sameboy' })
    event(name, params = {}) {
        if (!this.enabled || !window.gtag) {
            return;
        }
        const clean = {};
        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null && value !== '') {
                clean[key] = typeof value === 'string' ? value.slice(0, 100) : value;
            }
        }
        try {
            gtag('event', name, clean);
        } catch (ignored) { }
    },
};
