// Navigation Logic
function showSection(id, btn) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
}

// Basic Display Info
window.electronAPI.onShowIP(link => document.getElementById('ip-display').innerText = link);
window.electronAPI.onShowQR(src => document.getElementById('qr-image').src = src);

// Security PIN
window.electronAPI.onShowPIN(pin => {
    const el = document.getElementById('pin-display');
    if (el) el.innerText = pin;
});

// NEW: Device Status Monitor
window.electronAPI.onDeviceUpdate((device) => {
    const statusBox = document.getElementById('device-status-box');
    const statusText = document.getElementById('device-status-text');
    
    if (statusBox && statusText) {
        statusBox.style.display = 'flex'; // Make visible
        
        // Choose Icon based on Battery Level
        let icon = 'fa-battery-full';
        let color = '#30d158'; // Green

        if(device.battery < 20) {
            icon = 'fa-battery-quarter';
            color = '#ff453a'; // Red
        } else if(device.battery < 50) {
            icon = 'fa-battery-half';
            color = '#ff9f0a'; // Orange
        }
        
        statusText.innerHTML = `
            <div style="font-weight:600; line-height: 1.2;">${device.name || 'Mobile'}</div>
            <div style="font-size:12px; opacity:0.7; margin-top: 2px;">
                <i class="fa-solid ${icon}" style="color:${color}"></i> ${device.battery}% Battery
            </div>
        `;
    }
});