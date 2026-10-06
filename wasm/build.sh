#!/usr/bin/env bash
# Builds SameBoy's core as WebAssembly for GemuBoy: js/sameboy/sameboy.{js,wasm}.
# Requirements: Emscripten (emcc) on PATH. Boot ROMs are prebuilt in wasm/bootroms
# (assembled from SameBoy's open-source sources with rgbds; see README in that folder).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SAMEBOY_REPO="${SAMEBOY_REPO:-https://github.com/LIJI32/SameBoy.git}"
SAMEBOY_REF="${SAMEBOY_REF:-$(cat "$ROOT/wasm/SAMEBOY_COMMIT")}"
WORK="${WORK:-$ROOT/wasm/.build}"

mkdir -p "$WORK"
if [ ! -d "$WORK/SameBoy/.git" ]; then
    git clone --quiet "$SAMEBOY_REPO" "$WORK/SameBoy"
fi
git -C "$WORK/SameBoy" fetch --quiet origin "$SAMEBOY_REF" 2>/dev/null || true
git -C "$WORK/SameBoy" checkout --quiet "$SAMEBOY_REF"
VERSION="$(sed -n 's/^VERSION := //p' "$WORK/SameBoy/version.mk")"

# Boot ROMs -> C arrays
python3 - "$ROOT/wasm/bootroms" "$WORK/bootroms.h" <<'PY'
import sys, pathlib
src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
lines = ["// Generated from wasm/bootroms by wasm/build.sh", "#include <stdint.h>"]
for name in ["dmg_boot", "mgb_boot", "sgb_boot", "sgb2_boot", "cgb0_boot", "cgb_boot", "agb_boot"]:
    data = (src / f"{name}.bin").read_bytes()
    body = ",".join(str(b) for b in data)
    lines.append(f"static const uint8_t {name}[{len(data)}] = {{{body}}};")
out.write_text("\n".join(lines) + "\n")
PY

CORE=$(ls "$WORK"/SameBoy/Core/*.c | grep -v -E '/(debugger|sm83_disassembler|symbol_hash|cheats|cheat_search|rewind)\.c$')
DEFS="-DGB_INTERNAL -DGB_DISABLE_DEBUGGER -DGB_DISABLE_CHEATS -DGB_DISABLE_CHEAT_SEARCH -DGB_DISABLE_REWIND -D_GNU_SOURCE -DGB_VERSION=\"$VERSION\" -DGB_COPYRIGHT_YEAR=\"2026\""

mkdir -p "$ROOT/js/sameboy"
# shellcheck disable=SC2086
emcc -O3 -std=gnu11 $DEFS \
    -I"$WORK/SameBoy/Core" -I"$WORK" \
    -Wno-everything \
    $CORE "$ROOT/wasm/sameboy_glue.c" \
    -o "$ROOT/js/sameboy/sameboy.js" \
    -sMODULARIZE=1 -sEXPORT_NAME=createSameBoy -sENVIRONMENT=web \
    -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0 \
    -sEXPORTED_FUNCTIONS=_malloc,_free \
    -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU32,HEAPF32

echo "Built SameBoy $VERSION ($SAMEBOY_REF):"
ls -la "$ROOT/js/sameboy"
