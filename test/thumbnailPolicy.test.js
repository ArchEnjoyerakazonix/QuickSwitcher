const test = require('node:test');
const assert = require('node:assert');
const { getThumbPath } = require('../src/main/thumbnailPolicy');

test('Thumbnail Policy', async (t) => {
    await t.test('getThumbPath - computes unique fingerprints based on size and mtime', () => {
        const path1 = '/path/to/img.jpg';
        const stat1 = { size: 1000, mtimeMs: 1600000000000 };
        const stat2 = { size: 1000, mtimeMs: 1600000000001 }; // modified time changes
        const stat3 = { size: 1001, mtimeMs: 1600000000000 }; // size changes

        const p1 = getThumbPath('/tmp/cache', path1, stat1);
        const p2 = getThumbPath('/tmp/cache', path1, stat2);
        const p3 = getThumbPath('/tmp/cache', path1, stat3);

        assert.notStrictEqual(p1, p2);
        assert.notStrictEqual(p1, p3);
        assert.notStrictEqual(p2, p3);
    });
});
