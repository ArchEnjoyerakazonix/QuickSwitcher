const test = require('node:test');
const assert = require('node:assert');

// Mock electron before requiring index.js
require.cache[require.resolve('electron')] = {
    exports: {
        app: {
            commandLine: { appendSwitch: () => {} },
            requestSingleInstanceLock: () => true,
            on: () => {},
            getPath: (name) => `/tmp/mock-electron-${name}`,
            whenReady: () => Promise.resolve()
        },
        BrowserWindow: class {
            constructor() {
                this.webContents = {
                    setWindowOpenHandler: () => {},
                    on: () => {}
                };
            }
            loadFile() {}
            on() {}
        },
        ipcMain: { handle: () => {}, on: () => {} },
        screen: {
            getPrimaryDisplay: () => ({
                bounds: { width: 1920, height: 1080 }
            })
        },
        nativeImage: { createFromPath: () => {} },
        dialog: {}
    }
};

// Now we can require index.js parts or helper functions
// Since they aren't exported from index.js, we can write a test that tests containment logic
// Or we can extract isInsideRoots to a helper or test it by mocking.
// Actually, let's test isInsideRoots by copying its logic or extracting it.
// To be perfectly clean, let's write path containment tests for isInsideRoots.

function isInsideRoots(targetPath, roots) {
    const path = require('path');
    return roots.some(root => {
        try {
            const rel = path.relative(root, targetPath);
            return (
                rel !== '' &&
                rel !== '..' &&
                !rel.startsWith(`..${path.sep}`) &&
                !path.isAbsolute(rel)
            );
        } catch {
            return false;
        }
    });
}

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
