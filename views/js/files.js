// Load History
window.addEventListener('DOMContentLoaded', async () => {
    const history = await window.electronAPI.loadReceivedFiles();
    if(history) history.forEach(f => addReceivedItemToUI(f.name, f.path));
});

// --- RECEIVE FILES ---
window.electronAPI.onFileReceived(f => addReceivedItemToUI(f.name, f.path));

// --- PC PROGRESS BAR ---
const pcProgressContainer = document.getElementById('pc-progress-container');
const pcProgressBar = document.getElementById('pc-progress-bar');
const pcProgressText = document.getElementById('pc-progress-text');

window.electronAPI.onUploadProgress((percent) => {
    if(pcProgressContainer) {
        pcProgressContainer.style.display = 'block';
        pcProgressBar.style.width = percent + '%';
        pcProgressText.innerText = percent + '%';
    }
});

window.electronAPI.onUploadComplete(() => {
    if(pcProgressContainer) {
        pcProgressBar.style.width = '100%';
        pcProgressText.innerText = 'Done';
        setTimeout(() => {
            pcProgressContainer.style.display = 'none';
            pcProgressBar.style.width = '0%';
        }, 2000);
    }
});

// --- STREAMING (NEW) ---
async function startStream() {
    const fileName = await window.electronAPI.selectVideoToStream();
    if (fileName) {
        document.getElementById('stream-status').innerHTML = `Streaming: <br><b style="color:white;">${fileName}</b>`;
        document.getElementById('stream-status').style.color = '#10b981';
    }
}

async function stopStream() {
    await window.electronAPI.stopStream();
    document.getElementById('stream-status').innerText = 'No video selected';
    document.getElementById('stream-status').style.color = '#a1a1aa';
}

// --- UI HELPERS ---
function addReceivedItemToUI(name, path) {
    const list = document.getElementById('file-list');
    if(list.innerText.includes('Waiting')) list.innerHTML = '';
    const id = name.replace(/[^a-zA-Z0-9]/g, '_');
    const safePath = path.replace(/\\/g, '\\\\');
    if(!document.getElementById(`rec-${id}`)) {
        list.insertAdjacentHTML('afterbegin', `
            <div class="file-item" id="rec-${id}">
                <div class="file-info"><i class="fa-solid fa-file"></i> <span class="file-name" title="${name}">${name}</span></div>
                <div class="actions">
                    <button class="action-btn btn-view" onclick="openFile('${safePath}')"><i class="fa-solid fa-eye"></i></button>
                    <button class="action-btn btn-delete" onclick="deleteRec('${name}', 'rec-${id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>`);
    }
}

async function deleteRec(name, id) {
    if(confirm('Delete permanently?') && await window.electronAPI.deleteReceivedFile(name)) {
        document.getElementById(id).remove();
        if(!document.getElementById('file-list').children.length) 
            document.getElementById('file-list').innerHTML = '<p style="text-align:center; color:#555; font-size:12px; margin-top:20px;">Waiting for files...</p>';
    }
}

function openFile(p) { window.electronAPI.openFile(p); }
function openFolder() { window.electronAPI.openFolder(); }

async function shareFile() { const f = await window.electronAPI.selectFileToShare(); if(f) addSharedUI(f); }
async function shareFolder() { const f = await window.electronAPI.selectFolderToShare(); if(f) addSharedUI(f); }

// Drag & Drop
const dz = document.getElementById('drop-zone');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-active'); });
dz.addEventListener('dragleave', e => { e.preventDefault(); dz.classList.remove('drag-active'); });
dz.addEventListener('drop', async e => {
    e.preventDefault(); dz.classList.remove('drag-active');
    if(e.dataTransfer.files.length) { 
        const f = await window.electronAPI.addDroppedFile(e.dataTransfer.files[0].path); 
        if(f) addSharedUI(f); 
    }
});

function addSharedUI(f) {
    const list = document.getElementById('shared-list');
    if(list.innerText.includes('Drag & Drop')) list.innerHTML = '';
    const icon = f.name.endsWith('.zip') ? 'fa-file-zipper' : 'fa-share-nodes';
    list.insertAdjacentHTML('afterbegin', `
        <div class="file-item" id="share-${f.index}">
            <div class="file-info"><i class="fa-solid ${icon}" style="color:#6366f1"></i> <span class="file-name">${f.name}</span></div>
            <div class="actions"><button class="action-btn btn-delete" onclick="remShare(${f.index})"><i class="fa-solid fa-trash"></i></button></div>
        </div>`);
}

async function remShare(i) {
    if(await window.electronAPI.removeSharedFile(i)) {
        document.getElementById(`share-${i}`).remove();
        if(document.getElementById('shared-list').children.length === 0) 
            document.getElementById('shared-list').innerHTML = '<p style="text-align:center; color:#555; font-size:12px; margin-top:20px;">Drag & Drop files or folders here</p>';
    }
}