const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fsp = require('fs').promises;
const { queueJsonWrite, readJson, updateJson } = require('../src/main/store');

test('store.js atomic serialization', async (t) => {
    const testFile = path.join(__dirname, 'test_store.json');

    t.afterEach(async () => {
        await fsp.unlink(testFile).catch(() => {});
    });

    await t.test('queueJsonWrite & readJson - writes and reads data', async () => {
        await queueJsonWrite(testFile, { hello: 'world' });
        const read = await readJson(testFile, {});
        assert.strictEqual(read.hello, 'world');
    });

    await t.test('updateJson - runs concurrent updates in order without losing transactions', async () => {
        // Initialize
        await queueJsonWrite(testFile, [1]);

        // Run concurrent updates
        const p1 = updateJson(testFile, [], (arr) => [...arr, 2]);
        const p2 = updateJson(testFile, [], (arr) => [...arr, 3]);

        await Promise.all([p1, p2]);

        const final = await readJson(testFile, []);
        assert.deepStrictEqual(final.sort(), [1, 2, 3]);
    });

    await t.test('readJson - returns fallback on error', async () => {
        const result = await readJson('nonexistent_file.json', { fallback: true });
        assert.strictEqual(result.fallback, true);
    });
});
