function assertTrustedRenderer(event, mainWindow, rendererUrl) {
    if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window unavailable');
    }

    if (event.sender !== mainWindow.webContents) {
        throw new Error('Untrusted webContents');
    }

    if (!event.senderFrame || event.senderFrame.url !== rendererUrl) {
        throw new Error('Untrusted renderer frame');
    }
}

function requireObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function requireId(payload) {
    if (!requireObject(payload) ||
        typeof payload.id !== 'string' ||
        !/^[a-f0-9]{64}$/.test(payload.id)) {
        return null;
    }

    return payload.id;
}

module.exports = {
    assertTrustedRenderer,
    requireId
};
