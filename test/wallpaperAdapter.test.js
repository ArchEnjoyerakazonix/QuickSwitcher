const test = require('node:test');
const assert = require('node:assert');
const cp = require('child_process');
const { applyWallpaperUniversal, buildRestoreScript } = require('../src/main/wallpaperAdapter');

test('wallpaperAdapter Universal Dispatch & GIF Routing', async (t) => {
    const originalExecFile = cp.execFile;
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    const originalDesktop = process.env.XDG_CURRENT_DESKTOP;

    t.after(() => {
        cp.execFile = originalExecFile;
        if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
        if (originalDesktop !== undefined) process.env.XDG_CURRENT_DESKTOP = originalDesktop;
        else delete process.env.XDG_CURRENT_DESKTOP;
    });

    await t.test('win32: routes GIF files to SystemParametersInfo (PowerShell)', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

        let capturedCmd, capturedArgs;
        cp.execFile = (cmd, args, opts, cb) => {
            capturedCmd = cmd;
            capturedArgs = args;
            if (typeof opts === 'function') cb = opts;
            cb(null, { stdout: '', stderr: '' });
        };

        const res = await applyWallpaperUniversal('/path/to/image.gif', { mediaType: 'IMAGE' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.backend, 'Windows (SystemParametersInfo)');
        assert.strictEqual(capturedCmd, 'powershell');
    });

    await t.test('darwin: routes GIF files to osascript', async () => {
        Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

        let capturedCmd;
        cp.execFile = (cmd, args, opts, cb) => {
            capturedCmd = cmd;
            if (typeof opts === 'function') cb = opts;
            cb(null, { stdout: '', stderr: '' });
        };

        const res = await applyWallpaperUniversal('/path/to/image.gif', { mediaType: 'IMAGE' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.backend, 'macOS (Finder)');
        assert.strictEqual(capturedCmd, 'osascript');
    });

    await t.test('Linux (MATE): uses picture-filename schema key for gsettings', async () => {
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
        process.env.XDG_CURRENT_DESKTOP = 'MATE';

        let capturedSchema, capturedKey, capturedVal;
        cp.execFile = (cmd, args, opts, cb) => {
            if (cmd === 'gsettings' && args[0] === 'set') {
                capturedSchema = args[1];
                capturedKey = args[2];
                capturedVal = args[3];
            }
            if (typeof opts === 'function') cb = opts;
            cb(null, { stdout: '', stderr: '' });
        };

        const res = await applyWallpaperUniversal('/path/to/image.png', { mediaType: 'IMAGE' });
        assert.strictEqual(res.ok, true);
        assert.strictEqual(capturedSchema, 'org.mate.background');
        assert.strictEqual(capturedKey, 'picture-filename');
        assert.strictEqual(capturedVal, '/path/to/image.png');
    });

    await t.test('win32: rejects true video files with clear error message', async () => {
        Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

        const res = await applyWallpaperUniversal('/path/to/video.mp4', { mediaType: 'VIDEO' });
        assert.strictEqual(res.ok, false);
        assert.match(res.error, /Video wallpapers are not supported natively on win32/);
    });

    await t.test('Linux (video): buildRestoreScript contract is immune to arbitrary shell injection', () => {
        const testPathFile = '/home/user/.config/hypr/custom/scripts/__current_video_path.txt';
        const script = buildRestoreScript(testPathFile);

        // Path must NOT be directly concatenated as code, but read via $PATH_FILE
        assert.ok(script.includes(`PATH_FILE="${testPathFile}"`));
        assert.ok(script.includes('WALL="$(cat "$PATH_FILE")"'));
        assert.ok(script.includes('mpvpaper -o'));
        assert.ok(script.includes('"$WALL" &'));
        assert.ok(!script.includes('${filepath}'));
    });
});

