const test = require('node:test');
const assert = require('node:assert');
const { assertTrustedRenderer, requireId } = require('../src/main/ipcValidation');

test('ipcValidation', async (t) => {
    await t.test('assertTrustedRenderer - passes for valid renderer', () => {
        const mainWindow = { isDestroyed: () => false, webContents: {} };
        const event = {
            sender: mainWindow.webContents,
            senderFrame: { url: 'file:///path/to/index.html' }
        };
        assert.doesNotThrow(() => assertTrustedRenderer(event, mainWindow, 'file:///path/to/index.html'));
    });

    await t.test('assertTrustedRenderer - throws if mainWindow is destroyed', () => {
        const mainWindow = { isDestroyed: () => true };
        assert.throws(() => assertTrustedRenderer({}, mainWindow, 'file:///path/to/index.html'), /Main window unavailable/);
    });

    await t.test('assertTrustedRenderer - throws if sender is different', () => {
        const mainWindow = { isDestroyed: () => false, webContents: {} };
        const event = { sender: {} };
        assert.throws(() => assertTrustedRenderer(event, mainWindow, 'file:///path/to/index.html'), /Untrusted webContents/);
    });

    await t.test('assertTrustedRenderer - throws if senderFrame url mismatches', () => {
        const mainWindow = { isDestroyed: () => false, webContents: {} };
        const event = {
            sender: mainWindow.webContents,
            senderFrame: { url: 'http://malicious.com' }
        };
        assert.throws(() => assertTrustedRenderer(event, mainWindow, 'file:///path/to/index.html'), /Untrusted renderer frame/);
    });

    await t.test('assertTrustedRenderer - throws if senderFrame is missing', () => {
        const mainWindow = { isDestroyed: () => false, webContents: {} };
        const event = {
            sender: mainWindow.webContents,
        };
        assert.throws(() => assertTrustedRenderer(event, mainWindow, 'file:///path/to/index.html'), /Untrusted renderer frame/);
    });

    await t.test('requireId - returns id for valid payload', () => {
        const id = 'a'.repeat(64);
        assert.strictEqual(requireId({ id }), id);
    });

    await t.test('requireId - returns null for invalid payloads', () => {
        assert.strictEqual(requireId(null), null);
        assert.strictEqual(requireId([]), null);
        assert.strictEqual(requireId({}), null);
        assert.strictEqual(requireId({ id: 123 }), null);
        assert.strictEqual(requireId({ id: 'a'.repeat(63) }), null); // too short
        assert.strictEqual(requireId({ id: 'a'.repeat(65) }), null); // too long
    });
});
