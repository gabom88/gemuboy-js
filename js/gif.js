// Animated GIF encoder (GIF89a, LZW) for short gameplay clips.
// Frames are RGBA ImageData of the same size; the picture is scaled up with
// sharp pixels. Game Boy frames have few colors, so a global palette of the
// exact colors is used when it fits in 256; otherwise a 6x7x6 color cube.
const GifEncoder = {
    async encode(frames, { scale = 2, delay = 5, onProgress } = {}) {
        const width = frames[0].width;
        const height = frames[0].height;
        const { palette, indexOf } = this.palette(frames);
        const out = new ByteWriter();
        out.text('GIF89a');
        out.word(width * scale);
        out.word(height * scale);
        out.byte(0xf7); // global color table, 8 bits, 256 entries
        out.byte(0);
        out.byte(0);
        for (let i = 0; i < 256; i++) {
            const color = palette[i] || 0;
            out.byte(color >> 16 & 0xff);
            out.byte(color >> 8 & 0xff);
            out.byte(color & 0xff);
        }
        // Loop forever.
        out.bytes([0x21, 0xff, 0x0b]);
        out.text('NETSCAPE2.0');
        out.bytes([0x03, 0x01, 0x00, 0x00, 0x00]);

        const W = width * scale;
        const H = height * scale;
        const indices = new Uint8Array(W * H);
        for (let f = 0; f < frames.length; f++) {
            const data = new Uint32Array(frames[f].data.buffer);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const index = indexOf(data[y * width + x]);
                    for (let sy = 0; sy < scale; sy++) {
                        indices.fill(index, (y * scale + sy) * W + x * scale, (y * scale + sy) * W + x * scale + scale);
                    }
                }
            }
            out.bytes([0x21, 0xf9, 0x04, 0x00]); // graphic control: delay in 1/100 s
            out.word(delay);
            out.bytes([0x00, 0x00]);
            out.byte(0x2c);
            out.word(0);
            out.word(0);
            out.word(W);
            out.word(H);
            out.byte(0);
            this.lzw(indices, out);
            if (f % 10 === 9) {
                if (onProgress) {
                    onProgress((f + 1) / frames.length);
                }
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
        out.byte(0x3b);
        return new Blob(out.result(), { type: 'image/gif' });
    },

    // Colors are read as little-endian RGBA words (0xAABBGGRR).
    palette(frames) {
        const exact = new Map();
        for (const frame of frames) {
            const data = new Uint32Array(frame.data.buffer);
            for (let i = 0; i < data.length; i++) {
                const c = data[i] & 0xffffff;
                if (!exact.has(c)) {
                    if (exact.size >= 256) {
                        return this.cube();
                    }
                    exact.set(c, exact.size);
                }
            }
        }
        const palette = [];
        for (const [c, i] of exact) {
            palette[i] = ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
        }
        return { palette, indexOf: (rgba) => exact.get(rgba & 0xffffff) };
    },

    cube() {
        const palette = [];
        for (let r = 0; r < 6; r++) {
            for (let g = 0; g < 7; g++) {
                for (let b = 0; b < 6; b++) {
                    palette.push((Math.round(r * 255 / 5) << 16) | (Math.round(g * 255 / 6) << 8) | Math.round(b * 255 / 5));
                }
            }
        }
        return {
            palette,
            indexOf: (rgba) => {
                const r = rgba & 0xff;
                const g = (rgba >> 8) & 0xff;
                const b = (rgba >> 16) & 0xff;
                return Math.round(r * 5 / 255) * 42 + Math.round(g * 6 / 255) * 6 + Math.round(b * 5 / 255);
            },
        };
    },

    // Variable-length LZW with 8-bit pixels, written in sub-blocks of 255 bytes.
    lzw(indices, out) {
        const minCode = 8;
        const clear = 1 << minCode;
        const end = clear + 1;
        out.byte(minCode);
        // Code table indexed by prefix * 256 + pixel; an entry is valid only when its
        // stamp matches the current generation, so a clear code needs no refill.
        const table = this.table || (this.table = new Int32Array(4096 * 256));
        const stamps = this.stamps || (this.stamps = new Int32Array(4096 * 256));
        let generation = this.generation = (this.generation || 0) + 1;
        let next = end + 1;
        let size = minCode + 1;
        let buffer = 0;
        let bits = 0;
        const block = new Uint8Array(255);
        let blockLength = 0;
        const emit = (code) => {
            buffer |= code << bits;
            bits += size;
            while (bits >= 8) {
                block[blockLength++] = buffer & 0xff;
                buffer >>>= 8;
                bits -= 8;
                if (blockLength === 255) {
                    out.byte(255);
                    out.bytes(block);
                    blockLength = 0;
                }
            }
        };
        emit(clear);
        let prefix = indices[0];
        for (let i = 1; i < indices.length; i++) {
            const k = indices[i];
            const key = prefix * 256 + k;
            if (stamps[key] === generation) {
                prefix = table[key];
                continue;
            }
            emit(prefix);
            if (next < 4096) {
                table[key] = next++;
                stamps[key] = generation;
                if (next > (1 << size) && size < 12) {
                    size++;
                }
            } else {
                emit(clear);
                generation = ++this.generation;
                next = end + 1;
                size = minCode + 1;
            }
            prefix = k;
        }
        emit(prefix);
        emit(end);
        if (bits > 0) {
            block[blockLength++] = buffer & 0xff;
            if (blockLength === 255) {
                out.byte(255);
                out.bytes(block);
                blockLength = 0;
            }
        }
        if (blockLength) {
            out.byte(blockLength);
            out.bytes(block.subarray(0, blockLength));
        }
        out.byte(0);
    },
};

class ByteWriter {
    constructor() {
        this.chunks = [];
        this.buffer = new Uint8Array(1 << 16);
        this.length = 0;
    }

    byte(value) {
        if (this.length === this.buffer.length) {
            this.chunks.push(this.buffer);
            this.buffer = new Uint8Array(1 << 16);
            this.length = 0;
        }
        this.buffer[this.length++] = value;
    }

    bytes(values) {
        for (let i = 0; i < values.length; i++) {
            this.byte(values[i]);
        }
    }

    word(value) {
        this.byte(value & 0xff);
        this.byte((value >> 8) & 0xff);
    }

    text(value) {
        for (let i = 0; i < value.length; i++) {
            this.byte(value.charCodeAt(i));
        }
    }

    result() {
        return [...this.chunks, this.buffer.subarray(0, this.length)];
    }
}
