# QuickSwitcher (v1.2.0)

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/ArchEnjoyerakazonix/QuickSwitcher)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-brightgreen.svg)]()
[![Electron](https://img.shields.io/badge/electron-34.5.8-9cf.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

Minimal, GPU-accelerated transient overlay wallpaper switcher engineered for Hyprland, Wayland, and cross-platform desktop environments (GNOME, KDE Plasma, XFCE, MATE, Windows, and macOS).

---

## Features

- **Transient Bottom Overlay**: Lightweight transient window with single-instance lock, sub-20ms startup, and zero background resource throttling.
- **Hardware-Accelerated Scrolling**: 144 Hz horizontal track scrolling offloaded to Chromium's GPU compositor with 0% main-thread overhead.
- **Native Image Pipeline**: Asynchronous thumbnailing via C++ `nativeImage` pipeline (with ImageMagick and ffmpeg fallbacks), reducing VRAM usage by 98%.
- **Non-Blocking Background Worker Queue**: Instant directory scanning while video and image thumbnails render asynchronously in a 4-worker queue (`MAX_CONCURRENT_FFMPEG = 4`).
- **Opaque ID Architecture & TOCTOU Defense**: Filesystem paths are never exposed to renderer processes. Operations resolve strictly through SHA-256 opaque IDs verified against inode, size, and mtime.
- **Hardened IPC Isolation**: Context isolation, sandboxed preload API, strict `senderFrame.url` validation, and path containment policies.
- **Atomic State Persistence**: Safe temporary file serialization (`queueJsonWrite` / `updateJson`) with `0600` file modes preventing configuration corruption.
- **Process Ownership Verification**: Robust `mpvpaper` lifecycle tracking with PID start-time and executable verification before signal dispatch.

---

## Desktop Environment Support Matrix

QuickSwitcher automatically detects the active desktop environment and dispatches to the optimal backend:

| Environment | Static Formats | Animated / Video | Backend Integration |
|---|:---:|:---:|---|
| **Hyprland / Wayland** | Yes | Yes | `swww` / `hyprpaper` / `mpvpaper` |
| **GNOME / Cinnamon** | Yes | Fallback | `gsettings` (`org.gnome.desktop.background`) |
| **MATE** | Yes | Fallback | `gsettings` (`org.mate.background`) |
| **KDE Plasma** | Yes | Fallback | `plasma-apply-wallpaperimage` |
| **XFCE** | Yes | Fallback | `xfconf-query` (`xfce4-desktop`) |
| **Generic X11** | Yes | Fallback | `feh` |
| **Windows 10 / 11** | Yes | Fallback | `SystemParametersInfoW` (PowerShell) |
| **macOS** | Yes | Fallback | AppleScript (`osascript`) |

---

## Keybindings & Controls

| Shortcut / Input | Description |
|---|---|
| `Click` / `Enter` | Apply selected wallpaper and close overlay |
| `Right Click` | Open delete confirmation modal |
| `h` / `l` or `Left` / `Right` | Navigate between wallpaper cards |
| `/` | Focus search input |
| `Escape` | Dismiss QuickSwitcher |
| `Mouse Wheel` | Horizontal track scrolling |

---

## Installation & Setup

### 1. System Prerequisites

Install Node.js and desktop wallpaper tools for your distribution:

**Arch Linux**:
```bash
sudo pacman -S nodejs npm electron ffmpeg mpvpaper swww hyprpaper
```

**Ubuntu / Debian**:
```bash
sudo apt update && sudo apt install -y nodejs npm ffmpeg
```

**Fedora**:
```bash
sudo dnf install -y nodejs npm ffmpeg
```

### 2. Clone and Install

```bash
git clone https://github.com/ArchEnjoyerakazonix/QuickSwitcher.git ~/.config/quickswitcher
cd ~/.config/quickswitcher
npm ci
```

### 3. Hyprland Integration

Add the overlay toggle keybinding and window rules to `~/.config/hypr/hyprland.conf`:

```ini
# Toggle QuickSwitcher overlay
bind = CTRL SUPER, W, exec, npx electron ~/.config/quickswitcher

# Floating overlay window rules
windowrulev2 = float, title:^(QuickSwitcher)$
windowrulev2 = pin, title:^(QuickSwitcher)$
windowrulev2 = move 0 100%-300, title:^(QuickSwitcher)$
```

---

## Offline Thumbnail Pre-Generation

To pre-cache thumbnails for large wallpaper directories:

```bash
node scripts/generate-thumbs.js
```

---

## Testing & Multi-Environment Verification

QuickSwitcher includes an extensive test suite and containerized sandbox verification across multiple Linux distributions:

```bash
# Check syntax
npm run check

# Run unit and integration tests
npm test

# Run multi-environment container tests (Debian/Ubuntu, Alpine, Node 20/22)
npm run test:containers

# Full verification pass
npm run verify

# Package native distribution binaries
npm run pack
```

---

## Configuration & Storage Paths

- **Linux Config**: `~/.config/QuickSwitcher/`
  - `favorites.json`: Persisted favorites list.
  - `custom_folders.json`: User-registered wallpaper directories.
  - `state.json`: Active wallpaper tracking.
  - `mpvpaper_pids.json`: Tracked video process registry.
- **Linux Cache**: `~/.cache/quickswitcher-thumbs/` (hashed preview cache).
- **Windows Config**: `%APPDATA%\QuickSwitcher\`
- **macOS Config**: `~/Library/Application Support/QuickSwitcher/`

---

## License

MIT License. See [LICENSE](LICENSE) for details.
