const test = require('node:test');
const assert = require('node:assert');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const {
    isProcessOwnedMpvpaper,
    spawnMpvpaperMonitor,
    stopOwnedMpvpaper,
    saveMpvpaperPids,
    loadMpvpaperPids
} = require('../src/main/mpvpaperManager');

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

    await t.test('spawnMpvpaperMonitor - handles immediate exit', async () => {
        const mockSpawn = () => {
            const child = new EventEmitter();
            child.pid = 999;
            child.exitCode = 1;
            child.unref = () => {};
            setTimeout(() => child.emit('exit', 1), 10);
            return child;
        };

        await assert.rejects(
            spawnMpvpaperMonitor('DP-1', '/path/to/video.mp4', mockSpawn),
            /exited immediately/
        );
    });

    await t.test('spawnMpvpaperMonitor - handles spawn error', async () => {
        const mockSpawn = () => {
            const child = new EventEmitter();
            child.unref = () => {};
            setTimeout(() => child.emit('error', new Error('Spawn failed')), 10);
            return child;
        };

        await assert.rejects(
            spawnMpvpaperMonitor('DP-1', '/path/to/video.mp4', mockSpawn),
            /Spawn failed/
        );
    });

    await t.test('spawnMpvpaperMonitor - cleans up on metadata read failure', async () => {
        const mockSpawn = () => {
            const child = new EventEmitter();
            child.pid = 999;
            child.exitCode = null;
            child.unref = () => {};
            setTimeout(() => child.emit('spawn'), 5);
            return child;
        };

        const originalReadFile = fsp.readFile;
        fsp.readFile = async () => {
            throw new Error('ProcFS Read Error');
        };

        const originalKill = process.kill;
        let killedPid = null;
        let killSig = null;
        process.kill = (pid, sig) => {
            killedPid = pid;
            killSig = sig;
        };

        await assert.rejects(
            spawnMpvpaperMonitor('DP-1', '/path/to/video.mp4', mockSpawn),
            /ProcFS Read Error/
        );

        assert.strictEqual(killedPid, 999);
        assert.strictEqual(killSig, 'SIGKILL');

        fsp.readFile = originalReadFile;
        process.kill = originalKill;
    });

    await t.test('load/save registry - correctly persists registry format', async () => {
        const tmpDir = path.join(__dirname, 'mock_config');
        await fsp.mkdir(tmpDir, { recursive: true }).catch(() => {});

        const records = [
            { pid: 111, startTime: '1', executable: 'mpvpaper', monitor: 'DP-1' }
        ];

        await saveMpvpaperPids(tmpDir, records);
        const loaded = await loadMpvpaperPids(tmpDir);
        assert.deepStrictEqual(loaded, records);

        await fsp.unlink(path.join(tmpDir, 'mpvpaper_pids.json')).catch(() => {});
        await fsp.rmdir(tmpDir).catch(() => {});
    });
});
