const { app, BrowserWindow, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const { pathToFileURL } = require('url');
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

// User Data Directories (P2 Fix: Config in userData, binary thumbs in cache)
let CONFIG_DIR, THUMB_DIR, FAV_FILE, CUSTOM_FOLDERS_FILE, SET_WALL_SCRIPT;

function initPaths() {
    try {
        const uData = app.getPath('userData');
        const uCache = app.getPath('cache');
        CONFIG_DIR = uData;
        THUMB_DIR = path.join(uCache, 'quickswitcher-thumbs');
    } catch (e) {
        CONFIG_DIR = path.join(os.homedir(), '.config/QuickSwitcher');
        THUMB_DIR = path.join(os.homedir(), '.cache/quickswitcher-thumbs');
    }
    FAV_FILE = path.join(CONFIG_DIR, 'favorites.json');
    CUSTOM_FOLDERS_FILE = path.join(CONFIG_DIR, 'custom_folders.json');
    SET_WALL_SCRIPT = path.join(os.homedir(), '.config/hypr/wallpaper-daemon/set-wallpaper.sh');

    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });
}

// Atomic Persistence Helper (P2 Fix)
async function writeJsonAtomic(filePath, data) {
    const tempFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf-8');
        await fsp.rename(tempFile, filePath);
    } catch (e) {
        log.warn('Atomic write failed:', filePath, e.message);
        await fsp.unlink(tempFile).catch(() => {});
    }
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

