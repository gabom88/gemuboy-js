// Input handling: customizable touch overlay, keyboard and physical gamepads.
const Input = {
    buttons: ['a', 'b', 'start', 'select', 'up', 'down', 'left', 'right'],

    // Every action that can be bound to a key or a gamepad button.
    actions: ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select', 'turbo', 'rewind', 'slow', 'menu', 'save', 'load'],
    actionNames: {
        up: 'Arriba', down: 'Abajo', left: 'Izquierda', right: 'Derecha',
        a: 'A', b: 'B', start: 'Start', select: 'Select',
        turbo: 'Turbo', rewind: 'Rebobinar (mantener)', slow: 'Cámara lenta', menu: 'Menú', save: 'Guardar estado 1', load: 'Cargar estado 1',
    },
    defaultKeys: {
        up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
        a: ['KeyX', 'KeyK'], b: ['KeyZ', 'KeyJ'], start: ['Enter'], select: ['ShiftRight', 'Backspace'],
        turbo: ['Space'], rewind: ['KeyR'], slow: ['KeyQ'], menu: ['Escape'], save: ['F2'], load: ['F4'],
    },
    // Gamepad bindings: 'b<n>' = button n, 'a<n>+' / 'a<n>-' = axis n positive / negative.
    // Defaults follow the "standard" layout (Xbox, PlayStation, Switch Pro, 8BitDo…).
    defaultPad: {
        up: ['b12', 'a1-'], down: ['b13', 'a1+'], left: ['b14', 'a0-'], right: ['b15', 'a0+'],
        a: ['b1', 'b3'], b: ['b0', 'b2'], start: ['b9'], select: ['b8'],
        turbo: ['b7', 'b5'], rewind: [], slow: [], menu: ['b16'], save: ['b4'], load: ['b6'],
    },

    touch: {},
    keys: {},
    pad: {},
    turboTouch: false,
    rewindTouch: false,
    keyBindings: {},
    padBindings: {},
    codeToActions: {},

    configure(settings) {
        this.keyBindings = Object.assign({}, this.defaultKeys, settings.keyMap || {});
        this.padBindings = Object.assign({}, this.defaultPad, settings.padMap || {});
        this.codeToActions = {};
        for (const action of this.actions) {
            for (const code of this.keyBindings[action] || []) {
                (this.codeToActions[code] = this.codeToActions[code] || []).push(action);
            }
        }
    },

    actionsForKey(code) {
        return this.codeToActions[code] || [];
    },

    pressed(button) {
        return !!(this.touch[button] || this.keys[button] || this.pad[button]);
    },

    get turboHeld() {
        return !!(this.turboTouch || this.keys.turbo || this.pad.turbo);
    },

    get rewindHeld() {
        return !!(this.rewindTouch || this.keys.rewind || this.pad.rewind);
    },

    apply(joypad) {
        for (const button of this.buttons) {
            joypad[button] = this.pressed(button);
        }
        // Opposite directions can't be pressed at the same time on real hardware.
        if (joypad.left && joypad.right) {
            joypad.left = joypad.right = false;
        }
        if (joypad.up && joypad.down) {
            joypad.up = joypad.down = false;
        }
    },

    releaseAll() {
        this.touch = {};
        this.keys = {};
        this.turboTouch = false;
        this.rewindTouch = false;
    },

    connectedPads() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        return Array.from(pads).filter((pad) => pad && pad.connected);
    },

    // Raw inputs currently active on a gamepad, as binding strings.
    activeInputs(pad) {
        const active = [];
        pad.buttons.forEach((button, i) => {
            if (button && (button.pressed || button.value > 0.6)) {
                active.push('b' + i);
            }
        });
        pad.axes.forEach((value, i) => {
            if (value > 0.6) {
                active.push('a' + i + '+');
            } else if (value < -0.6) {
                active.push('a' + i + '-');
            }
        });
        return active;
    },

    // Reads all connected gamepads. Returns the actions that were just pressed.
    pollGamepads() {
        const state = {};
        const raw = new Set();
        for (const pad of this.connectedPads()) {
            const active = this.activeInputs(pad);
            active.forEach((input) => raw.add(input));
            for (const action of this.actions) {
                if ((this.padBindings[action] || []).some((binding) => active.includes(binding))) {
                    state[action] = true;
                }
            }
        }
        const previous = this.pad;
        this.pad = state;
        this.padRaw = raw;
        return this.actions.filter((action) => state[action] && !previous[action]);
    },

    keyLabel(code) {
        const names = {
            ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Espacio', Enter: 'Enter',
            Escape: 'Esc', Backspace: 'Retroceso', ShiftLeft: 'Shift izq.', ShiftRight: 'Shift der.',
            ControlLeft: 'Ctrl izq.', ControlRight: 'Ctrl der.', AltLeft: 'Alt izq.', AltRight: 'Alt der.',
            Tab: 'Tab', MetaLeft: 'Cmd izq.', MetaRight: 'Cmd der.',
        };
        if (names[code]) {
            return names[code];
        }
        return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
    },

    padLabel(binding) {
        // Xbox-style names for the "standard" layout (A = ✕ on PlayStation, B = ○, X = □, Y = △).
        const standard = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Select', 'Start', 'L3', 'R3',
            'Cruz ↑', 'Cruz ↓', 'Cruz ←', 'Cruz →', 'Home'];
        const match = /^([ab])(\d+)([+-]?)$/.exec(binding);
        if (!match) {
            return binding;
        }
        const index = Number(match[2]);
        if (match[1] === 'b') {
            const pad = this.connectedPads()[0];
            const isStandard = !pad || pad.mapping === 'standard';
            return (isStandard && standard[index]) || 'Botón ' + index;
        }
        const axes = { 0: ['Stick ←', 'Stick →'], 1: ['Stick ↑', 'Stick ↓'], 2: ['Stick der. ←', 'Stick der. →'], 3: ['Stick der. ↑', 'Stick der. ↓'] };
        if (axes[index]) {
            return axes[index][match[3] === '-' ? 0 : 1];
        }
        return `Eje ${index} ${match[3]}`;
    },
};

