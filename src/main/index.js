const { app, BrowserWindow, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const { applyWallpaperUniversal } = require('./wallpaperAdapter');

// Logger
const log = {
    warn: (...args) => console.warn('[QuickSwitcher]', ...args),
    info: (...args) => console.log('[QuickSwitcher]', ...args)
};

// GPU Performance Flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization');
if (process.env.QUICKSWITCHER_FORCE_GPU === '1') {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('disable-gpu-vsync');
}

// Single Instance Lock (A5)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) mainWindow.hide();
            else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

// User Data Directories (A1 Fix: Config in userData, binary thumbs in cache)
const CONFIG_DIR = path.join(os.homedir(), '.config/QuickSwitcher');
const THUMB_DIR = path.join(os.homedir(), '.cache/quickswitcher-thumbs');
const FAV_FILE = path.join(CONFIG_DIR, 'favorites.json');
const CUSTOM_FOLDERS_FILE = path.join(CONFIG_DIR, 'custom_folders.json');
const SET_WALL_SCRIPT = path.join(os.homedir(), '.config/hypr/wallpaper-daemon/set-wallpaper.sh');

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

function initPaths() {
    try {
        const uData = app.getPath('userData');
        const uCache = app.getPath('cache');
        if (uData && uCache) {
            // Keep paths aligned with Electron app getters if available
            fs.mkdirSync(uData, { recursive: true });
            fs.mkdirSync(path.join(uCache, 'quickswitcher-thumbs'), { recursive: true });
        }
    } catch (e) {}
}

function loadCustomFolders() {
    try {
        if (fs.existsSync(CUSTOM_FOLDERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CUSTOM_FOLDERS_FILE, 'utf-8'));
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        log.warn('Failed to load custom_folders.json:', e.message);
    }
    return [];
}

function saveCustomFolders(foldersArray) {
    try {
        fs.writeFileSync(CUSTOM_FOLDERS_FILE, JSON.stringify(foldersArray, null, 2), 'utf-8');
    } catch (e) {
        log.warn('Failed to save custom_folders.json:', e.message);
    }
}

function getWallpaperDirectories() {
    const defaultDirs = [
        path.join(os.homedir(), 'Pictures/wallpapers'),
        path.join(os.homedir(), 'Pictures/Wallpapers'),
        path.join(os.homedir(), 'Pictures/Wallpapers/Dynamic-Wallpapers'),
        path.join(os.homedir(), 'dotfiles/wallpapers'),
        path.join(os.homedir(), '.config/wallpapers'),
    ];
    const custom = loadCustomFolders();
    const merged = [...defaultDirs, ...custom];
    const unique = new Set(merged.filter(d => typeof d === 'string' && d.length > 0));
    return Array.from(unique);
}

function resolveRootsOnce() {
    const roots = [];
    for (const dir of getWallpaperDirectories()) {
        try {
            if (fs.existsSync(dir)) {
                roots.push(fs.realpathSync(dir));
            }
        } catch (e) {}
    }
    return Array.from(new Set(roots));
}

function isInsideRoots(resolved, roots) {
    return roots.some(root => {
        try {
            const rel = path.relative(root, resolved);
            return (
                rel !== '' &&
                rel !== '..' &&
                !rel.startsWith(`..${path.sep}`) &&
                !path.isAbsolute(rel)
            );
        } catch {
            return false;
        }
    });
}

function loadFavorites() {
    try {
        if (fs.existsSync(FAV_FILE)) {
            const data = JSON.parse(fs.readFileSync(FAV_FILE, 'utf-8'));
            if (Array.isArray(data)) return data;
        }
    } catch (e) {
        log.warn('Failed to load favorites.json:', e.message);
    }
    return [];
}

function saveFavorites(favsArray) {
    try {
        fs.writeFileSync(FAV_FILE, JSON.stringify(favsArray, null, 2), 'utf-8');
    } catch (e) {
        log.warn('Failed to save favorites.json:', e.message);
    }
}

function getThumbPath(originalPath) {
    const hash = crypto.createHash('md5').update(originalPath).digest('hex');
    return path.join(THUMB_DIR, `${hash}.jpg`);
}

function resolveAllowedWallpaper(filepath) {
    if (typeof filepath !== 'string' || !filepath) return null;
    let resolved;
    try {
        resolved = fs.realpathSync(filepath);
    } catch {
        return null;
    }
    const roots = resolveRootsOnce();
    return isInsideRoots(resolved, roots) ? resolved : null;
}

// Monitor Detection (X2 Fix)
function detectMonitors() {
    if (process.platform !== 'linux') return [];
    try {
        const out = execFileSync('hyprctl', ['monitors', '-j'], { timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        const names = JSON.parse(out).map(m => m.name).filter(Boolean);
        if (names.length) return names;
    } catch (e) {}
    try {
        const out = execFileSync('wlr-randr', [], { timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
        const names = [...out.matchAll(/^(\S+)/gm)].map(m => m[1]);
        if (names.length) return names;
    } catch (e) {}
    return [];
}


let mainWindow = null;

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: sysW, height: sysH } = primaryDisplay.bounds;

    const WIN_W = sysW;
    const WIN_H = 300;

    const logoPath = path.join(__dirname, '../../assets/icon.png');
    const icon = fs.existsSync(logoPath) ? nativeImage.createFromPath(logoPath) : undefined;

    mainWindow = new BrowserWindow({
        width: WIN_W,
        height: WIN_H,
        x: 0,
        y: sysH - WIN_H,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        icon,
        title: 'QuickSwitcher',
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            backgroundThrottling: false,
        }
    });

    // Navigation Security Lockdown (S5)
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith('file://')) e.preventDefault();
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Non-blocking Async Thumbnail Queue (P1, P4)
const pendingThumbs = new Set();

function notifyThumbReady(thumbPath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('thumb-ready', thumbPath);
    }
}

async function ensureThumbnailAsync(fullPath, thumbPath, isVideo) {
    if (fs.existsSync(thumbPath)) {
        try {
            const stat = fs.statSync(thumbPath);
            if (stat.size > 0) return thumbPath;
            fs.unlinkSync(thumbPath);
        } catch {}
    }

    if (!pendingThumbs.has(thumbPath)) {
        pendingThumbs.add(thumbPath);

        if (!isVideo) {
            pendingThumbs.delete(thumbPath);
            return fullPath; // Let Chromium handle image thumbnails natively with loading="lazy"
        } else {
            // Async non-blocking ffmpeg video thumbnailing (P1 Fix)
            const ffmpegArgs = [
                '-threads', '2', '-y', '-ss', '00:00:02', '-i', fullPath,
                '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
            ];
            execFile('ffmpeg', ffmpegArgs, { timeout: 8000 }, (err) => {
                if (!err && fs.existsSync(thumbPath)) {
                    pendingThumbs.delete(thumbPath);
                    notifyThumbReady(thumbPath);
                } else {
                    // Retry at 00:00:00 for short clips
                    const retryArgs = [
                        '-threads', '2', '-y', '-i', fullPath,
                        '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
                    ];
                    execFile('ffmpeg', retryArgs, { timeout: 8000 }, (err2) => {
                        pendingThumbs.delete(thumbPath);
                        if (!err2 && fs.existsSync(thumbPath)) {
                            notifyThumbReady(thumbPath);
                        }
                    });
                }
            });
        }
    }
    return fullPath; // Usable placeholder while background thumbnail generates
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const EXTS = new Set(['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm']);

// Async Parallel Scan (P2, P3)
ipcMain.handle('get-wallpapers', async () => {
    const roots = resolveRootsOnce();
    const perRoot = await Promise.all(roots.map(async (root) => {
        let entries;
        try {
            entries = await fsp.readdir(root, { withFileTypes: true });
        } catch (e) {
            return [];
        }

        const out = await Promise.all(entries.map(async (ent) => {
            if (!ent.isFile() && !ent.isSymbolicLink()) return null;
            const ext = path.extname(ent.name).toLowerCase();
            if (!EXTS.has(ext)) return null;

            try {
                const fullPath = path.join(root, ent.name);
                const resolved = await fsp.realpath(fullPath);
                if (!isInsideRoots(resolved, roots)) return null;

                const stat = await fsp.stat(resolved);
                if (!stat.isFile()) return null;

                const isVideo = VIDEO_EXTS.has(ext);
                const thumbPath = getThumbPath(resolved);
                const thumb = await ensureThumbnailAsync(resolved, thumbPath, isVideo);

                return {
                    name: ent.name,
                    path: resolved,
                    thumb,
                    thumbPath,
                    type: isVideo ? 'VIDEO' : 'IMAGE',
                    ext: ext.slice(1).toUpperCase(),
                    size: stat.size,
                    sizeFormatted: formatBytes(stat.size),
                    mtime: stat.mtimeMs
                };
            } catch {
                return null;
            }
        }));
        return out.filter(Boolean);
    }));

    const uniqueMap = new Map();
    for (const file of perRoot.flat()) {
        uniqueMap.set(file.path, file);
    }
    return Array.from(uniqueMap.values());
});

ipcMain.handle('apply-wallpaper', async (_event, { filepath }) => {
    const safePath = resolveAllowedWallpaper(filepath);
    if (!safePath) return { ok: false, error: 'Invalid wallpaper path' };

    const monitors = detectMonitors();
    let ws = 1;
    if (process.platform === 'linux') {
        try {
            const out = execFileSync('hyprctl', ['activeworkspace', '-j'], { timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
            ws = JSON.parse(out).id ?? 1;
        } catch { /* default ws=1 */ }
    }

    const result = await applyWallpaperUniversal(safePath, {
        setWallScript: SET_WALL_SCRIPT,
        monitors,
        ws
    });

    if (result.ok) {
        execFile('notify-send', ['QuickSwitcher', `Applied: ${path.basename(safePath)}`], () => {});
    } else {
        execFile('notify-send', ['-u', 'critical', 'QuickSwitcher', result.error || 'Failed to set wallpaper'], () => {});
    }
    return result;
});

// S4 Fix: Guard against selecting root directories like /, /home, $HOME
const FORBIDDEN_ROOTS = new Set([
    '/', '/home', '/etc', '/usr', '/var', '/boot',
    os.homedir(), path.parse(os.homedir()).root
].map(p => path.resolve(p)));

ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Custom Wallpaper Directory'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const selectedDir = path.resolve(result.filePaths[0]);

        if (FORBIDDEN_ROOTS.has(selectedDir)) {
            dialog.showErrorBox('Folder Too Broad', 'Please choose a dedicated wallpaper folder, not a system root or home directory.');
            return null;
        }

        const custom = loadCustomFolders();
        if (custom.length >= 32) {
            dialog.showErrorBox('Limit Reached', 'Maximum 32 custom wallpaper folders allowed.');
            return null;
        }

        if (!custom.includes(selectedDir)) {
            custom.push(selectedDir);
            saveCustomFolders(custom);
        }
        return selectedDir;
    }
    return null;
});

// S3 Fix: Enforce resolveAllowedWallpaper inside toggle-favorite
ipcMain.handle('toggle-favorite', async (_event, { filepath }) => {
    const safePath = resolveAllowedWallpaper(filepath);
    if (!safePath) return loadFavorites();

    let favs = loadFavorites();
    if (favs.includes(safePath)) {
        favs = favs.filter(p => p !== safePath);
    } else {
        favs = [...favs, safePath].slice(-5000);
    }
    saveFavorites(favs);
    return favs;
});

ipcMain.handle('delete-wallpaper', async (_event, { filepath }) => {
    const safePath = resolveAllowedWallpaper(filepath);
    if (!safePath) {
        return { success: false, error: 'Invalid wallpaper path' };
    }
    try {
        await fsp.unlink(safePath);
        const thumbPath = getThumbPath(safePath);
        if (fs.existsSync(thumbPath)) {
            await fsp.unlink(thumbPath).catch(() => {});
        }
        let favs = loadFavorites();
        if (favs.includes(safePath)) {
            favs = favs.filter(p => p !== safePath);
            saveFavorites(favs);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Wallpaper deletion failed' };
    }
});

ipcMain.handle('get-favorites', async () => {
    return loadFavorites();
});

ipcMain.on('close-app', () => {
    app.quit();
});

app.whenReady().then(() => {
    initPaths();
    createWindow();
});

app.on('window-all-closed', () => app.quit());
