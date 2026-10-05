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
    'img/icon-192.png',
    'img/icon-512.png',
    'img/icon-maskable-512.png',
    'img/apple-touch-icon.png',
    'static/pocket.gb',
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
