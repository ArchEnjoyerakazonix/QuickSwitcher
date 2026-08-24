const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const { stopOwnedMpvpaper, spawnMpvpaperMonitor, saveMpvpaperPids, terminateOwnedPids } = require('./mpvpaperManager');
const { CURRENT_CONF, RESTORE_SCRIPT, VIDEO_PATH_FILE, SWITCHWALL_SCRIPT } = require('./appPaths');

const pExecFile = (cmd, args, opts) => promisify(cp.execFile)(cmd, args, opts);
const DEFAULT_TIMEOUT = 10000;

function buildRestoreScript(videoPathFile) {
    return `#!/bin/bash
PATH_FILE="${videoPathFile}"
[ -f "$PATH_FILE" ] || exit 0
WALL="$(cat "$PATH_FILE")"
[ -f "$WALL" ] || exit 0
pkill -f mpvpaper
for monitor in $(hyprctl monitors -j | jq -r '.[] | .name'); do
    mpvpaper -o "no-audio loop hwdec=auto scale=bilinear interpolation=no video-sync=display-resample panscan=1.0 video-scale-x=1.0 video-scale-y=1.0 video-align-x=0.5 video-align-y=0.5 load-scripts=no" "$monitor" "$WALL" &
    sleep 0.1
done
`;
}

/**
 * Universal Cross-Platform Wallpaper Adapter
 * Supports: ArchEclipse (custom script), Hyprland, SWWW, Hyprpaper, MPVPaper, GNOME, KDE, XFCE, Windows, macOS
 */
