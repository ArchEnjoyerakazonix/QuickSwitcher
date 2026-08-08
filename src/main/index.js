const { app, BrowserWindow, ipcMain, screen, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');
const { applyWallpaperUniversal } = require('./wallpaperAdapter');

// perf
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization');

const THUMB_DIR = path.join(os.homedir(), '.cache/wallpaper_hub_thumbs');
const SET_WALL_SCRIPT = path.join(os.homedir(), '.config/hypr/wallpaper-daemon/set-wallpaper.sh');
const FAV_FILE = path.join(THUMB_DIR, 'favorites.json');
const CUSTOM_FOLDERS_FILE = path.join(THUMB_DIR, 'custom_folders.json');

if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

function loadCustomFolders() {
    try {
        if (fs.existsSync(CUSTOM_FOLDERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(CUSTOM_FOLDERS_FILE, 'utf-8'));
            if (Array.isArray(data)) return data;
        }
    } catch (e) {}
    return [];
}

function saveCustomFolders(foldersArray) {
    try {
        fs.writeFileSync(CUSTOM_FOLDERS_FILE, JSON.stringify(foldersArray, null, 2), 'utf-8');
    } catch (e) {}
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

function loadFavorites() {
    try {
        if (fs.existsSync(FAV_FILE)) {
            const data = JSON.parse(fs.readFileSync(FAV_FILE, 'utf-8'));
            if (Array.isArray(data)) return data;
        }
    } catch (e) {}
    return [];
}

function saveFavorites(favsArray) {
    try {
        fs.writeFileSync(FAV_FILE, JSON.stringify(favsArray, null, 2), 'utf-8');
    } catch (e) {}
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
    const wallDirs = getWallpaperDirectories();
    const allowed = wallDirs.some(dir => {
        if (!fs.existsSync(dir)) return false;
        try {
            const root = fs.realpathSync(dir);
            const relative = path.relative(root, resolved);
            return (
                relative !== '' &&
                relative !== '..' &&
                !relative.startsWith(`..${path.sep}`) &&
                !path.isAbsolute(relative)
            );
        } catch {
            return false;
        }
    });
    return allowed ? resolved : null;
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

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function ensureThumbnail(fullPath, thumbPath, isVideo) {
    if (fs.existsSync(thumbPath)) return thumbPath;
    if (!isVideo) return fullPath;
    try {
        execFileSync('ffmpeg', ['-threads', '2', '-y', '-ss', '00:00:02', '-i', fullPath, '-vframes', '1', '-q:v', '2', thumbPath], { timeout: 3000, stdio: 'ignore' });
        if (fs.existsSync(thumbPath)) return thumbPath;
    } catch (e) {
        try {
            execFileSync('ffmpeg', ['-threads', '2', '-y', '-i', fullPath, '-vframes', '1', '-q:v', '2', thumbPath], { timeout: 3000, stdio: 'ignore' });
            if (fs.existsSync(thumbPath)) return thumbPath;
        } catch (err) {}
    }
    return fullPath;
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

ipcMain.handle('get-wallpapers', async () => {
    let files = [];
    const wallDirs = getWallpaperDirectories();
    for (const dir of wallDirs) {
        if (fs.existsSync(dir)) {
            try {
                const list = fs.readdirSync(dir);
                for (const file of list) {
                    const fullPath = path.join(dir, file);
                    const safePath = resolveAllowedWallpaper(fullPath);
                    if (!safePath) continue;

                    const ext = path.extname(safePath).toLowerCase();
                    if (['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
                        try {
                            const stat = fs.statSync(safePath);
                            if (stat.isFile()) {
                                const isVideo = ['.mp4', '.webm'].includes(ext);
                                const thumbPath = getThumbPath(safePath);
                                const thumb = ensureThumbnail(safePath, thumbPath, isVideo);

                                files.push({
                                    name: file,
                                    path: safePath,
                                    thumb,
                                    type: isVideo ? 'VIDEO' : 'IMAGE',
                                    ext: ext.replace('.', '').toUpperCase(),
                                    size: stat.size,
                                    sizeFormatted: formatBytes(stat.size),
                                    mtime: stat.mtimeMs
                                });
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }
    }
    const uniqueMap = new Map();
    files.forEach(f => uniqueMap.set(f.path, f));
    return Array.from(uniqueMap.values());
});

ipcMain.handle('apply-wallpaper', async (_event, { filepath }) => {
    const safePath = resolveAllowedWallpaper(filepath);
    if (!safePath) return false;
    filepath = safePath;

    let monitors;
    try {
        const out = execFileSync('hyprctl', ['monitors', '-j'], { timeout: 2000 }).toString();
        monitors = JSON.parse(out).map(m => m.name);
    } catch {
        monitors = ['DP-2'];
    }

    let ws = 1;
    try {
        const out = execFileSync('hyprctl', ['activeworkspace', '-j'], { timeout: 2000 }).toString();
        ws = JSON.parse(out).id ?? 1;
    } catch { /* default ws=1 */ }

    // Execute universal adapter (Priority 1 is SET_WALL_SCRIPT, preserving your exact setup)
    applyWallpaperUniversal(filepath, {
        setWallScript: SET_WALL_SCRIPT,
        monitors,
        ws
    });

    execFile('notify-send', ['QuickSwitcher', `Wallpaper applied: ${path.basename(filepath)}`]);
    return true;
});

ipcMain.handle('select-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select Custom Wallpaper Directory'
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const selectedDir = result.filePaths[0];
        const custom = loadCustomFolders();
        if (!custom.includes(selectedDir)) {
            custom.push(selectedDir);
            saveCustomFolders(custom);
        }
        return selectedDir;
    }
    return null;
});

ipcMain.handle('delete-wallpaper', async (_event, { filepath }) => {
    const safePath = resolveAllowedWallpaper(filepath);
    if (!safePath) {
        return { success: false, error: 'Invalid wallpaper path' };
    }
    try {
        fs.unlinkSync(safePath);
        const thumbPath = getThumbPath(safePath);
        if (fs.existsSync(thumbPath)) {
            fs.unlinkSync(thumbPath);
        }
        let favs = loadFavorites();
        if (favs.includes(safePath)) {
            favs = favs.filter(p => p !== safePath);
            saveFavorites(favs);
        }
        return { success: true };
    } catch {
        return { success: false, error: 'Wallpaper deletion failed' };
    }
});

ipcMain.handle('get-favorites', async () => {
    return loadFavorites();
});

ipcMain.handle('toggle-favorite', async (_event, { filepath }) => {
    let favs = loadFavorites();
    if (favs.includes(filepath)) {
        favs = favs.filter(p => p !== filepath);
    } else {
        favs.push(filepath);
    }
    saveFavorites(favs);
    return favs;
});

ipcMain.on('close-app', () => {
    app.quit();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
