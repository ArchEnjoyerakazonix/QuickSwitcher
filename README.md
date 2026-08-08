# ⚡ QuickSwitcher (v1.1.2)

> A hyper-minimalist, GPU-accelerated wallpaper switcher built for Linux ricing enthusiasts & cross-platform desktops. Seamlessly integrated with Hyprland, X11, KDE, GNOME, Windows, and macOS.

**Why Electron?** Instant startup isn't the goal — instant *switching* is.
The window is a transient overlay (single-instance lock, ~300px strip);
the heavy lifting (scan, thumbnails, daemon calls) is fully async.

## ✨ Features

- 🚀 **Instant Launch**: Bottom-docked floating strip that opens & closes without lag.
- 🎴 **Interactive Slices**: 3D perspective cards for static wallpapers (`.png`, `.jpg`, `.webp`, `.gif`) and dynamic videos (`.mp4`, `.webm` on Linux via `mpvpaper`).
- ⚡ **Bounded Async Thumbnailing**: Progressive video frame extraction with max-concurrency bounds.
- 🔒 **Enterprise Security**: Context isolation, sandboxed IPC, sender validation, path traversal protection, and safe symlink entry deletion (preserving original target files).
- 🌐 **Universal Cross-Platform**: Native support for ArchEclipse (`set-wallpaper.sh`), vanilla Hyprland, SWWW, Hyprpaper, MPVPaper, GNOME (`gsettings`), KDE Plasma (`plasma-apply-wallpaperimage`), XFCE (`xfconf-query`), Windows (`SystemParametersInfoW`), and macOS (`AppleScript`).
- 🗑️ **Quick Delete & Favorites**: Star your top wallpapers and right-click to delete unwanted files & cached thumbnails.
- ⌨️ **Keyboard & Mouse Controls**: Navigation with `h`/`l` or arrow keys, `/` to search, `Enter` to apply.

---

## ⌨️ Controls & Keybindings

| Input | Action |
|---|---|
| `Click` / `Enter` | Apply wallpaper & close QuickSwitcher |
| `Right Click` | Open delete confirmation dialog |
| `h` / `l` or `←` / `→` | Keyboard focus navigation |
| `/` | Focus search bar |
| `Escape` | Close QuickSwitcher |
| `Mouse Wheel` | Fast horizontal scroll |

---

## 🛠️ Installation & Setup

### 1. Dependencies

Ensure you have Node.js and Electron installed:

```bash
sudo pacman -S electron ffmpeg hyprland
```

### 2. Clone & Install

```bash
git clone https://github.com/ArchEnjoyerakazonix/QuickSwitcher.git ~/.config/quickswitcher
cd ~/.config/quickswitcher
npm ci
```

### 3. Hyprland Integration

Add keybindings and window rules to your Hyprland configuration (`~/.config/hypr/hyprland.conf`):

```ini
# Launch QuickSwitcher
bind = CTRL SUPER, W, exec, npx electron ~/.config/quickswitcher

# Window Rules
windowrulev2 = float, title:^(QuickSwitcher)$
windowrulev2 = pin, title:^(QuickSwitcher)$
windowrulev2 = move 0 100%-300, title:^(QuickSwitcher)$
```

---

## ⚡ Optional Thumbnail Generator

Pre-generate video and image thumbnails for instant caching (Linux):

```bash
chmod +x scripts/generate-thumbs.sh
./scripts/generate-thumbs.sh
```

---

## 📄 License

MIT