async function applyWallpaperUniversal(filepath, options = {}) {
    const {
        setWallScript,
        monitors = [],
        ws = 1,
        configDir,
        previousPath,
        mediaType,
        currentConf = CURRENT_CONF,
        restoreScript = RESTORE_SCRIPT,
        videoPathFile = VIDEO_PATH_FILE,
        switchwallScript = SWITCHWALL_SCRIPT
    } = options;

    const ext = path.extname(filepath).toLowerCase();
    const platform = process.platform;
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();

    // GIF is handled as an animated video on Linux (via mpvpaper / setWallScript),
    // but falls through to native static image backends on Windows, macOS, GNOME, KDE, XFCE.
    const isGif = ext === '.gif';
    const isTrueVideo = mediaType === 'VIDEO' ? (!isGif) : ['.mp4', '.webm'].includes(ext);
    const isVideo = isTrueVideo || (isGif && platform === 'linux');

    // 1. LIFECYCLE TRANSITION
    // Sync with Hyprland wallpaper daemon current.conf & __restore_video_wallpaper.sh to prevent daemon revert on window/workspace switch
    if (currentConf && fs.existsSync(path.dirname(currentConf))) {
        try {
            fs.mkdirSync(path.dirname(currentConf), { recursive: true });
            fs.writeFileSync(currentConf, filepath, 'utf-8');
        } catch {}
    }

    if (isVideo && restoreScript && videoPathFile && fs.existsSync(path.dirname(restoreScript))) {
        try {
            fs.writeFileSync(videoPathFile, filepath, 'utf-8');
            const scriptContent = buildRestoreScript(videoPathFile);
            fs.writeFileSync(restoreScript, scriptContent, { encoding: 'utf-8', mode: 0o755 });
        } catch {}
    }

    // Stop any video wallpapers before dispatching to ANY backend
    if (platform === 'linux') {
        await stopOwnedMpvpaper(configDir);
    }

    // 2. PRIMARY PRIORITY: If ArchEclipse set-wallpaper.sh script exists, use it!
    if (setWallScript && fs.existsSync(setWallScript)) {
        const monList = monitors.length ? monitors : ['DP-2'];
        try {
            await Promise.all(
                monList.map(mon => pExecFile('bash', [setWallScript, String(ws), mon, filepath], { timeout: DEFAULT_TIMEOUT }))
            );
            return { ok: true, backend: 'ArchEclipse (set-wallpaper.sh)' };
        } catch (e) {
            return { ok: false, backend: 'ArchEclipse', error: e.message };
        }
    }

    // 3. VIDEO HANDLING FOR WAYLAND / LINUX
    if (isVideo) {
        if (platform !== 'linux') {
            return { ok: false, backend: null, error: `Video wallpapers are not supported natively on ${platform}` };
        }

        const monList = monitors.length ? monitors : ['eDP-1'];

        const results = await Promise.allSettled(
            monList.map(mon => spawnMpvpaperMonitor(mon, filepath, cp.spawn))
        );

        const started = results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        const failures = results
            .filter(r => r.status === 'rejected');

        if (failures.length > 0) {
            await terminateOwnedPids(started);
            await saveMpvpaperPids(configDir, []);
            return { ok: false, backend: 'mpvpaper', error: failures[0].reason.message };
        }

        await saveMpvpaperPids(configDir, started);
        return { ok: true, backend: 'mpvpaper' };
    }

    // 4. WINDOWS PLATFORM
    if (platform === 'win32') {
        const psScript = `
$code = @'
using System.Runtime.InteropServices;
public class Wallpaper {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
'@
Add-Type -TypeDefinition $code
[Wallpaper]::SystemParametersInfo(0x0014, 0, "${filepath.replace(/\\/g, '\\\\')}", 0x01 -bor 0x02)
`;
        try {
            await pExecFile('powershell', ['-NoProfile', '-Command', psScript], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'Windows (SystemParametersInfo)' };
        } catch (e) {
            return { ok: false, backend: 'Windows', error: e.message };
        }
    }

    // 5. MACOS PLATFORM
    if (platform === 'darwin') {
        const script = `tell application "System Events" to tell every desktop to set picture to "${filepath}"`;
        try {
            await pExecFile('osascript', ['-e', script], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'macOS (Finder)' };
        } catch (e) {
            return { ok: false, backend: 'macOS (Finder)', error: e.message };
        }
    }

    // 6. LINUX DESKTOP ENVIRONMENTS
    if (desktop.includes('GNOME') || desktop.includes('CINNAMON')) {
        try {
            const uri = pathToFileURL(filepath).href;
            await pExecFile('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', uri], { timeout: DEFAULT_TIMEOUT });
            await pExecFile('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'Linux (GNOME)' };
        } catch (e) {
            return { ok: false, backend: 'Linux (GNOME)', error: e.message };
        }
    }

    if (desktop.includes('MATE')) {
        try {
            await pExecFile('gsettings', ['set', 'org.mate.background', 'picture-filename', filepath], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'Linux (MATE)' };
        } catch (e) {
            return { ok: false, backend: 'Linux (MATE)', error: e.message };
        }
    }

    if (desktop.includes('KDE')) {
        try {
            await pExecFile('plasma-apply-wallpaperimage', [filepath], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'KDE Plasma' };
        } catch (e) {
            return { ok: false, backend: 'KDE Plasma', error: e.message };
        }
    }

    if (desktop.includes('XFCE')) {
        try {
            const { stdout } = await pExecFile('xfconf-query', ['-c', 'xfce4-desktop', '-l'], { timeout: DEFAULT_TIMEOUT });
            const props = stdout.split('\n').map(s => s.trim()).filter(l => l.endsWith('/last-image'));
            if (props.length === 0) throw new Error('No XFCE wallpaper properties found');
            await Promise.all(props.map(prop => pExecFile('xfconf-query', ['-c', 'xfce4-desktop', '-p', prop, '-s', filepath], { timeout: DEFAULT_TIMEOUT })));
            return { ok: true, backend: 'XFCE' };
        } catch (e) {
            return { ok: false, backend: 'XFCE', error: e.message };
        }
    }

    // 7. HYPRLAND / WAYLAND / X11 FALLBACKS
    try {
        await pExecFile('swww', ['query'], { timeout: 1000 });
        await pExecFile('swww', ['img', filepath], { timeout: DEFAULT_TIMEOUT });
        return { ok: true, backend: 'swww' };
    } catch (e) { /* swww not active */ }

    // Preload & assign first, then unload previous
    try {
        await pExecFile('hyprctl', ['hyprpaper', 'preload', filepath], { timeout: 5000 });
        const monList = monitors.length ? monitors : [''];
        await Promise.all(monList.map(mon => pExecFile('hyprctl', ['hyprpaper', 'wallpaper', `${mon},${filepath}`], { timeout: DEFAULT_TIMEOUT })));
        
        if (previousPath && previousPath !== filepath) {
            await pExecFile('hyprctl', ['hyprpaper', 'unload', previousPath], { timeout: 2000 }).catch(() => {});
        }
        
        // Trigger Matugen / switchwall.sh to auto-recolor Kitty, Hyprland, Quickshell, GTK & system UI
        if (switchwallScript && fs.existsSync(switchwallScript)) {
            cp.execFile('bash', [switchwallScript, filepath], (err) => {
                if (err) console.error('[QuickSwitcher] Auto-recolor switchwall error:', err.message);
            });
        }

        return { ok: true, backend: 'hyprpaper' };
    } catch (err) {
        try {
            await pExecFile('feh', ['--bg-fill', filepath], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'feh' };
        } catch (fehErr) {
            return { ok: false, backend: null, error: 'No supported Linux wallpaper daemon found (install swww, hyprpaper, or feh)' };
        }
    }
}

module.exports = { applyWallpaperUniversal, buildRestoreScript };
