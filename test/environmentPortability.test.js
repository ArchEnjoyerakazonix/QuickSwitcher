const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');

const { createAppPaths } = require('../src/main/appPaths');
const { applyWallpaperUniversal } = require('../src/main/wallpaperAdapter');

test('Environment Portability & Cross-Distro Compatibility', async (t) => {

    await t.test('createAppPaths works in arbitrary non-standard user environments', () => {
        const customHome = '/home/otheruser';
        const customConfig = '/home/otheruser/.config/QuickSwitcher';
        const customCache = '/home/otheruser/.cache';

        const paths = createAppPaths({
            configDir: customConfig,
            cacheDir: customCache,
            homeDir: customHome
        });

        assert.strictEqual(paths.CONFIG_DIR, customConfig);
        assert.strictEqual(paths.THUMB_DIR, path.join(customCache, 'quickswitcher-thumbs'));
        assert.strictEqual(paths.FAV_FILE, path.join(customConfig, 'favorites.json'));
        assert.strictEqual(paths.CUSTOM_FOLDERS_FILE, path.join(customConfig, 'custom_folders.json'));
        assert.strictEqual(paths.STATE_FILE, path.join(customConfig, 'state.json'));
        assert.strictEqual(paths.SET_WALL_SCRIPT, path.join(customHome, '.config/hypr/wallpaper-daemon/set-wallpaper.sh'));
    });

    await t.test('Wallpaper Adapter handles GNOME desktop environment', async () => {
        const originalExecFile = cp.execFile;
        process.env.XDG_CURRENT_DESKTOP = 'GNOME';
        const gsettingsCalls = [];

        cp.execFile = (cmd, args, opts, cb) => {
            if (typeof opts === 'function') cb = opts;
            if (cmd === 'gsettings') {
                gsettingsCalls.push({ cmd, args });
                cb(null, { stdout: '', stderr: '' });
                return;
            }
            cb(new Error(`command not found: ${cmd}`));
        };

        try {
            const res = await applyWallpaperUniversal('/tmp/wall.jpg', {
                configDir: '/tmp/test-config',
                monitors: ['eDP-1'],
                mediaType: 'IMAGE'
            });

            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.backend, 'Linux (GNOME)');
            assert.ok(gsettingsCalls.length >= 1);
            assert.strictEqual(gsettingsCalls[0].args[0], 'set');
            assert.strictEqual(gsettingsCalls[0].args[1], 'org.gnome.desktop.background');
            assert.strictEqual(gsettingsCalls[0].args[2], 'picture-uri');
        } finally {
            delete process.env.XDG_CURRENT_DESKTOP;
            cp.execFile = originalExecFile;
        }
    });

    await t.test('Wallpaper Adapter handles KDE Plasma environment', async () => {
        const originalExecFile = cp.execFile;
        process.env.XDG_CURRENT_DESKTOP = 'KDE';
        let plasmaCalled = false;

        cp.execFile = (cmd, args, opts, cb) => {
            if (typeof opts === 'function') cb = opts;
            if (cmd === 'plasma-apply-wallpaperimage') {
                plasmaCalled = true;
                cb(null, { stdout: '', stderr: '' });
                return;
            }
            cb(new Error(`command not found: ${cmd}`));
        };

        try {
            const res = await applyWallpaperUniversal('/tmp/kde_wall.png', {
                configDir: '/tmp/test-config',
                monitors: ['DP-1'],
                mediaType: 'IMAGE'
            });

            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.backend, 'KDE Plasma');
            assert.strictEqual(plasmaCalled, true);
        } finally {
            delete process.env.XDG_CURRENT_DESKTOP;
            cp.execFile = originalExecFile;
        }
    });

    await t.test('Wallpaper Adapter handles XFCE environment', async () => {
        const originalExecFile = cp.execFile;
        process.env.XDG_CURRENT_DESKTOP = 'XFCE';
        let xfcePropsQueried = false;
        let xfceSetCalled = false;

        cp.execFile = (cmd, args, opts, cb) => {
            if (typeof opts === 'function') cb = opts;
            if (cmd === 'xfconf-query' && args.includes('-l')) {
                xfcePropsQueried = true;
                cb(null, { stdout: '/backdrop/screen0/monitorDP-1/workspace0/last-image\n', stderr: '' });
                return;
            }
            if (cmd === 'xfconf-query' && args.includes('-s')) {
                xfceSetCalled = true;
                cb(null, { stdout: '', stderr: '' });
                return;
            }
            cb(new Error(`command not found: ${cmd}`));
        };

        try {
            const res = await applyWallpaperUniversal('/tmp/xfce_wall.jpg', {
                configDir: '/tmp/test-config',
                monitors: ['DP-1'],
                mediaType: 'IMAGE'
            });

            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.backend, 'XFCE');
            assert.strictEqual(xfcePropsQueried, true);
            assert.strictEqual(xfceSetCalled, true);
        } finally {
            delete process.env.XDG_CURRENT_DESKTOP;
            cp.execFile = originalExecFile;
        }
    });

    await t.test('Wallpaper Adapter falls back cleanly to feh on generic X11 without daemons', async () => {
        const originalExecFile = cp.execFile;
        delete process.env.XDG_CURRENT_DESKTOP;
        let fehCalled = false;

        cp.execFile = (cmd, args, opts, cb) => {
            if (typeof opts === 'function') cb = opts;
            if (cmd === 'feh') {
                fehCalled = true;
                cb(null, { stdout: '', stderr: '' });
                return;
            }
            cb(new Error(`daemon not running: ${cmd}`));
        };

        try {
            const res = await applyWallpaperUniversal('/tmp/x11_wall.jpg', {
                configDir: '/tmp/test-config',
                monitors: ['HDMI-1'],
                mediaType: 'IMAGE'
            });

            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.backend, 'feh');
            assert.strictEqual(fehCalled, true);
        } finally {
            cp.execFile = originalExecFile;
        }
    });

    await t.test('Wallpaper Adapter returns clear informative error when no wallpaper tools exist', async () => {
        const originalExecFile = cp.execFile;
        delete process.env.XDG_CURRENT_DESKTOP;

        cp.execFile = (cmd, args, opts, cb) => {
            if (typeof opts === 'function') cb = opts;
            cb(new Error(`not found: ${cmd}`));
        };

        try {
            const res = await applyWallpaperUniversal('/tmp/wall.jpg', {
                configDir: '/tmp/test-config',
                monitors: ['eDP-1'],
                mediaType: 'IMAGE'
            });

            assert.strictEqual(res.ok, false);
            assert.match(res.error, /No supported Linux wallpaper daemon found/);
        } finally {
            cp.execFile = originalExecFile;
        }
    });
});
