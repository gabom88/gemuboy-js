// Persistent storage helpers.
// Everything is stored in localStorage. Values that do not fit in the
// localStorage quota (large ROMs, save states) transparently fall back to
// IndexedDB so the app keeps working on browsers with small quotas (Safari).
const Store = {
    prefix: 'gemuboy:',

    key(name) {
        return this.prefix + name;
    },

    getJSON(name, fallback) {
        try {
            const value = localStorage.getItem(this.key(name));
            return value === null ? fallback : JSON.parse(value);
        } catch (error) {
            return fallback;
        }
    },

    setJSON(name, value) {
        try {
            localStorage.setItem(this.key(name), JSON.stringify(value));
            return true;
        } catch (error) {
            console.warn('localStorage write failed', name, error);
            return false;
        }
    },

    getSync(name) {
        try {
            return localStorage.getItem(this.key(name));
        } catch (error) {
            return null;
        }
    },

    setSync(name, value) {
        try {
            localStorage.setItem(this.key(name), value);
            return true;
        } catch (error) {
            return false;
        }
    },

    // Async string storage: localStorage first, IndexedDB as fallback.
    async put(name, value) {
        try {
            localStorage.setItem(this.key(name), value);
            await this.idbDelete(name).catch(() => {});
            return 'localStorage';
        } catch (error) {
            try {
                localStorage.removeItem(this.key(name));
            } catch (ignored) { }
            await this.idbPut(name, value);
            return 'indexedDB';
        }
    },

    async get(name) {
        const value = this.getSync(name);
        if (value !== null) {
            return value;
        }
        try {
            const stored = await this.idbGet(name);
            return stored === undefined ? null : stored;
        } catch (error) {
            return null;
        }
    },

    async remove(name) {
        try {
            localStorage.removeItem(this.key(name));
        } catch (ignored) { }
        await this.idbDelete(name).catch(() => {});
    },

    async where(name) {
        if (this.getSync(name) !== null) {
            return 'localStorage';
        }
        const stored = await this.idbGet(name).catch(() => undefined);
        return stored === undefined ? null : 'indexedDB';
    },

    async clearAll() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k.startsWith(this.prefix)) {
                keys.push(k);
            }
        }
        keys.forEach((k) => localStorage.removeItem(k));
        const db = await this.idb().catch(() => null);
        if (db) {
            await new Promise((resolve) => {
                const tx = db.transaction('kv', 'readwrite');
                tx.objectStore('kv').clear();
                tx.oncomplete = tx.onerror = () => resolve();
            });
        }
    },

    localStorageUsage() {
        let chars = 0;
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                chars += k.length + (localStorage.getItem(k) || '').length;
            }
        } catch (ignored) { }
        return chars;
    },

    // --- IndexedDB ---
    idb() {
        if (!this._db) {
            this._db = new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    reject(new Error('IndexedDB not available'));
                    return;
                }
                const request = indexedDB.open('gemuboy', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('kv');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            this._db.catch(() => { this._db = null; });
        }
        return this._db;
    },

    async idbRequest(mode, fn) {
        const db = await this.idb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('kv', mode);
            const request = fn(tx.objectStore('kv'));
            tx.oncomplete = () => resolve(request.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    },

    idbPut(name, value) {
        return this.idbRequest('readwrite', (store) => store.put(value, name));
    },

    idbGet(name) {
        return this.idbRequest('readonly', (store) => store.get(name));
    },

    idbDelete(name) {
        return this.idbRequest('readwrite', (store) => store.delete(name));
    },
};

// Binary <-> string encoding helpers.
const Bytes = {
    toBase64(bytes) {
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    },

    fromBase64(text) {
        const binary = atob(text);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    async transform(bytes, stream) {
        const response = new Response(new Blob([bytes]).stream().pipeThrough(stream));
        return new Uint8Array(await response.arrayBuffer());
    },

    // Compress with gzip when the browser supports it (Safari 16.4+, Chrome 80+).
    async pack(bytes) {
        if (window.CompressionStream) {
            try {
                return 'gz:' + this.toBase64(await this.transform(bytes, new CompressionStream('gzip')));
            } catch (ignored) { }
        }
        return 'b64:' + this.toBase64(bytes);
    },

    async unpack(text) {
        if (text.startsWith('gz:')) {
            return this.transform(this.fromBase64(text.slice(3)), new DecompressionStream('gzip'));
        }
        if (text.startsWith('b64:')) {
            return this.fromBase64(text.slice(4));
        }
        return this.fromBase64(text);
    },

    // Minimal ZIP reader: returns the first .gb/.gbc entry of an archive.
    async unzipRom(bytes) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let eocd = -1;
        for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
            if (view.getUint32(i, true) === 0x06054b50) {
                eocd = i;
                break;
            }
        }
        if (eocd < 0) {
            throw 'ZIP inválido';
        }
        const entries = view.getUint16(eocd + 10, true);
        let offset = view.getUint32(eocd + 16, true);
        for (let n = 0; n < entries; n++) {
            if (view.getUint32(offset, true) !== 0x02014b50) {
                break;
            }
            const flags = view.getUint16(offset + 8, true);
            const method = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const nameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localOffset = view.getUint32(offset + 42, true);
            const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
            offset += 46 + nameLength + extraLength + commentLength;
            // Skip macOS metadata ("__MACOSX/._game.gb") and anything that isn't a ROM.
            if (!/\.(gb|gbc|cgb|sgb)$/i.test(name) || /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)) {
                continue;
            }
            if (flags & 1) {
                throw 'El ZIP está protegido con contraseña';
            }
            const localNameLength = view.getUint16(localOffset + 26, true);
            const localExtraLength = view.getUint16(localOffset + 28, true);
            const start = localOffset + 30 + localNameLength + localExtraLength;
            const data = bytes.subarray(start, start + compressedSize);
            if (method === 0) {
                return { name, data: data.slice() };
            }
            if (method === 8) {
                if (!window.DecompressionStream) {
                    throw 'Este navegador no puede descomprimir ZIP; descomprime el ROM primero';
                }
                return { name, data: await this.transform(data, new DecompressionStream('deflate-raw')) };
            }
            throw `El ZIP usa un método de compresión no soportado (${method}); vuelve a comprimirlo con «Deflate» (el normal)`;
        }
        throw 'El ZIP no contiene ningún ROM .gb/.gbc';
    },
};
