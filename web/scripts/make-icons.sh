#!/bin/sh
# Rasterises the app icon with ImageMagick (run once; the PNGs are committed).
set -e
cd "$(dirname "$0")/../public/icons"
for size in 192 512; do magick -background none -density 384 icon.svg -resize "${size}x${size}" "icon-${size}.png"; done
magick -background none -density 384 icon.svg -resize 180x180 apple-touch-icon.png
