// Save states: snapshot of the full emulator state (CPU, memory, video,
// audio, timers and cartridge) that can be restored at any moment.
const SaveState = {
    version: 1,

    // Properties that are references, host objects or derived data.
    skip: {
        GameBoy: ['display', 'timer', 'joypad', 'cartridge', 'sound', 'serial'],
        Display: ['gb', 'imageData', 'pixels', 'frameReady'],
        Timer: ['gb'],
        Joypad: ['gb', 'start', 'select', 'a', 'b', 'up', 'down', 'left', 'right'],
        Serial: ['gb'],
        Cartridge: ['gb', 'rom', 'rtc'],
        Sound: ['gb', 'gainNode', 'buffer', 'bufferLeft', 'bufferRight', 'nextPush'],
        RTC: [],
    },

    encodeValue(value) {
        if (ArrayBuffer.isView(value)) {
            return { $t: value.constructor.name, d: Bytes.toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.encodeValue(item));
        }
        return value;
    },

    decodeValue(value) {
        if (value && typeof value === 'object' && !Array.isArray(value) && value.$t) {
            const bytes = Bytes.fromBase64(value.d);
            const Type = window[value.$t] || Uint8Array;
            return new Type(bytes.buffer, 0, bytes.byteLength / (Type.BYTES_PER_ELEMENT || 1));
        }
        if (Array.isArray(value)) {
            return value.map((item) => this.decodeValue(item));
        }
        return value;
    },

    encodeObject(object, type) {
        const skip = this.skip[type];
        const out = {};
        for (const key of Object.keys(object)) {
            const value = object[key];
            if (skip.includes(key) || value === undefined || typeof value === 'function') {
                continue;
            }
            if (value && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value)) {
                continue;
            }
            out[key] = this.encodeValue(value);
        }
        return out;
    },

    restoreObject(object, data) {
        for (const key of Object.keys(data)) {
            object[key] = this.decodeValue(data[key]);
        }
    },

    capture(gb) {
        const cartridge = gb.cartridge;
        return {
            v: this.version,
            cgb: gb.cgb,
            gb: this.encodeObject(gb, 'GameBoy'),
            display: this.encodeObject(gb.display, 'Display'),
            timer: this.encodeObject(gb.timer, 'Timer'),
            joypad: this.encodeObject(gb.joypad, 'Joypad'),
            serial: this.encodeObject(gb.serial, 'Serial'),
            sound: this.encodeObject(gb.sound, 'Sound'),
            cartridge: this.encodeObject(cartridge, 'Cartridge'),
            rtc: cartridge.rtc ? this.encodeObject(cartridge.rtc, 'RTC') : null,
        };
    },

    // Restores a state into a GameBoy that already has the same ROM loaded.
    restore(gb, state) {
        if (!state || state.v !== this.version) {
            throw 'Estado incompatible';
        }
        this.restoreObject(gb, state.gb);
        this.restoreObject(gb.display, state.display);
        this.restoreObject(gb.timer, state.timer);
        this.restoreObject(gb.joypad, state.joypad);
        this.restoreObject(gb.serial, state.serial);
        this.restoreObject(gb.sound, state.sound);
        this.restoreObject(gb.cartridge, state.cartridge);
        if (state.rtc && gb.cartridge.rtc) {
            this.restoreObject(gb.cartridge.rtc, state.rtc);
        }
        gb.sound.nextPush = 0;
        gb.cartridge.ramDirty = true;
    },
};
