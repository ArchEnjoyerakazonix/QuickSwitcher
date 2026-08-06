const { app, BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, execFileSync } = require('child_process');
const crypto = require('crypto');
const os = require('os');

// perf
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization');

const WALL_DIRS = [
    path.join(process.env.HOME, 'Pictures/wallpapers'),
    path.join(process.env.HOME, 'Pictures/Wallpapers'),
    path.join(process.env.HOME, 'Pictures/Wallpapers/Dynamic-Wallpapers'),
    path.join(process.env.HOME, 'dotfiles/wallpapers'),
    path.join(process.env.HOME, '.config/wallpapers'),
];

const THUMB_DIR = path.join(os.homedir(), '.cache/wallpaper_hub_thumbs');
const SET_WALL_SCRIPT = path.join(process.env.HOME, '.config/hypr/wallpaper-daemon/set-wallpaper.sh');

if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

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
    const allowed = WALL_DIRS.some(dir => {
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

function createWindow() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: sysW, height: sysH } = primaryDisplay.bounds;

    const WIN_W = sysW;
    const WIN_H = 300;

    const logoPath = path.join(__dirname, 'icon.png');
    const icon = fs.existsSync(logoPath) ? nativeImage.createFromPath(logoPath) : undefined;

    const win = new BrowserWindow({
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
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            backgroundThrottling: false,
        }
    });

    win.loadFile('index.html');
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
    for (const dir of WALL_DIRS) {
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

    if (fs.existsSync(SET_WALL_SCRIPT)) {
        for (const mon of monitors) {
            execFile('bash', [SET_WALL_SCRIPT, String(ws), mon, filepath]);
        }
    } else {
        const ext = path.extname(filepath).toLowerCase();
        const isVideo = ['.mp4', '.webm'].includes(ext);

        if (isVideo) {
            for (const mon of monitors) {
                execFile('mpvpaper', ['-o', 'no-audio loop', mon, filepath]);
            }
        } else {
            try {
                execFileSync('swww', ['query'], { timeout: 1000 });
                execFile('swww', ['img', filepath]);
            } catch {
                for (const mon of monitors) {
                    execFile('hyprctl', ['hyprpaper', 'wallpaper', `${mon},${filepath}`]);
                }
            }
        }
    }

    execFile('notify-send', ['QuickSwitcher', `Wallpaper applied: ${path.basename(filepath)}`]);
    return true;
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
        return { success: true };
    } catch {
        return { success: false, error: 'Wallpaper deletion failed' };
    }
});

ipcMain.on('close-app', () => {
    app.quit();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
