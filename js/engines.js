// Emulation engines. The app talks to an engine through this common interface:
//   load(rom, info)            start a game (async)
//   runFrame()                 emulate one frame (uses Input for the buttons)
//   present()                  draw the latest frame on the canvas
//   endFrames(speed)           called once per animation frame (audio, rumble)
//   hasSaveData()              does the cartridge keep a battery save?
//   batteryDirty() / markClean()
//   getBattery() / getRtc()    bytes (and RTC object, legacy only) to persist
//   setBattery(bytes, rtc)
//   captureState() / restoreState(state)
//   setPalette(settings) / setVolume(volume) / destroy()

const Engines = {
    list: [
        { id: 'sameboy', name: 'SameBoy (preciso, recomendado)' },
        { id: 'legacy', name: 'gemuboi.js (ligero)' },
    ],

    create(id) {
        return id === 'legacy' ? new LegacyEngine() : new SameBoyEngine();
    },
};

// FNV-1a hash, used to notice when a battery save changes.
function hashBytes(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
}

// ---------------------------------------------------------------- legacy
// The original pure-JavaScript core (gemuboi.js), unchanged.
class LegacyEngine {
    constructor() {
        this.id = 'legacy';
    }

    async load(rom) {
        this.gb = new GameBoy();
        this.gb.cartridge.load(rom);
        this.cycles = 0;
        // Size the cartridge declares (the core may allocate more internally), so the
        // exported save matches standard .sav files and SameBoy's battery saves.
        const declared = { 0x01: 0x800, 0x02: 0x2000, 0x03: 0x8000, 0x04: 0x20000, 0x05: 0x10000 }[rom[0x149]];
        const ram = this.gb.cartridge.ram;
        this.ramSize = ram ? Math.min(ram.length, declared || ram.length) : 0;
    }

    get cgb() {
        return this.gb.cgb;
    }

    runFrame() {
        const gb = this.gb;
        Input.apply(gb.joypad);
        if (gb.cartridge.hasRTC) {
            gb.cartridge.rtc.updateTime();
        }
        while (this.cycles < Display.cpuCyclesPerFrame) {
            this.cycles += gb.cycle();
        }
        this.cycles -= Display.cpuCyclesPerFrame;
    }

    present(force) {
        if (force || this.gb.display.frameReady) {
            this.gb.display.present();
        }
    }

    endFrames() { }

    hasSaveData() {
        return !!this.gb.cartridge.hasSaveData;
    }

    batteryDirty() {
        return !!this.gb.cartridge.ramDirty;
    }

    markClean() {
        this.gb.cartridge.ramDirty = false;
    }

    getBattery() {
        const cartridge = this.gb.cartridge;
        return cartridge.hasRAM && cartridge.ram ? cartridge.ram.subarray(0, this.ramSize) : null;
    }

    getRtc() {
        const cartridge = this.gb.cartridge;
        return cartridge.hasRTC && cartridge.rtc ? cartridge.rtc : null;
    }

    setBattery(bytes, rtc) {
        const cartridge = this.gb.cartridge;
        if (bytes && cartridge.ram) {
            cartridge.ram.set(bytes.subarray(0, cartridge.ram.length));
        }
        if (rtc && cartridge.rtc) {
            Object.assign(cartridge.rtc, rtc);
        }
    }

    exportSav() {
        const cartridge = this.gb.cartridge;
        return cartridge.hasRAM && cartridge.hasBattery && cartridge.ram ? cartridge.ram.subarray(0, this.ramSize) : null;
    }

    captureState() {
        return Object.assign({ engine: 'legacy' }, SaveState.capture(this.gb));
    }

    restoreState(state) {
        if (state.engine && state.engine !== 'legacy') {
            throw new Error('engine-mismatch');
        }
        SaveState.restore(this.gb, state);
        this.cycles = 0;
    }

    setPalette(settings) {
        Palettes.apply(settings);
    }

