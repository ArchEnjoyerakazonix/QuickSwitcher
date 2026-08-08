const test = require('node:test');
const assert = require('node:assert');
const fsp = require('fs').promises;
const fs = require('fs');
const { isProcessOwnedMpvpaper } = require('../src/main/mpvpaperManager');

test('mpvpaperManager', async (t) => {
    await t.test('isProcessOwnedMpvpaper - validates correct owned process', async () => {
        const originalReadFile = fsp.readFile;
        const originalReadlink = fsp.readlink;

        fsp.readFile = async (path) => {
            if (path.endsWith('/cmdline')) return 'mpvpaper -f ...';
            if (path.endsWith('/stat')) return '123 (mpvpaper) S 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 987654321';
            throw new Error('Not found');
        };

        fsp.readlink = async (path) => {
            if (path.endsWith('/exe')) return '/usr/bin/mpvpaper';
            throw new Error('Not found');
        };

        const record = {
            pid: 123,
            startTime: '987654321',
            executable: '/usr/bin/mpvpaper'
        };

        const owned = await isProcessOwnedMpvpaper(record);
        assert.strictEqual(owned, true);

        fsp.readFile = originalReadFile;
        fsp.readlink = originalReadlink;
    });

    await t.test('isProcessOwnedMpvpaper - rejects wrong executable', async () => {
        const originalReadFile = fsp.readFile;
        const originalReadlink = fsp.readlink;

        fsp.readFile = async (path) => {
            if (path.endsWith('/cmdline')) return 'mpvpaper -f ...';
            if (path.endsWith('/stat')) return '123 (mpvpaper) S 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 987654321';
            throw new Error('Not found');
        };

        fsp.readlink = async () => {
            return '/usr/bin/malicious-binary';
        };

        const record = {
            pid: 123,
            startTime: '987654321',
            executable: '/usr/bin/mpvpaper'
        };

        const owned = await isProcessOwnedMpvpaper(record);
        assert.strictEqual(owned, false);

        fsp.readFile = originalReadFile;
        fsp.readlink = originalReadlink;
    });

    await t.test('isProcessOwnedMpvpaper - rejects wrong startTime', async () => {
        const originalReadFile = fsp.readFile;
        const originalReadlink = fsp.readlink;

        fsp.readFile = async (path) => {
            if (path.endsWith('/cmdline')) return 'mpvpaper -f ...';
            if (path.endsWith('/stat')) return '123 (mpvpaper) S 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1 111111111';
            throw new Error('Not found');
        };

        fsp.readlink = async () => {
            return '/usr/bin/mpvpaper';
        };

        const record = {
            pid: 123,
            startTime: '987654321',
            executable: '/usr/bin/mpvpaper'
        };

        const owned = await isProcessOwnedMpvpaper(record);
        assert.strictEqual(owned, false);

        fsp.readFile = originalReadFile;
        fsp.readlink = originalReadlink;
    });
});
