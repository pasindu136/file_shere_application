window.electronAPI.onTextReceived((text) => {
    const textArea = document.getElementById('pc-clipboard');
    textArea.value = text;
    document.querySelector('.nav-btn:nth-child(4)').click();
});