#!/usr/bin/env bash
# High-speed offline thumbnail generator for QuickSwitcher
set -euo pipefail

THUMB_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/quickswitcher-thumbs"
mkdir -p "$THUMB_DIR"

CONFIG_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/QuickSwitcher/custom_folders.json"

DIRS=(
    "$HOME/Pictures/wallpapers"
    "$HOME/Pictures/Wallpapers"
    "$HOME/Pictures/Wallpapers/Dynamic-Wallpapers"
    "$HOME/dotfiles/wallpapers"
    "$HOME/.config/wallpapers"
)

if [ -f "$CONFIG_FILE" ] && command -v jq >/dev/null 2>&1; then
    while IFS= read -r cdir; do
        [ -n "$cdir" ] && DIRS+=("$cdir")
    done < <(jq -r '.[]' "$CONFIG_FILE" 2>/dev/null || true)
fi

export MAGICK_MEMORY_LIMIT="256MiB"
export MAGICK_MAP_LIMIT="512MiB"
export MAGICK_DISK_LIMIT="1GiB"

count=0
for dir in "${DIRS[@]}"; do
    [ -d "$dir" ] || continue
    while IFS= read -r -d '' f; do
        ext="${f##*.}"
        hash=$(echo -n "$(realpath "$f")" | md5sum | cut -d' ' -f1)
        thumb="$THUMB_DIR/${hash}.jpg"
        [ -s "$thumb" ] && continue
        rm -f "$thumb" 2>/dev/null || true

        case "${ext,,}" in
            mp4|webm)
                if ffmpeg -threads 2 -y -ss 2 -i "$f" -vframes 1 \
                    -vf "scale=260:-1" \
                    -q:v 4 "$thumb" 2>/dev/null; then
                    count=$((count+1))
                    echo "✓ $(basename "$f")"
                fi
                ;;
            jpg|jpeg|png|webp)
                if magick -limit memory 256MiB -limit map 512MiB "$f" -thumbnail "260x>" \
                    -quality 80 "$thumb" 2>/dev/null; then
                    count=$((count+1))
                    echo "✓ $(basename "$f")"
                fi
                ;;
        esac
    done < <(find -L "$dir" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.mp4" -o -iname "*.webm" \) -print0)
done

echo "Done — $count new thumbnails generated"
echo "Total: $(ls "$THUMB_DIR" | wc -l) thumbs cached in $THUMB_DIR"
