const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wallpaperAPI', {
    list: () => ipcRenderer.invoke('get-wallpapers'),
    apply: (filepath) => ipcRenderer.invoke('apply-wallpaper', { filepath }),
    remove: (filepath) => ipcRenderer.invoke('delete-wallpaper', { filepath }),
    close: () => ipcRenderer.send('close-app'),
});
