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

const pendingThumbs = new Set();

function ensureThumbnail(fullPath, thumbPath, isVideo) {
    if (fs.existsSync(thumbPath)) return thumbPath;
    if (!isVideo) return fullPath;

    if (!pendingThumbs.has(thumbPath)) {
        pendingThumbs.add(thumbPath);
        execFile('ffmpeg', ['-threads', '2', '-y', '-ss', '00:00:02', '-i', fullPath, '-vframes', '1', '-q:v', '2', thumbPath], { timeout: 3000 }, (err) => {
            if (err) {
                execFile('ffmpeg', ['-threads', '2', '-y', '-i', fullPath, '-vframes', '1', '-q:v', '2', thumbPath], { timeout: 3000 }, () => {
                    pendingThumbs.delete(thumbPath);
                });
            } else {
                pendingThumbs.delete(thumbPath);
            }
        });
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

    // Helper to check if a command exists in PATH
    const commandExists = (cmd) => {
        try {
            execFileSync('which', [cmd], { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    };

    // 1. Detect active monitors/outputs
    let monitors = [];
    
    // Try Hyprland monitors first
    if (commandExists('hyprctl')) {
        try {
            const out = execFileSync('hyprctl', ['monitors', '-j'], { timeout: 1000 }).toString();
            monitors = JSON.parse(out).map(m => m.name);
        } catch {}
    }
    
    // Try Niri outputs if Hyprland wasn't found or failed
    if (monitors.length === 0 && commandExists('niri')) {
        try {
            const out = execFileSync('niri', ['msg', '-j', 'outputs'], { timeout: 1000 }).toString();
            const outputs = JSON.parse(out);
            monitors = Object.keys(outputs).filter(name => outputs[name].active).map(name => name);
        } catch {}
    }

    // Try swww/awww query as another fallback
    if (monitors.length === 0 && (commandExists('swww') || commandExists('awww'))) {
        try {
            const cmd = commandExists('swww') ? 'swww' : 'awww';
            const out = execFileSync(cmd, ['query'], { timeout: 1000 }).toString();
            // Parse monitor names from lines like "DP-1: type..."
            monitors = out.split('\n')
                .map(line => line.split(':')[0].trim())
                .filter(name => name.length > 0 && !name.includes('no daemon'));
        } catch {}
    }

    // Generic fallback if we couldn't detect anything
    if (monitors.length === 0) {
        monitors = ['eDP-1', 'DP-1', 'DP-2', 'HDMI-A-1'];
    }

    const ext = path.extname(filepath).toLowerCase();
    const isVideo = ['.mp4', '.webm', '.gif'].includes(ext);

    // 2. Set the wallpaper using the best available tool
    if (isVideo && commandExists('mpvpaper')) {
        // Kill existing wallpaper programs to avoid resource conflicts
        try { execFileSync('pkill', ['-9', '-x', 'mpvpaper']); } catch {}
        try { execFileSync('pkill', ['-9', '-x', 'swaybg']); } catch {}
        
        for (const mon of monitors) {
            execFile('mpvpaper', ['-o', 'no-audio loop', mon, filepath]);
        }
    } else {
        // Static Image (or video fallback if mpvpaper isn't installed)
        try { execFileSync('pkill', ['-9', '-x', 'mpvpaper']); } catch {}

        // Prefer swww / awww (universal Wayland wallpaper tool)
        const hasSwww = commandExists('swww');
        const hasAwww = commandExists('awww');
        
        if (hasSwww || hasAwww) {
            const cmd = hasSwww ? 'swww' : 'awww';
            const daemonCmd = hasSwww ? 'swww-daemon' : 'awww-daemon';

            // Ensure daemon is running
            let daemonRunning = false;
            try {
                execFileSync('pgrep', ['-x', daemonCmd]);
                daemonRunning = true;
            } catch {
                try {
                    // Try starting it in the background
                    execFile(daemonCmd);
                    // Give it a moment to initialize
                    execFileSync('sleep', ['0.3']);
                    daemonRunning = true;
                } catch (e) {
                    console.error(`Failed to start ${daemonCmd}:`, e);
                }
            }

            if (daemonRunning) {
                // Kill swaybg if it was running to let swww render
                try { execFileSync('pkill', ['-9', '-x', 'swaybg']); } catch {}
                execFile(cmd, ['img', filepath]);
            }
        } 
        // Fallback to swaybg
        else if (commandExists('swaybg')) {
            try { execFileSync('pkill', ['-9', '-x', 'swaybg']); } catch {}
            execFile('swaybg', ['-m', 'fill', '-i', filepath]);
        }
        // Fallback to hyprpaper if on Hyprland
        else if (commandExists('hyprctl')) {
            try {
                for (const mon of monitors) {
                    execFile('hyprctl', ['hyprpaper', 'wallpaper', `${mon},${filepath}`]);
                }
            } catch {}
        }
    }

    // 3. Trigger theme color regeneration if illogical-impulse or iNiR dotfiles are installed
    const home = process.env.HOME;
    const configDirs = [
        path.join(home, '.config/quickshell/ii/scripts/colors/switchwall.sh'),
        path.join(home, '.config/quickshell/iNiR/scripts/colors/switchwall.sh'),
        path.join(home, '.config/quickshell/inir/scripts/colors/switchwall.sh'),
        path.join(home, '.config/quickshell/dots/scripts/colors/switchwall.sh'),
    ];

    for (const scriptPath of configDirs) {
        if (fs.existsSync(scriptPath)) {
            // Run themeswitch in background to regenerate colors, using --noswitch flag
            // so that it ONLY updates theme colors and doesn't try to change wallpaper again.
            execFile('bash', [scriptPath, '--noswitch', '--image', filepath]);
            break;
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
