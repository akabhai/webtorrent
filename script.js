document.addEventListener('DOMContentLoaded', () => {
    // Check if WebTorrent is supported
    if (!WebTorrent.WEBRTC_SUPPORT) {
        alert('WebTorrent is not supported in this browser. Please use a browser with WebRTC support, like Chrome, Firefox, or Opera.');
        return;
    }

    const client = new WebTorrent();
    const fileInput = document.getElementById('file-input');
    const magnetInput = document.getElementById('magnet-input');
    const downloadBtn = document.getElementById('download-btn');
    const seedingList = document.getElementById('seeding-list');
    const downloadList = document.getElementById('download-list');
    
    // --- SEEDING LOGIC ---
    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length === 0) return;
        
        console.log('Seeding files:', files);
        
        // Seed the files
        client.seed(files, (torrent) => {
            console.log('Client is seeding:', torrent.magnetURI);
            displayTorrent(torrent, 'seeding');
        });

        // Clear the file input for next use
        fileInput.value = '';
    });

    // --- DOWNLOADING LOGIC ---
    downloadBtn.addEventListener('click', () => {
        const magnetURI = magnetInput.value.trim();
        if (magnetURI === '') {
            alert('Please paste a magnet link.');
            return;
        }

        console.log('Adding torrent:', magnetURI);
        
        // Add the magnet link to start downloading
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

        // Get the main file name (or torrent name if multiple files)
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
            <div class="download-link-container"></div>
        `;

        list.appendChild(card);
        
        // Add click-to-copy functionality for magnet link
        const magnetLinkEl = card.querySelector('.magnet-link');
        if (magnetLinkEl) {
            magnetLinkEl.addEventListener('click', () => {
                navigator.clipboard.writeText(torrent.magnetURI).then(() => {
                    alert('Magnet link copied to clipboard!');
                }).catch(err => {
                    console.error('Failed to copy magnet link:', err);
                    alert('Could not copy link. Please copy it manually.');
                });
            });
        }

        // --- TORRENT EVENT LISTENERS AND UI UPDATES ---
        
        // Update UI periodically
        const interval = setInterval(() => {
            updateTorrentUI(torrent, card);
        }, 1000);

        torrent.on('done', () => {
            console.log('Torrent download finished');
            updateTorrentUI(torrent, card); // Final update
            clearInterval(interval);
            
            // Generate download links for each file
            const downloadLinkContainer = card.querySelector('.download-link-container');
            torrent.files.forEach(file => {
                file.getBlobURL((err, url) => {
                    if (err) {
                        console.error('Error getting blob URL:', err);
                        return;
                    }
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    a.textContent = `Download ${file.name}`;
                    downloadLinkContainer.appendChild(a);
                });
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
    
    // Client-wide error handling
    client.on('error', (err) => {
        console.error('WebTorrent client error:', err);
        alert(`An unexpected error occurred: ${err.message}`);
    });

    // --- UTILITY FUNCTIONS ---

    /**
     * Converts bytes to a human-readable format (KB, MB, GB).
     * @param {number} num - The number of bytes.
     * @returns {string} The formatted string.
     */
    function prettyBytes(num) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        if (Math.abs(num) < 1) return num + ' B';
        const exponent = Math.min(Math.floor(Math.log10(num) / 3), units.length - 1);
        const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3));
        const unit = units[exponent];
        return `${numStr} ${unit}`;
    }

    /**
     * Formats milliseconds into a human-readable time string (e.g., "1m 30s").
     * @param {number} ms - Milliseconds.
     * @returns {string} The formatted time string.
     */
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
