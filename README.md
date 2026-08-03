# ⚡ QuickSwitcher

A lightweight, GPU-accelerated wallpaper picker designed specifically for **Arch Linux** & **Hyprland**. Built with Electron, Catppuccin Mocha styling, and instant thumbnail caching.

![QuickSwitcher Logo](icon.png)

---

## ✨ Features

- 🚀 **Instant Launch**: Bottom-docked floating strip that opens & closes without lag.
- 🎴 **Interactive Slices**: 3D perspective cards for static wallpapers (`.png`, `.jpg`, `.webp`) and dynamic videos (`.mp4`, `.webm`).
- ⚡ **GPU Acceleration**: Hardware-accelerated canvas rasterization (`CanvasOopRasterization`, `zero-copy`).
- 🎨 **Catppuccin Mocha Palette**: Seamless blend with modern Hyprland rices.
- 🗑️ **Quick Delete**: Right-click context menu to safely delete unwanted wallpapers & cached thumbnails.
- 🔍 **Multi-Directory Scanning**: Scans `~/Pictures/wallpapers`, `~/dotfiles/wallpapers`, `~/.config/wallpapers`, etc.

---

## ⌨️ Controls & Keybindings

| Input | Action |
|---|---|
| `Click` | Apply wallpaper & close QuickSwitcher |
| `Right Click` | Open delete confirmation dialog |
| `Mouse Wheel` | Fast horizontal scroll |
| `←` / `→` | Step scroll left / right |
| `Escape` | Close QuickSwitcher |

---

## 🛠️ Installation & Setup

### 1. Dependencies

Ensure you have `electron`, `ffmpeg`, `imagemagick`, and `hyprland` installed:

```bash
sudo pacman -S electron ffmpeg imagemagick hyprland
```

### 2. Clone & Install

```bash
git clone https://github.com/ArchEnjoyerakazonix/QuickSwitcher.git ~/.config/quickswitcher
cd ~/.config/quickswitcher
npm install
```

### 3. Hyprland Integration

Add keybindings to your Hyprland configuration (`~/.config/hypr/hyprland.conf` or `custom/keybinds.lua`):

```lua
-- Launch QuickSwitcher
bind = CTRL SUPER, W, exec, ~/.config/quickswitcher/node_modules/.bin/electron --no-sandbox ~/.config/quickswitcher
```

Optional window rules for smooth bottom placement:

```lua
windowrulev2 = float, title:^(QuickSwitcher)$
windowrulev2 = pin, title:^(QuickSwitcher)$
windowrulev2 = move 0 790, title:^(QuickSwitcher)$
```

---

## ⚡ Thumbnail Generator

Pre-generate video and image thumbnails for zero-delay loading:

```bash
chmod +x generate-thumbs.sh
./generate-thumbs.sh
```

---

## 📄 License

MIT
