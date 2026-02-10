const { app, BrowserWindow, ipcMain, shell, dialog, clipboard } = require('electron');
const express = require('express');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const multer = require('multer');
const fs = require('fs');
const archiver = require('archiver');
const crypto = require('crypto');
const { exec } = require('child_process');
const checkDiskSpace = require('check-disk-space').default;

// --- 1. WINDOWS TASKBAR ICON FIX ---
if (process.platform === 'win32') {
    app.setAppUserModelId("com.pasindu.orbitshare"); 
}

// --- CONFIGURATION ---
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

let appConfig = {
    downloadPath: path.join(app.getPath('downloads'), 'Orbit_Share_Files'),
    pcName: os.hostname()
};

// Load Config
if (fs.existsSync(configPath)) {
    try {
        const savedConfig = JSON.parse(fs.readFileSync(configPath));
        appConfig = { ...appConfig, ...savedConfig };
    } catch (e) { console.error("Config load error", e); }
}

// Ensure download folder exists
if (!fs.existsSync(appConfig.downloadPath)){ 
    try { fs.mkdirSync(appConfig.downloadPath, { recursive: true }); } catch(e){} 
}

function saveConfig() {
    try { fs.writeFileSync(configPath, JSON.stringify(appConfig)); } catch (e) { console.error(e); }
}

// --- DATA ---
let currentPIN = '';
let sessionToken = null;
let sharedFiles = [];
let connectedDevice = { name: 'Unknown', battery: '-' };
let currentStreamFile = null;

function generatePIN() {
    currentPIN = Math.floor(1000 + Math.random() * 9000).toString();
    return currentPIN;
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('192.168.')) return iface.address;
            }
        }
    }
    return require('ip').address();
}

function pressKeyWindows(key) {
    let psKey = '';
    switch (key) {
        case 'right': psKey = '{RIGHT}'; break;
        case 'left': psKey = '{LEFT}'; break;
        case 'b': psKey = 'b'; break;
        case 'esc': psKey = '{ESC}'; break;
        case 'space': psKey = ' '; break;
        case 'up': psKey = '{UP}'; break;
        case 'down': psKey = '{DOWN}'; break;
        case 'm': psKey = 'm'; break;
        case 'f': psKey = 'f'; break;
        default: return;
    }
    const command = `powershell -c "$wshell = New-Object -ComObject wscript.shell; $wshell.SendKeys('${psKey}')"`;
    exec(command, (error) => { if (error) console.error("Key error:", error); });
}

function zipFolder(sourceDir, outPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(outPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve(outPath));
        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        archive.directory(sourceDir, false);
        archive.finalize();
    });
}

// --- MULTER ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(appConfig.downloadPath)){ 
            try { fs.mkdirSync(appConfig.downloadPath, { recursive: true }); } catch(e){} 
        }
        cb(null, appConfig.downloadPath);
    },
    filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage: storage });

// --- SERVER ---
const server = express();
const PORT = 3000;
const ipAddress = getLocalIP();
const fullURL = `http://${ipAddress}:${PORT}`;

server.use(express.json());

const authMiddleware = (req, res, next) => {
    const token = req.headers['x-auth-token'];
    if (req.path.startsWith('/stream')) return next();
    if (req.path === '/' || req.path === '/login') return next();
    if (token && token === sessionToken) next();
    else res.status(401).json({ error: 'Unauthorized' });
};
server.use(authMiddleware);

// --- ROUTES ---
server.get('/', (req, res) => res.sendFile(path.join(__dirname, 'views', 'mobile.html')));

server.post('/login', (req, res) => {
    const { pin } = req.body;
    if (pin === currentPIN) {
        sessionToken = crypto.randomBytes(16).toString('hex');
        res.json({ success: true, token: sessionToken, pcName: appConfig.pcName });
    } else res.status(403).json({ success: false });
});

server.post('/status', async (req, res) => {
    const { battery, deviceName } = req.body;
    if (battery) connectedDevice.battery = battery;
    if (deviceName) connectedDevice.name = deviceName;
    if (mainWindow) mainWindow.webContents.send('device-update', connectedDevice);

    try {
        const drive = os.platform() === 'win32' ? process.env.SystemDrive : '/';
        const disk = await checkDiskSpace(drive);
        res.json({ pcFree: (disk.free/1024/1024/1024).toFixed(1), pcTotal: (disk.size/1024/1024/1024).toFixed(1) });
    } catch { res.json({ pcFree: '-', pcTotal: '-' }); }
});

server.post('/upload', (req, res, next) => {
    let fileSize = req.headers['content-length'];
    let uploaded = 0;
    if (fileSize) {
        req.on('data', (chunk) => {
            uploaded += chunk.length;
            const p = Math.round((uploaded / fileSize) * 100);
            if (mainWindow) mainWindow.webContents.send('upload-progress', p);
        });
    }
    next();
}, upload.array('files'), (req, res) => {
    const files = req.files;
    if (!files || !files.length) return res.status(400).send('No files.');
    files.forEach(f => { if (mainWindow) mainWindow.webContents.send('file-received', { name: f.originalname, path: f.path }); });
    if (mainWindow) mainWindow.webContents.send('upload-complete');
    res.send('Success');
});

