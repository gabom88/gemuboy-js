// Game library: ROMs saved on the device and games imported from text lists.
// Imported games are only entries (name, URL, description…) until they are played
// for the first time; then the ROM is downloaded and kept for offline play.
//
// Entry fields:
//   id          stable id ("rom:<id>" holds the ROM, "cover:<id>" a custom cover)
//   romId       id of the ROM itself (title + checksum), used by saves and states
//   url         where the ROM is downloaded from (imported entries)
//   title, description, year, genre, author, license, web, image, collection
//   where       'localStorage' / 'indexedDB' once the ROM is on the device
//   size, cgb, added, played, fav, hasCover, homebrew
const Library = {
    // Order of the fields in a list line when there is no "#campos:" header.
    defaultOrder: ['title', 'url', 'description', 'year', 'genre', 'image'],
    exportOrder: ['title', 'url', 'description', 'year', 'genre', 'image', 'author', 'license', 'web', 'collection'],
    fieldNames: {
        nombre: 'title', name: 'title', titulo: 'title', title: 'title', juego: 'title', game: 'title',
        url: 'url', rom: 'url', enlace: 'url',
        descripcion: 'description', description: 'description',
        ano: 'year', year: 'year',
        genero: 'genre', genre: 'genre',
        portada: 'image', imagen: 'image', image: 'image', cover: 'image',
        autor: 'author', author: 'author', desarrollador: 'author', developer: 'author',
        licencia: 'license', license: 'license',
        web: 'web', pagina: 'web', website: 'web',
        coleccion: 'collection', collection: 'collection',
    },
    exportLabels: {
        title: 'nombre', url: 'url', description: 'descripcion', year: 'año', genre: 'genero', image: 'portada',
        author: 'autor', license: 'licencia', web: 'web', collection: 'coleccion',
    },
    limits: { title: 120, description: 1000, url: 2000, image: 2000, web: 2000 },

    downloads: new Map(), // id -> { progress } while downloading, { error } after a failure
    coverCache: new Map(),
    view: { query: '', filter: 'all', limit: 60 },

    init(app) {
        this.app = app;
    },

    // ------------------------------------------------------------- storage
    list() {
        return Store.getJSON('roms', []);
    },

    save(list) {
        if (!Store.setJSON('roms', list)) {
            this.app.toast('⚠️ No hay espacio para guardar la biblioteca', 4000);
            return false;
        }
        return true;
    },

    find(id) {
        return this.list().find((entry) => entry.id === id) || null;
    },

    update(id, values) {
        const list = this.list();
        const entry = list.find((item) => item.id === id);
        if (!entry) {
            return null;
        }
        Object.assign(entry, values);
        this.save(list);
        return entry;
    },

    romId(entry) {
        return entry.romId || entry.id;
    },

    isDownloaded(entry) {
        return !!entry.where;
    },

    // ------------------------------------------------------------- helpers
    hash(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) {
            h ^= text.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(36);
    },

    idForUrl(url) {
        return 'u-' + this.hash(url);
    },

    // Absolute form of a URL, so "static/x.gb" and "https://site/static/x.gb" match.
    urlKey(url) {
        try {
            return new URL(url, location.href).href;
        } catch (error) {
            return url;
        }
    },

    isWebUrl(text) {
        return /^https?:\/\/[^\s]+$/i.test(text || '');
    },

    // Images: web URLs, bundled files and data URLs only.
    safeImage(url) {
        return url && (this.isWebUrl(url) || /^static\//.test(url) || /^data:image\//.test(url)) ? url : '';
    },

    fold(text) {
        return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    },

    nameFromUrl(url) {
        let name = url.split(/[?#]/)[0].split('/').filter(Boolean).pop() || url;
        try {
            name = decodeURIComponent(name);
        } catch (ignored) { }
        return name.replace(/\.(gbc?|zip)$/i, '').replace(/[_+]+/g, ' ').replace(/\s+/g, ' ').trim() || url;
    },

    // ----------------------------------------------------------- text lists
    // One game per line: "name | url | description | year | genre | cover".
    // Also accepts " --- " as separator and tabs (cells pasted from a spreadsheet).
    // "#campos: url | nombre | …" changes the order; other "#" lines are comments.
    parse(text, collection = '') {
        const lines = String(text || '').split(/\r\n|\r|\n/);
        let order = this.defaultOrder;
        const entries = [];
        const errors = [];
        lines.forEach((raw, index) => {
            const lineNo = index + 1;
            const line = raw.trim();
            if (!line) {
                return;
            }
            const header = /^#\s*(campos|fields)\s*:(.*)$/i.exec(line);
            if (header) {
                const names = this.splitLine(header[2]).map((name) => this.fieldNames[this.fold(name).replace(/[^a-z]/g, '')]);
                if (names.includes('url')) {
                    order = names;
                } else {
                    errors.push({ line: lineNo, message: 'la cabecera #campos necesita un campo «url»' });
                }
                return;
            }
            if (line.startsWith('#')) {
                return;
            }
            const cells = this.splitLine(raw).map((cell) => this.cleanField(cell));
            const values = {};
            if (cells.length === 1 && this.isWebUrl(cells[0])) {
                values.url = cells[0];
            } else {
                order.forEach((field, i) => {
                    if (field && cells[i]) {
                        values[field] = cells[i];
                    }
                });
            }
            if (!this.isWebUrl(values.url)) {
                // Tolerate a URL in another column.
                const url = cells.find((cell) => this.isWebUrl(cell) && !/\.(png|jpe?g|gif|webp)(\?|$)/i.test(cell));
                if (!url) {
                    errors.push({ line: lineNo, message: 'falta una URL válida (http:// o https://)' });
                    return;
                }
                values.url = url;
            }
            if (values.image && !this.isWebUrl(values.image)) {
                delete values.image;
            }
            if (values.web && !this.isWebUrl(values.web)) {
                delete values.web;
            }
            values.title = values.title || this.nameFromUrl(values.url);
            for (const [field, max] of Object.entries(this.limits)) {
                if (values[field] && values[field].length > max) {
                    values[field] = values[field].slice(0, max);
                }
            }
            for (const field of ['year', 'genre', 'author', 'license', 'collection']) {
                if (values[field]) {
                    values[field] = values[field].slice(0, 60);
                }
            }
            if (collection && !values.collection) {
                values.collection = collection;
            }
            entries.push({ line: lineNo, values });
        });
        return { entries, errors };
    },

    splitLine(line) {
        if (line.includes('\t')) {
            return line.split('\t');
        }
        if (line.includes('|')) {
            return line.split('|');
        }
        if (line.includes('---')) {
            return line.split(/\s*---\s*/);
        }
        return [line];
    },

    cleanField(text) {
        let value = text.trim();
        if (/^\[.*\]$/.test(value)) {
            value = value.slice(1, -1).trim();
        }
        if (/^<.*>$/.test(value)) {
            value = value.slice(1, -1).trim();
        }
        return value;
    },

    // What an import would do: new entries, updated entries (same URL), errors.
    plan(parsed) {
        const byUrl = new Map(this.list().filter((e) => e.url).map((e) => [this.urlKey(e.url), e]));
        const seen = new Set();
        let added = 0;
        let updated = 0;
        for (const { values } of parsed.entries) {
            const key = this.urlKey(values.url);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            if (byUrl.has(key)) {
                updated++;
            } else {
                added++;
            }
        }
        return { added, updated, errors: parsed.errors.length };
    },

    // Adds new entries and updates existing ones (matched by URL). Custom covers,
    // favorites and downloads are kept.
    apply(parsed) {
        const list = this.list();
        const byUrl = new Map(list.filter((e) => e.url).map((e) => [this.urlKey(e.url), e]));
        const now = Date.now();
        let added = 0;
        let updated = 0;
        for (const { values } of parsed.entries) {
            const key = this.urlKey(values.url);
            const existing = byUrl.get(key);
            if (existing) {
                // Bundled games keep their local URL so they work offline.
                Object.assign(existing, values, existing.homebrew ? { url: existing.url, image: existing.image } : {});
                updated++;
            } else {
                const entry = Object.assign({ id: this.idForUrl(key), added: now - added }, values);
                list.push(entry);
                byUrl.set(key, entry);
                added++;
            }
        }
        if (!this.save(list)) {
            return null;
        }
        return { added, updated };
    },

    exportText() {
        const lines = [
            '# Biblioteca de GBoy-JS · ' + new Date().toLocaleString('es'),
            '#campos: ' + this.exportOrder.map((field) => this.exportLabels[field]).join(' | '),
        ];
        let skipped = 0;
        for (const entry of this.list()) {
            if (!entry.url) {
                skipped++;
                continue;
            }
            const absolute = (url) => (url ? new URL(url, location.href).href : '');
            const values = Object.assign({}, entry, { url: absolute(entry.url), image: entry.image ? absolute(entry.image) : '' });
            lines.push(this.exportOrder.map((field) => String(values[field] || '').replace(/[|\r\n\t]+/g, ' ').trim()).join(' | '));
        }
        if (skipped) {
            lines.splice(2, 0, `# ${skipped} juego(s) cargados desde archivos locales no tienen URL y no se incluyen.`);
        }
        return lines.join('\n') + '\n';
    },

    // The bundled homebrew games are a built-in collection of the library. Games
    // added in later versions appear automatically; deleted ones don't come back
    // unless they are restored explicitly.
    async seedHomebrew(force = false) {
        let catalog;
        try {
            catalog = await this.app.homebrewCatalog();
        } catch (error) {
            return 0;
        }
        const seeded = new Set(Store.getJSON('hbseeded', []));
        const list = this.list();
        let added = 0;
        for (const game of catalog) {
            if (seeded.has(game.id) && !force) {
                continue;
            }
            seeded.add(game.id);
            const values = {
                url: 'static/homebrew/' + game.file,
                image: 'static/homebrew/' + game.thumb,
                title: game.title,
                description: game.description,
                genre: game.genre,
                author: game.developer,
                license: game.license,
                web: game.url,
                collection: 'Homebrew',
                homebrew: game.id,
            };
            const existing = list.find((e) => e.homebrew === game.id || e.url === values.url);
            if (existing) {
                Object.assign(existing, values);
            } else {
                list.push(Object.assign({ id: 'hb-' + game.id, added: 0 }, values));
                added++;
            }
        }
        this.save(list);
        Store.setJSON('hbseeded', [...seeded]);
        return added;
    },

    // ---------------------------------------------------- backup (settings JSON)
    entryKeys: {
        string: ['id', 'romId', 'url', 'title', 'description', 'year', 'genre', 'author', 'license', 'web', 'image', 'collection', 'name', 'homebrew'],
        number: ['size', 'added', 'played'],
        boolean: ['cgb', 'fav', 'hasCover'],
    },

    // Library entries and custom covers (ROMs are not included).
    async exportData() {
        const entries = this.list().map((entry) => this.cleanEntry(entry)).filter(Boolean);
        const covers = {};
        for (const entry of entries) {
            if (entry.hasCover) {
                const cover = await Store.get('cover:' + entry.id);
                if (cover) {
                    covers[entry.id] = cover;
                }
            }
        }
        return { entries, covers, homebrewSeeded: Store.getJSON('hbseeded', []) };
    },

    cleanEntry(raw) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || raw.id.length > 200) {
            return null;
        }
        const entry = {};
        for (const [type, keys] of Object.entries(this.entryKeys)) {
            for (const key of keys) {
                if (typeof raw[key] === type) {
                    entry[key] = type === 'string' ? raw[key].slice(0, this.limits[key] || 200) : raw[key];
                }
            }
        }
        for (const key of ['url', 'image']) {
            if (entry[key] && !this.isWebUrl(entry[key]) && !/^static\//.test(entry[key])) {
                delete entry[key];
            }
        }
        if (entry.web && !this.isWebUrl(entry.web)) {
            delete entry.web;
        }
        entry.title = entry.title || (entry.url ? this.nameFromUrl(entry.url) : 'Sin título');
        return entry;
    },

    // Merges a library backup: new entries are added, existing ones (same id or
    // URL) get the saved metadata. Downloads on this device are kept.
    async importData(data) {
        if (!data || !Array.isArray(data.entries)) {
            return null;
        }
        const list = this.list();
        const byId = new Map(list.map((e) => [e.id, e]));
        const byUrl = new Map(list.filter((e) => e.url).map((e) => [this.urlKey(e.url), e]));
        const covers = data.covers && typeof data.covers === 'object' ? data.covers : {};
        let added = 0;
        let updated = 0;
        for (const raw of data.entries) {
            const entry = this.cleanEntry(raw);
            if (!entry) {
                continue;
            }
            let target = byId.get(entry.id) || (entry.url && byUrl.get(this.urlKey(entry.url)));
            if (target) {
                const keep = { id: target.id, where: target.where, size: target.size, romId: target.romId || entry.romId, hasCover: target.hasCover };
                Object.assign(target, entry, keep);
                updated++;
            } else {
                target = entry;
                target.where = await Store.where('rom:' + entry.id);
                target.hasCover = !!(await Store.where('cover:' + entry.id));
                list.push(target);
                byId.set(target.id, target);
                if (target.url) {
                    byUrl.set(this.urlKey(target.url), target);
                }
                added++;
            }
            const cover = covers[raw.id];
            if (typeof cover === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(cover) && cover.length < 2000000) {
                if (await Store.put('cover:' + target.id, cover).catch(() => null)) {
                    target.hasCover = true;
                    this.coverCache.delete(target.id);
                }
            }
        }
        if (Array.isArray(data.homebrewSeeded)) {
            const seeded = new Set(Store.getJSON('hbseeded', []));
            data.homebrewSeeded.filter((id) => typeof id === 'string').forEach((id) => seeded.add(id));
            Store.setJSON('hbseeded', [...seeded]);
        }
        if (!this.save(list)) {
            return null;
        }
        return { added, updated };
    },

    // ------------------------------------------------------------ downloads
    async fetchRom(url, onProgress) {
        let response;
        try {
            response = await fetch(url);
        } catch (error) {
            throw this.downloadError(navigator.onLine === false ? 'offline' : 'blocked');
        }
        if (!response.ok) {
            throw this.downloadError('http', response.status);
        }
        const total = Number(response.headers.get('content-length')) || 0;
        let bytes;
        if (response.body && response.body.getReader) {
            const reader = response.body.getReader();
            const chunks = [];
            let received = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                chunks.push(value);
                received += value.length;
                if (total) {
                    onProgress(Math.min(0.99, received / total));
                }
            }
            bytes = new Uint8Array(received);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
            }
        } else {
            bytes = new Uint8Array(await response.arrayBuffer());
        }
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            try {
                bytes = (await Bytes.unzipRom(bytes)).data;
            } catch (error) {
                throw this.downloadError('zip');
            }
        }
        if (bytes.length < 0x150) {
            throw this.downloadError('invalid');
        }
        return bytes;
    },

    downloadError(kind, status) {
        const messages = {
            offline: 'Sin conexión a internet',
            blocked: 'El servidor no permite la descarga directa desde el navegador',
            http: `El servidor respondió con un error (${status})`,
            zip: 'El .zip no contiene un ROM de Game Boy',
            invalid: 'El archivo descargado no es un ROM de Game Boy',
            storage: 'No hay espacio para guardar el ROM',
        };
        return Object.assign(new Error(messages[kind]), { kind });
    },

    // Saves ROM bytes as the given entry's download.
    async storeBytes(id, bytes) {
        const info = this.app.romInfo(bytes);
        let where;
        try {
            where = await Store.put('rom:' + id, await Bytes.pack(bytes));
        } catch (error) {
            throw this.downloadError('storage');
        }
        return this.update(id, { where, size: bytes.length, cgb: info.cgb, romId: info.id });
    },

    async download(id) {
        const entry = this.find(id);
        if (!entry || !entry.url || (this.downloads.get(id) || {}).progress !== undefined) {
            return false;
        }
        this.downloads.set(id, { progress: 0 });
        this.refreshEntry(id);
        try {
            const bytes = await this.fetchRom(entry.url, (progress) => {
                this.downloads.set(id, { progress });
                this.refreshEntry(id);
            });
            await this.storeBytes(id, bytes);
            this.downloads.delete(id);
            this.refreshEntry(id);
            return true;
        } catch (error) {
            console.warn('download failed', entry.url, error);
            this.downloads.set(id, { error: error.message || String(error), kind: error.kind });
            this.refreshEntry(id);
            return false;
        }
    },

    // Plays an entry, downloading it first if needed.
    async play(id) {
        const entry = this.find(id);
        if (!entry) {
            return false;
        }
        if (this.isDownloaded(entry) && await Store.where('rom:' + id)) {
            return this.app.loadFromLibrary(id);
        }
        if (!entry.url) {
            this.app.toast('No se encontró el ROM guardado en el dispositivo', 4000);
            this.update(id, { where: null });
            this.refreshEntry(id);
            return false;
        }
        this.app.toast('Descargando ' + entry.title + '…', 30000);
        if (!(await this.download(id))) {
            const failure = this.downloads.get(id) || {};
            this.app.toast('⚠️ ' + failure.error + (failure.kind === 'blocked' ? '. Abre la ficha (⋯) para asignar el archivo.' : ''), 6000);
            return false;
        }
        this.app.toast('Descargado: ' + entry.title);
        return this.app.loadFromLibrary(id);
    },

    async removeDownload(id) {
        await Store.remove('rom:' + id);
        this.update(id, { where: null });
        this.downloads.delete(id);
    },

    async assignFile(id, file) {
        try {
            const { bytes } = await this.app.readRomFile(file);
            if (bytes.length < 0x150) {
                throw this.downloadError('invalid');
            }
            await this.storeBytes(id, bytes);
            this.downloads.delete(id);
            this.app.toast('Archivo asignado: ya puedes jugar sin conexión');
            return true;
        } catch (error) {
            this.app.toast('⚠️ ' + (error.message || error), 4000);
            return false;
        }
    },

    async downloadAll(ids) {
        if (this.bulk) {
            this.bulk.cancel = true;
            return;
        }
        const pending = ids.filter((id) => {
            const entry = this.find(id);
            return entry && entry.url && !this.isDownloaded(entry);
        });
        if (!pending.length) {
            this.app.toast('Todos los juegos visibles ya están descargados');
            return;
        }
        this.bulk = { cancel: false };
        this.renderBulkButton();
        let ok = 0;
        let failed = 0;
        for (let i = 0; i < pending.length && !this.bulk.cancel; i++) {
            this.app.toast(`Descargando ${i + 1} de ${pending.length}…`, 60000);
            if (await this.download(pending[i])) {
                ok++;
            } else {
                failed++;
            }
        }
        const cancelled = this.bulk.cancel;
        this.bulk = null;
        this.renderBulkButton();
        this.app.toast(`${cancelled ? 'Descarga detenida. ' : ''}${ok} descargado(s)${failed ? ` · ${failed} con error` : ''}`, 4000);
    },

    // --------------------------------------------------------------- covers
    async setCover(id, dataUrl) {
        const where = await Store.put('cover:' + id, dataUrl).catch(() => null);
        if (!where) {
            this.app.toast('⚠️ No hay espacio para guardar la portada', 4000);
            return false;
        }
        this.coverCache.set(id, dataUrl);
        this.update(id, { hasCover: true });
        return true;
    },

    async removeCover(id) {
        await Store.remove('cover:' + id);
        this.coverCache.delete(id);
        this.update(id, { hasCover: false });
    },

    async coverOf(entry) {
        if (entry.hasCover) {
            if (!this.coverCache.has(entry.id)) {
                this.coverCache.set(entry.id, await Store.get('cover:' + entry.id));
            }
            const cover = this.coverCache.get(entry.id);
            if (cover) {
                return cover;
            }
        }
        return this.safeImage(entry.image);
    },

    // ------------------------------------------------------------ rendering
    statusOf(entry) {
        const state = this.downloads.get(entry.id) || {};
        if (state.progress !== undefined) {
            return { cls: 'busy', text: `descargando ${Math.round(state.progress * 100)}%`, progress: state.progress };
        }
        if (state.error) {
            return { cls: 'error', text: 'error de descarga' };
        }
        if (this.isDownloaded(entry)) {
            return { cls: 'ok', text: 'descargado' };
        }
        return entry.url ? { cls: 'pending', text: 'sin descargar' } : { cls: 'error', text: 'no disponible' };
    },

    filtered() {
        const settings = this.app.settings;
        const query = this.fold(this.view.query).trim();
        const filter = this.view.filter;
        let list = this.list().filter((entry) => {
            if (filter === 'downloaded' && !this.isDownloaded(entry)) return false;
            if (filter === 'pending' && this.isDownloaded(entry)) return false;
            if (filter === 'fav' && !entry.fav) return false;
            if (filter.startsWith('c:') && (entry.collection || '') !== filter.slice(2)) return false;
            if (filter.startsWith('g:') && (entry.genre || '') !== filter.slice(2)) return false;
            if (query) {
                const text = this.fold([entry.title, entry.genre, entry.author, entry.collection, entry.year, entry.description].join(' '));
                return query.split(/\s+/).every((word) => text.includes(word));
            }
            return true;
        });
        const byTitle = (a, b) => (a.title || '').localeCompare(b.title || '', 'es', { sensitivity: 'base' });
        const sorters = {
            played: (a, b) => (b.played || 0) - (a.played || 0) || (b.added || 0) - (a.added || 0) || byTitle(a, b),
            title: byTitle,
            year: (a, b) => (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0) || byTitle(a, b),
            added: (a, b) => (b.added || 0) - (a.added || 0) || byTitle(a, b),
        };
        list.sort(sorters[settings.librarySort] || sorters.played);
        return list;
    },

    renderFilterOptions() {
        const select = document.getElementById('lib-filter');
        const list = this.list();
        const collections = [...new Set(list.map((e) => e.collection).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        const genres = [...new Set(list.map((e) => e.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        select.innerHTML = '';
        const add = (parent, value, label) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            parent.appendChild(option);
        };
        add(select, 'all', 'Todos');
        add(select, 'downloaded', 'Descargados');
        add(select, 'pending', 'Sin descargar');
        add(select, 'fav', '★ Favoritos');
        for (const [label, prefix, values] of [['Colecciones', 'c:', collections], ['Géneros', 'g:', genres]]) {
            if (values.length) {
                const group = document.createElement('optgroup');
                group.label = label;
                values.forEach((value) => add(group, prefix + value, value));
                select.appendChild(group);
            }
        }
        if (![...select.options].some((o) => o.value === this.view.filter)) {
            this.view.filter = 'all';
        }
        select.value = this.view.filter;
    },

    render() {
        const container = document.getElementById('library-list');
        const settings = this.app.settings;
        this.renderFilterOptions();
        document.getElementById('lib-search').value = this.view.query;
        document.getElementById('lib-sort').value = settings.librarySort;
        const grid = settings.libraryView === 'grid';
        container.className = grid ? 'lib-grid' : 'cards';
        document.getElementById('lib-view').innerHTML = grid ? this.app.icons.list : this.app.icons.grid;
        const all = this.list();
        const list = this.filtered();
        this.visibleIds = list.map((e) => e.id);
        const downloaded = all.filter((e) => this.isDownloaded(e)).length;
        document.getElementById('lib-count').textContent = all.length
            ? `${list.length === all.length ? all.length + ' juegos' : list.length + ' de ' + all.length + ' juegos'} · ${downloaded} descargados`
            : '';
        container.innerHTML = '';
        if (!list.length) {
            container.innerHTML = `<p class="empty">${all.length ? 'Ningún juego coincide con la búsqueda.' : 'La biblioteca está vacía. Carga un ROM o importa una lista.'}</p>`;
        }
        for (const entry of list.slice(0, this.view.limit)) {
            container.appendChild(this.card(entry, grid));
        }
        const more = document.getElementById('lib-more');
        more.hidden = list.length <= this.view.limit;
        more.textContent = `Mostrar más (${list.length - this.view.limit})`;
        this.renderBulkButton();
    },

    card(entry, grid) {
        const card = document.createElement('div');
        card.className = 'card lib' + (this.app.game && this.app.game.entryId === entry.id ? ' current' : '');
        card.dataset.entry = entry.id;
        card.innerHTML = `
            <div class="lib-main">
                <button type="button" class="cover" data-action="lib-play" aria-label="Jugar"><span class="cover-ph"></span></button>
                <div class="rom-info">
                    <strong></strong>
                    <small class="meta"></small>
                    <span class="status"></span>
                    <span class="bar"><i></i></span>
                </div>
                <div class="lib-actions">
                    <button type="button" class="fav" data-action="lib-fav" aria-label="Favorito"></button>
                    ${grid ? '' : '<button type="button" class="btn primary small" data-action="lib-play">Jugar</button>'}
                    <button type="button" class="btn ghost small more" data-action="lib-edit" aria-label="Ficha del juego">⋯</button>
                </div>
            </div>
            <p class="desc"></p>
            <small class="details"></small>`;
        card.querySelectorAll('[data-action]').forEach((button) => { button.dataset.id = entry.id; });
        card.querySelector('strong').textContent = entry.title || 'Sin título';
        card.querySelector('.cover-ph').textContent = (entry.title || '?').trim().charAt(0).toUpperCase();
        // Everything registered for the game except the ROM and cover URLs.
        const system = entry.cgb === undefined ? '' : entry.cgb ? 'GBC' : 'GB';
        const size = entry.size && this.isDownloaded(entry) ? this.app.formatSize(entry.size) : '';
        card.querySelector('.meta').textContent = [entry.year, entry.genre, entry.collection, system, size].filter(Boolean).join(' · ');
        const desc = card.querySelector('.desc');
        desc.textContent = entry.description || '';
        desc.hidden = !entry.description;
        const details = card.querySelector('.details');
        const parts = [];
        if (entry.author) {
            parts.push('Autor: ' + entry.author);
        }
        if (entry.license) {
            parts.push('Licencia: ' + entry.license);
        }
        details.textContent = parts.join(' · ');
        if (this.isWebUrl(entry.web)) {
            if (parts.length) {
                details.append(' · ');
            }
            const link = document.createElement('a');
            link.href = entry.web;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'web';
            details.appendChild(link);
        }
        details.hidden = !details.textContent;
        this.updateCardStatus(card, entry);
        this.coverOf(entry).then((src) => {
            if (src) {
                const img = document.createElement('img');
                img.alt = '';
                img.loading = 'lazy';
                img.decoding = 'async';
                img.onerror = () => img.remove();
                img.src = src;
                card.querySelector('.cover').appendChild(img);
            }
        });
        return card;
    },

    updateCardStatus(card, entry) {
        const status = this.statusOf(entry);
        const label = card.querySelector('.status');
        label.className = 'status s-' + status.cls;
        label.textContent = status.text;
        const bar = card.querySelector('.bar');
        bar.hidden = status.progress === undefined;
        bar.firstElementChild.style.width = Math.round((status.progress || 0) * 100) + '%';
        const fav = card.querySelector('.fav');
        fav.textContent = entry.fav ? '★' : '☆';
        fav.classList.toggle('on', !!entry.fav);
    },

    refreshEntry(id) {
        const entry = this.find(id);
        if (!entry) {
            return;
        }
        document.querySelectorAll(`[data-entry="${CSS.escape(id)}"]`).forEach((card) => this.updateCardStatus(card, entry));
        if (this.app.page === 'entry' && this.editingId === id) {
            this.renderEntryStatus(entry);
        }
    },

    renderBulkButton() {
        const button = document.getElementById('lib-download-all');
        if (button) {
            button.textContent = this.bulk ? 'Detener descargas' : 'Descargar todos los visibles';
        }
    },

    // --- Entry page (edit) ---
    editFields: ['title', 'description', 'year', 'genre', 'author', 'license', 'collection', 'url', 'web', 'image'],

    async renderEntry() {
        const entry = this.find(this.editingId);
        if (!entry) {
            this.app.showPage('library');
            return;
        }
        for (const field of this.editFields) {
            document.getElementById('ef-' + field).value = entry[field] || '';
        }
        const preview = document.getElementById('entry-cover');
        preview.innerHTML = '';
        const src = await this.coverOf(entry);
        if (src) {
            const img = document.createElement('img');
            img.alt = '';
            img.src = src;
            preview.appendChild(img);
        } else {
            preview.innerHTML = '<span class="cover-ph"></span>';
            preview.firstChild.textContent = (entry.title || '?').charAt(0).toUpperCase();
        }
        document.getElementById('entry-cover-reset').hidden = !entry.hasCover;
        const web = document.getElementById('entry-web');
        web.hidden = !this.isWebUrl(entry.web);
        web.href = this.isWebUrl(entry.web) ? entry.web : '#';
        this.renderEntryStatus(entry);
    },

    renderEntryStatus(entry) {
        const status = this.statusOf(entry);
        const state = this.downloads.get(entry.id) || {};
        const label = document.getElementById('entry-status');
        label.className = 'status s-' + status.cls;
        label.textContent = status.text + (entry.size && this.isDownloaded(entry) ? ' · ' + this.app.formatSize(entry.size) : '');
        const help = document.getElementById('entry-help');
        help.hidden = !state.error;
        help.textContent = state.error ? state.error + (state.kind === 'blocked'
            ? '. Abre el enlace, descarga el archivo y pulsa «Asignar archivo» para vincularlo a esta ficha.' : '.') : '';
        const isUrl = this.isWebUrl(entry.url) || /^static\//.test(entry.url || '');
        document.getElementById('entry-download').hidden = !isUrl || this.isDownloaded(entry);
        document.getElementById('entry-remove-download').hidden = !isUrl || !this.isDownloaded(entry);
        const open = document.getElementById('entry-open');
        open.hidden = !this.isWebUrl(entry.url);
        open.href = this.isWebUrl(entry.url) ? entry.url : '#';
    },

    saveEntry() {
        const values = {};
        for (const field of this.editFields) {
            values[field] = document.getElementById('ef-' + field).value.trim();
        }
        if (!values.title) {
            this.app.toast('El nombre no puede quedar vacío');
            return false;
        }
        for (const field of ['url', 'web', 'image']) {
            if (values[field] && !this.isWebUrl(values[field]) && !/^static\//.test(values[field])) {
                this.app.toast(`«${field === 'url' ? 'URL del ROM' : field === 'web' ? 'Web' : 'Portada'}» debe empezar por http:// o https://`, 4000);
                return false;
            }
        }
        const list = this.list();
        if (values.url && list.some((e) => e.url && this.urlKey(e.url) === this.urlKey(values.url) && e.id !== this.editingId)) {
            this.app.toast('Ya hay otro juego con esa URL', 4000);
            return false;
        }
        this.update(this.editingId, values);
        this.app.toast('Ficha guardada');
        return true;
    },
};
