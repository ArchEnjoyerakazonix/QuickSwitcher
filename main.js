const { app, BrowserWindow, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, execSync } = require('child_process');
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
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            backgroundThrottling: false,
        }
    });

    win.loadFile('index.html');
}

ipcMain.handle('get-wallpapers', async () => {
    let files = [];
    for (const dir of WALL_DIRS) {
        if (fs.existsSync(dir)) {
            try {
                const list = fs.readdirSync(dir);
                for (const file of list) {
                    const fullPath = path.join(dir, file);
                    const ext = path.extname(file).toLowerCase();
                    if (['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat.isFile()) {
                                const thumbPath = getThumbPath(fullPath);
                                const isVideo = ['.mp4', '.webm'].includes(ext);

                                const thumb = fs.existsSync(thumbPath) ? thumbPath : fullPath;

                                files.push({
                                    name: file,
                                    path: fullPath,
                                    thumb,
                                    type: isVideo ? 'VIDEO' : 'IMAGE',
                                    ext: ext.replace('.', '').toUpperCase()
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

ipcMain.handle('apply-wallpaper', async (event, { filepath }) => {
    if (!filepath || typeof filepath !== 'string') return false;

    let monitors;
    try {
        const out = execSync('hyprctl monitors -j', { timeout: 2000 }).toString();
        monitors = JSON.parse(out).map(m => m.name);
    } catch {
        monitors = ['DP-2'];
    }

    let ws = 1;
    try {
        const out = execSync('hyprctl activeworkspace -j', { timeout: 2000 }).toString();
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
                execSync('swww query', { timeout: 1000 });
                execFile('swww', ['img', filepath]);
            } catch {
                for (const mon of monitors) {
                    execFile('hyprctl', ['hyprpaper', 'wallpaper', `${mon},${filepath}`]);
                }
            }
        }
    }

    execFile('notify-send', ['QuickSwitcher', `Обои применены: ${path.basename(filepath)}`]);
    return true;
});

ipcMain.handle('delete-wallpaper', async (event, { filepath }) => {
    const allowed = WALL_DIRS.some(d => filepath.startsWith(d + '/'));
    if (!allowed) return { success: false, error: 'path outside wallpaper dirs' };
    try {
        fs.unlinkSync(filepath);
        const thumbPath = getThumbPath(filepath);
        if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('close-app', () => {
    app.quit();
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
