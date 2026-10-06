// Service worker: makes the emulator work offline.
// VERSION is replaced with the commit SHA by the GitHub Pages workflow so each
// deploy refreshes the cache.
const VERSION = 'dev';
const CACHE = 'gemuboy-' + VERSION;
const ASSETS = [
    './',
    'index.html',
    'manifest.webmanifest',
    'css/app.css',
    'js/cpu.js',
    'js/display.js',
    'js/timer.js',
    'js/joypad.js',
    'js/cartridge.js',
    'js/rtc.js',
    'js/sound.js',
    'js/serial.js',
    'js/storage.js',
    'js/palettes.js',
    'js/savestate.js',
    'js/gamepad.js',
    'js/app.js',
    'img/favicon.ico',
    'img/icon.svg',
    'img/grain.png',
    'img/icon-192.png',
    'img/icon-512.png',
    'img/icon-maskable-512.png',
    'img/apple-touch-icon.png',
    'static/pocket.gb',
    // Homebrew catalog (ROMs are cached on first play and saved in the library).
    'static/homebrew/catalog.json',
    'static/homebrew/tobutobugirldeluxe.png',
    'static/homebrew/ucity.png',
    'static/homebrew/porklike-gb.png',
    'static/homebrew/shock-lobster.png',
    'static/homebrew/libbet.png',
    'static/homebrew/geometrix.png',
    'static/homebrew/aevilia.png',
    'static/homebrew/2048gb.png',
    'static/homebrew/tuff.png',
    'static/homebrew/big2small.png',
    'static/homebrew/rebound.png',
    'static/homebrew/sushi-nights.png',
    'static/homebrew/gb-wordyl.png',
    'static/homebrew/dawn-will-come.png',
    'static/homebrew/maxpirate.png',
    'static/homebrew/crystal-lake.png',
    'static/homebrew/carazu.png',
    'static/homebrew/airaki.png',
    'static/homebrew/renegade-rush.png',
    'static/homebrew/postie.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key.startsWith('gemuboy-') && key !== CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) {
        return;
    }
    if (VERSION === 'dev') {
        // Development: network first so changes show up immediately.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match(request, { ignoreSearch: true }))
        );
        return;
    }
    event.respondWith(
        caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request).then((response) => {
            if (response.ok) {
                const copy = response.clone();
                caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
        }).catch(() => (request.mode === 'navigate' ? caches.match('index.html') : undefined)))
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'version' && event.source) {
        event.source.postMessage({ version: VERSION });
    }
});
