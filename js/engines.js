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
//   width / height             size of the picture (256x224 with a Super Game Boy border)
//   rewindStep()               go back in time a little (false when there is no more history)
//   setCheats(codes)           Game Genie / GameShark codes; returns the ones not understood

const Engines = {
    list: [
        { id: 'sameboy', name: 'SameBoy (preciso, recomendado)' },
        { id: 'legacy', name: 'gemuboi.js (ligero)' },
    ],

    // Super Game Boy borders for games that support them (SameBoy only).
    sgb: true,
    // Seconds of play that can be rewound.
    rewindSeconds: 20,

    create(id) {
        return id === 'legacy' ? new LegacyEngine() : new SameBoyEngine();
    },
};

// Cheat codes, decoded like SameBoy does (Core/cheats.c).
//   GameShark  01VVAAAA          value VV at address AAAA (little endian)
//   Game Genie VVA-AAA(-OOO)     ROM value at address, optionally only when it was OOO
const Cheats = {
    normalize(code) {
        return String(code).toUpperCase().replace(/\s+/g, '');
    },

    parse(code) {
        code = this.normalize(code);
        let m = /^([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})$/.exec(code);
        if (m) {
            return { address: parseInt(m[4] + m[3], 16), value: parseInt(m[2], 16) };
        }
        m = /^([0-9A-F]{3})-?([0-9A-F]{3})(?:-?([0-9A-F]{3}))?$/.exec(code);
        if (m) {
            const digits = m[1] + m[2] + (m[3] || '');
            const value = parseInt(digits.slice(0, 2), 16);
            let address = parseInt(digits.slice(2, 6), 16);
            address = ((address >> 4) | (address << 12)) & 0xffff;
            address ^= 0xf000;
            if (address > 0x7fff) {
                return null;
            }
            const cheat = { address, value };
            if (m[3]) {
                // 7th digit is ignored; the old value is digits 6 and 8.
                let old = parseInt(digits[6] + digits[8], 16);
                old = ((old >> 2) | (old << 6)) & 0xff;
                cheat.old = old ^ 0xba;
            }
            return cheat;
        }
        return null;
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
        this.width = 160;
        this.height = 144;
        this.history = [];
        this.frameCount = 0;
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
        // Rewind history: a snapshot every 6 frames (10 per second).
        if (++this.frameCount % 6 === 0) {
            this.history.push(this.captureState());
            if (this.history.length > Engines.rewindSeconds * 10) {
                this.history.shift();
            }
        }
    }

    // Called on every screen refresh while rewinding: one snapshot every 3 calls
    // (about twice real time).
    rewindStep() {
        if (++this.frameCount % 3 !== 0) {
            return this.history.length > 0;
        }
        const state = this.history.pop();
        if (!state) {
            return false;
        }
        SaveState.restore(this.gb, state);
        this.cycles = 0;
        this.gb.display.present();
        return this.history.length > 0;
    }

    // Cheats patch what the CPU reads, like SameBoy does.
    setCheats(codes) {
        const invalid = [];
        const patches = new Map();
        for (const code of codes) {
            const cheat = Cheats.parse(code);
            if (cheat) {
                patches.set(cheat.address, cheat);
            } else {
                invalid.push(code);
            }
        }
        const gb = this.gb;
        delete gb.readAddress; // back to the prototype's method
        if (patches.size) {
            const read = gb.readAddress;
            gb.readAddress = function readWithCheats(address) {
                const value = read.call(this, address);
                const cheat = patches.get(address);
                return cheat && (cheat.old === undefined || cheat.old === value) ? cheat.value : value;
            };
        }
        return invalid;
    }

    present(force) {
        if (force || this.gb.display.frameReady) {
            this.gb.display.present();
        }
    }

    endFrames(speed) {
        Sound.rate = speed < 1 ? speed : 1;
    }

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
        this.history = [];
    }

    setPalette(settings) {
        Palettes.apply(settings);
    }

    setVolume(volume) {
        Sound.volume = volume;
        this.gb.sound.gainNode.gain.value = volume;
    }

    // Moves the output to a new AudioContext (see App.recreateAudio).
    reconnectAudio() {
        const sound = this.gb.sound;
        try {
            sound.gainNode.disconnect();
        } catch (ignored) { }
        sound.gainNode = Sound.ctx.createGain();
        sound.gainNode.gain.value = Sound.volume;
        sound.gainNode.connect(Sound.output || Sound.ctx.destination);
        sound.nextPush = 0;
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
        // Original Game Boy games made for the Super Game Boy get its border and colors.
        this.isSgb = !this.isCgb && Engines.sgb && rom[0x146] === 0x03 && rom[0x14b] === 0x33;
        // Kept for the whole game: buffers use it even if the AudioContext is
        // later rebuilt with another rate (the browser resamples).
        this.sampleRate = Sound.ctx.sampleRate;
        M._sb_init(this.isCgb ? 1 : this.isSgb ? 2 : 0, this.sampleRate);
        this.withBuffer(rom, (ptr) => M._sb_load_rom(ptr, rom.length));
        M._sb_set_rewind(Engines.rewindSeconds);
        this.width = M._sb_width();
        this.height = M._sb_height();
        this.gain = Sound.ctx.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(Sound.output || Sound.ctx.destination);
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
            const rate = speed < 1 ? speed : 1; // slow motion plays the sound slower and deeper
            if (speed > 1 || ctx.state !== 'running') {
                // Turbo or suspended audio: drop it instead of building up latency.
                this.nextTime = 0;
            } else {
                if (this.nextTime < now + 0.02 || this.nextTime > now + 0.3) {
                    this.nextTime = now + 0.06;
                }
                const buffer = ctx.createBuffer(2, this.queued, this.sampleRate);
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
                source.playbackRate.value = rate;
                source.connect(this.gain);
                source.start(this.nextTime);
                this.nextTime += buffer.duration / rate;
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

    rewindStep() {
        const more = this.M._sb_rewind_frame() !== 0;
        this.frameReady = true;
        return more;
    }

    setCheats(codes) {
        const M = this.M;
        M._sb_cheats_clear();
        const invalid = [];
        for (const code of codes) {
            const text = new TextEncoder().encode(Cheats.normalize(code) + '\0');
            if (!this.withBuffer(text, (ptr) => M._sb_cheat_add(ptr))) {
                invalid.push(code);
            }
        }
        return invalid;
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

    reconnectAudio() {
        try {
            this.gain.disconnect();
        } catch (ignored) { }
        this.gain = Sound.ctx.createGain();
        this.gain.gain.value = this.volume;
        this.gain.connect(Sound.output || Sound.ctx.destination);
        this.nextTime = 0;
        this.queue = [];
        this.queued = 0;
    }

    destroy() {
        try {
            this.gain.disconnect();
        } catch (ignored) { }
        this.queue = [];
        this.queued = 0;
    }
}
