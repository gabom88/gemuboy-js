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
        };
        // iOS greys out files with unknown extensions when "accept" is set.
        if (!this.isIOS) {
            this.el.romInput.accept = '.gb,.gbc,.zip';
            this.el.savInput.accept = '.sav,.srm';
            this.el.settingsInput.accept = '.json,application/json';
        }

        this.el.bezel = document.getElementById('bezel');
        this.el.brand = document.getElementById('brand');
        this.el.capture = document.getElementById('capture');
        Palettes.apply(this.settings);
        Input.configure(this.settings);
        Controls.init(this);
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

    async loadRom(bytes, { name = '', title = '', store = true, state = null } = {}) {
        if (bytes.length < 0x150) {
            this.toast('El archivo no es un ROM válido', 4000);
            return false;
        }
        const info = this.romInfo(bytes);
        info.name = name || info.title;
        if (title) {
            info.title = title;
        }

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
        Store.setSync('last', info.id);

        if (state) {
            await this.loadState(state, { quiet: true });
        }
        this.redraw();
        this.requestWakeLock();

        if (store) {
            this.storeRom(bytes, info);
        } else {
            this.touchLibrary(info.id);
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

    async storeRom(bytes, info) {
        const list = this.library();
        let entry = list.find((item) => item.id === info.id);
        if (!entry || !(await Store.where('rom:' + info.id))) {
            try {
                const where = await Store.put('rom:' + info.id, await Bytes.pack(bytes));
                entry = { id: info.id, title: info.title, name: info.name, size: info.size, cgb: info.cgb, added: Date.now(), where };
                const updated = this.library().filter((item) => item.id !== info.id);
                updated.unshift(entry);
                this.setLibrary(updated);
                if (this.pendingHomebrewTag) {
                    this.pendingHomebrewTag();
                    this.pendingHomebrewTag = null;
                }
                this.toast(where === 'localStorage' ? 'ROM guardado en el dispositivo' : 'ROM guardado (IndexedDB)');
            } catch (error) {
                console.error(error);
                this.toast('⚠️ No hay espacio para guardar el ROM', 4000);
            }
        }
        this.touchLibrary(info.id);
    },

    touchLibrary(id) {
        const list = this.library();
        const entry = list.find((item) => item.id === id);
        if (entry) {
            entry.played = Date.now();
            list.sort((a, b) => (b.played || b.added || 0) - (a.played || a.added || 0));
            this.setLibrary(list);
        }
    },

    async loadFromLibrary(id, { resume = true } = {}) {
        const packed = await Store.get('rom:' + id);
        if (!packed) {
            this.toast('No se encontró el ROM guardado', 4000);
            this.setLibrary(this.library().filter((item) => item.id !== id));
            return false;
        }
        const bytes = await Bytes.unpack(packed);
        const entry = this.library().find((item) => item.id === id) || {};
        let state = null;
        if (resume && this.settings.autoState && await Store.where(`state:${id}:auto`)) {
            state = 'auto';
        }
        return this.loadRom(bytes, { name: entry.name, title: entry.title, store: false, state });
    },

    async deleteRom(id) {
        await Store.remove('rom:' + id);
        for (const slot of this.stateSlots) {
            await Store.remove(`state:${id}:${slot}`);
            await Store.remove(`thumb:${id}:${slot}`);
            await Store.remove(`statemeta:${id}:${slot}`);
        }
        this.setLibrary(this.library().filter((item) => item.id !== id));
        if (Store.getSync('last') === id && (!this.game || this.game.id === id)) {
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
        if (await this.restartGame()) {
            this.toast('Motor cambiado: ' + label, 3000);
        }
    },

    // Restarts the current game from scratch (keeps the cartridge save).
    async restartGame() {
        const bytes = this.romBytes;
        const name = this.game.name;
        this.persistNow();
        this.running = false;
        return this.loadRom(bytes, { name, store: false });
    },

    async startDemo() {
        try {
            const response = await fetch('static/pocket.gb');
            const bytes = new Uint8Array(await response.arrayBuffer());
            await this.loadRom(bytes, { name: 'Demo', store: false });
            this.closeMenu();
        } catch (error) {
            this.toast('No se pudo cargar la demo', 4000);
        }
    },

    async boot() {
        const last = Store.getSync('last');
        if (last && this.library().some((item) => item.id === last)) {
            try {
                await this.loadFromLibrary(last);
            } catch (error) {
                console.error(error);
            }
        }
        this.openMenu();
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
        library: 'games',
        homebrew: 'games',
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
        const render = {
            main: () => this.renderMain(),
            library: () => this.renderLibrary(),
            homebrew: () => this.renderHomebrew(),
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
    },

    renderMain() {
        const hasGame = !!this.engine;
        const now = document.getElementById('now-playing');
        if (hasGame) {
            now.innerHTML = `<div class="now"><small>Jugando</small><strong></strong><span class="badge">${this.game.cgb ? 'GBC' : 'GB'}</span></div>`;
            now.querySelector('strong').textContent = this.game.title;
        } else {
            now.innerHTML = '<p class="welcome">Emulador de Game Boy y Game Boy Color.<br>Carga un ROM o prueba los juegos homebrew gratuitos.</p>';
        }
    },

    formatSize(bytes) {
        return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
    },

    formatDate(time) {
        return new Date(time).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
    },

    renderLibrary() {
        const container = document.getElementById('library-list');
        const list = this.library();
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = '<p class="empty">Todavía no hay ROMs guardados.</p>';
            return;
        }
        for (const item of list) {
            const card = document.createElement('div');
            card.className = 'card rom' + (this.game && this.game.id === item.id ? ' current' : '');
            card.innerHTML = `
                <div class="rom-info">
                    <strong></strong>
                    <small>${item.cgb ? 'GBC' : 'GB'} · ${this.formatSize(item.size)} · ${item.where === 'indexedDB' ? 'IndexedDB' : 'localStorage'}</small>
                </div>
                <div class="card-actions">
                    <button type="button" class="btn primary small" data-action="play-rom" data-id="">Jugar</button>
                    <button type="button" class="btn ghost small" data-action="delete-rom" data-id="" aria-label="Eliminar">🗑</button>
                </div>`;
            card.querySelector('strong').textContent = item.title;
            card.querySelectorAll('[data-id]').forEach((button) => { button.dataset.id = item.id; });
            container.appendChild(card);
        }
    },

    // --- Free homebrew catalog (bundled in static/homebrew) ---
    async homebrewCatalog() {
        if (!this.catalog) {
            const response = await fetch('static/homebrew/catalog.json');
            if (!response.ok) {
                throw new Error('catalog ' + response.status);
            }
            this.catalog = await response.json();
        }
        return this.catalog;
    },

    async renderHomebrew() {
        const container = document.getElementById('homebrew-list');
        let catalog;
        try {
            catalog = await this.homebrewCatalog();
        } catch (error) {
            container.innerHTML = '<p class="empty">No se pudo cargar el catálogo. Comprueba la conexión.</p>';
            return;
        }
        const saved = new Set(this.library().map((item) => item.homebrew).filter(Boolean));
        container.innerHTML = '';
        for (const game of catalog) {
            const card = document.createElement('div');
            card.className = 'card homebrew';
            card.innerHTML = `
                <div class="thumb"><img alt="" loading="lazy"></div>
                <div class="rom-info">
                    <strong></strong>
                    <small class="meta"></small>
                    <p class="desc"></p>
                    <div class="card-actions">
                        <button type="button" class="btn primary small" data-action="play-homebrew">${saved.has(game.id) ? 'Jugar ✓' : 'Jugar'}</button>
                        <a class="btn ghost small" target="_blank" rel="noopener">Web</a>
                    </div>
                </div>`;
            card.querySelector('img').src = 'static/homebrew/' + game.thumb;
            card.querySelector('strong').textContent = game.title;
            card.querySelector('.meta').textContent = `${game.genre} · ${game.developer} · ${game.license}`;
            card.querySelector('.desc').textContent = game.description;
            card.querySelector('a').href = game.url;
            card.querySelector('button').dataset.id = game.id;
            container.appendChild(card);
        }
    },

    async playHomebrew(id) {
        const game = (await this.homebrewCatalog()).find((item) => item.id === id);
        if (!game) {
            return false;
        }
        // Already saved in the local library: play it from there (works offline).
        const entry = this.library().find((item) => item.homebrew === id);
        if (entry && await Store.where('rom:' + entry.id)) {
            return this.loadFromLibrary(entry.id);
        }
        this.toast('Descargando ' + game.title + '…', 10000);
        let bytes;
        try {
            const response = await fetch('static/homebrew/' + game.file);
            if (!response.ok) {
                throw new Error(String(response.status));
            }
            bytes = new Uint8Array(await response.arrayBuffer());
        } catch (error) {
            this.toast('⚠️ No se pudo descargar el juego', 4000);
            return false;
        }
        if (!(await this.loadRom(bytes, { name: game.file, title: game.title }))) {
            return false;
        }
        // Tag the library entry so the catalog knows it's saved.
        const tag = () => {
            const list = this.library();
            const item = list.find((x) => x.id === this.game.id);
            if (item) {
                item.homebrew = id;
                item.title = game.title;
                this.setLibrary(list);
                return true;
            }
            return false;
        };
        if (!tag()) {
            this.pendingHomebrewTag = tag;
        }
        return true;
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

        document.getElementById('frame-toggle').addEventListener('change', (ev) => {
            this.settings.frame = ev.target.checked;
            this.saveSettings();
            this.applySettings();
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
            case 'demo':
                this.startDemo();
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
            case 'play-homebrew':
                if (await this.playHomebrew(target.dataset.id)) {
                    this.closeMenu();
                }
                break;
            case 'play-rom':
                if (await this.loadFromLibrary(target.dataset.id)) {
                    this.closeMenu();
                }
                break;
            case 'delete-rom': {
                const entry = this.library().find((item) => item.id === target.dataset.id);
                if (entry && confirm(`¿Eliminar «${entry.title}» y sus estados guardados? La partida (.sav) se conserva.`)) {
                    await this.deleteRom(entry.id);
                    this.renderLibrary();
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
    exportSettings() {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        // ':' isn't allowed in file names on Windows, iOS or Android.
        const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const data = { app: 'GBoy-JS', type: 'settings', version: 1, exported: now.toISOString(), settings: this.settings };
        this.download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `GBoy-JS_Settings_${date} ${time}.json`);
        this.toast('Ajustes exportados');
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
        if (!Object.keys(clean).length) {
            this.toast('⚠️ El archivo no contiene ajustes de GBoy-JS', 4000);
            return;
        }
        if (!confirm('¿Reemplazar tus ajustes actuales por los del archivo?')) {
            return;
        }
        const previousEngine = this.settings.engine;
        this.settings = Object.assign({}, this.defaults, clean);
        this.settings.opacity = Number(this.settings.opacity);
        this.saveSettings();
        Input.configure(this.settings);
        this.applyPalette();
        this.applySettings();
        this.redraw();
        this.showPage(this.page);
        this.toast('Ajustes importados');
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
