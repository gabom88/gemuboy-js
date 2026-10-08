#!/usr/bin/env bash
# Builds the static site into _site/ (used by the Firebase Hosting workflows).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site
cp -r index.html manifest.webmanifest sw.js css js img static _site/
# List every .txt in static/txt so the app shows them in "Listas TXT".
python3 -c "import json, pathlib; print(json.dumps(sorted(p.name for p in pathlib.Path('static/txt').glob('*.txt'))))" > _site/static/txt/index.json
# Each deploy gets a new service worker cache version.
version="${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || date +%s)}"
sed -i "s/const VERSION = 'dev';/const VERSION = '${version:0:8}';/" _site/sw.js
echo "Site built in _site/ (version ${version:0:8})"
