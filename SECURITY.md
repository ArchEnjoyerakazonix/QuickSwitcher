# Security Policy & Architecture Model

QuickSwitcher operates as a privileged local desktop utility interfacing with filesystem resources and external wallpaper daemons. To prevent privilege escalation, local injection, and race condition exploits, the application implements a multi-layer isolation architecture.

---

## 1. Threat Model & Mitigations

### Opaque ID Architecture & Path Containment
- **Problem**: Passing arbitrary file paths across IPC from the renderer layer exposes the system to path traversal and local file inclusion (LFI) vectors if renderer context is compromised.
- **Mitigation**: 
  - The renderer never receives raw filesystem paths. It only receives random opaque SHA-256 identifiers (`id`).
  - The main process maintains an isolated in-memory inventory map.
  - All requested files must reside inside strictly validated directory roots (`isInsideRoots`), forbidding root directories (`/`, `/home`, `/etc`, `/usr`).

### TOCTOU (Time-of-Check to Time-of-Use) Defense
- **Problem**: An attacker or external process could replace a verified wallpaper path with a malicious symlink or altered binary payload between inventory indexing and application.
- **Mitigation**:
  - Before applying or deleting any wallpaper, `revalidateRecord()` performs an atomic stat check.
  - Inode type, file size, and modification timestamp (`mtimeMs`) must match the indexed record. If mismatched, execution is aborted and a rescan is demanded.

### Hardened IPC Sandbox
- **Renderer Context Isolation**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **Sender Verification**: `assertTrustedRenderer` verifies that IPC calls originate exclusively from the authorized `mainWindow` frame matching the local `rendererUrl`.
- **Navigation Lockdown**: Window navigation outside the packaged local `index.html` is denied (`will-navigate`), and popup creation is rejected (`setWindowOpenHandler`).

### Process Ownership & PID Reuse Protection
- **Problem**: When stopping existing video wallpaper daemons (`mpvpaper`), targeting arbitrary PIDs risks sending termination signals to unrelated system processes if the PID was recycled by the kernel.
- **Mitigation**:
  - `mpvpaperManager` records both the PID and process start-time (`startTime` from `/proc/<pid>/stat`) alongside executable paths (`/proc/<pid>/exe`).
  - Prior to issuing `SIGTERM` or `SIGKILL`, ownership is validated against `/proc`. If PID start-time or binary path does not match the tracked instance, the signal is refused.

### Atomic Settings Persistence
- **Mitigation**: File writes for `favorites.json`, `custom_folders.json`, and `state.json` use atomic temporary file serialization (`queueJsonWrite` / `updateJson`) with explicit file permissions (`0600`), preventing partial writes or race-condition corruption.

---

## 2. Reporting Security Vulnerabilities

If you discover a security issue or vulnerability in QuickSwitcher, please report it responsibly:
- **Private Reporting**: Open a private security advisory on GitHub or email the maintainer directly.
- Please include reproduction steps, environment details (OS, desktop environment, Node.js version), and a proof of concept if available.