const Controls = {
    // Base sizes in "units" (1 unit ~= 1% of the shortest screen side).
    defs: {
        dpad: { name: 'Cruceta', w: 40, h: 40 },
        a: { name: 'Botón A', w: 17, h: 17, label: 'A' },
        b: { name: 'Botón B', w: 17, h: 17, label: 'B' },
        select: { name: 'Select', w: 16, h: 8, label: 'SELECT' },
        start: { name: 'Start', w: 16, h: 8, label: 'START' },
        turbo: { name: 'Turbo', w: 10, h: 10, label: '▶▶' },
        rewind: { name: 'Rebobinar', w: 10, h: 10, label: '◀◀' },
        slow: { name: 'Cámara lenta', w: 10, h: 10, label: '½×' },
        menu: { name: 'Menú', w: 10, h: 10, label: '☰' },
    },

    defaultLayouts: {
        portrait: {
            dpad: { x: 0.24, y: 0.74 },
            a: { x: 0.85, y: 0.7 },
            b: { x: 0.65, y: 0.765 },
            select: { x: 0.37, y: 0.895 },
            start: { x: 0.57, y: 0.895 },
            // Bottom corners: rewind and slow motion on the left, turbo on the right.
            // The menu button sits centered just above the top of the d-pad.
            // These four small buttons are 50 % transparent by default.
            rewind: { x: 0.08, y: 0.955, opacity: 0.5 },
            slow: { x: 0.2, y: 0.955, opacity: 0.5 },
            turbo: { x: 0.92, y: 0.955, opacity: 0.5 },
            menu: { x: 0.5, y: 0.6, aboveDpad: true, opacity: 0.5 },
        },
        landscape: {
            dpad: { x: 0.12, y: 0.6 },
            a: { x: 0.92, y: 0.5 },
            b: { x: 0.81, y: 0.66 },
            select: { x: 0.12, y: 0.92 },
            start: { x: 0.88, y: 0.92 },
            turbo: { x: 0.93, y: 0.13, opacity: 0.5 },
            rewind: { x: 0.84, y: 0.13, opacity: 0.5 },
            slow: { x: 0.16, y: 0.13, opacity: 0.5 },
            menu: { x: 0.07, y: 0.13, opacity: 0.5 },
        },
    },

    pointers: new Map(),
    editing: false,
    selected: null,
    rects: {},

    init(app) {
        this.app = app;
        this.layer = document.getElementById('controls');
        this.elements = {};
        for (const id of Object.keys(this.defs)) {
            const el = document.createElement('div');
            el.className = 'ctrl ctrl-' + id;
            el.dataset.id = id;
            if (id === 'dpad') {
                el.innerHTML = DpadModelB.markup();
                el.dataset.st = 'rest';
            } else if (id === 'a' || id === 'b') {
                el.innerHTML = `<div class="face"></div><em>${this.defs[id].label}</em>`;
            } else if (id === 'start' || id === 'select') {
                el.innerHTML = `<div class="rot"><div class="slot"></div><div class="pill"></div><em>${this.defs[id].label}</em></div>`;
            } else {
                el.innerHTML = `<div class="face"><span>${this.defs[id].label}</span></div>`;
            }
            this.layer.appendChild(el);
            this.elements[id] = el;
        }

        // Slanted oval recess that holds A and B, like on the original Game Boy.
        this.abWell = document.createElement('div');
        this.abWell.className = 'ab-well';
        this.layer.prepend(this.abWell);

        this.layer.addEventListener('pointerdown', (ev) => this.onDown(ev), { passive: false });
        this.layer.addEventListener('pointermove', (ev) => this.onMove(ev), { passive: false });
        this.layer.addEventListener('pointerup', (ev) => this.onUp(ev), { passive: false });
        this.layer.addEventListener('pointercancel', (ev) => this.onUp(ev), { passive: false });
        this.layer.addEventListener('lostpointercapture', (ev) => this.onUp(ev));
        // iOS: block magnifier / callout / double-tap zoom on the control layer.
        this.layer.addEventListener('touchstart', (ev) => {
            // iOS haptics need the tap to become a real click on the control's
            // label (see setupHaptics), so that touch is not cancelled.
            if (!(this.hapticsActive && ev.target.closest && ev.target.closest('[data-haptic]'))) {
                ev.preventDefault();
            }
        }, { passive: false });
        this.layer.addEventListener('touchmove', (ev) => ev.preventDefault(), { passive: false });
        this.layer.addEventListener('contextmenu', (ev) => ev.preventDefault());

        this.setupHaptics();
    },

    get orientation() {
        return this.app.orientation;
    },

    layoutFor(orientation) {
        const settings = this.app.settings;
        const saved = (settings.layouts && settings.layouts[orientation]) || {};
        const layout = {};
        for (const id of Object.keys(this.defs)) {
            layout[id] = Object.assign({ size: 1, opacity: 1, visible: true }, this.defaultLayouts[orientation][id], saved[id]);
            if (id === 'menu') {
                layout[id].visible = true;
            }
        }
        return layout;
    },

    get layout() {
        return this.layoutFor(this.orientation);
    },

    saveControl(id, values) {
        const settings = this.app.settings;
        settings.layouts = settings.layouts || {};
        const layouts = settings.layouts;
        layouts[this.orientation] = layouts[this.orientation] || {};
        if ('x' in values || 'y' in values) {
            values = Object.assign({ aboveDpad: false }, values); // placed by hand now
        }
        layouts[this.orientation][id] = Object.assign({}, this.layout[id], values);
        this.app.saveSettings();
    },

    resetLayout() {
        if (this.app.settings.layouts) {
            delete this.app.settings.layouts[this.orientation];
        }
        this.app.saveSettings();
        this.render();
    },

    get visibleTouch() {
        const mode = this.app.settings.touchControls;
        if (mode === 'always') {
            return true;
        }
        if (mode === 'never') {
            return false;
        }
        return this.app.isTouch;
    },

    render() {
        const W = this.layer.clientWidth;
        const H = this.layer.clientHeight;
        if (!W || !H) {
            return;
        }
        const unit = Math.min(Math.min(W, H) / 100, 5.2);
        const inset = this.app.safeInsets();
        const layout = this.layout;
        const globalOpacity = this.app.settings.opacity / 100;
        this.layer.classList.toggle('haptics', this.hapticsActive);
        this.rects = {};
        let dpadTop = null;
        for (const id of Object.keys(this.defs)) {
            const def = this.defs[id];
            const c = layout[id];
            const el = this.elements[id];
            const w = def.w * unit * c.size;
            const h = def.h * unit * c.size;
            const minX = inset.left + w / 2;
            const maxX = W - inset.right - w / 2;
            const minY = inset.top + h / 2;
            const maxY = H - inset.bottom - h / 2;
            const cx = Math.min(Math.max(c.x * W, minX), Math.max(minX, maxX));
            // aboveDpad: right above the top of the d-pad, whatever the screen size.
            const y = c.aboveDpad && dpadTop !== null ? dpadTop - h / 2 - unit * 1.5 : c.y * H;
            const cy = Math.min(Math.max(y, minY), Math.max(minY, maxY));
            if (id === 'dpad') {
                dpadTop = cy - h / 2;
            }
            const show = c.visible && (id === 'menu' || this.visibleTouch);
            el.style.width = w + 'px';
            el.style.height = h + 'px';
            el.style.transform = `translate(${cx - w / 2}px, ${cy - h / 2}px)`;
            el.style.fontSize = (id === 'start' || id === 'select' ? h * 0.36 : h * 0.4) + 'px';
            el.style.opacity = this.editing ? Math.max(0.35, globalOpacity * c.opacity) * (c.visible ? 1 : 0.5)
                : (id === 'menu' ? Math.max(0.35, globalOpacity * c.opacity) : globalOpacity * c.opacity);
            el.classList.toggle('hidden', !show && !this.editing);
            el.classList.toggle('disabled', !c.visible);
            el.classList.toggle('selected', this.editing && this.selected === id);
            if (show) {
                this.rects[id] = { cx, cy, w, h };
            }
        }
        this.renderAbWell(layout, globalOpacity);
        this.layer.classList.toggle('editing', this.editing);
    },

    // The arm paths are stroked 6 wide with round joins, i.e. a rect grown by 3
    // with 3-unit rounded corners; the shade covers that same footprint in one shape.
    shadeRect(d, dir) {
        const [x1, y1, x2, y2] = d.match(/[\d.]+/g).map(Number).slice(0, 4); // M x1 y1 H x2 V y2
        const left = Math.min(x1, x2) - 3;
        const top = Math.min(y1, y2) - 3;
        return `<rect class="shade" x="${left}" y="${top}" width="${Math.abs(x2 - x1) + 6}" height="${Math.abs(y2 - y1) + 6}" rx="3" fill="url(#sink-${dir})"/>`;
    },

    renderAbWell(layout, globalOpacity) {
        const a = this.elements.a;
        const b = this.elements.b;
        const visible = !a.classList.contains('hidden') && !b.classList.contains('hidden') && layout.a.visible && layout.b.visible;
        this.abWell.hidden = !visible;
        if (!visible) {
            return;
        }
        const ra = this.rectOf(a);
        const rb = this.rectOf(b);
        const dx = ra.cx - rb.cx;
        const dy = ra.cy - rb.cy;
        const distance = Math.hypot(dx, dy);
        const size = Math.max(ra.w, rb.w);
        // Only draw the oval while the buttons sit reasonably close together.
        if (distance > size * 2.6) {
            this.abWell.hidden = true;
            return;
        }
        const thickness = size * 1.28;
        const length = distance + thickness;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        Object.assign(this.abWell.style, {
            width: length + 'px',
            height: thickness + 'px',
            transform: `translate(${(ra.cx + rb.cx) / 2 - length / 2}px, ${(ra.cy + rb.cy) / 2 - thickness / 2}px) rotate(${angle}deg)`,
            opacity: Math.min(1, globalOpacity * Math.max(layout.a.opacity, layout.b.opacity)),
        });
    },

    rectOf(el) {
        const w = parseFloat(el.style.width);
        const h = parseFloat(el.style.height);
        const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(el.style.transform);
        const x = match ? parseFloat(match[1]) : 0;
        const y = match ? parseFloat(match[2]) : 0;
        return { cx: x + w / 2, cy: y + h / 2, w, h };
    },

    // --- Hit testing ---
    hitControl(x, y, candidates) {
        let best = null;
        let bestDistance = Infinity;
        for (const id of candidates) {
            const r = this.rects[id];
            if (!r) {
                continue;
            }
            // Generous touch area: 25% bigger than the drawn control.
            const pad = id === 'dpad' ? 1.2 : 1.3;
            const dx = Math.abs(x - r.cx) / (r.w / 2 * pad);
            const dy = Math.abs(y - r.cy) / (r.h / 2 * pad);
            const round = ['a', 'b', 'turbo', 'rewind', 'slow', 'menu'].includes(id);
            const distance = round ? Math.hypot(dx, dy) : Math.max(dx, dy);
            if (distance <= 1 && distance < bestDistance) {
                best = id;
                bestDistance = distance;
            }
        }
        return best;
    },

    dpadDirections(x, y) {
        const r = this.rects.dpad;
        const dx = x - r.cx;
        const dy = y - r.cy;
        const dead = Math.min(r.w, r.h) * 0.1;
        if (Math.hypot(dx, dy) < dead) {
            return [];
        }
        // 8 sectors; diagonals span 40° so cardinal directions are easier to hit.
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const dirs = [];
        const within = (center, span) => {
            let d = Math.abs(angle - center) % 360;
            if (d > 180) {
                d = 360 - d;
            }
            return d <= span;
        };
        if (within(0, 70)) dirs.push('right');
        if (within(180, 70)) dirs.push('left');
        if (within(90, 70)) dirs.push('down');
        if (within(-90, 70)) dirs.push('up');
        return dirs;
    },

    point(ev) {
        const rect = this.layer.getBoundingClientRect();
        return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    },

    onDown(ev) {
        ev.preventDefault();
        this.app.unlockAudio();
        const { x, y } = this.point(ev);
        // Touches are already captured by the element they started on; capturing
        // them on the layer would send the click away from the haptic label.
        if (!(this.hapticsActive && ev.pointerType === 'touch')) {
            try {
                this.layer.setPointerCapture(ev.pointerId);
            } catch (ignored) { }
        }
        if (this.editing) {
            this.editDown(ev, x, y);
            return;
        }
        const control = this.hitControl(x, y, Object.keys(this.rects));
        if (!control) {
            // A tap on the game screen restarts the sound (on release: iOS only
            // lets audio start on touchend / pointerup).
            const screen = this.app.el.screen.getBoundingClientRect();
            const layer = this.layer.getBoundingClientRect();
            const sx = x + layer.left;
            const sy = y + layer.top;
            if (sx >= screen.left && sx <= screen.right && sy >= screen.top && sy <= screen.bottom) {
                this.pointers.set(ev.pointerId, { control: 'screen', x, y });
            }
            return;
        }
        if (control === 'menu') {
            this.pointers.set(ev.pointerId, { control: 'menu', x, y });
            this.elements.menu.classList.add('pressed');
            return;
        }
        if (control === 'turbo') {
            this.pointers.set(ev.pointerId, { control: 'turbo', x, y });
            if (this.app.settings.turboMode === 'toggle') {
                this.app.turboToggled = !this.app.turboToggled;
            } else {
                Input.turboTouch = true;
            }
            this.update();
            this.haptic();
            return;
        }
        if (control === 'rewind') {
            this.pointers.set(ev.pointerId, { control, x, y });
            Input.rewindTouch = true;
            this.update();
            this.haptic();
            return;
        }
        if (control === 'slow') {
            this.pointers.set(ev.pointerId, { control, x, y });
            this.app.toggleSlowMotion();
            this.update();
            this.haptic();
            return;
        }
        this.pointers.set(ev.pointerId, { control, origin: control, x, y });
        this.update();
    },

    onMove(ev) {
        const pointer = this.pointers.get(ev.pointerId);
        if (!pointer && !this.editing) {
            return;
        }
        ev.preventDefault();
        const { x, y } = this.point(ev);
        if (this.editing) {
            this.editMove(ev, x, y);
            return;
        }
        pointer.x = x;
        pointer.y = y;
        if (pointer.control === 'screen') {
            return;
        }
        if (!['dpad', 'menu', 'turbo', 'rewind', 'slow'].includes(pointer.control)) {
            // Allow sliding a finger between face buttons.
            const control = this.hitControl(x, y, ['a', 'b', 'start', 'select']);
            pointer.control = control || pointer.control;
            pointer.inside = !!control;
        }
        this.update();
    },

    onUp(ev) {
        if (this.editing) {
            this.editUp(ev);
            return;
        }
        const pointer = this.pointers.get(ev.pointerId);
        if (!pointer) {
            return;
        }
        this.pointers.delete(ev.pointerId);
        if (pointer.control === 'screen') {
            if (ev.type === 'pointerup' && this.app.engine) {
                this.app.hardResetAudio({ notify: true, manual: true });
            }
            return;
        }
        if (pointer.control === 'menu') {
            this.elements.menu.classList.remove('pressed');
            if (ev.type === 'pointerup') {
                this.app.openMenu();
            }
            return;
        }
        if (pointer.control === 'turbo' && this.app.settings.turboMode !== 'toggle') {
            Input.turboTouch = [...this.pointers.values()].some((p) => p.control === 'turbo');
        }
        if (pointer.control === 'rewind') {
            Input.rewindTouch = [...this.pointers.values()].some((p) => p.control === 'rewind');
        }
        this.update();
    },

    update() {
        const state = {};
        for (const pointer of this.pointers.values()) {
            if (pointer.control === 'dpad') {
                for (const dir of this.dpadDirections(pointer.x, pointer.y)) {
                    state[dir] = true;
                }
            } else if (Input.buttons.includes(pointer.control)) {
                if (pointer.inside !== false) {
                    state[pointer.control] = true;
                }
                // Sliding from B to A (or A to B) keeps the first button pressed
                // too, until the finger is lifted.
                if (pointer.origin === 'a' || pointer.origin === 'b') {
                    state[pointer.origin] = true;
                }
            }
        }
        const newlyPressed = Input.buttons.some((b) => state[b] && !Input.touch[b]);
        Input.touch = state;
        if (newlyPressed) {
            this.haptic();
        }
        // Visual feedback.
        for (const id of ['a', 'b', 'start', 'select']) {
            this.elements[id].classList.toggle('pressed', !!state[id]);
        }
        const dpad = this.elements.dpad;
        for (const dir of ['up', 'down', 'left', 'right']) {
            dpad.classList.toggle('p-' + dir, !!state[dir]);
        }
        dpad.dataset.st = DpadModelB.key(state);
        this.elements.turbo.classList.toggle('pressed', Input.turboTouch || !!this.app.turboToggled);
        this.elements.rewind.classList.toggle('pressed', Input.rewindTouch);
        this.elements.slow.classList.toggle('pressed', !!this.app.slowMotion);
    },

    releaseAll() {
        this.pointers.clear();
        Input.touch = {};
        Input.turboTouch = false;
        Input.rewindTouch = false;
        this.update();
    },

    // --- Haptic feedback ---
    // Android (Chrome, Edge, Samsung Internet): Vibration API, see haptic().
    // iOS Safari has no Vibration API, but toggling a native switch
    // (<input type="checkbox" switch>, Safari 17.4+) plays the system haptic on
    // iOS 18+. It only works with a real tap, not with a click made by code, so
    // each control gets a transparent label linked to a hidden switch: the
    // player's tap on the label toggles the switch and the iPhone vibrates.
    // Technique from https://github.com/tijnjh/ios-haptics (MIT).
    setupHaptics() {
        this.iosHaptics = !navigator.vibrate && this.app.isIOS;
        if (!this.iosHaptics) {
            return;
        }
        for (const el of Object.values(this.elements)) {
            const label = document.createElement('label');
            label.dataset.haptic = '';
            label.setAttribute('aria-hidden', 'true');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.setAttribute('switch', '');
            input.tabIndex = -1;
            // The switch never sits under the finger; its forwarded click stays here.
            input.addEventListener('click', (ev) => ev.stopPropagation());
            label.appendChild(input);
            el.appendChild(label);
        }
    },

    // The iOS labels only catch taps while vibration is on and not editing.
    get hapticsActive() {
        return !!(this.iosHaptics && this.app.settings.vibration && !this.editing);
    },

    haptic() {
        if (!this.app.settings.vibration || !navigator.vibrate) {
            return; // iOS: the labels from setupHaptics do it
        }
        try {
            navigator.vibrate(25); // shorter pulses are too weak on many motors
        } catch (ignored) { }
    },

    // --- Layout editor ---
    startEditing() {
        this.releaseAll();
        this.editing = true;
        this.selected = this.selected || 'dpad';
        this.render();
    },

    stopEditing() {
        this.editing = false;
        this.selected = null;
        this.editPointers = null;
        this.render();
    },

    editDown(ev, x, y) {
        this.editPointers = this.editPointers || new Map();
        this.editPointers.set(ev.pointerId, { x, y });
        if (this.editPointers.size === 1) {
            const saveRects = this.rects;
            this.rects = this.editRects();
            const hit = this.hitControl(x, y, Object.keys(this.defs));
            this.rects = saveRects;
            if (hit) {
                this.selected = hit;
                const c = this.layout[hit];
                this.drag = { id: hit, startX: x, startY: y, origX: c.x, origY: c.y };
                this.app.updateEditor();
                this.render();
            } else {
                this.drag = null;
            }
        } else if (this.editPointers.size === 2 && this.selected) {
            const [p1, p2] = [...this.editPointers.values()];
            this.pinch = { distance: Math.hypot(p1.x - p2.x, p1.y - p2.y), size: this.layout[this.selected].size };
            this.drag = null;
        }
    },

    // Rects of all controls (including hidden ones) so they can be edited.
    editRects() {
        const rects = {};
        for (const id of Object.keys(this.defs)) {
            const el = this.elements[id];
            const box = el.getBoundingClientRect();
            const layer = this.layer.getBoundingClientRect();
            rects[id] = { cx: box.left - layer.left + box.width / 2, cy: box.top - layer.top + box.height / 2, w: box.width, h: box.height };
        }
        return rects;
    },

    editMove(ev, x, y) {
        if (!this.editPointers || !this.editPointers.has(ev.pointerId)) {
            return;
        }
        this.editPointers.set(ev.pointerId, { x, y });
        const W = this.layer.clientWidth;
        const H = this.layer.clientHeight;
        if (this.pinch && this.editPointers.size >= 2) {
            const [p1, p2] = [...this.editPointers.values()];
            const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const size = Math.min(2.5, Math.max(0.4, this.pinch.size * distance / this.pinch.distance));
            this.saveControl(this.selected, { size: Math.round(size * 100) / 100 });
            this.app.updateEditor();
            this.render();
        } else if (this.drag) {
            const nx = Math.min(1, Math.max(0, this.drag.origX + (x - this.drag.startX) / W));
            const ny = Math.min(1, Math.max(0, this.drag.origY + (y - this.drag.startY) / H));
            this.saveControl(this.drag.id, { x: nx, y: ny });
            this.render();
        }
    },

    editUp(ev) {
        if (!this.editPointers) {
            return;
        }
        this.editPointers.delete(ev.pointerId);
        if (this.editPointers.size < 2) {
            this.pinch = null;
        }
        if (this.editPointers.size === 0) {
            this.drag = null;
        }
    },
};
