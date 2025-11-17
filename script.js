document.addEventListener('DOMContentLoaded', () => {
    // Check if WebTorrent is supported
    if (!WebTorrent.WEBRTC_SUPPORT) {
        alert('WebTorrent is not supported in this browser. Please use a browser with WebRTC support, like Chrome, Firefox, or Opera.');
        return;
    }

    let client;
    try {
        client = new WebTorrent();
    } catch (err) {
        console.error('Failed to initialize WebTorrent client:', err);
        alert(`Error initializing WebTorrent: ${err.message}. This might be caused by a browser extension blocking WebRTC.`);
        return;
    }

    // Client-wide error handling
    client.on('error', (err) => {
        console.error('WebTorrent client error:', err);
        alert(`An unexpected error occurred in the WebTorrent client: ${err.message}`);
    });

    const fileInput = document.getElementById('file-input');
    const magnetInput = document.getElementById('magnet-input');
    const downloadBtn = document.getElementById('download-btn');
    const seedingList = document.getElementById('seeding-list');
    const downloadList = document.getElementById('download-list');
    
    // --- SEEDING LOGIC ---
    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length === 0) return;
        
        client.seed(files, (torrent) => {
            console.log('Client is seeding:', torrent.magnetURI);
            displayTorrent(torrent, 'seeding');
        });

        fileInput.value = '';
    });

    // --- DOWNLOADING LOGIC ---
    downloadBtn.addEventListener('click', () => {
        const magnetURI = magnetInput.value.trim();
        if (magnetURI === '') {
            alert('Please paste a magnet link.');
            return;
        }

        client.add(magnetURI, (torrent) => {
            console.log('Client is downloading:', torrent.infoHash);
            displayTorrent(torrent, 'downloading');
        });

        magnetInput.value = '';
    });

    /**
     * Creates and displays a torrent card in the UI.
     * @param {object} torrent - The WebTorrent torrent object.
     * @param {string} type - 'seeding' or 'downloading'.
     */
    function displayTorrent(torrent, type) {
        const list = type === 'seeding' ? seedingList : downloadList;
        
        const card = document.createElement('div');
        card.className = 'torrent-card';
        card.id = `torrent-${torrent.infoHash}`;

        const fileName = torrent.files.length > 1 ? torrent.name : torrent.files[0].name;

        card.innerHTML = `
            <div class="file-name">${fileName}</div>
            <div class="stats">
                <div><strong>Size:</strong> ${prettyBytes(torrent.length)}</div>
                <div><strong>Peers:</strong> <span class="peers">0</span></div>
                <div class="speed"><strong>Speed:</strong> <span class="download-speed">0 B/s</span> ↓ | <span class="upload-speed">0 B/s</span> ↑</div>
                <div class="time-remaining"><strong>ETA:</strong> <span class="eta">∞</span></div>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: 0%;">0%</div>
            </div>
            ${type === 'seeding' ? `<div class="magnet-link-container"><p>Share this link:</p><div class="magnet-link" title="Click to copy">${torrent.magnetURI}</div></div>` : ''}
            <div class="actions-container"></div>
        `;

        list.appendChild(card);
        
        const magnetLinkEl = card.querySelector('.magnet-link');
        if (magnetLinkEl) {
            magnetLinkEl.addEventListener('click', () => {
                navigator.clipboard.writeText(torrent.magnetURI).then(() => alert('Magnet link copied to clipboard!'));
            });
        }

        const interval = setInterval(() => {
            updateTorrentUI(torrent, card);
        }, 1000);

        torrent.on('done', () => {
            console.log('Torrent download finished');
            updateTorrentUI(torrent, card);
            clearInterval(interval);
            
            const actionsContainer = card.querySelector('.actions-container');
            
            // For each file in the torrent, create download/stream buttons
            torrent.files.forEach(file => {
                const fileActions = document.createElement('div');
                fileActions.className = 'file-actions';

                const fileNameEl = document.createElement('p');
                fileNameEl.textContent = file.name;
                fileActions.appendChild(fileNameEl);
                
                // Create Download Link
                file.getBlobURL((err, url) => {
                    if (err) {
                        console.error('Error getting blob URL:', err);
                        return;
                    }
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    a.textContent = 'Download';
                    a.className = 'action-button download';
                    fileActions.appendChild(a);
                });

                // Create Stream Button if file is streamable
                if (isStreamable(file)) {
                    const streamBtn = document.createElement('button');
                    streamBtn.textContent = 'Stream';
                    streamBtn.className = 'action-button stream';
                    streamBtn.onclick = () => {
                        // Remove any existing player
                        const existingPlayer = card.querySelector('video, audio');
                        if (existingPlayer) {
                            existingPlayer.remove();
                        }
                        
                        // Create and append the new player
                        const mediaElement = isStreamable(file) === 'video' 
                            ? document.createElement('video') 
                            : document.createElement('audio');
                        mediaElement.controls = true;
                        mediaElement.autoplay = true; // Start playing immediately
                        card.appendChild(mediaElement);

                        // WebTorrent's magic streaming function
                        file.appendTo(mediaElement);
                    };
                    fileActions.appendChild(streamBtn);
                }

                actionsContainer.appendChild(fileActions);
            });
        });

        torrent.on('error', (err) => {
            console.error(`Torrent error: ${err.message}`);
            card.innerHTML += `<div style="color: red;">Error: ${err.message}</div>`;
            clearInterval(interval);
        });
    }

    /**
     * Updates the UI for a specific torrent card.
     * @param {object} torrent - The WebTorrent torrent object.
     * @param {HTMLElement} card - The DOM element for the torrent card.
     */
    function updateTorrentUI(torrent, card) {
        const progress = (torrent.progress * 100).toFixed(1);
        const progressBar = card.querySelector('.progress-bar');
        const peers = card.querySelector('.peers');
        const downloadSpeed = card.querySelector('.download-speed');
        const uploadSpeed = card.querySelector('.upload-speed');
        const eta = card.querySelector('.eta');

        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${progress}%`;
        peers.textContent = torrent.numPeers;
        downloadSpeed.textContent = `${prettyBytes(torrent.downloadSpeed)}/s`;
        uploadSpeed.textContent = `${prettyBytes(torrent.uploadSpeed)}/s`;

        const timeRemaining = torrent.timeRemaining;
        if (timeRemaining === Infinity || !timeRemaining) {
            eta.textContent = '∞';
        } else {
            eta.textContent = formatTime(timeRemaining);
        }
    }
    
    // --- UTILITY FUNCTIONS ---

    /**
     * Checks if a file is a streamable video or audio type based on its name.
     * @param {object} file - The file object from WebTorrent.
     * @returns {string|false} 'video', 'audio', or false.
     */
    function isStreamable(file) {
        const videoExtensions = ['.mp4', '.mkv', '.webm', '.mov'];
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac'];
        const fileName = file.name.toLowerCase();

        if (videoExtensions.some(ext => fileName.endsWith(ext))) {
            return 'video';
        }
        if (audioExtensions.some(ext => fileName.endsWith(ext))) {
            return 'audio';
        }
        return false;
    }

    function prettyBytes(num) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (Math.abs(num) < 1) return num + ' B';
        const exponent = Math.min(Math.floor(Math.log10(num) / 3), units.length - 1);
        const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3));
        const unit = units[exponent];
        return `${numStr} ${unit}`;
    }

    function formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        if (seconds > 0) return `${seconds}s`;
        return '0s';
    }
});
