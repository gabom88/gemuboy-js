# GemuBoy

Emulador de **Game Boy** y **Game Boy Color** escrito en JavaScript puro, convertido en una
**PWA** (aplicación web instalable) optimizada para **Safari en iPhone** y navegadores **Android**.
Funciona sin conexión una vez instalada.

Basado en [gemuboi.js](https://github.com/danwsong/gemuboi-js) de Daniel Song.

## Funciones

- 📱 **PWA instalable**: pantalla completa, icono propio, funciona offline (service worker).
- 🎮 **Gamepad táctil multitáctil** con cruceta de 8 direcciones, A, B, Start, Select, Turbo y Menú.
  - **Editor de controles**: mueve cada botón arrastrándolo, cambia su **tamaño** (deslizador o pellizcando)
    y su **transparencia**; opacidad general; mostrar/ocultar botones. Diseños independientes para
    vertical y horizontal.
  - Vibración al pulsar (Android; háptica en iOS 18+).
- 🎨 **Paletas de color** para juegos de Game Boy original: 18 predefinidas (DMG verde, Pocket, Light,
  paletas de arranque de GBC…) y una **personalizada** con selector de color. Vista previa en vivo.
- 💾 **Guardado en tiempo real**:
  - La partida del cartucho (SRAM + reloj RTC) se guarda automáticamente cada segundo que cambia y al
    salir/cerrar la app.
  - **Autoguardado de estado**: al volver a abrir la app continúas exactamente donde lo dejaste
    (importante en iOS, que cierra las PWA en segundo plano).
  - 4 ranuras de **estados guardados** con miniatura.
  - Exportar / importar partidas `.sav`.
- 🗄️ **localStorage**: se guardan los ajustes del usuario y los **ROMs** (comprimidos con gzip). Si un
  ROM no cabe en la cuota de localStorage, se guarda automáticamente en IndexedDB.
- 📚 Biblioteca de ROMs guardados; carga de `.gb`, `.gbc` y `.zip`.
- ⏩ Turbo (2×–8×, mantener o alternar), teclado y mandos Bluetooth/USB.
- 🖥️ Escalado ajustado o entero (píxeles perfectos), efecto LCD, suavizado, contador de FPS.

## Usar en el móvil

1. Abre la web publicada (GitHub Pages) en **Safari** (iPhone) o **Chrome** (Android).
2. **iPhone**: Compartir → «Añadir a pantalla de inicio». **Android**: menú ⋮ → «Instalar aplicación».
3. Abre la app, pulsa **Cargar ROM** y elige tu archivo `.gb`/`.gbc`/`.zip`.

## Publicación en GitHub Pages

El flujo `.github/workflows/pages.yml` publica el sitio automáticamente en cada push a `master`.
Solo hay que activarlo una vez: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
La app quedará en `https://<usuario>.github.io/gemuboy-js/`.

## Desarrollo local

```sh
npx http-server -c-1 .
# abre http://localhost:8080
```

## Teclado

| Botón | Tecla |
| --- | --- |
| Cruceta | Flechas / WASD |
| A | X / K |
| B | Z / J |
| Start | Enter |
| Select | Shift / Retroceso |
| Turbo | Espacio |
| Menú | Esc |
| Guardar / cargar estado 1 | F2 / F4 |
