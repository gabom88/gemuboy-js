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
        { id: 'kirokaze', name: 'Kirokaze', bg: ['#e2f3e4', '#94e344', '#46878f', '#332c50'] },
        { id: 'nostalgia', name: 'Nostalgia', bg: ['#d0d058', '#a0a840', '#708028', '#405010'] },
        { id: 'rustic', name: 'Rústico', bg: ['#edb4a1', '#a96868', '#764462', '#2c2137'] },
        { id: 'spacehaze', name: 'Bruma espacial', bg: ['#f8e3c4', '#cc3495', '#6b1fb1', '#0b0630'] },
        { id: 'cherry', name: 'Cereza', bg: ['#f7f0f2', '#f2a7c3', '#bd4882', '#4d1135'] },
        { id: 'arctic', name: 'Ártico', bg: ['#f0f8ff', '#9cd3f2', '#4a84b8', '#1b2a4a'] },
        { id: 'sunset', name: 'Atardecer', bg: ['#ffe9a3', '#ff9a52', '#c2405a', '#3b1a4a'] },
        { id: 'forest', name: 'Bosque', bg: ['#dfe8c4', '#8fb070', '#3f6b3c', '#14261b'] },
        { id: 'lava', name: 'Lava', bg: ['#fff0c0', '#ffa040', '#c03020', '#300808'] },
        { id: 'neon', name: 'Neón', bg: ['#e0fff8', '#00f0c0', '#e0209a', '#1a0830'] },
        { id: 'sepia', name: 'Sepia', bg: ['#f4e8d0', '#c8a878', '#806040', '#302010'] },
        { id: 'matrix', name: 'Matrix', bg: ['#c8ffc8', '#40e040', '#108010', '#001400'] },
        { id: 'amber', name: 'Monitor ámbar', bg: ['#ffd280', '#e09020', '#804800', '#201000'] },
        { id: 'lavender', name: 'Lavanda', bg: ['#f4eefa', '#c8b4e6', '#8a6cb8', '#3a2a5a'] },
        { id: 'mint', name: 'Menta', bg: ['#f0fff4', '#a8e6c4', '#52a083', '#1e4a3c'] },
        { id: 'coffee', name: 'Café', bg: ['#f2e6d8', '#c49a6c', '#7a5232', '#2e1c10'] },
        { id: 'grape', name: 'Uva', bg: ['#f0d8ff', '#b080e0', '#6040a0', '#200a40'] },
        { id: 'virtualboy', name: 'Virtual Boy', bg: ['#ff3030', '#b00000', '#600000', '#100000'] },
        { id: 'cga', name: 'CGA', bg: ['#ffffff', '#55ffff', '#ff55ff', '#000000'] },
        { id: 'candy', name: 'Caramelo', bg: ['#fff4fc', '#ffb3d9', '#b36bd6', '#3d2a6b'] },
        { id: 'peach', name: 'Melocotón', bg: ['#fff1e6', '#ffb8a0', '#d8706a', '#5a2a3a'] },
        { id: 'aqua', name: 'Aguamarina', bg: ['#e8fffa', '#7fe0d0', '#2f8f9a', '#103040'] },
        { id: 'desert', name: 'Desierto', bg: ['#fbe7c6', '#e0a96d', '#a0603a', '#3a2015'] },
        { id: 'midnight', name: 'Medianoche', bg: ['#c8d0ff', '#7080d0', '#303880', '#0a0c28'] },
        { id: 'rose', name: 'Rosa vieja', bg: ['#f8e8ea', '#d9a5ae', '#9a5a6a', '#3a1e28'] },
        { id: 'olive', name: 'Oliva', bg: ['#eef0d0', '#b8c070', '#6a7a30', '#252c10'] },
        { id: 'ice', name: 'Hielo', bg: ['#ffffff', '#c8e8ff', '#6898c8', '#203048'] },
        { id: 'magma', name: 'Magma', bg: ['#ffe070', '#ff6020', '#a01040', '#200018'] },
        { id: 'toxic', name: 'Tóxico', bg: ['#f0ffb0', '#b0f020', '#509010', '#102008'] },
        { id: 'royal', name: 'Real', bg: ['#f8e8a0', '#d0a030', '#5030a0', '#180c40'] },
        { id: 'bubblegum', name: 'Chicle', bg: ['#fff0f8', '#ff9ad0', '#9a60e0', '#302060'] },
        { id: 'steel', name: 'Acero', bg: ['#e8eef2', '#a8b8c4', '#5a6c7a', '#1c2630'] },
        { id: 'swamp', name: 'Pantano', bg: ['#d8e0a8', '#8aa060', '#4a6848', '#1a2a20'] },
        { id: 'sakura', name: 'Sakura', bg: ['#fff5f8', '#ffc8dc', '#e07aa0', '#5a2040'] },
        { id: 'cyber', name: 'Ciberpunk', bg: ['#fcee0a', '#00f0ff', '#ff003c', '#0a0a1a'] },
        { id: 'chocolate', name: 'Chocolate', bg: ['#f5e1c8', '#b07a50', '#6a3a20', '#25120a'] },
        { id: 'plum', name: 'Ciruela', bg: ['#f2e0f0', '#c080b8', '#783c78', '#2a1030'] },
        { id: 'lime', name: 'Lima', bg: ['#f8ffe0', '#c8f060', '#6aa020', '#1a3008'] },
        { id: 'crimson', name: 'Carmesí', bg: ['#ffe0e0', '#ff7070', '#b01828', '#300008'] },
        { id: 'teal', name: 'Verde azulado', bg: ['#e0fff8', '#70d8c8', '#18807a', '#06282a'] },
        { id: 'dusk', name: 'Crepúsculo', bg: ['#ffd8a8', '#e0789a', '#6a4a9a', '#1a1840'] },
        { id: 'honey', name: 'Miel', bg: ['#fff6d0', '#f8c840', '#b07818', '#3a2408'] },
        { id: 'glacier', name: 'Glaciar', bg: ['#f0ffff', '#a0e0f0', '#4890c0', '#183058'] },
        { id: 'ruby', name: 'Rubí', bg: ['#ffe8f0', '#f06090', '#a0103a', '#300010'] },
        { id: 'emerald', name: 'Esmeralda', bg: ['#e8fff0', '#60d890', '#108048', '#022614'] },
        { id: 'sapphire', name: 'Zafiro', bg: ['#e8f0ff', '#6090f0', '#1838a0', '#040c30'] },
        { id: 'gold', name: 'Oro', bg: ['#fff8d8', '#f0d060', '#a07a10', '#302000'] },
        { id: 'blueprint', name: 'Plano azul', bg: ['#ffffff', '#9ac0f0', '#2a5aa8', '#0c2050'] },
        { id: 'noir', name: 'Cine negro', bg: ['#f0f0f0', '#909090', '#404040', '#080808'] },
        { id: 'pastelrain', name: 'Arcoíris pastel', bg: ['#fffaf0', '#a8e6cf', '#ffaaa5', '#6c5b7b'] },
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
