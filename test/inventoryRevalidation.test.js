const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fsp = require('fs').promises;
const { rememberWallpaper, revalidateRecord } = require('../src/main/wallpaperInventory');

test('Inventory Revalidation', async (t) => {
    const testFile = path.join(__dirname, 'test_val.jpg');
    const symlinkFile = path.join(__dirname, 'test_val_sym.jpg');

    t.before(async () => {
        await fsp.writeFile(testFile, 'dummy content');
        await fsp.symlink(testFile, symlinkFile).catch(() => {});
    });

    t.after(async () => {
        await fsp.unlink(testFile).catch(() => {});
        await fsp.unlink(symlinkFile).catch(() => {});
    });

    await t.test('revalidateRecord - passes for unmodified file', async () => {
        const stat = await fsp.stat(testFile);
        const inventory = new Map();
        const pub = rememberWallpaper(
            inventory,
            testFile,
            testFile,
            { name: 'test_val.jpg' },
            'thumb.jpg',
            'file://thumb.jpg',
            false,
            '.jpg',
            stat
        );

        const record = inventory.get(pub.id);
        const valid = await revalidateRecord(record);
        assert.strictEqual(valid, true);
    });

    await t.test('revalidateRecord - fails if file size changes', async () => {
        const stat = await fsp.stat(testFile);
        const inventory = new Map();
        const pub = rememberWallpaper(
            inventory,
            testFile,
            testFile,
            { name: 'test_val.jpg' },
            'thumb.jpg',
            'file://thumb.jpg',
            false,
            '.jpg',
            { ...stat, size: 99999 } // modified size
        );

        const record = inventory.get(pub.id);
        const valid = await revalidateRecord(record);
        assert.strictEqual(valid, false);
    });

    await t.test('revalidateRecord - checks symlink correctly', async () => {
        const stat = await fsp.stat(testFile);
        const inventory = new Map();
        const pub = rememberWallpaper(
            inventory,
            symlinkFile,
            testFile,
            { name: 'test_val_sym.jpg' },
            'thumb.jpg',
            'file://thumb.jpg',
            false,
            '.jpg',
            stat
        );

        const record = inventory.get(pub.id);
        const valid = await revalidateRecord(record);
        assert.strictEqual(valid, true);
    });
});
