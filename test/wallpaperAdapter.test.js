const test = require('node:test');
const assert = require('node:assert');
const child_process = require('child_process');
const { applyWallpaperUniversal } = require('../src/main/wallpaperAdapter');

test('wallpaperAdapter applyWallpaperUniversal', async (t) => {
    // Stub execFile
    const originalExecFile = child_process.execFile;
    let runCommands = [];

    child_process.execFile = (cmd, args, options, callback) => {
        runCommands.push({ cmd, args });
        const cb = typeof options === 'function' ? options : callback;
        cb(null, { stdout: '' });
    };

    t.afterEach(() => {
        runCommands = [];
    });

    t.after(() => {
        child_process.execFile = originalExecFile;
    });

    await t.test('applies static wallpaper using swww if active', async () => {
        const result = await applyWallpaperUniversal('/path/to/wall.jpg', {
            monitors: ['DP-1']
        });

        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.backend, 'swww');
        assert.strictEqual(runCommands[0].cmd, 'swww');
        assert.strictEqual(runCommands[0].args[0], 'query');
        assert.strictEqual(runCommands[1].cmd, 'swww');
        assert.strictEqual(runCommands[1].args[0], 'img');
    });

    await t.test('falls back to hyprpaper if swww fails', async () => {
        child_process.execFile = (cmd, args, options, callback) => {
            const cb = typeof options === 'function' ? options : callback;
            if (cmd === 'swww' && args[0] === 'query') {
                cb(new Error('swww not active'));
            } else {
                cb(null, { stdout: '' });
            }
        };

        const result = await applyWallpaperUniversal('/path/to/wall.jpg', {
            monitors: ['DP-1'],
            previousPath: '/path/to/prev.jpg'
        });

        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.backend, 'hyprpaper');
    });
});
