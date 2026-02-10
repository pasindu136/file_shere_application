const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    onShowIP: (cb) => ipcRenderer.on('show-ip', (e, v) => cb(v)),
    onShowQR: (cb) => ipcRenderer.on('show-qr', (e, v) => cb(v)),
    onShowPIN: (cb) => ipcRenderer.on('show-pin', (e, v) => cb(v)),
    onFileReceived: (cb) => ipcRenderer.on('file-received', (e, v) => cb(v)),
    onTextReceived: (cb) => ipcRenderer.on('text-received', (e, v) => cb(v)),
    onUploadProgress: (cb) => ipcRenderer.on('upload-progress', (e, v) => cb(v)),
    onUploadComplete: (cb) => ipcRenderer.on('upload-complete', (e) => cb()),
    onDeviceUpdate: (cb) => ipcRenderer.on('device-update', (e, v) => cb(v)),

    openFolder: () => ipcRenderer.invoke('open-folder'),
    openFile: (p) => ipcRenderer.invoke('open-file', p),
    selectFileToShare: () => ipcRenderer.invoke('select-file-to-share'),
    selectFolderToShare: () => ipcRenderer.invoke('select-folder-to-share'),
    addDroppedFile: (p) => ipcRenderer.invoke('add-dropped-file', p),
    removeSharedFile: (i) => ipcRenderer.invoke('remove-shared-file', i),
    loadReceivedFiles: () => ipcRenderer.invoke('load-received-files'),
    deleteReceivedFile: (f) => ipcRenderer.invoke('delete-received-file', f),
    selectVideoToStream: () => ipcRenderer.invoke('select-video-to-stream'),
    stopStream: () => ipcRenderer.invoke('stop-stream'),

    getSettings: () => ipcRenderer.invoke('get-settings'),
    setPCName: (name) => ipcRenderer.invoke('set-pc-name', name),
    selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
    
    // NEW: Link Opener
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url)
});