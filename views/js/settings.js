// Load Settings when page opens
window.addEventListener('DOMContentLoaded', async () => {
    const config = await window.electronAPI.getSettings();
    if(config) {
        document.getElementById('setting-pc-name').value = config.pcName;
        document.getElementById('setting-path').innerText = config.downloadPath;
    }
});

async function savePCName() {
    const name = document.getElementById('setting-pc-name').value;
    if(name) {
        await window.electronAPI.setPCName(name);
        alert('Name Saved!');
    }
}

async function changePath() {
    const newPath = await window.electronAPI.selectDownloadFolder();
    if(newPath) {
        document.getElementById('setting-path').innerText = newPath;
        // Optionally refresh file list if we want to show files from new folder
        // But for now, we just update the path for future uploads
    }
}