server.post('/clipboard/send', (req, res) => {
    const { text } = req.body;
    if (text) { clipboard.writeText(text); if (mainWindow) mainWindow.webContents.send('text-received', text); res.sendStatus(200); }
    else res.sendStatus(400);
});
server.get('/clipboard/get', (req, res) => res.json({ text: clipboard.readText() }));

server.get('/list-files', (req, res) => res.json(sharedFiles.map((f, i) => ({ id: i, name: f.name }))));
server.get('/download/:id', (req, res) => {
    const id = parseInt(req.params.id);
    if (id >= 0 && id < sharedFiles.length) res.download(sharedFiles[id].path);
    else res.status(404).send('Not found');
});

server.post('/remote/input', (req, res) => {
    try { pressKeyWindows(req.body.key); res.json({ success: true }); }
    catch { res.status(500).json({ success: false }); }
});

server.get('/stream/info', (req, res) => {
    if (currentStreamFile) res.json({ active: true, name: path.basename(currentStreamFile) });
    else res.json({ active: false });
});

server.get('/stream/video', (req, res) => {
    if (!currentStreamFile || !fs.existsSync(currentStreamFile)) return res.status(404).send('No video');
    const stat = fs.statSync(currentStreamFile);
    const fileSize = stat.size;
    const range = req.headers.range;
    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(currentStreamFile, { start, end });
        res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${fileSize}`, 'Accept-Ranges': 'bytes', 'Content-Length': chunksize, 'Content-Type': 'video/mp4' });
        file.pipe(res);
    } else {
        res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
        fs.createReadStream(currentStreamFile).pipe(res);
    }
});

server.listen(PORT, () => console.log(`Server: ${fullURL}`));

// --- ELECTRON WINDOW ---
let mainWindow;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100, 
        height: 750,
        minWidth: 900,
        minHeight: 600,
        
        // 2. ICON SETTING (Using .ico for Windows)
        icon: path.join(__dirname, 'views', 'assets', 'icon.ico'),

        // 3. FRAMELESS UI
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#18181b', // Sidebar color
            symbolColor: '#ffffff',
            height: 35
        },

        webPreferences: { 
            preload: path.join(__dirname, 'preload.js'), 
            contextIsolation: true, 
            nodeIntegration: false 
        }
    });
    
    const pin = generatePIN();
    mainWindow.loadFile('views/index.html');
    
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('show-ip', fullURL);
        mainWindow.webContents.send('show-pin', pin);
        QRCode.toDataURL(fullURL, (err, url) => { if (!err) mainWindow.webContents.send('show-qr', url); });
    });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// IPC
ipcMain.handle('open-folder', () => shell.openPath(appConfig.downloadPath));
ipcMain.handle('open-file', (e, p) => shell.openPath(p));
ipcMain.handle('load-received-files', () => { try { return fs.readdirSync(appConfig.downloadPath).map(f => ({ name: f, path: path.join(appConfig.downloadPath, f) })); } catch { return []; } });
ipcMain.handle('delete-received-file', (e, f) => { try { fs.unlinkSync(path.join(appConfig.downloadPath, f)); return true; } catch { return false; } });
ipcMain.handle('remove-shared-file', (e, i) => { if (i > -1 && i < sharedFiles.length) { sharedFiles.splice(i, 1); return true; } return false; });
ipcMain.handle('select-file-to-share', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
    if (!r.canceled && r.filePaths.length) { const p = r.filePaths[0]; const n = path.basename(p); sharedFiles.push({ name: n, path: p }); return { name: n, index: sharedFiles.length - 1, path: p }; } return null;
});
ipcMain.handle('select-folder-to-share', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!r.canceled && r.filePaths.length) { const p = r.filePaths[0]; const n = path.basename(p); const zn = `${n}.zip`; const zp = path.join(appConfig.downloadPath, zn); try { await zipFolder(p, zp); sharedFiles.push({ name: zn, path: zp }); return { name: zn, index: sharedFiles.length - 1, path: zp }; } catch { return null; } } return null;
});
ipcMain.handle('add-dropped-file', async (e, p) => {
    const s = fs.statSync(p);
    if (s.isDirectory()) { const n = path.basename(p); const zn = `${n}.zip`; const zp = path.join(appConfig.downloadPath, zn); try { await zipFolder(p, zp); sharedFiles.push({ name: zn, path: zp }); return { name: zn, index: sharedFiles.length - 1, path: zp }; } catch { return null; } }
    else { const n = path.basename(p); sharedFiles.push({ name: n, path: p }); return { name: n, index: sharedFiles.length - 1, path: p }; }
});
ipcMain.handle('select-video-to-stream', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Movies', extensions: ['mp4', 'mkv', 'webm'] }] });
    if (!r.canceled && r.filePaths.length > 0) { currentStreamFile = r.filePaths[0]; return path.basename(currentStreamFile); } return null;
});
ipcMain.handle('stop-stream', () => { currentStreamFile = null; return true; });

// SETTINGS & LINKS
ipcMain.handle('get-settings', () => appConfig);
ipcMain.handle('set-pc-name', (e, name) => { appConfig.pcName = name; saveConfig(); return true; });
ipcMain.handle('select-download-folder', async () => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!r.canceled && r.filePaths.length > 0) { appConfig.downloadPath = r.filePaths[0]; saveConfig(); return appConfig.downloadPath; } return null;
});
ipcMain.handle('open-external-link', (event, url) => { shell.openExternal(url); });