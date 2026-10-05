// Input handling: customizable touch overlay, keyboard and physical gamepads.
const Input = {
    buttons: ['a', 'b', 'start', 'select', 'up', 'down', 'left', 'right'],
    touch: {},
    keys: {},
    pad: {},
    turboKey: false,
    turboTouch: false,
    turboPad: false,

    pressed(button) {
        return !!(this.touch[button] || this.keys[button] || this.pad[button]);
    },

    get turboHeld() {
        return this.turboKey || this.turboTouch || this.turboPad;
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
        this.pad = {};
        this.turboKey = this.turboTouch = this.turboPad = false;
    },

    keyMap: {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
        KeyX: 'a', KeyK: 'a', KeyZ: 'b', KeyJ: 'b',
        Enter: 'start', ShiftRight: 'select', ShiftLeft: 'select', Backspace: 'select',
    },

    // Standard gamepad mapping (Xbox/PlayStation/Switch Pro/8BitDo).
    pollGamepads() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const state = {};
        let turbo = false;
        for (const pad of pads) {
            if (!pad || !pad.connected) {
                continue;
            }
            const b = (i) => pad.buttons[i] && pad.buttons[i].pressed;
            state.a = state.a || b(1) || b(3);
            state.b = state.b || b(0) || b(2);
            state.select = state.select || b(8);
            state.start = state.start || b(9);
            state.up = state.up || b(12) || pad.axes[1] < -0.5;
            state.down = state.down || b(13) || pad.axes[1] > 0.5;
            state.left = state.left || b(14) || pad.axes[0] < -0.5;
            state.right = state.right || b(15) || pad.axes[0] > 0.5;
            turbo = turbo || b(7) || b(5);
        }
        this.pad = state;
        this.turboPad = turbo;
    },
};

