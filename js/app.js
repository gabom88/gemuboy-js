// GBoy-JS PWA: application shell around the emulator core.
const App = {
    defaults: {
        palette: 'dmg',
        customPalette: ['#e0f8d0', '#88c070', '#346856', '#081820'],
        volume: 60,
        muted: false,
        ignoreSilentSwitch: false,
        vibration: true,
        touchControls: 'auto',
        opacity: 100,
        skin: 'dmg',
        frame: true,
        keyMap: {},
        padMap: {},
        turboMode: 'hold',
        turboSpeed: '3',
        scaleMode: 'fit',
        lcdEffect: false,
        smoothing: false,
        showFps: false,
        autoState: true,
        engine: 'sameboy',
        layouts: {},
        screenMode: 'auto',
        screenLayouts: {},
        menuTheme: 'night',
        libraryView: 'list',
        librarySort: 'added',
        analytics: true,
    },

    stateSlots: ['auto', '1', '2', '3', '4'],

    engine: null,
    game: null,
    cycles: 0,
    running: false,
    menuOpen: false,
    turboToggled: false,
    accumulator: 0,
    lastTime: 0,

    init() {
        this.settings = Object.assign({}, this.defaults, Store.getJSON('settings', {}));
        this.settings.opacity = Number(this.settings.opacity);
        Analytics.init(this.settings);
        this.isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
        this.isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        this.isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

        this.el = {
            app: document.getElementById('app'),
            screen: document.getElementById('screen'),
            canvas: document.getElementById('canvas'),
            lcd: document.getElementById('lcd'),
            fps: document.getElementById('fps'),
            toast: document.getElementById('toast'),
            menu: document.getElementById('menu'),
            editor: document.getElementById('editor'),
            romInput: document.getElementById('rom-input'),
            savInput: document.getElementById('sav-input'),
            saveIndicator: document.getElementById('save-indicator'),
            turboIndicator: document.getElementById('turbo-indicator'),
            screenEditor: document.getElementById('screen-editor'),
            screenDrag: document.getElementById('screen-drag'),
            settingsInput: document.getElementById('settings-input'),
            assignInput: document.getElementById('assign-input'),
            txtInput: document.getElementById('txt-input'),
            capturePop: document.getElementById('capture-pop'),
            cameraBtn: document.getElementById('camera-btn'),
        };
        // iOS greys out files with unknown extensions when "accept" is set.
        if (!this.isIOS) {
            this.el.romInput.accept = '.gb,.gbc,.zip';
            this.el.savInput.accept = '.sav,.srm';
            this.el.settingsInput.accept = '.json,application/json';
            this.el.assignInput.accept = '.gb,.gbc,.zip';
            this.el.txtInput.accept = '.txt,.tsv,.csv,text/plain';
        }

        this.el.bezel = document.getElementById('bezel');
        this.el.brand = document.getElementById('brand');
        this.el.capture = document.getElementById('capture');
        Palettes.apply(this.settings);
        Input.configure(this.settings);
        Controls.init(this);
        Library.init(this);
        this.bindEvents();
        this.applySettings();
        this.layout();
        this.registerServiceWorker();
        this.requestPersistentStorage();

        requestAnimationFrame((t) => this.frame(t));
        this.boot();
    },

    // ---------------------------------------------------------------- settings
    saveSettings() {
        Store.setJSON('settings', this.settings);
    },

    // Console skins: the body color/material behind the screen and controls.
    skins: [
        { id: 'dmg', name: 'Game Boy clásica (gris)', color: '#c8c6c0' },
        { id: 'gbc-berry', name: 'Color · Berry', color: '#c1124e' },
        { id: 'gbc-grape', name: 'Color · Grape', color: '#5a3d9e' },
        { id: 'gbc-kiwi', name: 'Color · Kiwi', color: '#9cc43c' },
        { id: 'gbc-dandelion', name: 'Color · Dandelion', color: '#f1c21b' },
        { id: 'gbc-teal', name: 'Color · Teal', color: '#139aa3' },
        { id: 'clear-atomic', name: 'Transparente · Atomic Purple', color: '#6b4aa3', clear: true },
        { id: 'clear-ice', name: 'Transparente · Cristal', color: '#c9d3dc', clear: true },
        { id: 'clear-jungle', name: 'Transparente · Verde jungla', color: '#3f8f57', clear: true },
        { id: 'clear-smoke', name: 'Transparente · Humo', color: '#2b2c33', clear: true },
        { id: 'dark', name: 'Oscuro', color: '#16171c' },
    ],

    // Color themes for the menu and panels: 3 dark and 3 light.
    themes: [
        { id: 'night', name: 'Noche', dark: true },
        { id: 'midnight', name: 'Medianoche', dark: true },
        { id: 'grape', name: 'Uva', dark: true },
        { id: 'paper', name: 'Papel', dark: false },
        { id: 'sand', name: 'Arena', dark: false },
        { id: 'sky', name: 'Cielo', dark: false },
    ],

    icons: {
        sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
        grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
        list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
        moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
    },

    theme() {
        return this.themes.find((item) => item.id === this.settings.menuTheme) || this.themes[0];
    },

    applyTheme() {
        const theme = this.theme();
        this.el.app.dataset.theme = theme.id;
        const button = document.getElementById('theme-btn');
        button.innerHTML = theme.dark ? this.icons.moon : this.icons.sun;
        button.title = 'Tema: ' + theme.name;
    },

    nextTheme() {
        const index = this.themes.indexOf(this.theme());
        const theme = this.themes[(index + 1) % this.themes.length];
        this.settings.menuTheme = theme.id;
        this.saveSettings();
        this.applyTheme();
        this.toast(`Tema: ${theme.name} (${theme.dark ? 'oscuro' : 'claro'})`);
        Analytics.event('theme_change', { theme: theme.id });
    },

    applySettings() {
        const s = this.settings;
        this.applyTheme();
        const skin = this.skins.find((item) => item.id === s.skin) || this.skins[0];
        this.el.app.dataset.skin = skin.id;
        this.el.app.dataset.family = skin.id.split('-')[0];
        this.el.app.classList.toggle('framed', !!s.frame);
        const theme = document.querySelector('meta[name="theme-color"]');
        if (theme) {
            theme.content = skin.color;
        }
        this.el.canvas.classList.toggle('smooth', !!s.smoothing);
        this.el.lcd.hidden = !s.lcdEffect;
        this.el.fps.hidden = !s.showFps;
        this.updateVolume();
        if (navigator.audioSession) {
            try {
                navigator.audioSession.type = s.ignoreSilentSwitch ? 'playback' : 'auto';
            } catch (ignored) { }
        }
        this.layout();
    },

    applyPalette() {
        Palettes.apply(this.settings);
        if (this.engine) {
            this.engine.setPalette(this.settings);
        }
    },

    updateVolume() {
        const volume = this.settings.muted ? 0 : this.settings.volume / 100;
        Sound.volume = volume * 0.5;
        if (this.engine) {
            this.engine.setVolume(Sound.volume);
        }
    },

    // ------------------------------------------------------------------ layout
    safeInsets() {
        if (!this.insetProbe) {
            this.insetProbe = document.createElement('div');
            this.insetProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;' +
                'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
            document.body.appendChild(this.insetProbe);
        }
        const style = getComputedStyle(this.insetProbe);
        return {
            top: parseFloat(style.paddingTop) || 0,
            right: parseFloat(style.paddingRight) || 0,
            bottom: parseFloat(style.paddingBottom) || 0,
            left: parseFloat(style.paddingLeft) || 0,
        };
    },

    // Geometry of the screen box (screen + bezel + logo) at scale 1.
    screenBox() {
        const framed = !!this.settings.frame;
        const portrait = this.orientation === 'portrait';
        // Bezel around the screen, as a fraction of the screen size (DMG proportions).
        const box = {
            framed,
            padX: framed ? 0.13 : 0,
            padTop: framed ? 0.13 : 0,
            padBottom: framed ? 0.1 : 0,
            brand: framed && portrait ? 0.14 : 0,
        };
        box.w = Display.width * (1 + box.padX * 2);
        box.h = Display.height * (1 + box.padTop + box.padBottom + box.brand);
        return box;
    },

    // Automatic placement: centered above the touch controls (portrait) or in the
    // middle (landscape). Without the frame the screen takes the full width.
    autoScreen(W, H, inset, box) {
        const portrait = this.orientation === 'portrait';
        const touch = Controls.visibleTouch;
        const margin = box.framed ? 10 : 0;
        const availW = W - inset.left - inset.right - margin * 2;
        let availH;
        if (portrait) {
            const share = box.framed ? 0.53 : 0.58;
            availH = (touch ? H * share : H) - inset.top - margin * 2 - (touch ? 0 : inset.bottom);
        } else {
            availH = H - inset.top - inset.bottom - margin * 2;
        }
        let scale = Math.max(0.5, Math.min(availW / box.w, availH / box.h));
        if (box.framed && this.settings.scaleMode === 'integer' && scale >= 1) {
            scale = Math.floor(scale);
        }
        const totalW = box.w * scale;
        const totalH = box.h * scale;
        return {
            scale,
            left: inset.left + margin + (availW - totalW) / 2,
            top: inset.top + margin + Math.max(0, (availH - totalH) / 2),
        };
    },

    // Largest scale at which the screen box fits the whole viewport.
    maxScreenScale(W, H, inset, box) {
        return Math.max(0.5, Math.min((W - inset.left - inset.right) / box.w, (H - inset.top - inset.bottom) / box.h));
    },

    // Manual placement, saved per orientation: center (fractions of the viewport)
    // and size (fraction of the largest scale that fits).
    manualScreen(W, H, inset, box) {
        const saved = (this.settings.screenLayouts || {})[this.orientation];
        if (!saved) {
            return null;
        }
        const scale = Math.max(0.5, this.maxScreenScale(W, H, inset, box) * saved.size);
        const totalW = box.w * scale;
        const totalH = box.h * scale;
        const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
        return {
            scale,
            left: clamp(saved.x * W - totalW / 2, inset.left, W - inset.right - totalW),
            top: clamp(saved.y * H - totalH / 2, inset.top, H - inset.bottom - totalH),
        };
    },

    // Stores the current automatic placement as the starting manual layout.
    seedManualScreen() {
        const layouts = this.settings.screenLayouts = this.settings.screenLayouts || {};
        if (layouts[this.orientation]) {
            return;
        }
        const W = this.el.app.clientWidth;
        const H = this.el.app.clientHeight;
        const inset = this.safeInsets();
        const box = this.screenBox();
        const auto = this.autoScreen(W, H, inset, box);
        layouts[this.orientation] = {
            x: (auto.left + box.w * auto.scale / 2) / W,
            y: (auto.top + box.h * auto.scale / 2) / H,
            size: Math.min(1, auto.scale / this.maxScreenScale(W, H, inset, box)),
        };
    },

    layout() {
        const W = this.el.app.clientWidth;
        const H = this.el.app.clientHeight;
        if (!W || !H) {
            return;
        }
        this.orientation = W > H ? 'landscape' : 'portrait';
        this.el.app.dataset.orientation = this.orientation;
        const inset = this.safeInsets();
        const box = this.screenBox();
        const place = (this.settings.screenMode === 'manual' && this.manualScreen(W, H, inset, box)) || this.autoScreen(W, H, inset, box);
        const { scale } = place;
        const boxLeft = place.left;
        const boxTop = place.top;
        const w = Math.round(Display.width * scale);
        const h = Math.round(Display.height * scale);
        const totalW = w * (1 + box.padX * 2);
        const left = boxLeft + w * box.padX;
        const top = boxTop + h * box.padTop;
        Object.assign(this.el.screen.style, { width: w + 'px', height: h + 'px', transform: `translate(${left}px, ${top}px)` });
        this.el.lcd.style.backgroundSize = `${scale}px ${scale}px`;
        this.screenRect = { left: boxLeft, top: boxTop, width: box.w * scale, height: box.h * scale, scale };

        this.el.bezel.hidden = !box.framed;
        if (box.framed) {
            const bezelH = h * (1 + box.padTop + box.padBottom);
            Object.assign(this.el.bezel.style, {
                width: totalW + 'px',
                height: bezelH + 'px',
                transform: `translate(${boxLeft}px, ${boxTop}px)`,
            });
            this.el.bezel.style.setProperty('--u', (h / 100) + 'px');
        }
        this.el.brand.hidden = !box.brand;
        if (box.brand) {
            Object.assign(this.el.brand.style, {
                transform: `translate(${boxLeft}px, ${boxTop + h * (1 + box.padTop + box.padBottom)}px)`,
                width: totalW + 'px',
                height: h * box.brand + 'px',
                fontSize: h * box.brand * 0.5 + 'px',
            });
        }
        Controls.render();
    },

    // ----------------------------------------------------------- screen editor
    startScreenEditor() {
        this.menuOpen = false;
        this.el.menu.hidden = true;
        this.screenEditing = true;
        Controls.releaseAll();
        Input.releaseAll();
        this.el.screenEditor.hidden = false;
        this.el.screenDrag.hidden = false;
        this.el.app.classList.add('screen-editing');
        this.updateScreenEditor();
    },

    stopScreenEditor() {
        this.screenEditing = false;
        this.screenPointers = null;
        this.el.screenEditor.hidden = true;
        this.el.screenDrag.hidden = true;
        this.el.app.classList.remove('screen-editing', 'screen-auto');
        this.openMenu('controls');
    },

    setScreenMode(mode) {
        if (mode === 'manual') {
            this.seedManualScreen();
        }
        this.settings.screenMode = mode;
        this.saveSettings();
        this.layout();
        this.updateScreenEditor();
    },

    saveScreenLayout(values) {
        const layouts = this.settings.screenLayouts = this.settings.screenLayouts || {};
        this.seedManualScreen();
        layouts[this.orientation] = Object.assign({}, layouts[this.orientation], values);
        this.settings.screenMode = 'manual';
        this.saveSettings();
        this.layout();
        this.updateScreenEditor();
    },

    updateScreenEditor() {
        if (!this.screenEditing) {
            return;
        }
        const manual = this.settings.screenMode === 'manual';
        const orientationName = this.orientation === 'portrait' ? 'vertical' : 'horizontal';
        document.getElementById('screen-editor-title').textContent = `Ajustar pantalla · modo ${orientationName}`;
        this.el.screenEditor.querySelectorAll('[data-mode]').forEach((button) => {
            button.classList.toggle('active', button.dataset.mode === this.settings.screenMode);
        });
        this.el.app.classList.toggle('screen-auto', !manual);
        const W = this.el.app.clientWidth;
        const H = this.el.app.clientHeight;
        const max = this.maxScreenScale(W, H, this.safeInsets(), this.screenBox());
        const size = Math.round(Math.min(1, this.screenRect.scale / max) * 100);
        document.getElementById('scr-size').value = size;
        document.getElementById('scr-size-out').textContent = size + '%';
        document.getElementById('scr-frame').checked = !!this.settings.frame;
    },

    // Dragging anywhere moves the screen; two fingers resize it.
    screenPointer(ev) {
        const rect = this.el.app.getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    },

    onScreenDown(ev) {
        ev.preventDefault();
        try {
            this.el.screenDrag.setPointerCapture(ev.pointerId);
        } catch (ignored) { }
        this.seedManualScreen();
        this.screenPointers = this.screenPointers || new Map();
        this.screenPointers.set(ev.pointerId, this.screenPointer(ev));
        const layout = this.settings.screenLayouts[this.orientation];
        const points = [...this.screenPointers.values()];
        this.screenGesture = {
            points: points.map((p) => Object.assign({}, p)),
            x: layout.x,
            y: layout.y,
            size: layout.size,
            distance: points.length >= 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0,
        };
    },

    onScreenMove(ev) {
        if (!this.screenPointers || !this.screenPointers.has(ev.pointerId)) {
            return;
        }
        ev.preventDefault();
        this.screenPointers.set(ev.pointerId, this.screenPointer(ev));
        const W = this.el.app.clientWidth;
        const H = this.el.app.clientHeight;
        const gesture = this.screenGesture;
        const points = [...this.screenPointers.values()];
        if (points.length >= 2 && gesture.distance) {
            const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
            const size = Math.min(1, Math.max(0.2, gesture.size * distance / gesture.distance));
            this.saveScreenLayout({ size: Math.round(size * 100) / 100 });
        } else if (points.length === 1) {
            const start = gesture.points[0];
            this.saveScreenLayout({
                x: Math.min(1, Math.max(0, gesture.x + (points[0].x - start.x) / W)),
                y: Math.min(1, Math.max(0, gesture.y + (points[0].y - start.y) / H)),
            });
        }
    },

    onScreenUp(ev) {
        if (!this.screenPointers) {
            return;
        }
        this.screenPointers.delete(ev.pointerId);
        // Restart the gesture with the remaining fingers.
        if (this.screenPointers.size) {
            const layout = this.settings.screenLayouts[this.orientation];
            const points = [...this.screenPointers.values()];
            this.screenGesture = { points: points.map((p) => Object.assign({}, p)), x: layout.x, y: layout.y, size: layout.size, distance: 0 };
        }
    },

    // -------------------------------------------------------------- main loop
    frame(now) {
        requestAnimationFrame((t) => this.frame(t));
        const dt = now - this.lastTime;
        this.lastTime = now;

        const justPressed = Input.pollGamepads();
        if (this.capture) {
            this.pollCapture();
        } else {
            this.handleActions(justPressed, 'pad');
            if (Input.pad.start && Input.pad.select && !this.menuOpen && !this.screenEditing && this.engine) {
                this.openMenu();
            }
        }
        this.el.app.classList.toggle('led-on', this.running && !document.hidden);

        if (!this.running || this.isPaused()) {
            this.accumulator = 0;
            return;
        }

        const turbo = Input.turboHeld || this.turboToggled;
        const speed = turbo ? Number(this.settings.turboSpeed) : 1;
        this.el.turboIndicator.classList.toggle('on', turbo);
        this.accumulator += Math.min(dt, 100) * speed;
        const maxFrames = 2 + speed * 2;
        let frames = 0;
        while (this.accumulator >= Display.frameInterval && frames < maxFrames) {
            if (!this.runFrame()) {
                return;
            }
            this.accumulator -= Display.frameInterval;
            frames++;
        }
        if (frames >= maxFrames) {
            this.accumulator = 0;
        }
        this.engine.present();
        this.engine.endFrames(speed);
        this.countFps(frames, now);
        this.periodicSave(now);
    },

    runFrame() {
        try {
            this.engine.runFrame();
        } catch (error) {
            console.error(error);
            this.running = false;
            this.toast('Error de emulación: ' + error, 5000);
            return false;
        }
        return true;
    },

    // One-shot actions from the keyboard or a gamepad (menu, save/load state).
    handleActions(actions, source) {
        for (const action of actions) {
            if (action === 'menu') {
                if (Controls.editing) {
                    this.stopLayoutEditor();
                } else if (this.screenEditing) {
                    this.stopScreenEditor();
                } else if (this.menuOpen) {
                    this.closeMenu();
                } else {
                    this.openMenu();
                }
            } else if (!this.menuOpen && this.engine && action === 'save') {
                this.saveState('1');
            } else if (!this.menuOpen && this.engine && action === 'load') {
                this.loadState('1');
            } else if (source === 'pad' && this.menuOpen && action === 'start' && this.engine && this.page === 'main') {
                this.closeMenu();
            }
        }
    },

    // --- Remapping ---
    startCapture(action, type) {
        this.capture = { action, type, ignore: new Set(Input.padRaw || []) };
        Input.releaseAll();
        const text = type === 'key'
            ? `Pulsa una tecla para «${Input.actionNames[action]}»`
            : `Pulsa un botón del mando para «${Input.actionNames[action]}»`;
        this.el.capture.querySelector('strong').textContent = text;
        this.el.capture.querySelector('small').textContent = type === 'key'
            ? 'Esc para cancelar · Supr para quitar la asignación'
            : (Input.connectedPads().length ? 'Mando detectado: ' + Input.connectedPads()[0].id.split('(')[0].trim()
                : 'No se detecta ningún mando: conéctalo por Bluetooth y pulsa cualquier botón.');
        this.el.capture.hidden = false;
    },

    pollCapture() {
        if (this.capture.type !== 'pad') {
            return;
        }
        const raw = Input.padRaw || new Set();
        // Forget inputs held when the capture started once they are released.
        for (const input of [...this.capture.ignore]) {
            if (!raw.has(input)) {
                this.capture.ignore.delete(input);
            }
        }
        const fresh = [...raw].find((input) => !this.capture.ignore.has(input));
        if (fresh) {
            this.finishCapture(fresh);
        } else if (Input.connectedPads().length) {
            this.el.capture.querySelector('small').textContent = 'Mando detectado: ' + Input.connectedPads()[0].id.split('(')[0].trim();
        }
    },

    finishCapture(value, clear = false) {
        const { action, type } = this.capture;
        this.capture = null;
        this.el.capture.hidden = true;
        if (value || clear) {
            const mapName = type === 'key' ? 'keyMap' : 'padMap';
            const map = this.settings[mapName] = this.settings[mapName] || {};
            map[action] = clear ? [] : [value];
            // A key/button controls a single action: remove it from the others.
            if (!clear) {
                const defaults = type === 'key' ? Input.defaultKeys : Input.defaultPad;
                for (const other of Input.actions) {
                    if (other === action) {
                        continue;
                    }
                    const current = map[other] || defaults[other] || [];
                    if (current.includes(value)) {
                        map[other] = current.filter((item) => item !== value);
                    }
                }
            }
            this.saveSettings();
            Input.configure(this.settings);
        }
        this.renderMapping();
    },

    renderMapping() {
        const list = document.getElementById('mapping-list');
        if (!list) {
            return;
        }
        list.innerHTML = '';
        for (const action of Input.actions) {
            const row = document.createElement('div');
            row.className = 'map-row';
            const keys = Input.keyBindings[action] || [];
            const pads = Input.padBindings[action] || [];
            row.innerHTML = `<span class="map-name"></span>
                <button type="button" class="map-btn" data-action="map-key" data-id="${action}"><i>⌨️</i><span></span></button>
                <button type="button" class="map-btn" data-action="map-pad" data-id="${action}"><i>🎮</i><span></span></button>`;
            row.querySelector('.map-name').textContent = Input.actionNames[action];
            const [keyLabel, padLabel] = row.querySelectorAll('.map-btn span');
            keyLabel.textContent = keys.length ? keys.map((k) => Input.keyLabel(k)).join(' / ') : '—';
            padLabel.textContent = pads.length ? pads.map((b) => Input.padLabel(b)).join(' / ') : '—';
            list.appendChild(row);
        }
        const pads = Input.connectedPads();
        document.getElementById('pad-status').textContent = pads.length
            ? '🎮 Conectado: ' + pads.map((pad) => pad.id.split('(')[0].trim()).join(', ')
            : 'Ningún mando detectado. Conéctalo por Bluetooth o USB y pulsa un botón para que el navegador lo reconozca.';
    },

    renderSkins() {
        const container = document.getElementById('skin-list');
        container.innerHTML = '';
        for (const skin of this.skins) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'skin' + (this.settings.skin === skin.id ? ' active' : '') + (skin.clear ? ' clear' : '');
            button.dataset.action = 'skin';
            button.dataset.id = skin.id;
            button.innerHTML = `<span class="skin-preview" data-skin="${skin.id}"><i class="sp-screen"></i><i class="sp-dpad"></i><i class="sp-a"></i><i class="sp-b"></i></span><span class="name"></span>`;
            button.querySelector('.name').textContent = skin.name;
            container.appendChild(button);
        }
        document.getElementById('frame-toggle').checked = !!this.settings.frame;
    },

    isPaused() {
        return this.menuOpen || Controls.editing || this.screenEditing || document.hidden;
    },

    countFps(frames, now) {
        if (!this.settings.showFps) {
            return;
        }
        this.fpsFrames = (this.fpsFrames || 0) + frames;
        if (!this.fpsTime) {
            this.fpsTime = now;
        }
        if (now - this.fpsTime >= 1000) {
            this.el.fps.textContent = Math.round(this.fpsFrames * 1000 / (now - this.fpsTime)) + ' FPS';
            this.fpsFrames = 0;
            this.fpsTime = now;
        }
    },

    // Refresh the screen while paused (e.g. after changing the palette).
    redraw() {
        if (this.engine && this.running) {
            this.runFrame();
            this.engine.present(true);
        }
    },

    // ------------------------------------------------------------ persistence
    periodicSave(now) {
        if (!this.lastSramCheck || now - this.lastSramCheck > 1000) {
            this.lastSramCheck = now;
            if (this.engine.batteryDirty()) {
                this.saveSram();
            }
        }
        if (this.settings.autoState) {
            if (!this.lastAutoState) {
                this.lastAutoState = now;
            }
            if (now - this.lastAutoState > 30000) {
                this.lastAutoState = now;
                this.saveState('auto', { quiet: true });
            }
        }
    },

    saveSram(quiet) {
        const engine = this.engine;
        if (!engine || !this.game || !engine.hasSaveData()) {
            return;
        }
        let ok = true;
        const battery = engine.getBattery();
        if (battery) {
            ok = Store.setSync('sram:' + this.game.id, Bytes.toBase64(battery)) && ok;
        }
        const rtc = engine.getRtc();
        if (rtc) {
            ok = Store.setJSON('rtc:' + this.game.id, rtc) && ok;
        }
        engine.markClean();
        if (!ok) {
            this.toast('⚠️ No se pudo guardar la partida: almacenamiento lleno', 4000);
            return;
        }
        if (!quiet) {
            this.flashSaveIndicator();
        }
    },

    // Battery saves are shared by both engines: raw cartridge RAM (SameBoy appends
    // the real-time clock in the standard .sav layout; the legacy core ignores it).
    loadSram(engine, game) {
        if (!engine.hasSaveData()) {
            return;
        }
        let ram = null;
        const stored = Store.getSync('sram:' + game.id);
        if (stored) {
            ram = Bytes.fromBase64(stored);
        } else {
            // Saves made by the very first version of the emulator.
            try {
                const legacy = localStorage.getItem(game.rawTitle);
                if (legacy) {
                    ram = new Uint8Array(legacy.split(',').map(Number));
                }
            } catch (ignored) { }
        }
        let rtc = Store.getJSON('rtc:' + game.id, null);
        if (!rtc) {
            try {
                const legacy = localStorage.getItem(game.rawTitle + 'TIME');
                rtc = legacy ? JSON.parse(legacy) : null;
            } catch (ignored) { }
        }
        engine.setBattery(ram, rtc);
        engine.markClean();
    },

    flashSaveIndicator() {
        const indicator = this.el.saveIndicator;
        indicator.classList.remove('show');
        void indicator.offsetWidth;
        indicator.classList.add('show');
    },

    stateKey(slot) {
        return `state:${this.game.id}:${slot}`;
    },

    async saveState(slot, { quiet = false, sync = false } = {}) {
        if (!this.engine || !this.running) {
            return false;
        }
        const data = JSON.stringify({ time: Date.now(), engine: this.engine.id, state: this.engine.captureState() });
        let thumb = null;
        try {
            thumb = this.el.canvas.toDataURL('image/png');
        } catch (ignored) { }
        const key = this.stateKey(slot);
        try {
            if (sync) {
                if (!Store.setSync(key, data)) {
                    Store.put(key, data);
                }
            } else {
                await Store.put(key, data);
            }
            if (thumb) {
                Store.setSync(`thumb:${this.game.id}:${slot}`, thumb);
            }
            Store.setJSON(`statemeta:${this.game.id}:${slot}`, { time: Date.now() });
            if (!quiet) {
                this.toast(slot === 'auto' ? 'Estado guardado' : `Estado guardado en ranura ${slot}`);
                Analytics.event('state_save', { slot, game_title: this.game.title });
            }
            return true;
        } catch (error) {
            console.error(error);
            if (!quiet) {
                this.toast('⚠️ No se pudo guardar el estado', 4000);
            }
            return false;
        }
    },

    async loadState(slot, { quiet = false } = {}) {
        if (!this.engine) {
            return false;
        }
        const text = await Store.get(this.stateKey(slot));
        if (!text) {
            if (!quiet) {
                this.toast('Esta ranura está vacía');
            }
            return false;
        }
        try {
            const { state } = JSON.parse(text);
            this.engine.restoreState(state);
            this.redraw();
            if (!quiet) {
                this.toast(slot === 'auto' ? 'Estado cargado' : `Estado ${slot} cargado`);
                Analytics.event('state_load', { slot, game_title: this.game.title });
            }
            return true;
        } catch (error) {
            if (error.message !== 'engine-mismatch') {
                console.error(error);
            }
            if (!quiet) {
                this.toast(error.message === 'engine-mismatch'
                    ? '⚠️ Este estado se guardó con el otro motor de emulación'
                    : '⚠️ No se pudo cargar el estado', 4000);
            }
            return false;
        }
    },

    async deleteState(slot) {
        await Store.remove(this.stateKey(slot));
        await Store.remove(`thumb:${this.game.id}:${slot}`);
        await Store.remove(`statemeta:${this.game.id}:${slot}`);
    },

    // Called whenever the app may be closed or killed (iOS kills background PWAs).
    persistNow() {
        if (!this.engine || !this.running) {
            return;
        }
        this.saveSram(true);
        if (this.settings.autoState) {
            this.saveState('auto', { quiet: true, sync: true });
        }
    },

    // -------------------------------------------------------------------- ROMs
    library() {
        return Store.getJSON('roms', []);
    },

    setLibrary(list) {
        Store.setJSON('roms', list);
    },

    romInfo(rom) {
        const rawTitle = new TextDecoder('ascii').decode(rom.slice(0x134, 0x144));
        const title = rawTitle.replace(/[^\x20-\x7e]/g, '').trim() || 'SIN TÍTULO';
        const checksum = ((rom[0x14e] << 8) | rom[0x14f]).toString(16).padStart(4, '0');
        return {
            id: title.replace(/[^A-Za-z0-9]+/g, '_') + '-' + checksum,
            title,
            rawTitle,
            cgb: (rom[0x143] & 0x80) !== 0,
            size: rom.length,
        };
    },

    async readRomFile(file) {
        let bytes = new Uint8Array(await file.arrayBuffer());
        let name = file.name;
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            const entry = await Bytes.unzipRom(bytes);
            bytes = entry.data;
            name = entry.name;
        }
        return { bytes, name };
    },

    // entryId: library entry the ROM comes from (saves and states use the ROM's own id).
    async loadRom(bytes, { name = '', title = '', store = true, state = null, entryId = null, source = '' } = {}) {
        if (bytes.length < 0x150) {
            this.toast('El archivo no es un ROM válido', 4000);
            return false;
        }
        const info = this.romInfo(bytes);
        info.name = name || info.title;
        if (title) {
            info.title = title;
        }
        info.entryId = entryId || info.id;

        this.stopGame();
        const engine = await this.createEngine(bytes);
        if (!engine) {
            return false;
        }
        this.engine = engine;
        this.game = info;
        this.romBytes = bytes;
        this.accumulator = 0;
        this.lastAutoState = 0;
        this.turboToggled = false;
        this.loadSram(engine, info);
        engine.setPalette(this.settings);
        this.updateVolume();
        this.running = true;
        Store.setSync('last', info.entryId);
        Analytics.event('game_start', {
            game_title: info.title,
            engine: engine.id,
            system: info.cgb ? 'GBC' : 'GB',
            source: source || (store ? 'file' : state ? 'resume' : 'library'),
        });

        if (state) {
            await this.loadState(state, { quiet: true });
        }
        this.redraw();
        this.requestWakeLock();

        if (store) {
            await this.storeRom(bytes, info);
        } else {
            this.touchLibrary(info.entryId);
        }
        return true;
    },

    // Creates the selected engine and loads the ROM. If SameBoy (WebAssembly) can't
    // start, falls back to the legacy JavaScript core so the game still runs.
    async createEngine(bytes) {
        const order = this.settings.engine === 'legacy' ? ['legacy'] : ['sameboy', 'legacy'];
        for (const id of order) {
            const engine = Engines.create(id);
            try {
                await engine.load(bytes);
                engine.onRumble = () => {
                    if (this.settings.vibration && navigator.vibrate) {
                        try {
                            navigator.vibrate(80);
                        } catch (ignored) { }
                    }
                };
                if (id !== this.settings.engine && this.settings.engine !== 'legacy') {
                    this.toast('SameBoy no está disponible: usando el motor ligero', 4000);
                }
                return engine;
            } catch (error) {
                console.error(id, error);
                if (id === 'legacy') {
                    this.toast('No se pudo cargar el ROM: ' + (error.message || error), 5000);
                }
            }
        }
        return null;
    },

    // Saves a ROM loaded from a file. If the same ROM is already in the library
    // (e.g. imported from a list), that entry is used.
    async storeRom(bytes, info) {
        const list = this.library();
        let entry = list.find((item) => item.id === info.id || item.romId === info.id);
        if (!entry || !entry.where || !(await Store.where('rom:' + entry.id))) {
            const id = entry ? entry.id : info.id;
            try {
                const where = await Store.put('rom:' + id, await Bytes.pack(bytes));
                const values = { where, size: info.size, cgb: info.cgb, romId: info.id };
                if (entry) {
                    Library.update(id, values);
                } else {
                    const updated = this.library();
                    updated.unshift(Object.assign({ id, title: info.title, name: info.name, added: Date.now() }, values));
                    this.setLibrary(updated);
                    Analytics.event('rom_add', { game_title: info.title, system: info.cgb ? 'GBC' : 'GB' });
                }
                this.toast(where === 'localStorage' ? 'ROM guardado en el dispositivo' : 'ROM guardado (IndexedDB)');
            } catch (error) {
                console.error(error);
                this.toast('⚠️ No hay espacio para guardar el ROM', 4000);
            }
            entry = this.library().find((item) => item.id === id);
        }
        if (entry) {
            this.game.entryId = entry.id;
            Store.setSync('last', entry.id);
            this.touchLibrary(entry.id);
        }
    },

    touchLibrary(id) {
        const list = this.library();
        const entry = list.find((item) => item.id === id);
        if (entry) {
            entry.played = Date.now();
            this.setLibrary(list);
        }
    },

    async loadFromLibrary(id, { resume = true } = {}) {
        const entry = this.library().find((item) => item.id === id) || { id };
        const packed = await Store.get('rom:' + id);
        if (!packed) {
            this.toast('No se encontró el ROM guardado', 4000);
            Library.update(id, { where: null });
            return false;
        }
        const bytes = await Bytes.unpack(packed);
        let state = null;
        if (resume && this.settings.autoState && await Store.where(`state:${Library.romId(entry)}:auto`)) {
            state = 'auto';
        }
        return this.loadRom(bytes, { name: entry.name, title: entry.title, store: false, state, entryId: id });
    },

    // Removes a library entry with its ROM, cover and save states (the cartridge
    // save is kept).
    async deleteRom(id) {
        const entry = this.library().find((item) => item.id === id) || { id };
        const romId = Library.romId(entry);
        await Store.remove('rom:' + id);
        await Store.remove('cover:' + id);
        Library.coverCache.delete(id);
        Library.downloads.delete(id);
        for (const slot of this.stateSlots) {
            await Store.remove(`state:${romId}:${slot}`);
            await Store.remove(`thumb:${romId}:${slot}`);
            await Store.remove(`statemeta:${romId}:${slot}`);
        }
        this.setLibrary(this.library().filter((item) => item.id !== id));
        if (Store.getSync('last') === id && (!this.game || this.game.entryId === id)) {
            await Store.remove('last');
        }
    },

    stopGame() {
        if (this.engine && this.running) {
            this.persistNow();
        }
        this.running = false;
        if (this.engine) {
            this.engine.destroy();
        }
        this.engine = null;
        this.game = null;
        this.romBytes = null;
    },

    // Restarts the running game with the newly selected engine. The cartridge save
    // is shared by both engines; save states belong to the engine that made them.
    async switchEngine() {
        const label = (Engines.list.find((e) => e.id === this.settings.engine) || {}).name || '';
        if (!this.engine || !this.romBytes) {
            this.toast('Motor: ' + label);
            return;
        }
        Analytics.event('engine_change', { engine: this.settings.engine });
        if (await this.restartGame()) {
            this.toast('Motor cambiado: ' + label, 3000);
        }
    },

    // Restarts the current game from scratch (keeps the cartridge save).
    async restartGame() {
        const bytes = this.romBytes;
        const { name, title, entryId } = this.game;
        this.persistNow();
        this.running = false;
        return this.loadRom(bytes, { name, title, entryId, store: false, source: 'restart' });
    },

    // Shown once, the first time the app opens.
    showWelcome() {
        if (!Store.getJSON('welcomed', false)) {
            document.getElementById('welcome').hidden = false;
        }
    },

    closeWelcome() {
        document.getElementById('welcome').hidden = true;
        Store.setJSON('welcomed', true);
    },

    async boot() {
        Library.migrateHomebrew();
        Library.seedDemo();
        const last = Store.getSync('last');
        if (last && this.library().some((item) => item.id === last && item.where)) {
            try {
                await this.loadFromLibrary(last);
            } catch (error) {
                console.error(error);
            }
        }
        this.openMenu();
        this.showWelcome();
    },

    // ------------------------------------------------------------------- audio
    unlockAudio() {
        const ctx = Sound.ctx;
        if (ctx.state !== 'running') {
            ctx.resume().catch(() => {});
            if (!this.audioPrimed) {
                // Playing a silent buffer inside a user gesture unlocks audio on iOS.
                this.audioPrimed = true;
                try {
                    const source = ctx.createBufferSource();
                    source.buffer = ctx.createBuffer(1, 1, 22050);
                    source.connect(ctx.destination);
                    source.start(0);
                } catch (ignored) { }
            }
        }
    },

    async requestWakeLock() {
        if (!('wakeLock' in navigator) || document.hidden || this.wakeLock) {
            return;
        }
        try {
            this.wakeLock = await navigator.wakeLock.request('screen');
            this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
        } catch (ignored) { }
    },

    async requestPersistentStorage() {
        if (navigator.storage && navigator.storage.persist) {
            try {
                await navigator.storage.persist();
            } catch (ignored) { }
        }
    },

    // -------------------------------------------------------------------- menu
    openMenu(page = 'main') {
        this.menuOpen = true;
        Controls.releaseAll();
        Input.releaseAll();
        if (this.engine && this.running) {
            this.saveSram(true);
        }
        this.el.menu.hidden = false;
        this.showPage(page);
    },

    closeMenu() {
        if (!this.engine) {
            this.showPage('main');
            this.toast('Carga un ROM para empezar');
            return;
        }
        this.menuOpen = false;
        this.el.menu.hidden = true;
        this.unlockAudio();
        this.requestWakeLock();
    },

    // Parent of each menu page, for the back button.
    pageParents: {
        library: 'main',
        import: 'library',
        entry: 'library',
        states: 'saveload',
        savedata: 'saveload',
        palette: 'interface',
        skin: 'interface',
        mapping: 'controls',
    },

    showPage(page) {
        this.page = page;
        this.el.menu.dataset.page = page;
        const sections = this.el.menu.querySelectorAll('.page');
        let title = '';
        sections.forEach((section) => {
            const active = section.dataset.page === page;
            section.hidden = !active;
            if (active) {
                title = section.dataset.title || '';
            }
        });
        document.getElementById('menu-title').innerHTML = title ? title : '<span class="logo">GBoy-JS</span>';
        document.getElementById('menu-back').style.visibility = page === 'main' ? 'hidden' : 'visible';
        this.el.menu.querySelector('.sheet').scrollTop = 0;
        this.renderGameState();
        this.toggleCapturePop(false);
        const render = {
            main: () => this.renderMain(),
            library: () => Library.render(),
            import: () => this.renderImport(),
            entry: () => Library.renderEntry(),
            states: () => this.renderStates(),
            palette: () => this.renderPalettes(),
            settings: () => this.renderSettings(),
            mapping: () => this.renderMapping(),
            skin: () => this.renderSkins(),
            about: () => this.renderAbout(),
        }[page];
        if (render) {
            render();
        }
    },

    // Options that need a running game are disabled until one is loaded.
    renderGameState() {
        const hasGame = !!this.engine;
        this.el.menu.querySelectorAll('[data-needs-game]').forEach((el) => { el.disabled = !hasGame; });
        this.el.menu.querySelectorAll('[data-no-game]').forEach((el) => { el.hidden = hasGame; });
        this.el.cameraBtn.hidden = !hasGame;
    },

    renderMain() {
        const hasGame = !!this.engine;
        const now = document.getElementById('now-playing');
        if (hasGame) {
            now.innerHTML = '';
            now.appendChild(this.nowPlayingCard());
        } else {
            now.innerHTML = '<p class="welcome">Emulador de Game Boy y Game Boy Color.<br>Abre <strong>Juegos</strong> para jugar la demo, añadir tus ROMs<br>o importar listas de juegos.</p>';
        }
    },

    // Card of the running game at the top of the menu, with its favorite star.
    nowPlayingCard() {
        const entry = this.game.entryId ? Library.find(this.game.entryId) : null;
        const card = document.createElement('div');
        card.className = 'card lib now-card';
        card.innerHTML = `
            <div class="lib-main">
                <div class="cover"><span class="cover-ph"></span></div>
                <div class="rom-info">
                    <small class="now-label">Jugando</small>
                    <strong></strong>
                    <small class="meta"></small>
                </div>
                <div class="lib-actions">
                    ${entry ? `<button type="button" class="fav${entry.fav ? ' on' : ''}" data-action="lib-fav" aria-label="Favorito">${entry.fav ? '★' : '☆'}</button>
                    <button type="button" class="btn ghost small more" data-action="lib-edit" aria-label="Ficha del juego">⋯</button>` : ''}
                </div>
            </div>
            <p class="desc"></p>`;
        card.querySelectorAll('[data-action]').forEach((button) => { button.dataset.id = entry.id; });
        const title = (entry && entry.title) || this.game.title;
        card.querySelector('strong').textContent = title;
        card.querySelector('.cover-ph').textContent = (title || '?').trim().charAt(0).toUpperCase();
        const values = entry ? [entry.year, entry.genre, entry.collection] : [];
        card.querySelector('.meta').textContent = [...new Set([...values, this.game.cgb ? 'GBC' : 'GB'].filter(Boolean))].join(' · ');
        const desc = card.querySelector('.desc');
        desc.textContent = (entry && entry.description) || '';
        desc.hidden = !desc.textContent;
        if (entry) {
            Library.coverOf(entry).then((src) => {
                if (src) {
                    const img = document.createElement('img');
                    img.alt = '';
                    img.onerror = () => img.remove();
                    img.src = src;
                    card.querySelector('.cover').appendChild(img);
                }
            });
        }
        return card;
    },

    formatSize(bytes) {
        return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
    },

    formatDate(time) {
        return new Date(time).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    },

    // --- Import page ---
    updateImportGutter() {
        const text = document.getElementById('import-text');
        const lines = text.value.split('\n').length;
        const gutter = document.getElementById('import-gutter');
        if (gutter.dataset.lines !== String(lines)) {
            gutter.dataset.lines = lines;
            gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
        }
        gutter.scrollTop = text.scrollTop;
    },

    // Lists bundled in static/txt, ready to import.
    async renderTxtLists() {
        const container = document.getElementById('txt-lists');
        container.innerHTML = '<p class="note">Cargando listas…</p>';
        const lists = (await Library.txtLists()).filter((list) => !list.error && list.count);
        this.txtListCache = new Map(lists.map((list) => [list.file, list]));
        container.innerHTML = '';
        if (!lists.length) {
            container.innerHTML = '<p class="note">No hay listas disponibles.</p>';
            return;
        }
        for (const list of lists) {
            const card = document.createElement('div');
            card.className = 'card txt-list';
            card.innerHTML = `
                <div class="rom-info">
                    <strong></strong>
                    <small class="meta"></small>
                    <p class="desc"></p>
                </div>
                <button type="button" class="btn primary small" data-action="txt-load">Usar</button>`;
            card.querySelector('strong').textContent = list.title;
            card.querySelector('.meta').textContent = `${list.file} · ${list.count} juegos`;
            const desc = card.querySelector('.desc');
            desc.textContent = list.description;
            desc.hidden = !list.description;
            card.querySelector('button').dataset.file = list.file;
            container.appendChild(card);
        }
    },

    // Puts a bundled list in the editor and shows its preview.
    loadTxtList(file) {
        const list = this.txtListCache && this.txtListCache.get(file);
        if (!list) {
            return;
        }
        document.getElementById('import-text').value = list.text;
        this.importSource = list.file;
        document.getElementById('import-collection').value = '';
        this.updateImportGutter();
        this.previewImport();
        document.getElementById('import-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    renderImport() {
        this.renderTxtLists();
        this.updateImportGutter();
        document.getElementById('import-result').innerHTML = '';
        document.getElementById('import-apply').disabled = true;
        this.importParsed = null;
    },

    previewImport() {
        const text = document.getElementById('import-text').value;
        const collection = document.getElementById('import-collection').value.trim().slice(0, 60);
        const parsed = Library.parse(text, collection);
        const plan = Library.plan(parsed);
        const result = document.getElementById('import-result');
        result.innerHTML = '';
        const summary = document.createElement('p');
        summary.className = 'summary';
        summary.textContent = parsed.entries.length || parsed.errors.length
            ? `${plan.added} nuevos · ${plan.updated} se actualizarán · ${plan.errors} con errores`
            : 'La lista está vacía.';
        result.appendChild(summary);
        if (parsed.errors.length) {
            const ul = document.createElement('ul');
            for (const error of parsed.errors.slice(0, 50)) {
                const li = document.createElement('li');
                li.textContent = `Línea ${error.line}: ${error.message}`;
                ul.appendChild(li);
            }
            if (parsed.errors.length > 50) {
                const li = document.createElement('li');
                li.textContent = `… y ${parsed.errors.length - 50} más`;
                ul.appendChild(li);
            }
            result.appendChild(ul);
        }
        if (parsed.entries.length) {
            const table = document.createElement('table');
            table.className = 'preview-table';
            for (const { line, values } of parsed.entries.slice(0, 30)) {
                const row = table.insertRow();
                row.insertCell().textContent = line;
                const info = row.insertCell();
                const strong = document.createElement('strong');
                strong.textContent = values.title;
                info.appendChild(strong);
                const meta = [values.year, values.genre, values.collection].filter(Boolean).join(' · ');
                let host = values.url;
                try {
                    host = new URL(values.url).host;
                } catch (ignored) { }
                const small = document.createElement('small');
                small.textContent = (meta ? meta + ' · ' : '') + host;
                info.appendChild(document.createElement('br'));
                info.appendChild(small);
            }
            result.appendChild(table);
            if (parsed.entries.length > 30) {
                const more = document.createElement('p');
                more.className = 'note';
                more.textContent = `… y ${parsed.entries.length - 30} más`;
                result.appendChild(more);
            }
        }
        this.importParsed = parsed.entries.length ? parsed : null;
        document.getElementById('import-apply').disabled = !this.importParsed;
    },

    applyImport() {
        if (!this.importParsed) {
            return;
        }
        const result = Library.apply(this.importParsed);
        if (!result) {
            return;
        }
        this.importParsed = null;
        document.getElementById('import-text').value = '';
        this.toast(`Lista importada: ${result.added} nuevos, ${result.updated} actualizados`, 3000);
        Analytics.event('list_import', { list: this.importSource || 'manual', added: result.added, updated: result.updated });
        this.importSource = null;
        Library.view.filter = 'all';
        Library.view.query = '';
        this.showPage('library');
    },

    // --- Screenshots (camera button in the menu header) ---
    async shotCover() {
        const id = this.game && this.game.entryId;
        if (!id || !Library.find(id)) {
            this.toast('Este juego no está en la biblioteca', 3000);
            return;
        }
        if (await Library.setCover(id, this.el.canvas.toDataURL('image/png'))) {
            this.toast('Portada actualizada');
            Analytics.event('screenshot', { type: 'cover', game_title: this.game.title });
        }
    },

    shotPng() {
        // 4× nearest-neighbour upscale so the capture looks sharp.
        const scale = 4;
        const canvas = document.createElement('canvas');
        canvas.width = this.el.canvas.width * scale;
        canvas.height = this.el.canvas.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.el.canvas, 0, 0, canvas.width, canvas.height);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const title = (this.game.title || 'captura').replace(/[\\/:*?"<>|]+/g, ' ').trim();
        canvas.toBlob((blob) => {
            if (blob) {
                this.download(blob, `GBoy-JS_${title}_${stamp}.png`);
                this.toast('Captura guardada');
                Analytics.event('screenshot', { type: 'png', game_title: this.game.title });
            }
        }, 'image/png');
    },

    toggleCapturePop(show) {
        const open = show !== undefined ? show : this.el.capturePop.hidden;
        this.el.capturePop.hidden = !open;
        this.el.cameraBtn.setAttribute('aria-expanded', String(open));
    },

    renderStates() {
        const container = document.getElementById('state-list');
        container.innerHTML = '';
        if (!this.game) {
            return;
        }
        for (const slot of this.stateSlots) {
            const meta = Store.getJSON(`statemeta:${this.game.id}:${slot}`, null);
            const thumb = Store.getSync(`thumb:${this.game.id}:${slot}`);
            const card = document.createElement('div');
            card.className = 'card state';
            const label = slot === 'auto' ? 'Autoguardado' : `Ranura ${slot}`;
            card.innerHTML = `
                <div class="thumb">${meta && thumb ? '<img alt="">' : '<span>Vacía</span>'}</div>
                <div class="state-info">
                    <strong>${label}</strong>
                    <small>${meta ? this.formatDate(meta.time) : '—'}</small>
                    <div class="card-actions">
                        ${slot === 'auto' ? '' : `<button type="button" class="btn primary small" data-action="state-save" data-slot="${slot}">Guardar</button>`}
                        <button type="button" class="btn small" data-action="state-load" data-slot="${slot}" ${meta ? '' : 'disabled'}>Cargar</button>
                        ${meta && thumb ? `<button type="button" class="btn ghost small" data-action="state-cover" data-slot="${slot}">Portada</button>` : ''}
                        ${meta ? `<button type="button" class="btn ghost small" data-action="state-delete" data-slot="${slot}" aria-label="Borrar">🗑</button>` : ''}
                    </div>
                </div>`;
            if (meta && thumb) {
                card.querySelector('img').src = thumb;
            }
            container.appendChild(card);
        }
    },

    renderPalettes() {
        const container = document.getElementById('palette-list');
        container.innerHTML = '';
        const all = Palettes.presets.slice();
        for (const preset of all) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'palette' + (this.settings.palette === preset.id ? ' active' : '');
            button.dataset.action = 'palette';
            button.dataset.id = preset.id;
            const sprites = preset.obj0 ? [preset.obj0[1], preset.obj0[2], (preset.obj1 || preset.obj0)[1]] : [];
            button.innerHTML = `<span class="swatches">${preset.bg.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
                ${sprites.length ? `<span class="swatches sprites">${sprites.map((c) => `<i style="background:${c}"></i>`).join('')}</span>` : ''}
                <span class="name"></span>`;
            button.querySelector('.name').textContent = preset.name;
            container.appendChild(button);
        }
        document.querySelectorAll('[data-custom]').forEach((input) => {
            input.value = this.settings.customPalette[Number(input.dataset.custom)];
        });
        document.querySelector('[data-action="palette-custom"]').classList.toggle('primary', this.settings.palette === 'custom');
        document.getElementById('palette-note').classList.toggle('warn', !!(this.game && this.game.cgb));
    },

    renderSettings() {
        this.el.menu.querySelectorAll('[data-setting]').forEach((input) => {
            const value = this.settings[input.dataset.setting];
            if (input.type === 'checkbox') {
                input.checked = !!value;
            } else {
                input.value = String(value);
            }
        });
        this.updateOutputs();
        document.getElementById('row-silent-switch').hidden = !navigator.audioSession;
        this.renderStorageInfo();
    },

    updateOutputs() {
        this.el.menu.querySelectorAll('[data-out]').forEach((out) => {
            out.textContent = this.settings[out.dataset.out] + '%';
        });
    },

    async renderStorageInfo() {
        const info = document.getElementById('storage-info');
        const used = Store.localStorageUsage();
        let text = `localStorage: ${this.formatSize(used * 2)} usados`;
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                text += ` · Total del sitio: ${this.formatSize(estimate.usage || 0)}`;
            } catch (ignored) { }
        }
        if (navigator.storage && navigator.storage.persisted) {
            try {
                text += (await navigator.storage.persisted()) ? ' · Almacenamiento persistente ✅' : '';
            } catch (ignored) { }
        }
        info.textContent = text;
    },

    renderAbout() {
        document.getElementById('install-btn').hidden = !this.installPrompt;
        document.getElementById('install-ios').hidden = this.isStandalone || !this.isIOS;
        document.getElementById('install-android').hidden = this.isStandalone || this.isIOS || !!this.installPrompt || !/Android/.test(navigator.userAgent);
        document.getElementById('installed-note').hidden = !this.isStandalone;
        document.getElementById('version-info').textContent = this.version ? 'Versión: ' + this.version : '';
    },

    // ------------------------------------------------------------------ editor
    startLayoutEditor() {
        this.menuOpen = false;
        this.el.menu.hidden = true;
        if (this.settings.touchControls === 'never') {
            this.toast('Los controles táctiles están ocultos en Ajustes', 3000);
        }
        Controls.startEditing();
        this.el.editor.hidden = false;
        this.el.app.classList.add('editing');
        this.renderEditorChips();
        this.updateEditor();
    },

    stopLayoutEditor() {
        Controls.stopEditing();
        this.el.editor.hidden = true;
        this.el.app.classList.remove('editing');
        this.openMenu('controls');
    },

    renderEditorChips() {
        const chips = document.getElementById('editor-chips');
        chips.innerHTML = '';
        for (const id of Object.keys(Controls.defs)) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'chip';
            chip.dataset.action = 'select-control';
            chip.dataset.id = id;
            chip.textContent = Controls.defs[id].name;
            chips.appendChild(chip);
        }
    },

    updateEditor() {
        const id = Controls.selected;
        const c = Controls.layout[id];
        const orientationName = this.orientation === 'portrait' ? 'vertical' : 'horizontal';
        document.getElementById('editor-title').textContent = `Controles · modo ${orientationName}`;
        document.querySelectorAll('#editor-chips .chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.id === id));
        const size = Math.round(c.size * 100);
        const opacity = Math.round(c.opacity * 100);
        document.getElementById('ed-size').value = size;
        document.getElementById('ed-size-out').textContent = size + '%';
        document.getElementById('ed-opacity').value = opacity;
        document.getElementById('ed-opacity-out').textContent = opacity + '%';
        document.getElementById('ed-global').value = this.settings.opacity;
        document.getElementById('ed-global-out').textContent = this.settings.opacity + '%';
        const visible = document.getElementById('ed-visible');
        visible.checked = c.visible;
        visible.disabled = id === 'menu';
    },

    // ----------------------------------------------------------------- events
    bindEvents() {
        const menu = this.el.menu;
        document.addEventListener('click', (ev) => {
            const tracked = ev.target.closest('a[data-track]');
            if (tracked) {
                Analytics.event('link_click', { link: tracked.dataset.track });
            }
            if (!this.el.capturePop.hidden && !ev.target.closest('#capture-pop, #camera-btn')) {
                this.toggleCapturePop(false);
            }
            const target = ev.target.closest('[data-action]');
            if (target && !target.disabled) {
                this.handleAction(target.dataset.action, target);
            }
        });
        menu.addEventListener('click', (ev) => {
            if (ev.target === menu) {
                this.closeMenu();
            }
        });

        menu.addEventListener('input', (ev) => this.onSettingInput(ev));
        menu.addEventListener('change', (ev) => this.onSettingInput(ev));

        document.querySelectorAll('[data-custom]').forEach((input) => {
            input.addEventListener('input', () => {
                this.settings.customPalette[Number(input.dataset.custom)] = input.value;
                this.settings.palette = 'custom';
                this.saveSettings();
                this.applyPalette();
                this.redraw();
            });
            input.addEventListener('change', () => this.renderPalettes());
        });

        // Layout editor sliders.
        const edit = (values) => {
            Controls.saveControl(Controls.selected, values);
            Controls.render();
            this.updateEditor();
        };
        document.getElementById('ed-size').addEventListener('input', (ev) => edit({ size: ev.target.value / 100 }));
        document.getElementById('ed-opacity').addEventListener('input', (ev) => edit({ opacity: ev.target.value / 100 }));
        document.getElementById('ed-visible').addEventListener('change', (ev) => edit({ visible: ev.target.checked }));
        document.getElementById('ed-global').addEventListener('input', (ev) => {
            this.settings.opacity = Number(ev.target.value);
            this.saveSettings();
            Controls.render();
            this.updateEditor();
        });

        this.el.romInput.addEventListener('change', async () => {
            const file = this.el.romInput.files[0];
            this.el.romInput.value = '';
            if (!file) {
                return;
            }
            try {
                const { bytes, name } = await this.readRomFile(file);
                if (await this.loadRom(bytes, { name })) {
                    this.closeMenu();
                }
            } catch (error) {
                console.error(error);
                this.toast(String(error), 4000);
            }
        });

        // Library: search, filter, sort.
        const search = document.getElementById('lib-search');
        search.addEventListener('input', () => {
            clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => {
                Library.view.query = search.value;
                Library.view.limit = 60;
                Library.render();
            }, 150);
        });
        document.getElementById('lib-filter').addEventListener('change', (ev) => {
            Library.view.filter = ev.target.value;
            Library.view.limit = 60;
            Library.render();
        });
        document.getElementById('lib-sort').addEventListener('change', (ev) => {
            this.settings.librarySort = ev.target.value;
            this.saveSettings();
            Library.render();
        });
        const importText = document.getElementById('import-text');
        importText.addEventListener('input', () => {
            this.updateImportGutter();
            document.getElementById('import-apply').disabled = true;
        });
        importText.addEventListener('scroll', () => {
            document.getElementById('import-gutter').scrollTop = importText.scrollTop;
        });
        this.el.txtInput.addEventListener('change', async () => {
            const file = this.el.txtInput.files[0];
            this.el.txtInput.value = '';
            if (file) {
                importText.value = await file.text();
                this.importSource = 'file:' + file.name;
                this.renderImport();
                this.previewImport();
            }
        });
        this.el.assignInput.addEventListener('change', async () => {
            const file = this.el.assignInput.files[0];
            this.el.assignInput.value = '';
            if (file && Library.editingId && await Library.assignFile(Library.editingId, file)) {
                Library.renderEntry();
            }
        });

        this.el.settingsInput.addEventListener('change', async () => {
            const file = this.el.settingsInput.files[0];
            this.el.settingsInput.value = '';
            if (file) {
                this.importSettings(await file.text());
            }
        });

        // Screen editor: drag / pinch on the overlay, size slider.
        const drag = this.el.screenDrag;
        drag.addEventListener('pointerdown', (ev) => this.onScreenDown(ev));
        drag.addEventListener('pointermove', (ev) => this.onScreenMove(ev));
        drag.addEventListener('pointerup', (ev) => this.onScreenUp(ev));
        drag.addEventListener('pointercancel', (ev) => this.onScreenUp(ev));
        drag.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });
        drag.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
        document.getElementById('scr-size').addEventListener('input', (ev) => {
            this.saveScreenLayout({ size: Number(ev.target.value) / 100 });
        });

        this.el.savInput.addEventListener('change', async () => {
            const file = this.el.savInput.files[0];
            this.el.savInput.value = '';
            if (file) {
                this.importSav(new Uint8Array(await file.arrayBuffer()));
            }
        });

        // Keyboard (bindings are configurable in "Mando y teclado").
        document.addEventListener('keydown', (ev) => {
            if (this.capture) {
                ev.preventDefault();
                if (this.capture.type === 'key' && !ev.repeat) {
                    this.finishCapture(ev.code === 'Escape' ? null : ev.code, ev.code === 'Delete');
                }
                return;
            }
            if (ev.target.matches && ev.target.matches('input, select, textarea')) {
                return;
            }
            const actions = [...Input.actionsForKey(ev.code)];
            if (ev.code === 'Escape' && !actions.includes('menu')) {
                actions.push('menu');
            }
            if (!actions.length) {
                return;
            }
            ev.preventDefault();
            if (ev.repeat) {
                return;
            }
            this.unlockAudio();
            for (const action of actions) {
                if (Input.buttons.includes(action) || action === 'turbo') {
                    if (!this.menuOpen) {
                        Input.keys[action] = true;
                    }
                }
            }
            this.handleActions(actions, 'key');
        });
        document.addEventListener('keyup', (ev) => {
            for (const action of Input.actionsForKey(ev.code)) {
                Input.keys[action] = false;
            }
        });

        // Audio unlock on any gesture (iOS requires touchend / click).
        ['touchend', 'click', 'keydown'].forEach((type) => {
            document.addEventListener(type, () => this.unlockAudio(), { passive: true });
        });

        // Lifecycle: save whenever the app may be closed.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.persistNow();
                Controls.releaseAll();
                Input.releaseAll();
            } else {
                this.lastTime = performance.now();
                this.requestWakeLock();
                if (Sound.ctx.state !== 'running' && !this.menuOpen) {
                    Sound.ctx.resume().catch(() => {});
                }
            }
        });
        addEventListener('pagehide', () => this.persistNow());
        addEventListener('beforeunload', () => this.persistNow());
        document.addEventListener('freeze', () => this.persistNow());

        // Layout.
        const relayout = () => requestAnimationFrame(() => {
            this.layout();
            if (Controls.editing) {
                this.updateEditor();
            }
            this.updateScreenEditor();
        });
        addEventListener('resize', relayout);
        addEventListener('orientationchange', () => setTimeout(relayout, 250));
        if (window.visualViewport) {
            visualViewport.addEventListener('resize', relayout);
        }

        // Prevent pinch zoom in iOS Safari (it ignores user-scalable=no).
        ['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
            document.addEventListener(type, (ev) => ev.preventDefault(), { passive: false });
        });
        document.addEventListener('dblclick', (ev) => ev.preventDefault(), { passive: false });

        // Install prompt (Android / desktop Chrome).
        addEventListener('beforeinstallprompt', (ev) => {
            ev.preventDefault();
            this.installPrompt = ev;
            if (this.page === 'about') {
                this.renderAbout();
            }
        });
        addEventListener('appinstalled', () => {
            Analytics.event('app_install');
            this.installPrompt = null;
            this.toast('¡App instalada!');
        });

        // Opening .gb/.gbc files with the installed app (Chrome/Android).
        if ('launchQueue' in window) {
            launchQueue.setConsumer(async (params) => {
                if (!params.files || !params.files.length) {
                    return;
                }
                const { bytes, name } = await this.readRomFile(await params.files[0].getFile());
                if (await this.loadRom(bytes, { name })) {
                    this.closeMenu();
                }
            });
        }

        // The frame can be toggled from "Aspecto de la consola" and from the screen editor.
        ['frame-toggle', 'scr-frame'].forEach((id) => {
            document.getElementById(id).addEventListener('change', (ev) => {
                this.settings.frame = ev.target.checked;
                this.saveSettings();
                this.applySettings();
                this.updateScreenEditor();
            });
        });
        addEventListener('gamepaddisconnected', () => {
            if (this.page === 'mapping') {
                this.renderMapping();
            }
        });
        addEventListener('gamepadconnected', () => {
            if (this.page === 'mapping') {
                this.renderMapping();
            }
        });
        addEventListener('gamepadconnected', (ev) => this.toast('🎮 Mando conectado: ' + ev.gamepad.id.split('(')[0].trim()));
    },

    onSettingInput(ev) {
        const input = ev.target;
        const name = input.dataset && input.dataset.setting;
        if (!name) {
            return;
        }
        let value;
        if (input.type === 'checkbox') {
            value = input.checked;
        } else if (input.type === 'range') {
            value = Number(input.value);
        } else {
            value = input.value;
        }
        this.settings[name] = value;
        this.saveSettings();
        this.updateOutputs();
        if (name === 'turboMode') {
            this.turboToggled = false;
        }
        if (name === 'screenMode' && value === 'manual') {
            this.seedManualScreen();
            this.saveSettings();
        }
        this.applySettings();
        if (name === 'engine') {
            this.switchEngine();
        }
        if (name === 'analytics') {
            Analytics.setEnabled(value);
        }
    },

    async handleAction(action, target) {
        switch (action) {
            case 'close':
            case 'resume':
                this.closeMenu();
                break;
            case 'back':
                this.showPage(this.pageParents[this.page] || 'main');
                break;
            case 'theme':
                this.nextTheme();
                break;
            case 'welcome-close':
                this.closeWelcome();
                break;
            case 'welcome-games':
                this.closeWelcome();
                this.openMenu('library');
                break;
            case 'edit-screen':
                this.startScreenEditor();
                break;
            case 'screen-mode':
                this.setScreenMode(target.dataset.mode);
                break;
            case 'screen-reset':
                if (this.settings.screenLayouts) {
                    delete this.settings.screenLayouts[this.orientation];
                }
                this.setScreenMode('auto');
                break;
            case 'screen-done':
                this.stopScreenEditor();
                break;
            case 'export-settings':
                this.exportSettings();
                break;
            case 'import-settings':
                this.el.settingsInput.click();
                break;
            case 'page':
                this.showPage(target.dataset.pageTarget);
                break;
            case 'open-rom':
                this.el.romInput.click();
                break;
            case 'reset':
                if (confirm('¿Reiniciar el juego? Se perderá el progreso no guardado en el juego.')) {
                    if (await this.restartGame()) {
                        this.closeMenu();
                    }
                }
                break;
            case 'skin':
                this.settings.skin = target.dataset.id;
                this.saveSettings();
                this.applySettings();
                this.renderSkins();
                break;
            case 'map-key':
                this.startCapture(target.dataset.id, 'key');
                break;
            case 'map-pad':
                this.startCapture(target.dataset.id, 'pad');
                break;
            case 'map-cancel':
                if (this.capture) {
                    this.finishCapture(null);
                }
                break;
            case 'map-clear':
                if (this.capture) {
                    this.finishCapture(null, true);
                }
                break;
            case 'map-reset':
                this.settings.keyMap = {};
                this.settings.padMap = {};
                this.saveSettings();
                Input.configure(this.settings);
                this.renderMapping();
                this.toast('Controles restablecidos');
                break;
            case 'lib-play':
                if (await Library.play(target.dataset.id)) {
                    this.closeMenu();
                }
                break;
            case 'lib-fav': {
                const entry = Library.find(target.dataset.id);
                if (entry) {
                    Library.update(entry.id, { fav: !entry.fav });
                    Library.refreshEntry(entry.id);
                    if (this.page === 'main') {
                        this.renderMain();
                    }
                }
                break;
            }
            case 'lib-edit':
                Library.editingId = target.dataset.id;
                this.showPage('entry');
                break;
            case 'lib-view':
                this.settings.libraryView = this.settings.libraryView === 'grid' ? 'list' : 'grid';
                this.saveSettings();
                Library.render();
                break;
            case 'lib-more':
                Library.view.limit += 60;
                Library.render();
                break;
            case 'lib-collection':
                Library.view.filter = 'c:' + target.dataset.collection;
                Library.view.query = '';
                Library.view.limit = 60;
                this.showPage('library');
                break;
            case 'import-games':
                if (await Library.importGamesList()) {
                    Library.view.filter = 'all';
                    Library.view.query = '';
                    Library.render();
                }
                break;
            case 'lib-clear': {
                const count = this.library().length;
                if (!count) {
                    this.toast('La biblioteca ya está vacía');
                } else if (confirm(`¿Eliminar TODA la biblioteca (${count} juegos) con sus ROMs descargados, portadas y estados guardados?\n\nLas partidas guardadas del cartucho (.sav) se conservan. No se puede deshacer: si quieres conservarla, expórtala antes.`)) {
                    const removed = await Library.clearAll();
                    if (this.game) {
                        this.game.entryId = null;
                    }
                    Library.render();
                    this.toast(`Biblioteca eliminada (${removed} juegos)`, 3000);
                }
                break;
            }
            case 'import-file':
                this.el.txtInput.click();
                break;
            case 'import-clear':
                document.getElementById('import-text').value = '';
                this.importSource = null;
                this.renderImport();
                break;
            case 'import-preview':
                this.previewImport();
                break;
            case 'import-apply':
                this.applyImport();
                break;
            case 'txt-load':
                this.loadTxtList(target.dataset.file);
                break;
            case 'entry-play':
                if (await Library.play(Library.editingId)) {
                    this.closeMenu();
                }
                break;
            case 'entry-save':
                if (Library.saveEntry()) {
                    Library.renderEntry();
                }
                break;
            case 'entry-download':
                if (await Library.download(Library.editingId)) {
                    this.toast('Descargado: ya puedes jugar sin conexión');
                }
                break;
            case 'entry-assign':
                this.el.assignInput.click();
                break;
            case 'entry-remove-download': {
                const entry = Library.find(Library.editingId);
                if (entry && confirm(`¿Borrar el ROM descargado de «${entry.title}»? La ficha, la portada y las partidas se conservan.`)) {
                    await Library.removeDownload(entry.id);
                    Library.renderEntry();
                }
                break;
            }
            case 'entry-delete': {
                const entry = Library.find(Library.editingId);
                if (entry && confirm(`¿Eliminar «${entry.title}» de la biblioteca con su ROM, portada y estados guardados? La partida (.sav) se conserva.`)) {
                    await this.deleteRom(entry.id);
                    this.showPage('library');
                }
                break;
            }
            case 'entry-cover-reset':
                await Library.removeCover(Library.editingId);
                Library.renderEntry();
                break;
            case 'capture-menu':
                this.toggleCapturePop();
                break;
            case 'shot-cover':
                this.toggleCapturePop(false);
                await this.shotCover();
                break;
            case 'shot-png':
                this.toggleCapturePop(false);
                this.shotPng();
                break;
            case 'state-cover': {
                const id = this.game && this.game.entryId;
                const thumb = this.game && Store.getSync(`thumb:${this.game.id}:${target.dataset.slot}`);
                if (!id || !Library.find(id)) {
                    this.toast('Este juego no está en la biblioteca', 3000);
                } else if (thumb && await Library.setCover(id, thumb)) {
                    this.toast('Portada actualizada');
                }
                break;
            }
            case 'state-save':
                if (await this.saveState(target.dataset.slot)) {
                    this.renderStates();
                }
                break;
            case 'state-load':
                if (await this.loadState(target.dataset.slot)) {
                    this.closeMenu();
                }
                break;
            case 'state-delete':
                await this.deleteState(target.dataset.slot);
                this.renderStates();
                break;
            case 'palette':
                this.settings.palette = target.dataset.id;
                this.saveSettings();
                this.applyPalette();
                this.redraw();
                this.renderPalettes();
                break;
            case 'palette-custom':
                this.settings.palette = 'custom';
                this.saveSettings();
                this.applyPalette();
                this.redraw();
                this.renderPalettes();
                break;
            case 'edit-layout':
                this.startLayoutEditor();
                break;
            case 'layout-done':
                this.stopLayoutEditor();
                break;
            case 'layout-reset':
                Controls.resetLayout();
                this.updateEditor();
                break;
            case 'select-control':
                Controls.selected = target.dataset.id;
                Controls.render();
                this.updateEditor();
                break;
            case 'export-sav':
                this.exportSav();
                break;
            case 'import-sav':
                this.el.savInput.click();
                break;
            case 'install':
                if (this.installPrompt) {
                    this.installPrompt.prompt();
                    this.installPrompt = null;
                    this.renderAbout();
                }
                break;
            case 'clear-data':
                if (confirm('¿Borrar TODOS los ROMs, partidas, estados y ajustes guardados? No se puede deshacer.')) {
                    this.running = false;
                    this.engine = null;
                    this.game = null;
                    await Store.clearAll();
                    location.reload();
                }
                break;
        }
    },

    // ---------------------------------------------------------------- .sav I/O
    exportSav() {
        const sav = this.engine.exportSav();
        if (!sav) {
            this.toast('Este juego no tiene partida guardada en el cartucho', 3000);
            return;
        }
        this.download(new Blob([sav], { type: 'application/octet-stream' }), this.game.title + '.sav');
    },

    download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    },

    // ------------------------------------------------------- settings backup
    async exportSettings() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        // ':' isn't allowed in file names on Windows, iOS or Android.
        const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const data = {
            app: 'GBoy-JS',
            type: 'settings',
            version: 2,
            exported: now.toISOString(),
            settings: this.settings,
            library: await Library.exportData(),
        };
        this.download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `GBoy-JS_Settings_${date} ${time}.json`);
        this.toast(`Ajustes y biblioteca exportados (${data.library.entries.length} juegos)`);
    },

    // Keeps only known settings whose type matches the default value.
    cleanSettings(input) {
        const clean = {};
        for (const [key, fallback] of Object.entries(this.defaults)) {
            const value = input[key];
            if (value === undefined || value === null) {
                continue;
            }
            const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
            if (Array.isArray(fallback) ? Array.isArray(value) && value.length === fallback.length
                : isObject(fallback) ? isObject(value) : typeof value === typeof fallback) {
                clean[key] = value;
            }
        }
        return clean;
    },

    async importSettings(text) {
        let data;
        try {
            data = JSON.parse(text);
        } catch (error) {
            this.toast('⚠️ El archivo no es un JSON válido', 4000);
            return;
        }
        const input = data && typeof data.settings === 'object' ? data.settings : data;
        const clean = input && typeof input === 'object' ? this.cleanSettings(input) : {};
        const library = data && data.library && Array.isArray(data.library.entries) ? data.library : null;
        if (!Object.keys(clean).length && !library) {
            this.toast('⚠️ El archivo no contiene ajustes de GBoy-JS', 4000);
            return;
        }
        const question = [
            Object.keys(clean).length ? 'Se reemplazarán tus ajustes actuales por los del archivo.' : '',
            library ? `La biblioteca del archivo (${library.entries.length} juegos) se combinará con la tuya; no se borra nada.` : '',
        ].filter(Boolean).join('\n');
        if (!confirm(question + '\n\n¿Continuar?')) {
            return;
        }
        let libraryResult = null;
        if (library) {
            libraryResult = await Library.importData(library);
        }
        if (!Object.keys(clean).length) {
            this.showPage(this.page);
            this.toast(libraryResult ? `Biblioteca importada: ${libraryResult.added} nuevos, ${libraryResult.updated} actualizados` : '⚠️ No se pudo importar la biblioteca', 4000);
            return;
        }
        const previousEngine = this.settings.engine;
        this.settings = Object.assign({}, this.defaults, clean);
        this.settings.opacity = Number(this.settings.opacity);
        this.saveSettings();
        Input.configure(this.settings);
        Analytics.setEnabled(this.settings.analytics);
        this.applyPalette();
        this.applySettings();
        this.redraw();
        this.showPage(this.page);
        this.toast(libraryResult ? `Ajustes importados · biblioteca: ${libraryResult.added} nuevos, ${libraryResult.updated} actualizados` : 'Ajustes importados', 4000);
        if (this.settings.engine !== previousEngine) {
            this.switchEngine();
        }
    },

    async importSav(bytes) {
        if (!this.engine.hasSaveData()) {
            this.toast('Este juego no usa partida guardada en el cartucho', 3000);
            return;
        }
        if (!confirm('¿Reemplazar la partida actual por la del archivo? El juego se reiniciará.')) {
            return;
        }
        // Stored whole: SameBoy reads the RTC appended to .sav files, the legacy core ignores it.
        Store.setSync('sram:' + this.game.id, Bytes.toBase64(bytes));
        await Store.remove('rtc:' + this.game.id);
        await Store.remove(`state:${this.game.id}:auto`);
        await Store.remove(`statemeta:${this.game.id}:auto`);
        await Store.remove(`thumb:${this.game.id}:auto`);
        // Stop first so the current (old) save isn't written back on restart.
        this.running = false;
        if (await this.restartGame()) {
            this.toast('Partida importada');
            this.closeMenu();
        }
    },

    // ------------------------------------------------------------------ misc
    toast(message, duration = 2000) {
        const toast = this.el.toast;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    },

    registerServiceWorker() {
        if (!('serviceWorker' in navigator) || location.protocol === 'file:') {
            return;
        }
        navigator.serviceWorker.register('sw.js').then((registration) => {
            registration.addEventListener('updatefound', () => {
                const worker = registration.installing;
                worker.addEventListener('statechange', () => {
                    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.toast('Nueva versión disponible: se aplicará al reabrir la app', 4000);
                    }
                });
            });
        }).catch((error) => console.warn('Service worker registration failed', error));
        navigator.serviceWorker.addEventListener('message', (ev) => {
            if (ev.data && ev.data.version) {
                this.version = ev.data.version;
            }
        });
        navigator.serviceWorker.ready.then((registration) => {
            if (registration.active) {
                registration.active.postMessage('version');
            }
        });
    },
};

App.init();