    setVolume(volume) {
        Sound.volume = volume;
        this.gb.sound.gainNode.gain.value = volume;
    }

    destroy() {
        try {
            this.gb.sound.gainNode.disconnect();
        } catch (ignored) { }
        this.gb = null;
    }
}

// --------------------------------------------------------------- SameBoy
// SameBoy (https://github.com/LIJI32/SameBoy) compiled to WebAssembly.
class SameBoyEngine {
    constructor() {
        this.id = 'sameboy';
        this.queue = [];
        this.queued = 0;
        this.nextTime = 0;
        this.lastRumble = 0;
        this.volume = 0.25;
    }

    // Loads the WebAssembly module once and shares it between games.
    static module() {
        if (!SameBoyEngine.modulePromise) {
            SameBoyEngine.modulePromise = new Promise((resolve, reject) => {
                const ready = () => createSameBoy({ locateFile: (file) => 'js/sameboy/' + file }).then(resolve, reject);
                if (window.createSameBoy) {
                    ready();
                    return;
                }
                const script = document.createElement('script');
                script.src = 'js/sameboy/sameboy.js';
                script.onload = ready;
                script.onerror = () => reject(new Error('No se pudo cargar SameBoy'));
                document.head.appendChild(script);
            });
            SameBoyEngine.modulePromise.catch(() => { SameBoyEngine.modulePromise = null; });
        }
        return SameBoyEngine.modulePromise;
    }

    async load(rom) {
        const M = await SameBoyEngine.module();
        this.M = M;
        // Color games run on a Game Boy Color, original games on a Game Boy (DMG),
        // so the custom palettes work like on the classic console.
        this.isCgb = (rom[0x143] & 0x80) !== 0;
        M._sb_init(this.isCgb ? 1 : 0, Sound.ctx.sampleRate);
        this.withBuffer(rom, (ptr) => M._sb_load_rom(ptr, rom.length));
        this.gain = Sound.ctx.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(Sound.ctx.destination);
        this.imageCtx = Display.ctx;
        this.batterySize = M._sb_battery_size();
        this.lastHash = null;
    }

    get cgb() {
        return this.isCgb;
    }

    withBuffer(bytes, fn) {
        const ptr = this.M._malloc(Math.max(1, bytes.length));
        this.M.HEAPU8.set(bytes, ptr);
        try {
            return fn(ptr);
        } finally {
            this.M._free(ptr);
        }
    }

    runFrame() {
        const M = this.M;
        let mask = 0;
        // GB_key_t order: right, left, up, down, A, B, select, start.
        const keys = { right: 1, left: 2, up: 4, down: 8, a: 16, b: 32, select: 64, start: 128 };
        const joypad = {};
        Input.apply(joypad);
        for (const key in keys) {
            if (joypad[key]) {
                mask |= keys[key];
            }
        }
        M._sb_set_keys(mask);
        M._sb_run_frame();
        // Collect this frame's audio.
        const length = M._sb_audio_len();
        if (length) {
            const samples = new Float32Array(M.HEAPF32.buffer, M._sb_audio(), length * 2).slice();
            M._sb_audio_clear();
            this.queue.push(samples);
            this.queued += length;
        }
        this.frameReady = true;
    }

    present(force) {
        if (!force && !this.frameReady) {
            return;
        }
        const M = this.M;
        const w = M._sb_width();
        const h = M._sb_height();
        const data = new Uint8ClampedArray(M.HEAPU8.buffer, M._sb_pixels(), w * h * 4);
        this.imageCtx.putImageData(new ImageData(data.slice(), w, h), 0, 0);
        this.frameReady = false;
    }

