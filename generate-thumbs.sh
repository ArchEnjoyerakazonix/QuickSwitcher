#!/usr/bin/env bash
# thumbnail generator
set -euo pipefail

THUMB_DIR="$HOME/.cache/wallpaper_hub_thumbs"
mkdir -p "$THUMB_DIR"

DIRS=(
    "$HOME/Pictures/wallpapers"
    "$HOME/Pictures/Wallpapers"
    "$HOME/dotfiles/wallpapers"
    "$HOME/.config/wallpapers"
)

count=0
for dir in "${DIRS[@]}"; do
    [ -d "$dir" ] || continue
    while IFS= read -r -d '' f; do
        ext="${f##*.}"
        hash=$(echo -n "$f" | md5sum | cut -d' ' -f1)
        thumb="$THUMB_DIR/${hash}.jpg"
        [ -f "$thumb" ] && continue

        case "${ext,,}" in
            mp4|webm)
                ffmpeg -y -ss 2 -i "$f" -vframes 1 \
                    -vf "scale=160:260:force_original_aspect_ratio=increase,crop=160:260" \
                    -q:v 4 "$thumb" 2>/dev/null && count=$((count+1))
                ;;
            jpg|jpeg|png|webp)
                magick "$f" -thumbnail "160x260^" -gravity center \
                    -extent 160x260 -quality 80 "$thumb" 2>/dev/null && count=$((count+1))
                ;;
        esac
        echo "✓ $(basename "$f")"
    done < <(find "$dir" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" -o -iname "*.mp4" -o -iname "*.webm" \) -print0)
done

echo "Done — $count new thumbnails generated"
echo "Total: $(ls "$THUMB_DIR" | wc -l) thumbs cached"
