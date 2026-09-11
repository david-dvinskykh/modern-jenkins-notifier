#!/bin/bash
#
# Packages the extension for both stores. Each browser gets the manifest that
# was written for it: patching the Chrome manifest with sed used to leave
# invalid JSON behind and produced an xpi Firefox could not install.
set -euo pipefail

rm -rf dist
mkdir -p dist/chrome dist/firefox

SHARED=(css fonts img js LICENSE options.html popup.html)

cp -r "${SHARED[@]}" dist/chrome
cp manifest.json dist/chrome/manifest.json

cp -r "${SHARED[@]}" dist/firefox
cp manifest_firefox.json dist/firefox/manifest.json

for target in chrome firefox; do
  python3 -c "import json,sys; json.load(open('dist/$target/manifest.json'))" \
    || { echo "dist/$target/manifest.json is not valid JSON" >&2; exit 1; }
done

(cd dist/chrome && zip -qr ../chrome.zip .)
(cd dist/firefox && zip -qr ../firefox.xpi .)

echo "Built dist/chrome.zip and dist/firefox.xpi"
