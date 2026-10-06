# SameBoy boot ROMs

Open-source boot ROMs from [SameBoy](https://github.com/LIJI32/SameBoy) (`BootROMs/`, Expat license),
assembled with [RGBDS](https://github.com/gbdev/rgbds) using `make bootroms` at the commit in
`../SAMEBOY_COMMIT`. They are embedded into `js/sameboy/sameboy.wasm` by `wasm/build.sh`.

**Custom logo:** the Game Boy Color boot ROMs (`cgb_boot.bin`, `cgb0_boot.bin`, `agb_boot.bin`) are
built with [`GameBoyLogo.png`](GameBoyLogo.png) in place of SameBoy's `BootROMs/SameBoyLogo.png`, so the
intro reads «GAMEBOY» instead of «SAMEBOY». Only the first letter is redrawn (S → G), keeping the
same tile layout, so the original color-sweep animation is unchanged. To rebuild them, copy the PNG
over `BootROMs/SameBoyLogo.png` in a SameBoy checkout and run `make bootroms`.
