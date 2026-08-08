const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wallpaperAPI', {
    list: () => ipcRenderer.invoke('get-wallpapers'),
    apply: (id) => ipcRenderer.invoke('apply-wallpaper', { id }),
    remove: (id) => ipcRenderer.invoke('delete-wallpaper', { id }),
    getFavorites: () => ipcRenderer.invoke('get-favorites'),
    toggleFavorite: (id) => ipcRenderer.invoke('toggle-favorite', { id }),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    onThumbReady: (cb) => ipcRenderer.on('thumb-ready', (_event, data) => cb(data)),
    close: () => ipcRenderer.send('close-app'),
});
