const { execFile, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Universal Cross-Platform Wallpaper Adapter
 * Supports: ArchEclipse (custom script), Hyprland, SWWW, Hyprpaper, MPVPaper, GNOME, KDE, XFCE, Windows, macOS
 */
function applyWallpaperUniversal(filepath, options = {}) {
    const { setWallScript, monitors = ['DP-2'], ws = 1 } = options;

    // 1. PRIMARY PRIORITY: If ArchEclipse set-wallpaper.sh script exists, use it! (Your system)
    if (setWallScript && fs.existsSync(setWallScript)) {
        for (const mon of monitors) {
            execFile('bash', [setWallScript, String(ws), mon, filepath]);
        }
        return true;
    }

    const ext = path.extname(filepath).toLowerCase();
    const isVideo = ['.mp4', '.webm'].includes(ext);
    const platform = process.platform;

    // 2. WINDOWS PLATFORM
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
[Wallpaper]::SystemParametersInfo(0x0014, 0, "${filepath.replace(/\\/g, '\\\\')}", 0x0001 -bor 0x0002)
`;
        execFile('powershell', ['-Command', psScript]);
        return true;
    }

    // 3. MACOS PLATFORM
    if (platform === 'darwin') {
        const osascript = `tell application "System Events" to set picture of every desktop to "${filepath}"`;
        execFile('osascript', ['-e', osascript]);
        return true;
    }

    // 4. LINUX DESKTOP ENVIRONMENTS
    // Check GNOME
    if (process.env.XDG_CURRENT_DESKTOP && process.env.XDG_CURRENT_DESKTOP.includes('GNOME')) {
        const fileUrl = `file://${filepath}`;
        execFile('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri', fileUrl]);
        execFile('gsettings', ['set', 'org.gnome.desktop.background', 'picture-uri-dark', fileUrl]);
        return true;
    }

    // Check KDE Plasma
    if (process.env.XDG_CURRENT_DESKTOP && process.env.XDG_CURRENT_DESKTOP.includes('KDE')) {
        execFile('plasma-apply-wallpaperimage', [filepath]);
        return true;
    }

    // 5. HYPRLAND / WAYLAND / X11 FALLBACKS
    if (isVideo) {
        for (const mon of monitors) {
            execFile('mpvpaper', ['-o', 'no-audio loop', mon, filepath]);
        }
    } else {
        // Try SWWW first
        let usedSwww = false;
        try {
            execFileSync('swww', ['query'], { timeout: 1000, stdio: 'ignore' });
            execFile('swww', ['img', filepath]);
            usedSwww = true;
        } catch (e) {}

        if (!usedSwww) {
            // Try Hyprpaper (with required preload step!)
            try {
                for (const mon of monitors) {
                    execFileSync('hyprctl', ['hyprpaper', 'preload', filepath], { timeout: 1000, stdio: 'ignore' });
                    execFile('hyprctl', ['hyprpaper', 'wallpaper', `${mon},${filepath}`]);
                }
            } catch (err) {
                // Fallback to feh for X11 / i3 / bspwm
                try {
                    execFile('feh', ['--bg-fill', filepath]);
                } catch (fehErr) {}
            }
        }
    }

    return true;
}

module.exports = { applyWallpaperUniversal };
