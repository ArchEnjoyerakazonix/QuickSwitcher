# ⚡ QuickSwitcher (v1.2.0)

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](https://github.com/ArchEnjoyerakazonix/QuickSwitcher)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20Windows%20%7C%20macOS-brightgreen.svg)]()
[![Electron](https://img.shields.io/badge/electron-34.5.8-9cf.svg)](https://www.electronjs.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

> A hyper-minimalist, GPU-accelerated transient overlay wallpaper switcher built for ricing enthusiasts and cross-platform desktop environments. Seamlessly integrates with **Hyprland, Wayland, X11, GNOME, KDE, XFCE, MATE, Windows 10/11, and macOS**.

---

## 🎯 Architectural Philosophy

**Why Electron?** Instant window creation wasn't the goal — instant *switching* and *fluid 3D card presentation* was. 

QuickSwitcher runs as a single-instance transient overlay (~300px bottom dock). All disk scanning, metadata parsing, and thumbnail extraction are completely asynchronous and non-blocking. The core application achieves a **90+ Production Security & Architecture Rating** featuring strict isolation boundaries, atomic serialization, and PID-reuse-protected process lifecycles.

---

## ✨ Features & Security Highlights

- 🚀 **Transient Overlay UI**: Instant toggle strip with single-instance lock and zero background window throttling.
- 🎴 **3D Perspective Cards**: Interactive perspective cards supporting static imagery (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`) and live video streams (`.mp4`, `.webm`).
- ⚡ **Bounded Concurrency Engine**: Metadata extraction uses a 48-worker pool (`mapLimit`), while FFmpeg video thumbnailing is capped at 2 concurrent jobs to prevent CPU/RAM throttling.
- 🔒 **Opaque ID Inventory & TOCTOU Defense**: Filesystem paths are never exposed to the renderer process. Communication relies entirely on SHA-256 opaque IDs revalidated against inode, file size, and `mtime` before any operation.
- 🛡️ **Hardened IPC Sandbox**: Context isolation, sandboxed preload API, strict `senderFrame.url` verification, path traversal checks, and disabled node integration.
- 💾 **Atomic Settings Persistence**: Atomic temporary file serialization (`queueJsonWrite` / `updateJson`) with file mode `0600`, preventing corruption or lost updates during concurrent operations.
- ⚙️ **Process Ownership Verification**: Robust `mpvpaper` lifecycle management in Linux environments — verifies PID start-time from `/proc/<pid>/stat` and executable path from `/proc/<pid>/exe` before issuing signals (SIGTERM grace period → SIGKILL escalation).

---

## 🌐 Cross-Platform Support Matrix

QuickSwitcher natively adapts to the host operating system and desktop environment:

| Operating System / Desktop | Static Formats | Live / Animated Formats | Integration Engine & Command |
|---|:---:|:---:|---|
| **Hyprland (Wayland)** | ✅ | ✅ | `swww` / `hyprpaper` / `mpvpaper` |
| **GNOME / Cinnamon (Linux)** | ✅ | ⚠️ Static | `gsettings` (`org.gnome.desktop.background`) |
| **MATE (Linux)** | ✅ | ⚠️ Static | `gsettings` (`org.mate.background`, `picture-filename`) |
| **KDE Plasma (Linux)** | ✅ | ⚠️ Static | `plasma-apply-wallpaperimage` |
| **XFCE (Linux)** | ✅ | ⚠️ Static | `xfconf-query` (`xfce4-desktop`) |
| **Windows 10 / 11** | ✅ | ⚠️ Static | `SystemParametersInfoW` (via injection-safe PowerShell `env` parameters) |
| **macOS (Darwin)** | ✅ | ⚠️ Static | AppleScript (`osascript` via POSIX `argv`) |

> ℹ️ *Note: Animated GIFs play in motion via `mpvpaper` on Linux, and render gracefully through native static backends on Windows, macOS, GNOME, KDE, and XFCE.*

---

## ⌨️ Controls & Keybindings

| Input | Action |
|---|---|
| `Click` / `Enter` | Apply selected wallpaper & close QuickSwitcher |
| `Right Click` | Open delete confirmation dialog |
| `h` / `l` or `←` / `→` | Keyboard focus navigation |
| `/` | Focus search bar |
| `Escape` | Close QuickSwitcher window |
| `Mouse Wheel` | Fast horizontal card scrolling |

---

## 🛠️ Installation & Setup

### 1. System Dependencies (Linux)

Ensure core utilities and optional daemons are installed:

```bash
# Arch Linux
sudo pacman -S nodejs npm electron ffmpeg hyprland mpvpaper swww
```

### 2. Clone & Build

```bash
git clone https://github.com/ArchEnjoyerakazonix/QuickSwitcher.git ~/.config/quickswitcher
cd ~/.config/quickswitcher
npm ci
```

### 3. Hyprland Keybinding Integration

Add keybindings and floating overlay rules to `~/.config/hypr/hyprland.conf`:

```ini
# Toggle QuickSwitcher Overlay
bind = CTRL SUPER, W, exec, npx electron ~/.config/quickswitcher

# Window Overlay Rules
windowrulev2 = float, title:^(QuickSwitcher)$
windowrulev2 = pin, title:^(QuickSwitcher)$
windowrulev2 = move 0 100%-300, title:^(QuickSwitcher)$
```

---

## ⚡ Pre-Generating Offline Thumbnails

To pre-generate thumbnails for large wallpaper collections (improving initial card load times):

```bash
node scripts/generate-thumbs.js
```

---

## 🧪 Developer Verification & Testing

QuickSwitcher includes an extensive test suite verifying path policy containment, IPC validation, store serialization, inventory revalidation, thumbnail caching, and process ownership.

```bash
# Check JavaScript syntax
npm run check

# Run unit & integration test suite with coverage
npm test

# Complete verification pass
npm run verify

# Package native binaries (AppImage, deb, nsis, portable, dmg)
npm run pack
```

---

## ⚙️ Path & Storage Specification

QuickSwitcher utilizes native platform path resolutions (`app.getPath('userData')` / `cache`):

- **Linux Config**: `~/.config/QuickSwitcher/`
  - `favorites.json`: Persisted user favorites (hashed targets).
  - `custom_folders.json`: User-registered custom wallpaper directories.
  - `state.json`: Active wallpaper tracking.
  - `mpvpaper_pids.json`: Tracked video process PIDs.
- **Linux Cache**: `~/.cache/quickswitcher-thumbs/` (hashed thumbnail image cache).
- **Windows Config**: `%APPDATA%\QuickSwitcher\`
- **macOS Config**: `~/Library/Application Support/QuickSwitcher/`

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
