#!/usr/bin/env bash
# Render media/logo.svg to PNG at requested dimension (default: 256x256).
#
# Usage:
#   ./scripts/render-logo.sh [dimension] [output_path]
#
# Examples:
#   ./scripts/render-logo.sh           # writes media/logo.png at 256x256
#   ./scripts/render-logo.sh 64        # writes media/logo-64.png
#   ./scripts/render-logo.sh 32 /path/to/icon-32.png
#
# Uses rsvg-convert, ImageMagick (magick), or macOS sips.

set -euo pipefail

SIZE="${1:-256}"
DEFAULT_OUTPUT="media/logo.png"
if [ "$SIZE" != "256" ]; then
  DEFAULT_OUTPUT="media/logo-${SIZE}.png"
fi
OUTPUT="${2:-$DEFAULT_OUTPUT}"
INPUT="media/logo.svg"

cd "$(git rev-parse --show-toplevel)"

if [ ! -f "$INPUT" ]; then
  echo "error: input SVG not found: $INPUT" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w "$SIZE" -h "$SIZE" "$INPUT" -o "$OUTPUT"
elif command -v magick >/dev/null 2>&1; then
  magick -background none -density "$(( SIZE * 4 ))" "$INPUT" -resize "${SIZE}x${SIZE}" "$OUTPUT"
elif command -v sips >/dev/null 2>&1; then
  sips -s format png "$INPUT" --out "$OUTPUT" >/dev/null 2>&1
  sips -z "$SIZE" "$SIZE" "$OUTPUT" >/dev/null 2>&1
else
  echo "error: no suitable rasterizer found (need rsvg-convert, magick, or sips)" >&2
  exit 1
fi

echo "Rendered $OUTPUT (${SIZE}x${SIZE})"
