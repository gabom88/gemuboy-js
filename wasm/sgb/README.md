# Super Game Boy graphics

SameBoy's built-in Super Game Boy border and boot animation say «Super SameBoy (2)».
These two files replace SameBoy's `Core/graphics/sgb_border.inc` and
`Core/graphics/sgb_animation_logo.inc` (copied by `wasm/build.sh` before compiling) with the
same artwork saying «Super Game Boy (2)»:

- the «G» is drawn from the «O» of the same font, and «GAME BOY» is re-spaced and centered;
- the border keeps SameBoy's palette and tile format (SNES 4bpp tiles + tilemap); only the tiles
  of the logo rows (tile rows 25–27) change.

SameBoy © Lior Halphon, Expat license.
