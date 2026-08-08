const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wallpaperAPI', {
    list: () => ipcRenderer.invoke('get-wallpapers'),
    apply: (filepath) => ipcRenderer.invoke('apply-wallpaper', { filepath }),
    remove: (filepath) => ipcRenderer.invoke('delete-wallpaper', { filepath }),
    getFavorites: () => ipcRenderer.invoke('get-favorites'),
    toggleFavorite: (filepath) => ipcRenderer.invoke('toggle-favorite', { filepath }),
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    close: () => ipcRenderer.send('close-app'),
});
