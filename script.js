document.addEventListener('DOMContentLoaded', () => {
    if (!WebTorrent.WEBRTC_SUPPORT) {
        alert('WebTorrent is not supported in this browser. Please use a browser with WebRTC support.');
        return;
    }

    // NEW: Explicit WebRTC trackers to improve peer discovery.
    const trackers = [
        'wss://tracker.openwebtorrent.com',
        'wss://tracker.btorrent.xyz',
        'wss://tracker.webtorrent.dev'
    ];

    let client;
    try {
        client = new WebTorrent({ tracker: { ws: true, rtc: true } });
    } catch (err) {
        console.error('Failed to initialize WebTorrent client:', err);
        alert(`Error initializing WebTorrent: ${err.message}. This might be caused by an ad-blocker or running from an insecure context (file://).`);
        return;
    }

    client.on('error', (err) => {
        console.error('WebTorrent client error:', err);
        alert(`An unexpected error occurred in the WebTorrent client: ${err.message}`);
    });

    const fileInput = document.getElementById('file-input');
    const magnetInput = document.getElementById('magnet-input');
    const downloadBtn = document.getElementById('download-btn');
    const seedingList = document.getElementById('seeding-list');
    const downloadList = document.getElementById('download-list');
    
    fileInput.addEventListener('change', () => {
        const files = fileInput.files;
        if (files.length === 0) return;
        
        console.log('Seeding files:', files);
        // NEW: Pass the explicit trackers when seeding.
        const opts = { announce: trackers };
        client.seed(files, opts, (torrent) => {
            console.log('Client is seeding:', torrent.magnetURI);
            displayTorrent(torrent, 'seeding');
        });

        fileInput.value = '';
    });

    downloadBtn.addEventListener('click', () => {
        const magnetURI = magnetInput.value.trim();
        if (magnetURI === '') {
            alert('Please paste a magnet link.');
            return;
        }
        
        console.log('Adding torrent:', magnetURI);
        // NEW: Pass the explicit trackers when downloading.
        const opts = { announce: trackers };
        client.add(magnetURI, opts, (torrent) => {
            console.log('Client is downloading:', torrent.infoHash);
            displayTorrent(torrent, 'downloading');
        });

        magnetInput.value = '';
    });

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

        if (type === 'downloading') {
            torrent.on('done', () => {
                console.log('Torrent download finished');
                updateTorrentUI(torrent, card);
                clearInterval(interval);
                
                const actionsContainer = card.querySelector('.actions-container');
                
                torrent.files.forEach(file => {
                    const fileActions = document.createElement('div');
                    fileActions.className = 'file-actions';

                    const fileNameEl = document.createElement('p');
                    fileNameEl.textContent = file.name;
                    fileActions.appendChild(fileNameEl);
                    
                    file.getBlobURL((err, url) => {
                        if (err) return console.error('Error getting blob URL:', err);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = file.name;
                        a.textContent = 'Download';
                        a.className = 'action-button download';
                        fileActions.appendChild(a);
                    });

                    if (isStreamable(file)) {
                        const streamBtn = document.createElement('button');
                        streamBtn.textContent = 'Stream';
                        streamBtn.className = 'action-button stream';
                        streamBtn.onclick = () => {
                            const existingPlayer = card.querySelector('video, audio');
                            if (existingPlayer) existingPlayer.remove();
                            
                            const mediaType = isStreamable(file);
                            const mediaElement = document.createElement(mediaType);
                            mediaElement.controls = true;
                            mediaElement.autoplay = true;
                            
                            // NEW: Error handling for the media player
                            mediaElement.addEventListener('error', (e) => {
                                console.error('Media playback error:', e);
                                alert(`Error playing media. The file's codec might not be supported by your browser. Check the console for details.`);
                            });
                            
                            card.appendChild(mediaElement);
                            file.appendTo(mediaElement);
                        };
                        fileActions.appendChild(streamBtn);
                    }

                    actionsContainer.appendChild(fileActions);
                });
            });
        }

        torrent.on('error', (err) => {
            console.error(`Torrent error: ${err.message}`);
            clearInterval(interval);
        });
    }

    function updateTorrentUI(torrent, card) {
        const progress = (torrent.progress * 100).toFixed(1);
        const progressBar = card.querySelector('.progress-bar');
        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${progress}%`;

        if (torrent.progress === 1 && !torrent.done) {
            progressBar.textContent = 'Seeding';
            progressBar.style.backgroundColor = '#007bff';
        }

        card.querySelector('.peers').textContent = torrent.numPeers;
        card.querySelector('.download-speed').textContent = `${prettyBytes(torrent.downloadSpeed)}/s`;
        card.querySelector('.upload-speed').textContent = `${prettyBytes(torrent.uploadSpeed)}/s`;
        
        const eta = card.querySelector('.eta');
        const timeRemaining = torrent.timeRemaining;
        eta.textContent = timeRemaining === Infinity || !timeRemaining ? '∞' : formatTime(timeRemaining);
    }
    
    function isStreamable(file) {
        const videoExtensions = ['.mp4', '.webm', '.mov'];
        const audioExtensions = ['.mp3', '.wav', '.ogg'];
        const fileName = file.name.toLowerCase();

        if (videoExtensions.some(ext => fileName.endsWith(ext))) return 'video';
        if (audioExtensions.some(ext => fileName.endsWith(ext))) return 'audio';
        return false;
    }

    function prettyBytes(num) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (Math.abs(num) < 1) return num + ' B';
        const exponent = Math.min(Math.floor(Math.log10(num) / 3), units.length - 1);
        const numStr = Number((num / Math.pow(1000, exponent)).toPrecision(3));
        return `${numStr} ${units[exponent]}`;
    }

    function formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds % 60}s`;
    }
});
