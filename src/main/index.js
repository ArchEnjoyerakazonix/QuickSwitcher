const { app, BrowserWindow, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const os = require('os');
const { pathToFileURL } = require('url');
const { applyWallpaperUniversal } = require('./wallpaperAdapter');
const { queueJsonWrite, readJson, updateJson } = require('./store');
const { assertTrustedRenderer, requireId } = require('./ipcValidation');
const {
    rememberWallpaper,
    revalidateRecord,
    replaceWallpaperInventory,
    getWallpaperRecord,
    getFavoriteKey,
    getLiveInventory,
    removeWallpaperRecord
} = require('./wallpaperInventory');
const { isInsideRoots } = require('./pathPolicy');
const { getThumbPath } = require('./thumbnailPolicy');
const { createAppPaths } = require('./appPaths');

const pExecFile = promisify(execFile);

// Resolve Electron-native paths
const paths = createAppPaths({
    configDir: process.env.QUICKSWITCHER_CONFIG_DIR || app.getPath('userData'),
    cacheDir: process.env.QUICKSWITCHER_CACHE_DIR || app.getPath('cache'),
    homeDir: app.getPath('home')
});

const { CONFIG_DIR, THUMB_DIR, FAV_FILE, CUSTOM_FOLDERS_FILE, SET_WALL_SCRIPT, STATE_FILE } = paths;

// Logger
const log = {
    warn: (...args) => console.warn('[QuickSwitcher]', ...args),
    info: (...args) => console.log('[QuickSwitcher]', ...args)
};

// GPU Performance Flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
if (process.env.QUICKSWITCHER_FORCE_GPU === '1') {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('disable-gpu-vsync');
}

// Single Instance Lock
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

async function initPaths() {
    await fsp.mkdir(CONFIG_DIR, { recursive: true }).catch(() => {});
    await fsp.mkdir(THUMB_DIR, { recursive: true }).catch(() => {});
}

async function loadCustomFolders() {
    return await readJson(CUSTOM_FOLDERS_FILE, []);
}

async function saveCustomFolders(foldersArray) {
    await queueJsonWrite(CUSTOM_FOLDERS_FILE, foldersArray);
}

async function getWallpaperDirectories() {
    const defaultDirs = [
        path.join(os.homedir(), 'Pictures/wallpapers'),
        path.join(os.homedir(), 'Pictures/Wallpapers'),
        path.join(os.homedir(), 'Pictures/Wallpapers/Dynamic-Wallpapers'),
        path.join(os.homedir(), 'dotfiles/wallpapers'),
        path.join(os.homedir(), '.config/wallpapers'),
    ];
    const custom = await loadCustomFolders();
    const merged = [...defaultDirs, ...custom];
    const unique = new Set(merged.filter(d => typeof d === 'string' && d.length > 0));
    return Array.from(unique);
}

async function resolveRootsAsync() {
    const dirs = await getWallpaperDirectories();
    const roots = [];
    for (const dir of dirs) {
        try {
            const stat = await fsp.stat(dir);
            if (stat.isDirectory()) {
                roots.push(await fsp.realpath(dir));
            }
        } catch (e) {}
    }
    return Array.from(new Set(roots));
}

async function loadFavorites() {
    return await readJson(FAV_FILE, []);
}

async function saveFavorites(favsArray) {
    await queueJsonWrite(FAV_FILE, favsArray);
}

let mainWindow = null;
let rendererUrl = '';

async function detectMonitors() {
    if (process.platform !== 'linux') return [];
    try {
        const { stdout } = await pExecFile('hyprctl', ['monitors', '-j'], { timeout: 1500 });
        const names = JSON.parse(stdout).map(m => m.name).filter(Boolean);
        if (names.length) return names;
    } catch (e) {}
    try {
        const { stdout } = await pExecFile('wlr-randr', [], { timeout: 1500 });
        const names = [...stdout.matchAll(/^(\S+)/gm)].map(m => m[1]);
        if (names.length) return names;
    } catch (e) {}
    return [];
}

async function detectWorkspace() {
    if (process.platform !== 'linux') return 1;
    try {
        const { stdout } = await pExecFile('hyprctl', ['activeworkspace', '-j'], { timeout: 1500 });
        return JSON.parse(stdout).id ?? 1;
    } catch {
        return 1;
    }
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

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (url !== rendererUrl) e.preventDefault();
    });

    mainWindow.loadFile(rendererPath);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Worker Pool for Metadata Scanning
async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    async function runWorker() {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) return;
            results[index] = await worker(items[index], index);
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, runWorker)
    );

    return results;
}

