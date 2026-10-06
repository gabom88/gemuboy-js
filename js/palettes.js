// Color palettes for original Game Boy (DMG) games.
// Each palette has 4 shades (lightest to darkest) for the background and both
// sprite palettes. Game Boy Color games use their own colors.
const Palettes = {
    presets: [
        { id: 'dmg', name: 'Game Boy original', bg: ['#9bbc0f', '#8bac0f', '#306230', '#0f380f'] },
        { id: 'pocket', name: 'Game Boy Pocket', bg: ['#e3e6c9', '#a7ad8c', '#5f6553', '#1f2219'] },
        { id: 'light', name: 'Game Boy Light', bg: ['#00e7b0', '#00b98d', '#00805f', '#004a37'] },
        { id: 'gray', name: 'Escala de grises', bg: ['#ffffff', '#aaaaaa', '#555555', '#000000'] },
        { id: 'bgb', name: 'BGB', bg: ['#e0f8d0', '#88c070', '#346856', '#081820'] },
        { id: 'brown', name: 'GBC ↑ Marrón', bg: ['#ffffff', '#ffad63', '#843100', '#000000'] },
        {
            id: 'red', name: 'GBC ↑+A Rojo', bg: ['#ffffff', '#ff8584', '#943a3a', '#000000'],
            obj0: ['#ffffff', '#7bff31', '#008400', '#000000'], obj1: ['#ffffff', '#63a5ff', '#0000ff', '#000000'],
        },
        {
            id: 'blue', name: 'GBC ← Azul', bg: ['#ffffff', '#63a5ff', '#0000ff', '#000000'],
            obj0: ['#ffffff', '#ff8584', '#943a3a', '#000000'], obj1: ['#ffffff', '#7bff31', '#008400', '#000000'],
        },
        {
            id: 'darkblue', name: 'GBC ←+A Azul oscuro', bg: ['#ffffff', '#8c8cde', '#52528c', '#000000'],
            obj0: ['#ffffff', '#ff8584', '#943a3a', '#000000'], obj1: ['#ffffff', '#ffad63', '#843100', '#000000'],
        },
        {
            id: 'green', name: 'GBC → Verde', bg: ['#ffffff', '#52ff00', '#ff4200', '#000000'],
        },
        {
            id: 'yellow', name: 'GBC ↓+B Amarillo', bg: ['#ffffff', '#ffff00', '#7b4a00', '#000000'],
            obj0: ['#ffffff', '#63a5ff', '#0000ff', '#000000'], obj1: ['#ffffff', '#7bff31', '#008400', '#000000'],
        },
        { id: 'pastel', name: 'GBC ↓ Pastel', bg: ['#ffffa5', '#ff9494', '#9494ff', '#000000'] },
        { id: 'inverted', name: 'GBC →+B Invertido', bg: ['#000000', '#008484', '#ffde00', '#ffffff'] },
        { id: 'icecream', name: 'Helado', bg: ['#fff6d3', '#f9a875', '#eb6b6f', '#7c3f58'] },
        { id: 'mist', name: 'Niebla', bg: ['#c4f0c2', '#5ab9a8', '#1e606e', '#2d1b00'] },
        { id: 'autumn', name: 'Otoño', bg: ['#dad3af', '#d58863', '#c23a73', '#2c1e74'] },
        { id: 'velvet', name: 'Terciopelo', bg: ['#e8c1a0', '#c7798a', '#7d4a7a', '#2a1b3d'] },
        { id: 'ocean', name: 'Océano', bg: ['#e0f0e8', '#8ccdd0', '#3e7c9e', '#1a2846'] },
    ],

    find(id) {
        return this.presets.find((preset) => preset.id === id) || this.presets[0];
    },

    // '#rrggbb' -> 0xAABBGGRR (little-endian RGBA as stored in ImageData).
    toABGR(hex) {
        const value = parseInt(hex.slice(1), 16);
        const r = (value >> 16) & 0xff;
        const g = (value >> 8) & 0xff;
        const b = value & 0xff;
        return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    },

    resolve(settings) {
        if (settings.palette === 'custom') {
            return { bg: settings.customPalette, obj0: settings.customPalette, obj1: settings.customPalette };
        }
        const preset = this.find(settings.palette);
        return { bg: preset.bg, obj0: preset.obj0 || preset.bg, obj1: preset.obj1 || preset.bg };
    },

    apply(settings) {
        const palette = this.resolve(settings);
        Display.palette = palette.bg.map((c) => this.toABGR(c));
        Display.objPalettes = [palette.obj0.map((c) => this.toABGR(c)), palette.obj1.map((c) => this.toABGR(c))];
        return palette;
    },
};
