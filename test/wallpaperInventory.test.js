const test = require('node:test');
const assert = require('node:assert');
const { rememberWallpaper, getWallpaperRecord, replaceWallpaperInventory } = require('../src/main/wallpaperInventory');

test('wallpaperInventory', async (t) => {
    t.beforeEach(() => {
        replaceWallpaperInventory(new Map());
    });

    await t.test('rememberWallpaper - creates and returns a valid public record', () => {
        const ent = { name: 'test.jpg' };
        const stat = { size: 1024, mtimeMs: 1000 };
        const inventory = new Map();
        const pub = rememberWallpaper(inventory, '/src/test.jpg', '/target/test.jpg', ent, 'thumb.jpg', 'file://thumb.jpg', false, '.jpg', stat);
        
        assert.strictEqual(typeof pub.id, 'string');
        assert.strictEqual(pub.id.length, 64);
        assert.strictEqual(pub.name, 'test.jpg');
        assert.strictEqual(pub.type, 'IMAGE');
        
        // Ensure sensitive paths are NOT in public object
        assert.strictEqual(pub.sourcePath, undefined);
        assert.strictEqual(pub.targetPath, undefined);
        assert.strictEqual(pub.thumbPath, undefined);
    });

    await t.test('getWallpaperRecord - retrieves full record by id from live inventory', () => {
        const ent = { name: 'video.mp4' };
        const stat = { size: 2048, mtimeMs: 2000 };
        const inventory = new Map();
        const pub = rememberWallpaper(inventory, '/src/video.mp4', '/target/video.mp4', ent, 'thumb.jpg', 'file://thumb.jpg', true, '.mp4', stat);
        
        replaceWallpaperInventory(inventory);
        const fullRecord = getWallpaperRecord(pub.id);
        assert.notStrictEqual(fullRecord, null);
        assert.strictEqual(fullRecord.sourcePath, '/src/video.mp4');
        assert.strictEqual(fullRecord.targetPath, '/target/video.mp4');
        assert.strictEqual(fullRecord.type, 'VIDEO');
    });
});
