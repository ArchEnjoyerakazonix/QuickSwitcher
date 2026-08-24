# QuickSwitcher (v1.2.0)

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/ArchEnjoyerakazonix/QuickSwitcher)
[![CI](https://github.com/ArchEnjoyerakazonix/QuickSwitcher/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ArchEnjoyerakazonix/QuickSwitcher/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-brightgreen.svg)]()
[![Electron](https://img.shields.io/badge/electron-34.5.8-9cf.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

![QuickSwitcher Demo](assets/demo.webp)

Minimal, GPU-accelerated transient overlay wallpaper switcher engineered for Hyprland, Wayland, and cross-platform desktop environments (GNOME, KDE Plasma, XFCE, MATE, generic X11, Windows, and macOS).

---

## Architectural Highlights

- **Transient Bottom Overlay**: Lightweight bottom strip with single-instance enforcement and disabled background window throttling.
- **Compositor-Accelerated Scrolling**: Horizontal track navigation offloaded to Chromium's GPU rasterizer and compositor thread.
- **Asynchronous Thumbnail Pipeline**: High-resolution wallpapers (4K/8K) are downsampled asynchronously to cached 800px previews via C++ decoders (`nativeImage`) with ImageMagick and ffmpeg fallbacks, preventing high-resolution image bloat in renderer memory.
- **Non-Blocking Background Worker Queue**: Immediate filesystem directory scanning with background concurrency-limited video frame extraction (`MAX_CONCURRENT_FFMPEG = 4`) streaming live `thumb-ready` updates.
- **Opaque ID Architecture & TOCTOU Defense**: Raw filesystem paths are isolated to the main process. Renderer IPC operates strictly over opaque SHA-256 tokens revalidated against inode, size, and mtime before execution. See [SECURITY.md](SECURITY.md).
- **Process Ownership Verification**: Safe `mpvpaper` process lifecycle tracking using `/proc/<pid>/stat` start-time and `/proc/<pid>/exe` verification to eliminate PID recycling hazards.

---

## Desktop Environment Support Matrix

QuickSwitcher automatically detects the active desktop environment and dispatches to the native tool:

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
| `Click` / `Enter` | Apply selected wallpaper and dismiss overlay |
| `Right Click` | Open delete confirmation modal |
| `h` / `l` or `Left` / `Right` | Navigate wallpaper cards |
| `/` | Focus search input |
| `Escape` | Dismiss QuickSwitcher |
| `Mouse Wheel` | Horizontal track scrolling |

---

## Requirements

- **Node.js**: `>= 20.0.0` (LTS recommended)
- **Electron**: `>= 34.0.0`
- **Linux Tools (Optional / Recommended)**: `ffmpeg` (video previews), `imagemagick` (fast thumbnailing), `swww` or `hyprpaper` (Wayland), `mpvpaper` (video wallpapers).

---

## Installation & Setup

### 1. Install System Dependencies

**Arch Linux**:
```bash
sudo pacman -S nodejs npm electron ffmpeg mpvpaper swww hyprpaper imagemagick
```

**Ubuntu / Debian**:
```bash
sudo apt update && sudo apt install -y nodejs npm ffmpeg imagemagick
```

**Fedora**:
```bash
sudo dnf install -y nodejs npm ffmpeg ImageMagick
```

### 2. Clone and Build

```bash
git clone https://github.com/ArchEnjoyerakazonix/QuickSwitcher.git ~/.config/quickswitcher
cd ~/.config/quickswitcher
npm ci

# Build local standalone unpacked binary (recommended for instant startup)
npm run pack
```

### 3. Hyprland Integration

Add the overlay toggle keybinding and window rules to `~/.config/hypr/hyprland.conf`.

**Using the packaged binary (Fastest cold start)**:
```ini
# Toggle QuickSwitcher overlay
bind = CTRL SUPER, W, exec, ~/.config/quickswitcher/dist/linux-unpacked/quickswitcher

# Floating overlay window rules
windowrulev2 = float, title:^(QuickSwitcher)$
windowrulev2 = pin, title:^(QuickSwitcher)$
windowrulev2 = move 0 100%-300, title:^(QuickSwitcher)$
```

**Using development runner**:
```ini
bind = CTRL SUPER, W, exec, npm --prefix ~/.config/quickswitcher start
```

---

## Offline Thumbnail Pre-Generation

To pre-cache thumbnails for large wallpaper directories ahead of time:

```bash
node scripts/generate-thumbs.js
```

---

## Testing & Verification

QuickSwitcher includes unit tests, integration tests, and containerized multi-distro sandboxes:

```bash
# Check syntax
npm run check

# Run unit and integration tests with coverage
npm test

# Run multi-environment container tests (Debian/Ubuntu, Alpine, Node 20/22)
npm run test:containers

# Full verification pass
npm run verify
```

---

## Security Model

Detailed information regarding threat modeling, context isolation, TOCTOU mitigations, and PID ownership validation is documented in [SECURITY.md](SECURITY.md).

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

## Contributing & Issues

Contributions, bug reports, and suggestions are welcome!
- **Bug Reports & Features**: Open an issue on [GitHub Issues](https://github.com/ArchEnjoyerakazonix/QuickSwitcher/issues).
- **Pull Requests**: Ensure all checks and tests pass with `npm run verify` before submitting.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