const Controls = {
    // Base sizes in "units" (1 unit ~= 1% of the shortest screen side).
    defs: {
        dpad: { name: 'Cruceta', w: 40, h: 40 },
        a: { name: 'Botón A', w: 18, h: 18, label: 'A' },
        b: { name: 'Botón B', w: 18, h: 18, label: 'B' },
        select: { name: 'Select', w: 18, h: 7, label: 'SELECT' },
        start: { name: 'Start', w: 18, h: 7, label: 'START' },
        turbo: { name: 'Turbo', w: 12, h: 12, label: '▶▶' },
        menu: { name: 'Menú', w: 11, h: 11, label: '☰' },
    },

    defaultLayouts: {
        portrait: {
            dpad: { x: 0.25, y: 0.74 },
            a: { x: 0.86, y: 0.69 },
            b: { x: 0.66, y: 0.77 },
            select: { x: 0.37, y: 0.93 },
            start: { x: 0.63, y: 0.93 },
            turbo: { x: 0.5, y: 0.6 },
            menu: { x: 0.9, y: 0.56 },
        },
        landscape: {
            dpad: { x: 0.12, y: 0.6 },
            a: { x: 0.92, y: 0.5 },
            b: { x: 0.81, y: 0.66 },
            select: { x: 0.12, y: 0.92 },
            start: { x: 0.88, y: 0.92 },
            turbo: { x: 0.93, y: 0.13 },
            menu: { x: 0.07, y: 0.13 },
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
                el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
                    <path class="arm arm-up" d="M35 6 Q35 2 39 2 H61 Q65 2 65 6 V38 H35 Z"/>
                    <path class="arm arm-down" d="M35 62 H65 V94 Q65 98 61 98 H39 Q35 98 35 94 Z"/>
                    <path class="arm arm-left" d="M6 35 H38 V65 H6 Q2 65 2 61 V39 Q2 35 6 35 Z"/>
                    <path class="arm arm-right" d="M62 35 H94 Q98 35 98 39 V61 Q98 65 94 65 H62 Z"/>
                    <rect class="hub" x="34" y="34" width="32" height="32"/>
                    <circle class="hub-dot" cx="50" cy="50" r="7"/>
                    <path class="tri" d="M50 10 L57 20 H43 Z M50 90 L57 80 H43 Z M10 50 L20 43 V57 Z M90 50 L80 43 V57 Z"/>
                </svg>`;
            } else {
                el.innerHTML = `<span>${this.defs[id].label}</span>`;
            }
            this.layer.appendChild(el);
            this.elements[id] = el;
        }

        this.layer.addEventListener('pointerdown', (ev) => this.onDown(ev), { passive: false });
        this.layer.addEventListener('pointermove', (ev) => this.onMove(ev), { passive: false });
        this.layer.addEventListener('pointerup', (ev) => this.onUp(ev), { passive: false });
        this.layer.addEventListener('pointercancel', (ev) => this.onUp(ev), { passive: false });
        this.layer.addEventListener('lostpointercapture', (ev) => this.onUp(ev));
        // iOS: block magnifier / callout / double-tap zoom on the control layer.
        this.layer.addEventListener('touchstart', (ev) => ev.preventDefault(), { passive: false });
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
        const globalOpacity = this.app.settings.opacity;
        this.rects = {};
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
            const cy = Math.min(Math.max(c.y * H, minY), Math.max(minY, maxY));
            const show = c.visible && (id === 'menu' || this.visibleTouch);
            el.style.width = w + 'px';
            el.style.height = h + 'px';
            el.style.transform = `translate(${cx - w / 2}px, ${cy - h / 2}px)`;
            el.style.fontSize = (def.h < 10 ? Math.min(h * 0.45, w * 0.16) : h * 0.4) + 'px';
            el.style.opacity = this.editing ? Math.max(0.35, globalOpacity * c.opacity) * (c.visible ? 1 : 0.5)
                : (id === 'menu' ? Math.max(0.35, globalOpacity * c.opacity) : globalOpacity * c.opacity);
            el.classList.toggle('hidden', !show && !this.editing);
            el.classList.toggle('disabled', !c.visible);
            el.classList.toggle('selected', this.editing && this.selected === id);
            if (show) {
                this.rects[id] = { cx, cy, w, h };
            }
        }
        this.layer.classList.toggle('editing', this.editing);
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
            const round = id === 'a' || id === 'b' || id === 'turbo' || id === 'menu';
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
        try {
            this.layer.setPointerCapture(ev.pointerId);
        } catch (ignored) { }
        if (this.editing) {
            this.editDown(ev, x, y);
            return;
        }
        const control = this.hitControl(x, y, Object.keys(this.rects));
        if (!control) {
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
        this.pointers.set(ev.pointerId, { control, x, y });
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
        if (pointer.control !== 'dpad' && pointer.control !== 'menu' && pointer.control !== 'turbo') {
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
        this.update();
    },

    update() {
        const state = {};
        for (const pointer of this.pointers.values()) {
            if (pointer.control === 'dpad') {
                for (const dir of this.dpadDirections(pointer.x, pointer.y)) {
                    state[dir] = true;
                }
            } else if (Input.buttons.includes(pointer.control) && pointer.inside !== false) {
                state[pointer.control] = true;
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
        this.elements.turbo.classList.toggle('pressed', Input.turboTouch || !!this.app.turboToggled);
    },

    releaseAll() {
        this.pointers.clear();
        Input.touch = {};
        Input.turboTouch = false;
        this.update();
    },

    // --- Haptic feedback ---
    setupHaptics() {
        // iOS Safari has no Vibration API; toggling a native switch input
        // triggers the system haptic engine on iOS 18+.
        if (!navigator.vibrate) {
            const label = document.createElement('label');
            label.className = 'haptic-switch';
            label.innerHTML = '<input type="checkbox" switch tabindex="-1">';
            document.body.appendChild(label);
            this.hapticLabel = label;
        }
    },

    haptic() {
        if (!this.app.settings.vibration) {
            return;
        }
        if (navigator.vibrate) {
            try {
                navigator.vibrate(12);
            } catch (ignored) { }
        } else if (this.hapticLabel) {
            this.hapticLabel.click();
        }
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
