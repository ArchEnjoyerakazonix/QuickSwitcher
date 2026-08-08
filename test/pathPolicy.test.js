const test = require('node:test');
const assert = require('node:assert');
const { isInsideRoots } = require('../src/main/pathPolicy');

test('Path Policy - isInsideRoots', async (t) => {
    const roots = ['/home/user/Pictures/wallpapers', '/home/user/custom/walls'];

    await t.test('allows nested files inside roots', () => {
        assert.strictEqual(isInsideRoots('/home/user/Pictures/wallpapers/nature.jpg', roots), true);
        assert.strictEqual(isInsideRoots('/home/user/custom/walls/anime/cyberpunk.png', roots), true);
    });

    await t.test('rejects files outside roots', () => {
        assert.strictEqual(isInsideRoots('/home/user/Pictures/nature.jpg', roots), false);
        assert.strictEqual(isInsideRoots('/etc/passwd', roots), false);
    });

    await t.test('rejects path traversal attempts', () => {
        assert.strictEqual(isInsideRoots('/home/user/Pictures/wallpapers/../secret.txt', roots), false);
    });
});
