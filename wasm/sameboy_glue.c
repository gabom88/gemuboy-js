// Thin WebAssembly interface between SameBoy's core and GBoy-JS (js/engines.js).
// Everything the page needs goes through these exported sb_* functions.
#include <emscripten.h>
#include <stdlib.h>
#include <string.h>
#include "gb.h"
#include "bootroms.h"

#define MAX_W 256
#define MAX_H 224
#define AUDIO_CAP 32768 /* stereo frames buffered between two drains */

static GB_gameboy_t *gb;
static uint32_t pixels[MAX_W * MAX_H];
static float audio[AUDIO_CAP * 2];
static int audio_len;
static int frame_done;
static double rumble;

// Pixels are written as little-endian RGBA, ready for an ImageData buffer.
static uint32_t rgb_encode(GB_gameboy_t *g, uint8_t r, uint8_t gr, uint8_t b) {
    return 0xFF000000u | ((uint32_t)b << 16) | ((uint32_t)gr << 8) | r;
}

static void vblank(GB_gameboy_t *g, GB_vblank_type_t type) {
    frame_done = 1;
}

static void sample(GB_gameboy_t *g, GB_sample_t *s) {
    if (audio_len < AUDIO_CAP) {
        audio[audio_len * 2] = s->left / 32768.0f;
        audio[audio_len * 2 + 1] = s->right / 32768.0f;
        audio_len++;
    }
}

static void rumble_cb(GB_gameboy_t *g, double amplitude) {
    rumble = amplitude;
}

// SameBoy's own open-source boot ROMs, embedded at build time.
static void boot_rom_load(GB_gameboy_t *g, GB_boot_rom_t type) {
    switch (type) {
        case GB_BOOT_ROM_DMG_0:
        case GB_BOOT_ROM_DMG: GB_load_boot_rom_from_buffer(g, dmg_boot, sizeof(dmg_boot)); break;
        case GB_BOOT_ROM_MGB: GB_load_boot_rom_from_buffer(g, mgb_boot, sizeof(mgb_boot)); break;
        case GB_BOOT_ROM_SGB: GB_load_boot_rom_from_buffer(g, sgb_boot, sizeof(sgb_boot)); break;
        case GB_BOOT_ROM_SGB2: GB_load_boot_rom_from_buffer(g, sgb2_boot, sizeof(sgb2_boot)); break;
        case GB_BOOT_ROM_CGB_0: GB_load_boot_rom_from_buffer(g, cgb0_boot, sizeof(cgb0_boot)); break;
        case GB_BOOT_ROM_AGB_0:
        case GB_BOOT_ROM_AGB: GB_load_boot_rom_from_buffer(g, agb_boot, sizeof(agb_boot)); break;
        default: GB_load_boot_rom_from_buffer(g, cgb_boot, sizeof(cgb_boot)); break;
    }
}

// Creates a fresh emulated console. model: 0 = original Game Boy, 1 = Game Boy
// Color, 2 = Super Game Boy 2 (with its border and colors).
EMSCRIPTEN_KEEPALIVE int sb_init(int model, int sample_rate) {
    if (gb) {
        GB_free(gb);
        GB_dealloc(gb);
    }
    gb = GB_init(GB_alloc(), model == 1 ? GB_MODEL_CGB_E : model == 2 ? GB_MODEL_SGB2 : GB_MODEL_DMG_B);
    GB_set_boot_rom_load_callback(gb, boot_rom_load);
    GB_set_rgb_encode_callback(gb, rgb_encode);
    GB_set_vblank_callback(gb, vblank);
    GB_set_pixels_output(gb, pixels);
    GB_apu_set_sample_callback(gb, sample);
    GB_set_sample_rate(gb, sample_rate);
    GB_set_highpass_filter_mode(gb, GB_HIGHPASS_ACCURATE);
    GB_set_rtc_mode(gb, GB_RTC_MODE_SYNC_TO_HOST);
    GB_set_rumble_mode(gb, GB_RUMBLE_CARTRIDGE_ONLY);
    GB_set_rumble_callback(gb, rumble_cb);
    GB_set_color_correction_mode(gb, GB_COLOR_CORRECTION_MODERN_BALANCED);
    GB_set_border_mode(gb, model == 2 ? GB_BORDER_SGB : GB_BORDER_NEVER);
    GB_set_cheats_enabled(gb, true);
    audio_len = 0;
    rumble = 0;
    return 1;
}