// Bounded Concurrency Queue for Video Thumbnails
const MAX_CONCURRENT_FFMPEG = 2;
let activeFFmpegJobs = 0;
const ffmpegQueue = [];
const pendingThumbs = new Map();

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

function subscribeThumbnail(thumbPath, wallpaperId) {
    let entry = pendingThumbs.get(thumbPath);
    if (!entry) {
        entry = {
            subscribers: new Set(),
            running: false
        };
        pendingThumbs.set(thumbPath, entry);
    }
    entry.subscribers.add(wallpaperId);
    return entry;
}

function notifyThumbnailSubscribers(thumbPath) {
    const entry = pendingThumbs.get(thumbPath);
    if (!entry) return;
    for (const id of entry.subscribers) {
        notifyThumbReady(id, thumbPath);
    }
    pendingThumbs.delete(thumbPath);
}

function notifyThumbReady(wallpaperId, thumbPath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('thumb-ready', {
            id: wallpaperId,
            thumbUrl: pathToFileURL(thumbPath).href
        });
    }
}

async function ensureThumbnailAsync(wallpaperId, targetPath, thumbPath, isVideo) {
    if (fs.existsSync(thumbPath)) {
        try {
            const stat = await fsp.stat(thumbPath);
            if (stat.size > 0) return thumbPath;
            await fsp.unlink(thumbPath).catch(() => {});
        } catch {}
    }

    const entry = subscribeThumbnail(thumbPath, wallpaperId);

    if (!entry.running) {
        entry.running = true;

        if (!isVideo) {
            entry.running = false;
            pendingThumbs.delete(thumbPath);
            return targetPath;
        } else {
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
                                notifyThumbnailSubscribers(thumbPath);
                                resolve(thumbPath);
                                return;
                            }
                        } catch {}

                        const retryArgs = [
                            '-threads', '2', '-y', '-i', targetPath,
                            '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
                        ];
                        execFile('ffmpeg', retryArgs, { timeout: 8000 }, async (err2) => {
                            try {
                                const stat2 = await fsp.stat(thumbPath);
                                if (!err2 && stat2.size > 0) {
                                    notifyThumbnailSubscribers(thumbPath);
                                    resolve(thumbPath);
                                    return;
                                }
                            } catch {}

                            // Failure: release subscribers so a future scan can retry
                            pendingThumbs.delete(thumbPath);
                            resolve(targetPath);
                        });
                    });
                });
            });
        }
    }
    return targetPath;
}

const EXTS = new Set(['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.gif']);

ipcMain.handle('get-wallpapers', async (event) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
    const roots = await resolveRootsAsync();
    const nextInventory = new Map();

    const perRoot = await Promise.all(roots.map(async (root) => {
        let entries;
        try {
            entries = await fsp.readdir(root, { withFileTypes: true });
        } catch (e) {
            return [];
        }

        const results = await mapLimit(entries, 48, async (ent) => {
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
                const thumbPath = getThumbPath(THUMB_DIR, targetPath, stat);

                const resolvedPreviewPath = await ensureThumbnailAsync(
                    crypto.createHash('sha256').update(sourcePath).digest('hex'),
                    targetPath,
                    thumbPath,
                    isVideo
                );

                let initialThumbUrl;
                if (isVideo) {
                    if (resolvedPreviewPath === thumbPath) {
                        initialThumbUrl = pathToFileURL(thumbPath).href;
                    } else {
                        initialThumbUrl = pathToFileURL(path.join(__dirname, '../../assets/icon.png')).href;
                    }
                } else {
                    initialThumbUrl = pathToFileURL(resolvedPreviewPath).href;
                }

                return rememberWallpaper(
                    nextInventory,
                    sourcePath,
                    targetPath,
                    ent,
                    thumbPath,
                    initialThumbUrl,
                    isVideo,
                    ext,
                    stat
                );
            } catch {
                return null;
            }
        });
        
        return results.filter(Boolean);
    }));

    replaceWallpaperInventory(nextInventory);

    const uniqueMap = new Map();
    for (const file of perRoot.flat()) {
        uniqueMap.set(file.id, file);
    }
    return Array.from(uniqueMap.values());
});

