const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const { stopOwnedMpvpaper, spawnMpvpaperMonitor, saveMpvpaperPids, terminateOwnedPids } = require('./mpvpaperManager');

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
    const { setWallScript, monitors = [], ws = 1, configDir, previousPath, mediaType } = options;

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
    const homeDir = require('os').homedir();
    const currentConf = path.join(homeDir, '.config/hypr/wallpaper-daemon/config/current.conf');
    if (fs.existsSync(path.dirname(currentConf))) {
        try {
            fs.mkdirSync(path.dirname(currentConf), { recursive: true });
            fs.writeFileSync(currentConf, filepath, 'utf-8');
        } catch {}
    }

    const restoreScript = path.join(homeDir, '.config/hypr/custom/scripts/__restore_video_wallpaper.sh');
    const videoPathFile = path.join(homeDir, '.config/hypr/custom/scripts/__current_video_path.txt');
    if (isVideo && fs.existsSync(path.dirname(restoreScript))) {
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
$ok = [Wallpaper]::SystemParametersInfo(0x0014, 0, $env:QS_WALLPAPER_PATH, 0x0001 -bor 0x0002)
if (-not $ok) {
    throw "SystemParametersInfoW returned 0"
}
`;
        try {
            await pExecFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
                env: { ...process.env, QS_WALLPAPER_PATH: filepath },
                timeout: DEFAULT_TIMEOUT,
                windowsHide: true
            });
            return { ok: true, backend: 'Windows (SystemParametersInfo)' };
        } catch (e) {
            return { ok: false, backend: 'powershell', error: e.message };
        }
    }

    // 5. MACOS PLATFORM
    if (platform === 'darwin') {
        const script = `
on run argv
  set p to POSIX file (item 1 of argv)
  tell application "System Events"
    repeat with d in every desktop
      set picture of d to p
    end repeat
  end tell
end run`;
        try {
            await pExecFile('osascript', ['-e', script, filepath], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'macOS (Finder)' };
        } catch (e) {
            return { ok: false, backend: 'osascript', error: e.message };
        }
    }

    // 6. LINUX DESKTOP ENVIRONMENTS (GNOME / KDE / XFCE / MATE / CINNAMON)
    if (desktop.includes('GNOME') || desktop.includes('CINNAMON') || desktop.includes('MATE')) {
        const safeUri = pathToFileURL(filepath).href;
        const isMate = desktop.includes('MATE');
        const schema = isMate ? 'org.mate.background' :
                       desktop.includes('CINNAMON') ? 'org.cinnamon.desktop.background' :
                       'org.gnome.desktop.background';
        const key = isMate ? 'picture-filename' : 'picture-uri';
        const val = isMate ? filepath : safeUri;

        try {
            await pExecFile('gsettings', ['set', schema, key, val], { timeout: DEFAULT_TIMEOUT });
            if (desktop.includes('GNOME')) {
                await pExecFile('gsettings', ['set', schema, 'picture-uri-dark', safeUri], { timeout: DEFAULT_TIMEOUT }).catch(() => {});
            }
            return { ok: true, backend: `Linux (${desktop})` };
        } catch (e) {
            return { ok: false, backend: 'gsettings', error: e.message };
        }
    }

    if (desktop.includes('KDE')) {
        try {
            await pExecFile('plasma-apply-wallpaperimage', [filepath], { timeout: DEFAULT_TIMEOUT });
            return { ok: true, backend: 'KDE Plasma' };
        } catch (e) {
            console.warn('[QuickSwitcher] KDE wallpaper apply error:', e.message);
        }
    }

    if (desktop.includes('XFCE')) {
        try {
            const { stdout } = await pExecFile('xfconf-query', ['-c', 'xfce4-desktop', '-l'], { timeout: 2000 });
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
        const switchwallScript = path.join(homeDir, '.config/quickshell/ii/scripts/colors/switchwall.sh');
        if (fs.existsSync(switchwallScript)) {
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
