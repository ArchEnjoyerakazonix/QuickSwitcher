const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fsp = require('fs').promises;
const { rememberWallpaper } = require('../src/main/wallpaperInventory');

test('Video Scan Smoke Test', async (t) => {
    const tmpDir = path.join(__dirname, 'mock_video_scan');
    const videoFile = path.join(tmpDir, 'sample_video.mp4');

    t.before(async () => {
        await fsp.mkdir(tmpDir, { recursive: true });
        await fsp.writeFile(videoFile, 'fake video stream data');
    });

    t.after(async () => {
        await fsp.unlink(videoFile).catch(() => {});
        await fsp.rmdir(tmpDir).catch(() => {});
    });

    await t.test('scans uncached video file and creates valid wallpaper record', async () => {
        const stat = await fsp.stat(videoFile);
        const inventory = new Map();
        const pub = rememberWallpaper(
            inventory,
            videoFile,
            videoFile,
            { name: 'sample_video.mp4' },
            '/tmp/thumb.jpg',
            'file:///assets/icon.png',
            true,
            '.mp4',
            stat
        );

        assert.strictEqual(pub.type, 'VIDEO');
        assert.strictEqual(pub.name, 'sample_video.mp4');
        assert.strictEqual(pub.thumbUrl, 'file:///assets/icon.png');
        assert.strictEqual(inventory.size, 1);
    });
});