ipcMain.handle('apply-wallpaper', async (event, payload) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
    
    const id = requireId(payload);
    if (!id) return { ok: false, error: 'Invalid request' };

    const record = getWallpaperRecord(id);
    if (!record || !await revalidateRecord(record)) {
        return { ok: false, error: 'Wallpaper unavailable; rescan required' };
    }

    const [monitors, ws, appState] = await Promise.all([
        detectMonitors(),
        detectWorkspace(),
        readJson(STATE_FILE, { activeWallpaperPath: null })
    ]);

    const result = await applyWallpaperUniversal(record.targetPath, {
        setWallScript: SET_WALL_SCRIPT,
        monitors,
        ws,
        configDir: CONFIG_DIR,
        previousPath: appState.activeWallpaperPath,
        mediaType: record.type
    });

    if (result.ok) {
        queueJsonWrite(STATE_FILE, { activeWallpaperPath: record.targetPath }).catch(error => {
            log.warn('Failed to persist active wallpaper:', error.message);
        });
        if (process.platform === 'linux') {
            execFile('notify-send', ['QuickSwitcher', `Applied: ${record.name}`], () => {});
        }
    } else {
        if (process.platform === 'linux') {
            execFile('notify-send', ['-u', 'critical', 'QuickSwitcher', result.error || 'Failed to set wallpaper'], () => {});
        }
    }
    return result;
});

const FORBIDDEN_ROOTS = new Set([
    '/', '/home', '/etc', '/usr', '/var', '/boot',
    os.homedir(), path.parse(os.homedir()).root
].map(p => path.resolve(p)));

ipcMain.handle('select-folder', async (event) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
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

        const custom = await loadCustomFolders();
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

ipcMain.handle('toggle-favorite', async (event, payload) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
    
    const id = requireId(payload);
    if (!id) {
        const favs = await loadFavorites();
        return favs.map(p => getFavoriteKey(p));
    }

    const record = getWallpaperRecord(id);
    if (!record) {
        const favs = await loadFavorites();
        return favs.map(p => getFavoriteKey(p));
    }

    const targetPath = record.targetPath;

    const updated = await updateJson(FAV_FILE, [], (favs) => {
        if (favs.includes(targetPath)) {
            return favs.filter(p => p !== targetPath);
        } else {
            return [...favs, targetPath].slice(-5000);
        }
    });

    return updated.map(p => getFavoriteKey(p));
});

function countTargetReferences(targetPath, excludingId) {
    let references = 0;
    for (const record of getLiveInventory().values()) {
        if (record.id !== excludingId && record.targetPath === targetPath) {
            references++;
        }
    }
    return references;
}

ipcMain.handle('delete-wallpaper', async (event, payload) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
    
    const id = requireId(payload);
    if (!id) return { success: false, error: 'Invalid request' };

    const record = getWallpaperRecord(id);
    if (!record) {
        return { success: false, error: 'Wallpaper unavailable; rescan required' };
    }
    
    if (!await revalidateRecord(record)) {
        return { success: false, error: 'File has been modified or removed; rescan required' };
    }

    try {
        await fsp.unlink(record.sourcePath);

        // Remove from inventory immediately
        removeWallpaperRecord(id);

        // Delete thumbnail only if no other inventory record references this target
        if (countTargetReferences(record.targetPath, id) === 0) {
            if (fs.existsSync(record.thumbPath)) {
                await fsp.unlink(record.thumbPath).catch(() => {});
            }
        }

        await updateJson(FAV_FILE, [], (favs) => {
            return favs.filter(p => p !== record.targetPath);
        });
        
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Wallpaper deletion failed' };
    }
});

ipcMain.handle('get-favorites', async (event) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
    const favs = await loadFavorites();
    return favs.map(p => getFavoriteKey(p));
});

ipcMain.on('close-app', (event) => {
    assertTrustedRenderer(event, mainWindow, rendererUrl);
    app.quit();
});

async function installDesktopShortcut() {
    if (process.platform !== 'linux') return;
    try {
        const appsDir = path.join(os.homedir(), '.local/share/applications');
        await fsp.mkdir(appsDir, { recursive: true }).catch(() => {});
        const desktopPath = path.join(appsDir, 'quickswitcher.desktop');

        const execPath = process.execPath;
        const mainScript = path.resolve(__dirname, '../../');
        const iconPath = path.resolve(__dirname, '../../assets/icon.png');

        const desktopContent = `[Desktop Entry]
Name=QuickSwitcher
GenericName=Wallpaper Switcher
Comment=Hyper-minimalist GPU-accelerated wallpaper switcher
Exec="${execPath}" "${mainScript}"
Icon=${iconPath}
Terminal=false
Type=Application
Categories=Utility;DesktopSettings;
StartupWMClass=QuickSwitcher
`;
        await fsp.writeFile(desktopPath, desktopContent, { encoding: 'utf8', mode: 0o755 });
    } catch (e) {
        log.warn('Could not register desktop entry:', e.message);
    }
}

app.whenReady().then(async () => {
    await initPaths();
    await installDesktopShortcut();
    createWindow();
});

app.on('window-all-closed', () => app.quit());
