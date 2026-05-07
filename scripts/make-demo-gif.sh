#!/usr/bin/env bash
# Convert docs/demo.mov to docs/demo.gif using ffmpeg + gifski.
#
# Why this script exists: the first attempt at a v0.1.0 demo GIF was
# rediscovered live during release. Pinning the recipe here means the next
# demo refresh is one command.
#
# Tunables (override via env vars):
#   FPS=12        Frames per second for the output GIF.
#   WIDTH=900     Output width in pixels (height is derived to preserve aspect).
#   QUALITY=80    gifski quality, 1-100.
#   INPUT=docs/demo.mov
#   OUTPUT=docs/demo.gif
#
# Requires: ffmpeg, gifski (both available via Homebrew).

set -euo pipefail

FPS="${FPS:-12}"
WIDTH="${WIDTH:-900}"
QUALITY="${QUALITY:-80}"
INPUT="${INPUT:-docs/demo.mov}"
OUTPUT="${OUTPUT:-docs/demo.gif}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "error: ffmpeg not found. Install with: brew install ffmpeg" >&2
  exit 1
fi
if ! command -v gifski >/dev/null 2>&1; then
  echo "error: gifski not found. Install with: brew install gifski" >&2
  exit 1
fi

# Repo root, so paths work regardless of where the script is invoked from.
cd "$(git rev-parse --show-toplevel)"

if [ ! -f "$INPUT" ]; then
  echo "error: input file not found: $INPUT" >&2
  exit 1
fi

TMPDIR="$(mktemp -d -t markdown-loom-gif.XXXXXX)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Extracting frames from $INPUT (fps=$FPS, width=$WIDTH)..."
ffmpeg -y -loglevel error -i "$INPUT" \
  -vf "fps=${FPS},scale=${WIDTH}:-2:flags=lanczos" \
  "$TMPDIR/frame_%05d.png"

echo "Encoding GIF to $OUTPUT (quality=$QUALITY)..."
gifski --fps "$FPS" --width "$WIDTH" --quality "$QUALITY" \
  -o "$OUTPUT" "$TMPDIR"/frame_*.png

SIZE_BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')
SIZE_KB=$(( SIZE_BYTES / 1024 ))
echo "Wrote $OUTPUT (${SIZE_KB} KB)"

if [ "$SIZE_KB" -gt 1024 ]; then
  echo "warning: $OUTPUT is larger than 1 MB. GitHub may not inline it well." >&2
  echo "         Try lowering WIDTH or FPS, or trimming the source MOV." >&2
fi
