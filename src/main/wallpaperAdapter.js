const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const pExecFile = promisify(execFile);

/**
 * Universal Cross-Platform Wallpaper Adapter
 * Supports: ArchEclipse (custom script), Hyprland, SWWW, Hyprpaper, MPVPaper, GNOME, KDE, XFCE, Windows, macOS
 */
async function applyWallpaperUniversal(filepath, options = {}) {
    const { setWallScript, monitors = [], ws = 1 } = options;

    // 1. PRIMARY PRIORITY: If ArchEclipse set-wallpaper.sh script exists, use it! (User System)
    if (setWallScript && fs.existsSync(setWallScript)) {
        const monList = monitors.length ? monitors : ['DP-2'];
        for (const mon of monList) {
            execFile('bash', [setWallScript, String(ws), mon, filepath], (err) => {
                if (err) console.warn('[QuickSwitcher] set-wallpaper.sh error:', err.message);
            });
        }
        return { ok: true, backend: 'ArchEclipse (set-wallpaper.sh)' };
    }

    const ext = path.extname(filepath).toLowerCase();
    const isVideo = ['.mp4', '.webm'].includes(ext);
    const platform = process.platform;
    const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toUpperCase();

    // 2. VIDEO HANDLING FOR WAYLAND / LINUX
    if (isVideo) {
        if (platform !== 'linux') {
            return { ok: false, backend: null, error: `Video wallpapers are not supported natively on ${platform}` };
        }
        // Prevent process leak: reap previous mpvpaper instances
        try {
            execFileSync('pkill', ['-x', 'mpvpaper'], { timeout: 2000, stdio: 'ignore' });
        } catch (e) { /* none running */ }

        const monList = monitors.length ? monitors : ['*'];
        for (const mon of monList) {
            const child = execFile('mpvpaper', ['-f', '-o', 'no-audio --loop-file=inf --panscan=1.0 --hwdec=auto', mon, filepath], (err) => {
                if (err) console.warn('[QuickSwitcher] mpvpaper error:', err.message);
            });
            if (child.unref) child.unref();
        }
        return { ok: true, backend: 'mpvpaper' };
    }

    // 3. WINDOWS PLATFORM (S2 Fix: Safe env variable passing & no PowerShell double-quote string injection)
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
[Wallpaper]::SystemParametersInfo(0x0014, 0, $env:QS_WALLPAPER_PATH, 0x0001 -bor 0x0002)
`;
        try {
            await pExecFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], {
                env: { ...process.env, QS_WALLPAPER_PATH: filepath }
            });
            return { ok: true, backend: 'Windows (SystemParametersInfo)' };
        } catch (e) {
            return { ok: false, backend: 'powershell', error: e.message };
        }
    }

    // 4. MACOS PLATFORM (S1 Fix: Safe parameter array passing with on run argv)
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
            await pExecFile('osascript', ['-e', script, filepath]);
            return { ok: true, backend: 'macOS (Finder)' };
        } catch (e) {
            return { ok: false, backend: 'osascript', error: e.message };
        }
    }

    // 5. LINUX DESKTOP ENVIRONMENTS (GNOME / KDE / XFCE)
    if (desktop.includes('GNOME') || desktop.includes('CINNAMON') || desktop.includes('MATE')) {
        const safeUri = 'file://' + encodeURI(filepath).replace(/#/g, '%23');
        const schema = desktop.includes('MATE') ? 'org.mate.background' :
                       desktop.includes('CINNAMON') ? 'org.cinnamon.desktop.background' :
                       'org.gnome.desktop.background';
        execFile('gsettings', ['set', schema, 'picture-uri', safeUri], (err) => {
            if (err) console.warn('[QuickSwitcher] gsettings picture-uri error:', err.message);
        });
        if (desktop.includes('GNOME')) {
            execFile('gsettings', ['set', schema, 'picture-uri-dark', safeUri], (err) => {
                if (err) console.warn('[QuickSwitcher] gsettings picture-uri-dark error:', err.message);
            });
        }
        return { ok: true, backend: `Linux (${desktop})` };
    }

    if (desktop.includes('KDE')) {
        try {
            await pExecFile('plasma-apply-wallpaperimage', [filepath]);
            return { ok: true, backend: 'KDE Plasma' };
        } catch (e) {
            console.warn('[QuickSwitcher] KDE wallpaper apply error:', e.message);
        }
    }

    if (desktop.includes('XFCE')) {
        execFile('xfconf-query', ['-c', 'xfce4-desktop', '-l'], { timeout: 2000 }, (err, stdout) => {
            if (!err && stdout) {
                const props = stdout.split('\n').filter(l => l.trim().endsWith('/last-image'));
                for (const prop of props) {
                    execFile('xfconf-query', ['-c', 'xfce4-desktop', '-p', prop.trim(), '-s', filepath], (e) => {
                        if (e) console.warn('[QuickSwitcher] xfconf-query error:', e.message);
                    });
                }
            }
        });
        return { ok: true, backend: 'XFCE' };
    }

    // 6. HYPRLAND / WAYLAND / X11 FALLBACKS
    // Try SWWW first
    try {
        execFileSync('swww', ['query'], { timeout: 1000, stdio: 'ignore' });
        await pExecFile('swww', ['img', filepath]);
        return { ok: true, backend: 'swww' };
    } catch (e) { /* swww not active */ }

    // Try Hyprpaper (Unload old VRAM + Preload new + Set)
    try {
        try {
            execFileSync('hyprctl', ['hyprpaper', 'unload', 'all'], { timeout: 2000, stdio: 'ignore' });
        } catch (e) { /* ignore */ }

        execFileSync('hyprctl', ['hyprpaper', 'preload', filepath], { timeout: 5000, stdio: 'ignore' });
        const monList = monitors.length ? monitors : [''];
        for (const mon of monList) {
            execFile('hyprctl', ['hyprpaper', 'wallpaper', `${mon},${filepath}`], (err) => {
                if (err) console.warn('[QuickSwitcher] hyprpaper wallpaper error:', err.message);
            });
        }
        return { ok: true, backend: 'hyprpaper' };
    } catch (err) {
        // Fallback to feh for X11 / i3 / bspwm
        try {
            await pExecFile('feh', ['--bg-fill', filepath]);
            return { ok: true, backend: 'feh' };
        } catch (fehErr) {
            return { ok: false, backend: null, error: 'No supported Linux wallpaper daemon found (install swww, hyprpaper, or feh)' };
        }
    }
}

module.exports = { applyWallpaperUniversal };
