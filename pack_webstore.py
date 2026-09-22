"""Build the Chrome Web Store ZIP with manifest.json at the archive root."""

from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "extension"
OUTPUT = ROOT / "CallMeOut-WebStore.zip"
FILES = (
    "manifest.json",
    "background.js",
    "content.js",
    "pump_bridge.js",
    "panel.css",
    "options.html",
    "options.css",
    "options.js",
    "images/callmeout.png",
    "images/icon16.png",
    "images/icon32.png",
    "images/icon48.png",
    "images/icon128.png",
)


with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as archive:
    for name in FILES:
        archive.write(SOURCE / name, name)

print(OUTPUT)
