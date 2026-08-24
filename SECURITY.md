# Security Policy & Architecture Model

QuickSwitcher operates as a privileged local desktop utility interfacing with filesystem resources and external wallpaper daemons. To prevent privilege escalation, local injection, and race condition exploits, the application implements a multi-layer isolation architecture.

---

## 1. Threat Model & Mitigations

### Two-Tier Path Containment (Allowlist + Guardrail Blocklist)
- **Problem**: Passing arbitrary file paths across IPC from the renderer layer exposes the system to path traversal and local file inclusion (LFI) vectors if the renderer context is compromised.
- **Mitigation (Tier 1 — Strict Allowlist)**: 
  - The renderer never receives raw filesystem paths; it operates strictly on opaque SHA-256 identifiers.
  - The core containment policy (`isInsideRoots`) is an **allowlist**. Only files that reside inside registered root directories (`~/Pictures/wallpapers`, `~/Pictures/Wallpapers`, `~/.config/wallpapers`, and explicitly user-added directories) can be indexed, read, or modified.
  - All symlinks are canonicalized via `fs.realpath()` before evaluation; if a symlink points outside the allowlisted root hierarchy, it is rejected immediately.
- **Mitigation (Tier 2 — Broad Root Guardrails)**:
  - When registering custom directories via `select-folder`, overly broad system roots (`/`, `/home`, `/etc`, `/usr`, `/var`, `/tmp`, `/boot`, `/opt`, `/root`, and bare `$HOME`) are blocked from registration to prevent expansive indexing.

### TOCTOU (Time-of-Check to Time-of-Use) Defense
- **Problem**: An external process or attacker could replace a verified wallpaper path with a malicious symlink or altered binary payload between inventory indexing and application.
- **Mitigation**:
  - Before applying or deleting any wallpaper, `revalidateRecord()` executes an atomic stat check.
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
- **Private Advisory**: Submit a report directly via [GitHub Private Vulnerability Reporting](https://github.com/ArchEnjoyerakazonix/QuickSwitcher/security/advisories/new).
- Please include reproduction steps, environment details (OS, desktop environment, Node.js version), and a proof of concept if available.