EMSCRIPTEN_KEEPALIVE void sb_load_rom(const uint8_t *data, int size) {
    GB_load_rom_from_buffer(gb, data, size);
    GB_reset(gb);
}

EMSCRIPTEN_KEEPALIVE void sb_reset(void) {
    GB_reset(gb);
}

// Runs the emulator until the next frame is ready.
EMSCRIPTEN_KEEPALIVE void sb_run_frame(void) {
    frame_done = 0;
    for (int guard = 0; !frame_done && guard < 4; guard++) {
        GB_run_frame(gb);
    }
}

EMSCRIPTEN_KEEPALIVE void sb_set_keys(int mask) {
    GB_set_key_mask(gb, (GB_key_mask_t)mask);
}

EMSCRIPTEN_KEEPALIVE uint32_t *sb_pixels(void) { return pixels; }
EMSCRIPTEN_KEEPALIVE int sb_width(void) { return GB_get_screen_width(gb); }
EMSCRIPTEN_KEEPALIVE int sb_height(void) { return GB_get_screen_height(gb); }
EMSCRIPTEN_KEEPALIVE int sb_is_cgb(void) { return GB_is_cgb(gb); }

EMSCRIPTEN_KEEPALIVE float *sb_audio(void) { return audio; }
EMSCRIPTEN_KEEPALIVE int sb_audio_len(void) { return audio_len; }
EMSCRIPTEN_KEEPALIVE void sb_audio_clear(void) { audio_len = 0; }

EMSCRIPTEN_KEEPALIVE double sb_rumble(void) { return rumble; }

// Battery save (cartridge RAM + real time clock, standard .sav layout).
EMSCRIPTEN_KEEPALIVE int sb_battery_size(void) { return GB_save_battery_size(gb); }
EMSCRIPTEN_KEEPALIVE int sb_save_battery(uint8_t *buffer, int size) { return GB_save_battery_to_buffer(gb, buffer, size); }
EMSCRIPTEN_KEEPALIVE void sb_load_battery(const uint8_t *buffer, int size) { GB_load_battery_from_buffer(gb, buffer, size); }

// Save states (BESS-compatible).
EMSCRIPTEN_KEEPALIVE int sb_state_size(void) { return (int)GB_get_save_state_size(gb); }
EMSCRIPTEN_KEEPALIVE void sb_save_state(uint8_t *buffer) { GB_save_state_to_buffer(gb, buffer); }
EMSCRIPTEN_KEEPALIVE int sb_load_state(const uint8_t *buffer, int size) { return GB_load_state_from_buffer(gb, buffer, size); }

// Palette for original Game Boy games: 4 shades, darkest first, as 12 bytes RGB.
static GB_palette_t palette;
EMSCRIPTEN_KEEPALIVE void sb_set_palette(const uint8_t *rgb) {
    for (int i = 0; i < 4; i++) {
        palette.colors[i].r = rgb[i * 3];
        palette.colors[i].g = rgb[i * 3 + 1];
        palette.colors[i].b = rgb[i * 3 + 2];
    }
    palette.colors[4] = palette.colors[3]; /* screen colour while the LCD is off */
    GB_set_palette(gb, &palette);
}

// Rewind: SameBoy keeps compressed snapshots of the last seconds of play.
EMSCRIPTEN_KEEPALIVE void sb_set_rewind(double seconds) { GB_set_rewind_length(gb, seconds); }

// Steps one frame back in time and draws it. Returns 0 when there is no more history.
EMSCRIPTEN_KEEPALIVE int sb_rewind_frame(void) {
    GB_rewind_pop(gb);
    int more = GB_rewind_pop(gb);
    sb_run_frame(); /* draws the frame (and records it again) */
    audio_len = 0;
    return more;
}

// Cheats: Game Genie (ABC-DEF-GHI) and GameShark (01VVAAAA) codes.
EMSCRIPTEN_KEEPALIVE int sb_cheat_add(const char *code) { return GB_import_cheat(gb, code, "", true) != NULL; }
EMSCRIPTEN_KEEPALIVE void sb_cheats_clear(void) { GB_remove_all_cheats(gb); }
