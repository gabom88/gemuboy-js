# SameBoy boot ROMs

Open-source boot ROMs from [SameBoy](https://github.com/LIJI32/SameBoy) (`BootROMs/`, Expat license),
assembled with [RGBDS](https://github.com/gbdev/rgbds) using `make bootroms` at the commit in
`../SAMEBOY_COMMIT`. They are embedded into `js/sameboy/sameboy.wasm` by `wasm/build.sh`.

**Custom logo:** the Game Boy Color boot ROMs (`cgb_boot.bin`, `cgb0_boot.bin`, `agb_boot.bin`) show
«GAME BOY» instead of «SAMEBOY». They are built from [`GameBoyLogo.png`](GameBoyLogo.png) (128×24,
3 shades) and [`cgb_logo.patch`](cgb_logo.patch), which drops SameBoy's trick of reusing the tiles
shared by the E and B of its own logo, so any 48-tile logo works. The color-sweep animation is
unchanged. To rebuild them in a SameBoy checkout:

```sh
git apply /path/to/wasm/bootroms/cgb_logo.patch
cp /path/to/wasm/bootroms/GameBoyLogo.png BootROMs/SameBoyLogo.png
make bootroms RGBGFX_FLAGS="-Z -c embedded"   # no -u: keep all 48 tiles in column order
```

The compressed logo must stay small enough for the boot ROM to fit in 2304 bytes (the assembler
fails with "BootROM overflowed" otherwise).