    // Plays the audio produced since the last call and handles cartridge rumble.
    endFrames(speed) {
        const ctx = Sound.ctx;
        if (this.queued) {
            const now = ctx.currentTime;
            if (speed > 1 || ctx.state !== 'running') {
                // Turbo or suspended audio: drop it instead of building up latency.
                this.nextTime = 0;
            } else {
                if (this.nextTime < now + 0.02 || this.nextTime > now + 0.3) {
                    this.nextTime = now + 0.06;
                }
                const buffer = ctx.createBuffer(2, this.queued, ctx.sampleRate);
                const left = buffer.getChannelData(0);
                const right = buffer.getChannelData(1);
                let offset = 0;
                for (const chunk of this.queue) {
                    for (let i = 0; i < chunk.length / 2; i++) {
                        left[offset + i] = chunk[i * 2];
                        right[offset + i] = chunk[i * 2 + 1];
                    }
                    offset += chunk.length / 2;
                }
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(this.gain);
                source.start(this.nextTime);
                this.nextTime += buffer.duration;
            }
            this.queue = [];
            this.queued = 0;
        }
        const rumble = this.M._sb_rumble();
        if (rumble > 0.25 && this.onRumble) {
            const t = performance.now();
            if (t - this.lastRumble > 100) {
                this.lastRumble = t;
                this.onRumble(rumble);
            }
        }
    }

    hasSaveData() {
        return this.batterySize > 0;
    }

    getBattery() {
        if (!this.batterySize) {
            return null;
        }
        const M = this.M;
        const ptr = M._malloc(this.batterySize);
        try {
            const written = M._sb_save_battery(ptr, this.batterySize);
            return M.HEAPU8.slice(ptr, ptr + (written > 0 ? written : this.batterySize));
        } finally {
            M._free(ptr);
        }
    }

    getRtc() {
        return null; // included in the battery save
    }

    batteryDirty() {
        const bytes = this.getBattery();
        if (!bytes) {
            return false;
        }
        const hash = hashBytes(bytes);
        if (this.lastHash === null) {
            this.lastHash = hash;
            return false;
        }
        return hash !== this.lastHash;
    }

    markClean() {
        const bytes = this.getBattery();
        this.lastHash = bytes ? hashBytes(bytes) : null;
    }

    setBattery(bytes) {
        if (bytes && bytes.length && this.batterySize) {
            this.withBuffer(bytes, (ptr) => this.M._sb_load_battery(ptr, bytes.length));
            this.lastHash = hashBytes(this.getBattery());
        }
    }

    exportSav() {
        return this.getBattery();
    }

    captureState() {
        const M = this.M;
        const size = M._sb_state_size();
        const ptr = M._malloc(size);
        try {
            M._sb_save_state(ptr);
            return { engine: 'sameboy', data: Bytes.toBase64(M.HEAPU8.subarray(ptr, ptr + size)) };
        } finally {
            M._free(ptr);
        }
    }

    restoreState(state) {
        if (state.engine !== 'sameboy') {
            throw new Error('engine-mismatch');
        }
        const bytes = Bytes.fromBase64(state.data);
        const result = this.withBuffer(bytes, (ptr) => this.M._sb_load_state(ptr, bytes.length));
        if (result !== 0) {
            throw new Error('Estado no válido');
        }
        this.queue = [];
        this.queued = 0;
    }

    setPalette(settings) {
        Palettes.apply(settings); // keeps the other engine in sync
        if (!this.M || this.isCgb) {
            return;
        }
        // SameBoy wants the darkest shade first.
        const shades = Palettes.resolve(settings).bg.slice().reverse();
        const rgb = new Uint8Array(12);
        shades.forEach((hex, i) => {
            const value = parseInt(hex.slice(1), 16);
            rgb[i * 3] = (value >> 16) & 0xff;
            rgb[i * 3 + 1] = (value >> 8) & 0xff;
            rgb[i * 3 + 2] = value & 0xff;
        });
        this.withBuffer(rgb, (ptr) => this.M._sb_set_palette(ptr));
    }

    setVolume(volume) {
        this.volume = volume;
        if (this.gain) {
            this.gain.gain.value = volume;
        }
    }

    destroy() {
        try {
            this.gain.disconnect();
        } catch (ignored) { }
        this.queue = [];
        this.queued = 0;
    }
}