async function saveCustomFolders(foldersArray) {
    await writeJsonAtomic(CUSTOM_FOLDERS_FILE, foldersArray);
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

function isInsideRoots(targetPath, roots) {
    return roots.some(root => {
        try {
            const rel = path.relative(root, targetPath);
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

async function saveFavorites(favsArray) {
    await writeJsonAtomic(FAV_FILE, favsArray);
}

function getThumbPath(originalPath) {
    const hash = crypto.createHash('md5').update(originalPath).digest('hex');
    return path.join(THUMB_DIR, `${hash}.jpg`);
}

function resolveAllowedPath(filepath) {
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

let mainWindow = null;
let rendererUrl = '';

// IPC Security Sender & Frame URL Validation (P1 Fix)
function assertTrustedRenderer(event) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window unavailable');
    }
    if (event.sender !== mainWindow.webContents) {
        throw new Error('Untrusted IPC sender webContents');
    }
    if (event.senderFrame && event.senderFrame.url !== rendererUrl) {
        throw new Error('Untrusted IPC sender frame URL');
    }
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

    const rendererPath = path.join(__dirname, '../renderer/index.html');
    rendererUrl = pathToFileURL(rendererPath).href;

    // Navigation Security Lockdown (S5)
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (url !== rendererUrl) e.preventDefault();
    });

    mainWindow.loadFile(rendererPath);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Bounded Concurrency Queue for Video Thumbnails (P1 Fix)
const MAX_CONCURRENT_FFMPEG = 2;
let activeFFmpegJobs = 0;
const ffmpegQueue = [];
const pendingThumbs = new Set();

function enqueueFFmpegJob(jobFn) {
    return new Promise((resolve, reject) => {
        ffmpegQueue.push({ jobFn, resolve, reject });
        pumpFFmpegQueue();
    });
}

function pumpFFmpegQueue() {
    while (activeFFmpegJobs < MAX_CONCURRENT_FFMPEG && ffmpegQueue.length > 0) {
        const { jobFn, resolve, reject } = ffmpegQueue.shift();
        activeFFmpegJobs++;
        jobFn()
            .then(resolve, reject)
            .finally(() => {
                activeFFmpegJobs--;
                pumpFFmpegQueue();
            });
    }
}

// P1 Fix: Send structured payload { thumbPath, thumbUrl }
function notifyThumbReady(thumbPath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('thumb-ready', {
            thumbPath: thumbPath,
            thumbUrl: pathToFileURL(thumbPath).href
        });
    }
}

async function ensureThumbnailAsync(targetPath, thumbPath, isVideo) {
    if (fs.existsSync(thumbPath)) {
        try {
            const stat = await fsp.stat(thumbPath);
            if (stat.size > 0) return thumbPath;
            await fsp.unlink(thumbPath).catch(() => {});
        } catch {}
    }

    if (!pendingThumbs.has(thumbPath)) {
        pendingThumbs.add(thumbPath);

        if (!isVideo) {
            pendingThumbs.delete(thumbPath);
            return targetPath;
        } else {
            // Queue FFmpeg job with max concurrency 2 (P1 Fix)
            enqueueFFmpegJob(() => {
                return new Promise((resolve) => {
                    const ffmpegArgs = [
                        '-threads', '2', '-y', '-ss', '00:00:02', '-i', targetPath,
                        '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
                    ];
                    execFile('ffmpeg', ffmpegArgs, { timeout: 8000 }, async (err) => {
                        try {
                            const stat = await fsp.stat(thumbPath);
                            if (!err && stat.size > 0) {
                                notifyThumbReady(thumbPath);
                                resolve(thumbPath);
                                return;
                            }
                        } catch {}

                        // Retry at 00:00:00 for short clips
                        const retryArgs = [
                            '-threads', '2', '-y', '-i', targetPath,
                            '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
                        ];
                        execFile('ffmpeg', retryArgs, { timeout: 8000 }, async (err2) => {
                            try {
                                const stat2 = await fsp.stat(thumbPath);
                                if (!err2 && stat2.size > 0) {
                                    notifyThumbReady(thumbPath);
                                }
                            } catch {}
                            resolve(thumbPath);
                        });
                    });
                }).finally(() => {
                    // P2 Fix: Clean pendingThumbs ONLY after all attempts (including retry) finish
                    pendingThumbs.delete(thumbPath);
                });
            });
        }
    }
    return targetPath;
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

// Async Parallel Scan (P0 Fix: Preserve Source & Target Separation)
ipcMain.handle('get-wallpapers', async (event) => {
    assertTrustedRenderer(event);
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
                const sourcePath = path.join(root, ent.name);
                const targetPath = await fsp.realpath(sourcePath);
                if (!isInsideRoots(targetPath, roots)) return null;

                const stat = await fsp.stat(targetPath);
                if (!stat.isFile()) return null;

                const isVideo = VIDEO_EXTS.has(ext);
                const thumbPath = getThumbPath(targetPath);
                const thumb = await ensureThumbnailAsync(targetPath, thumbPath, isVideo);

                return {
                    name: ent.name,
                    sourcePath: sourcePath,
                    path: sourcePath, // Shown and deleted by UI
                    targetPath: targetPath, // Used for applying & favorites
                    thumb: thumb,
                    thumbUrl: pathToFileURL(thumb).href, // P1 Fix: Safe URL
                    pathUrl: pathToFileURL(sourcePath).href,
                    thumbPath: thumbPath,
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

ipcMain.handle('apply-wallpaper', async (event, { filepath }) => {
    assertTrustedRenderer(event);
    const targetPath = resolveAllowedPath(filepath);
    if (!targetPath) return { ok: false, error: 'Invalid wallpaper path' };

    const monitors = detectMonitors();
    let ws = 1;
    if (process.platform === 'linux') {
        try {
            const out = execFileSync('hyprctl', ['activeworkspace', '-j'], { timeout: 1500, stdio: ['pipe', 'pipe', 'ignore'] }).toString();
            ws = JSON.parse(out).id ?? 1;
        } catch { /* default ws=1 */ }
    }

    const result = await applyWallpaperUniversal(targetPath, {
        setWallScript: SET_WALL_SCRIPT,
        monitors,
        ws,
        configDir: CONFIG_DIR
    });

    if (result.ok) {
        execFile('notify-send', ['QuickSwitcher', `Applied: ${path.basename(targetPath)}`], () => {});
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

ipcMain.handle('select-folder', async (event) => {
    assertTrustedRenderer(event);
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
            await saveCustomFolders(custom);
        }
        return selectedDir;
    }
    return null;
});

ipcMain.handle('toggle-favorite', async (event, { filepath }) => {
    assertTrustedRenderer(event);
    const targetPath = resolveAllowedPath(filepath);
    if (!targetPath) return loadFavorites();

    let favs = loadFavorites();
    if (favs.includes(targetPath)) {
        favs = favs.filter(p => p !== targetPath);
    } else {
        favs = [...favs, targetPath].slice(-5000);
    }
    await saveFavorites(favs);
    return favs;
});

// P1 Fix: Delete Authorization checks containment for BOTH sourcePath AND targetPath
ipcMain.handle('delete-wallpaper', async (event, { filepath }) => {
    assertTrustedRenderer(event);

    if (typeof filepath !== 'string' || !filepath) {
        return { success: false, error: 'Invalid wallpaper path' };
    }

    const sourcePath = path.resolve(filepath);
    const roots = resolveRootsOnce();

    // Verify sourcePath is inside an allowed root
    const isSourceAllowed = isInsideRoots(sourcePath, roots);
    if (!isSourceAllowed) {
        return { success: false, error: 'Source path outside allowed wallpaper roots' };
    }

    let targetPath;
    try {
        targetPath = await fsp.realpath(sourcePath);
    } catch {
        return { success: false, error: 'File does not exist' };
    }

    if (!isInsideRoots(targetPath, roots)) {
        return { success: false, error: 'Target path outside allowed wallpaper roots' };
    }

    try {
        // Unlink sourcePath (deletes symlink if it was a symlink!)
        await fsp.unlink(sourcePath);

        // Delete thumbnail for target file
        const thumbPath = getThumbPath(targetPath);
        if (fs.existsSync(thumbPath)) {
            await fsp.unlink(thumbPath).catch(() => {});
        }

        let favs = loadFavorites();
        if (favs.includes(targetPath)) {
            favs = favs.filter(p => p !== targetPath);
            await saveFavorites(favs);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Wallpaper deletion failed' };
    }
});

ipcMain.handle('get-favorites', async (event) => {
    assertTrustedRenderer(event);
    return loadFavorites();
});

ipcMain.on('close-app', (event) => {
    assertTrustedRenderer(event);
    app.quit();
});

app.whenReady().then(() => {
    initPaths();
    createWindow();
});

app.on('window-all-closed', () => app.quit());
