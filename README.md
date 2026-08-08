# ⚡ QuickSwitcher

A lightweight, GPU-accelerated wallpaper picker designed for **Arch Linux**, **Hyprland**, **KDE**, **GNOME**, **Windows**, and **macOS**. Built with Electron, Catppuccin Mocha styling, non-blocking async thumbnailing, and instant searching.

![QuickSwitcher Logo](assets/icon.png)

---

## ✨ Features

- 🚀 **Instant Launch**: Bottom-docked floating strip that opens & closes without lag.
- 🎴 **Interactive Slices**: 3D perspective cards for static wallpapers (`.png`, `.jpg`, `.webp`, `.gif`) and dynamic videos (`.mp4`, `.webm`).
- ⚡ **Non-blocking Async Thumbnailing**: Progressive loading powered by Electron `nativeImage` and background `ffmpeg`.
- 🔒 **Enterprise Security**: Context isolation, sandboxed IPC, and path traversal protection.
- 🌐 **Universal Cross-Platform**: Native support for ArchEclipse (`set-wallpaper.sh`), vanilla Hyprland, SWWW, Hyprpaper, MPVPaper, GNOME (`gsettings`), KDE Plasma (`plasma-apply-wallpaperimage`), Windows (`user32.dll`), and macOS (`AppleScript`).
- 🗑️ **Quick Delete & Favorites**: Star your top wallpapers and right-click to delete unwanted files & cached thumbnails.
- ⌨️ **Full Keyboard & Mouse Controls**: Seamless navigation with `hjkl` or arrow keys, `/` to search, `Enter` to apply.

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

Pre-generate video and image thumbnails for instant caching:

```bash
chmod +x scripts/generate-thumbs.sh
./scripts/generate-thumbs.sh
```

---

## 📄 License

MIT
