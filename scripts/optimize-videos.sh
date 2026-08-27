#!/usr/bin/env bash

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="${1:-"$project_root/media-source"}"
output_dir="${2:-"$project_root/public/site/media"}"
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/swisscompact-videos.XXXXXX")"
desktop_temporary_dir="$temporary_dir/desktop"
mobile_temporary_dir="$temporary_dir/mobile"

cleanup() {
  find "$temporary_dir" -type f -delete
  rmdir "$desktop_temporary_dir" "$mobile_temporary_dir" 2>/dev/null || true
  rmdir "$temporary_dir"
}
trap cleanup EXIT

if [[ ! -d "$source_dir" ]]; then
  echo "Video source directory not found: $source_dir" >&2
  exit 1
fi

shopt -s nullglob
inputs=("$source_dir"/*.mp4)
if (( ${#inputs[@]} == 0 )); then
  echo "No MP4 files found in: $source_dir" >&2
  exit 1
fi

mkdir -p "$desktop_temporary_dir" "$mobile_temporary_dir"
mkdir -p "$output_dir" "$output_dir/mobile"

for input in "${inputs[@]}"; do
  filename="$(basename "$input")"
  desktop_output="$desktop_temporary_dir/$filename"
  mobile_output="$mobile_temporary_dir/$filename"
  echo "Optimizing desktop $filename"
  ffmpeg \
    -hide_banner \
    -loglevel error \
    -y \
    -i "$input" \
    -map 0:v:0 \
    -an \
    -sn \
    -dn \
    -vf "scale='min(1440,iw)':-2:flags=lanczos" \
    -c:v libx264 \
    -preset medium \
    -crf 23 \
    -maxrate 7M \
    -bufsize 10M \
    -pix_fmt yuv420p \
    -profile:v high \
    -level:v 4.1 \
    -g 12 \
    -keyint_min 12 \
    -sc_threshold 0 \
    -movflags +faststart \
    "$desktop_output"
  echo "Optimizing mobile $filename"
  ffmpeg \
    -hide_banner \
    -loglevel error \
    -y \
    -i "$input" \
    -map 0:v:0 \
    -an \
    -sn \
    -dn \
    -vf "scale='min(960,iw)':-2:flags=lanczos" \
    -c:v libx264 \
    -preset medium \
    -crf 24 \
    -maxrate 4M \
    -bufsize 6M \
    -pix_fmt yuv420p \
    -profile:v high \
    -level:v 4.0 \
    -g 12 \
    -keyint_min 12 \
    -sc_threshold 0 \
    -movflags +faststart \
    "$mobile_output"
done

for optimized in "$desktop_temporary_dir"/*.mp4; do
  mv "$optimized" "$output_dir/$(basename "$optimized")"
done
for optimized in "$mobile_temporary_dir"/*.mp4; do
  mv "$optimized" "$output_dir/mobile/$(basename "$optimized")"
done

echo "Optimized ${#inputs[@]} desktop and mobile videos into $output_dir"
