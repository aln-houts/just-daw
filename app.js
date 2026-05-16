// Just-DAW Audio Engine & UI Controller

class JustDAW {
    constructor() {
        // Audio Context
        this.audioContext = null;
        this.masterGain = null;
        this.analyser = null;
        
        // Transport State
        this.isPlaying = false;
        this.isRecording = false;
        this.isLooping = false;
        this.loopStart = 0;
        this.loopEnd = 16; // 16 beats default
        this.currentTime = 0;
        this.bpm = 120;
        this.playStartTime = 0;
        this.animationFrameId = null;
        
        // Zoom/Pan
        this.pixelsPerSecond = 50;
        this.timelineScrollLeft = 0;
        
        // Tracks
        this.tracks = [];
        this.nextTrackId = 1;
        
        // UI Elements
        this.elements = {
            playBtn: document.getElementById('play-btn'),
            stopBtn: document.getElementById('stop-btn'),
            recordBtn: document.getElementById('record-btn'),
            loopBtn: document.getElementById('loop-btn'),
            addTrackBtn: document.getElementById('add-track-btn'),
            bpmInput: document.getElementById('bpm'),
            masterVol: document.getElementById('master-vol'),
            timeDisplay: document.querySelector('.time-display'),
            trackHeaders: document.getElementById('track-headers'),
            timelineGrid: document.getElementById('timeline-grid'),
            timelineRuler: document.getElementById('timeline-ruler'),
            timelineArea: document.querySelector('.timeline-area'),
            masterMeter: document.getElementById('master-meter'),
            dropZone: document.getElementById('drop-zone')
        };
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.initAudio();
        this.addTrack(); // Start with one track
        this.startRenderLoop();
        this.renderRuler();
        this.checkMicPermission();
        this.setupResizeHandler();
    }
    
    setupResizeHandler() {
        // Handle canvas resizing
        const resizeObserver = new ResizeObserver(() => {
            this.tracks.forEach(track => {
                if (track.audioBuffer) {
                    this.drawWaveform(track);
                }
            });
            this.renderRuler();
        });
        resizeObserver.observe(this.elements.timelineGrid);
    }
    
    async checkMicPermission() {
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('getUserMedia not supported in this browser');
            this.showMicNotSupported();
            return;
        }

        // Try to use permissions API if available
        if (navigator.permissions && navigator.permissions.query) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                this.updateMicPermissionUI(result.state);
                result.onchange = () => this.updateMicPermissionUI(result.state);
                return;
            } catch (e) {
                // permissions API not supported for microphone, fall through
                console.log('Permissions API not available for microphone');
            }
        }
        
        // Fallback: Check if we already have permission by trying to get a stream
        // This is less intrusive - we just check and immediately stop
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // If we get here, permission was already granted
            stream.getTracks().forEach(t => t.stop());
            this.micPermissionGranted = true;
            this.hideMicPermissionButton();
        } catch (err) {
            // Permission not granted or denied - show the enable button
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                this.showPermissionDeniedModal();
            } else {
                this.showMicPermissionButton();
            }
        }
    }
    
    updateMicPermissionUI(state) {
        if (state === 'granted') {
            this.micPermissionGranted = true;
            this.hideMicPermissionButton();
        } else if (state === 'prompt') {
            this.showMicPermissionButton();
        } else {
            // denied
            this.showPermissionDeniedModal();
        }
    }
    
    showMicPermissionButton() {
        if (document.getElementById('mic-permission-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'mic-permission-btn';
        btn.className = 'mic-permission-btn';
        btn.textContent = '🎤 Enable Microphone';
        btn.onclick = () => this.requestMicPermission();
        
        // Add to transport bar
        this.elements.recordBtn.parentNode.insertBefore(btn, this.elements.recordBtn);
    }
    
    hideMicPermissionButton() {
        const btn = document.getElementById('mic-permission-btn');
        if (btn) btn.remove();
    }
    
    showMicNotSupported() {
        const existing = document.getElementById('mic-not-supported-msg');
        if (existing) return;
        
        const msg = document.createElement('span');
        msg.id = 'mic-not-supported-msg';
        msg.style.color = '#ff9800';
        msg.style.fontSize = '12px';
        msg.textContent = '🎤 Mic not supported';
        
        this.elements.recordBtn.parentNode.insertBefore(msg, this.elements.recordBtn);
    }
    
    async requestMicPermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            this.hideMicPermissionButton();
            this.micPermissionGranted = true;
        } catch (err) {
            console.error('Mic permission denied:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                this.showPermissionDeniedModal();
            } else {
                alert('Could not access microphone: ' + err.message);
            }
        }
    }
    
    showPermissionDeniedModal() {
        // Remove existing modal if any
        const existing = document.getElementById('permission-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'permission-modal';
        modal.className = 'permission-modal';
        modal.innerHTML = `
            <div class="permission-modal-content">
                <h3>Microphone Access Required</h3>
                <p>To record audio, Just-DAW needs access to your microphone.</p>
                <p>Please click the button below and allow access in your browser's prompt.</p>
                <button id="permission-retry-btn" class="permission-retry-btn">Allow Microphone Access</button>
                <button id="permission-close-btn" class="permission-close-btn">Close</button>
            </div>
        `;
        document.body.appendChild(modal);
        
        document.getElementById('permission-retry-btn').onclick = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                modal.remove();
                this.hideMicPermissionButton();
                this.micPermissionGranted = true;
            } catch (err) {
                alert('Permission denied. Please check your browser settings and try again.');
            }
        };
        
        document.getElementById('permission-close-btn').onclick = () => {
            modal.remove();
        };
    }
    
    initAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.8;
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.masterGain.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }
    
    setupEventListeners() {
        this.elements.playBtn.addEventListener('click', () => this.togglePlayback());
        this.elements.stopBtn.addEventListener('click', () => this.stop());
        this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.elements.loopBtn.addEventListener('click', () => this.toggleLoop());
        this.elements.addTrackBtn.addEventListener('click', () => this.addTrack());
        this.elements.bpmInput.addEventListener('change', (e) => this.setBPM(e.target.value));
        this.elements.masterVol.addEventListener('input', (e) => this.setMasterVolume(e.target.value));
        
        // Timeline scroll sync with ruler
        this.elements.timelineGrid.addEventListener('scroll', (e) => {
            this.timelineScrollLeft = e.target.scrollLeft;
            this.elements.timelineRuler.scrollLeft = e.target.scrollLeft;
        });
        
        // Drag and drop
        const dropZone = this.elements.dropZone;
        const timelineArea = this.elements.timelineArea;
        
        timelineArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('active');
        });
        
        timelineArea.addEventListener('dragleave', (e) => {
            if (!timelineArea.contains(e.relatedTarget)) {
                dropZone.classList.remove('active');
            }
        });
        
        timelineArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            this.handleFileDrop(e.dataTransfer.files);
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                case 'KeyR':
                    if (!e.ctrlKey && !e.metaKey) {
                        this.toggleRecording();
                    }
                    break;
                case 'KeyL':
                    this.toggleLoop();
                    break;
            }
        });
    }
    
    addTrack() {
        const trackId = this.nextTrackId++;
        const track = {
            id: trackId,
            name: `Track ${trackId}`,
            volume: 0.8,
            pan: 0,
            muted: false,
            soloed: false,
            armed: false,
            audioBuffer: null,
            sourceNode: null,
            gainNode: this.audioContext.createGain(),
            panNode: this.audioContext.createStereoPanner(),
            mediaStream: null,
            mediaRecorder: null,
            chunks: []
        };
        
        // Connect audio graph: gain -> pan -> master
        track.gainNode.connect(track.panNode);
        track.panNode.connect(this.masterGain);
        
        this.tracks.push(track);
        this.renderTrackHeader(track);
        this.renderTrackRow(track);
        this.updateTrackAudio(track);
    }
    
    deleteTrack(trackId) {
        const index = this.tracks.findIndex(t => t.id === trackId);
        if (index > -1) {
            const track = this.tracks[index];
            if (track.sourceNode) {
                try { track.sourceNode.stop(); } catch (e) {}
            }
            if (track.mediaRecorder && track.mediaRecorder.state !== 'inactive') {
                track.mediaRecorder.stop();
            }
            if (track.mediaStream) {
                track.mediaStream.getTracks().forEach(t => t.stop());
            }
            track.gainNode.disconnect();
            track.panNode.disconnect();
            this.tracks.splice(index, 1);
            
            // Remove UI
            const header = document.getElementById(`header-${trackId}`);
            const row = document.getElementById(`row-${trackId}`);
            if (header) header.remove();
            if (row) row.remove();
        }
    }
    
    renderTrackHeader(track) {
        const header = document.createElement('div');
        header.className = 'track-header';
        header.id = `header-${track.id}`;
        header.innerHTML = `
            <div class="track-header-top">
                <span class="track-name" id="name-${track.id}" onclick="daw.editTrackName(${track.id})">${track.name}</span>
                <button class="delete-track-btn" onclick="daw.deleteTrack(${track.id})" title="Delete Track">✕</button>
            </div>
            <div class="track-controls">
                <button id="mute-${track.id}" class="mute-btn" onclick="daw.toggleMute(${track.id})" title="Mute">M</button>
                <button id="solo-${track.id}" class="solo-btn" onclick="daw.toggleSolo(${track.id})" title="Solo">S</button>
                <button id="arm-${track.id}" class="arm-btn" onclick="daw.toggleArm(${track.id})" title="Record Arm">R</button>
            </div>
            <div class="track-faders">
                <div class="fader-row">
                    <label>Vol</label>
                    <input type="range" min="0" max="1" step="0.01" value="${track.volume}" 
                           oninput="daw.setTrackVolume(${track.id}, this.value)">
                </div>
                <div class="fader-row">
                    <label>Pan</label>
                    <input type="range" min="-1" max="1" step="0.01" value="${track.pan}" 
                           oninput="daw.setTrackPan(${track.id}, this.value)">
                </div>
            </div>
        `;
        this.elements.trackHeaders.appendChild(header);
    }
    
    editTrackName(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;
        
        const nameEl = document.getElementById(`name-${trackId}`);
        const currentName = track.name;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'track-name-input';
        input.style.width = '100%';
        input.style.background = '#333';
        input.style.border = '1px solid #4CAF50';
        input.style.color = 'white';
        input.style.padding = '2px 5px';
        input.style.borderRadius = '3px';
        input.style.fontSize = '0.9rem';
        
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        
        const saveName = () => {
            const newName = input.value.trim() || currentName;
            track.name = newName;
            nameEl.textContent = newName;
            input.replaceWith(nameEl);
        };
        
        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                input.blur();
            } else if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }
    
    renderTrackRow(track) {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.id = `row-${track.id}`;
        row.innerHTML = `
            <canvas id="canvas-${track.id}"></canvas>
        `;
        this.elements.timelineGrid.appendChild(row);
        
        // Set canvas size after adding to DOM
        requestAnimationFrame(() => this.setupCanvas(track));
    }
    
    setupCanvas(track) {
        const canvas = document.getElementById(`canvas-${track.id}`);
        if (!canvas) return;
        
        const row = document.getElementById(`row-${track.id}`);
        if (!row) return;
        
        // Set canvas size to match row
        const rect = row.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
        // Draw empty waveform background
        this.drawEmptyWaveform(track);
    }
    
    drawEmptyWaveform(track) {
        const canvas = document.getElementById(`canvas-${track.id}`);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw center line
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
    }
    
    renderRuler() {
        const ruler = this.elements.timelineRuler;
        ruler.innerHTML = '';
        
        const width = Math.max(ruler.offsetWidth, this.elements.timelineGrid.scrollWidth);
        const totalSeconds = Math.max(width / this.pixelsPerSecond, 120);
        
        // Create ruler content container
        const content = document.createElement('div');
        content.style.position = 'relative';
        content.style.width = `${totalSeconds * this.pixelsPerSecond}px`;
        content.style.height = '100%';
        
        // Draw beat marks
        const beatsPerSecond = this.bpm / 60;
        const pixelsPerBeat = this.pixelsPerSecond / beatsPerSecond;
        const totalBeats = Math.ceil(totalSeconds * beatsPerSecond);
        
        for (let beat = 0; beat < totalBeats; beat++) {
            const isMeasure = beat % 4 === 0;
            const x = beat * pixelsPerBeat;
            
            const mark = document.createElement('div');
            mark.style.position = 'absolute';
            mark.style.left = `${x}px`;
            mark.style.top = '0';
            mark.style.width = '1px';
            mark.style.height = isMeasure ? '20px' : '10px';
            mark.style.backgroundColor = isMeasure ? '#888' : '#555';
            
            content.appendChild(mark);
            
            // Add measure numbers
            if (isMeasure) {
                const measureNum = Math.floor(beat / 4) + 1;
                const label = document.createElement('span');
                label.textContent = measureNum.toString();
                label.style.position = 'absolute';
                label.style.left = `${x + 3}px`;
                label.style.top = '2px';
                label.style.fontSize = '10px';
                label.style.color = '#aaa';
                label.style.fontWeight = 'bold';
                content.appendChild(label);
            }
        }
        
        ruler.appendChild(content);
    }
    
    updateTrackAudio(track) {
        const hasSolo = this.tracks.some(t => t.soloed);
        
        if (hasSolo) {
            track.gainNode.gain.value = track.soloed ? track.volume : 0;
        } else {
            track.gainNode.gain.value = track.muted ? 0 : track.volume;
        }
        track.panNode.pan.value = track.pan;
    }
    
    toggleMute(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.muted = !track.muted;
            this.updateTrackAudio(track);
            const btn = document.getElementById(`mute-${trackId}`);
            if (btn) btn.classList.toggle('active', track.muted);
        }
    }
    
    toggleSolo(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.soloed = !track.soloed;
            this.handleSolo();
            const btn = document.getElementById(`solo-${trackId}`);
            if (btn) btn.classList.toggle('active', track.soloed);
        }
    }
    
    handleSolo() {
        const hasSolo = this.tracks.some(t => t.soloed);
        this.tracks.forEach(track => {
            if (hasSolo) {
                track.gainNode.gain.value = track.soloed ? track.volume : 0;
            } else {
                track.gainNode.gain.value = track.muted ? 0 : track.volume;
            }
        });
    }
    
    toggleArm(trackId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.armed = !track.armed;
            const btn = document.getElementById(`arm-${trackId}`);
            if (btn) btn.classList.toggle('active', track.armed);
        }
    }
    
    setTrackVolume(trackId, value) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.volume = parseFloat(value);
            this.updateTrackAudio(track);
        }
    }
    
    setTrackPan(trackId, value) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.pan = parseFloat(value);
            this.updateTrackAudio(track);
        }
    }
    
    setBPM(value) {
        this.bpm = parseInt(value);
        this.renderRuler(); // Re-render ruler with new BPM
    }
    
    setMasterVolume(value) {
        if (this.masterGain) {
            this.masterGain.gain.value = parseFloat(value);
        }
    }
    
    async togglePlayback() {
        this.initAudio();
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }
    
    play() {
        if (this.tracks.length === 0) return;
        
        this.isPlaying = true;
        this.elements.playBtn.classList.add('active');
        this.elements.playBtn.textContent = '⏸';
        
        // Calculate the offset into the audio buffer
        const offset = this.currentTime;
        
        // Start sources for all tracks with audio
        this.tracks.forEach(track => {
            if (track.audioBuffer) {
                // Stop existing source if any
                if (track.sourceNode) {
                    try { track.sourceNode.stop(); } catch (e) {}
                }
                
                const sourceNode = this.audioContext.createBufferSource();
                sourceNode.buffer = track.audioBuffer;
                sourceNode.connect(track.gainNode);
                
                // Handle loop if enabled
                if (this.isLooping) {
                    sourceNode.loop = true;
                    sourceNode.loopStart = this.loopStart;
                    sourceNode.loopEnd = this.loopEnd;
                }
                
                // Start from current position if within buffer duration
                const duration = track.audioBuffer.duration;
                if (offset < duration) {
                    sourceNode.start(0, offset);
                } else {
                    // If we're past the end, start from beginning or don't play
                    sourceNode.start(0, 0);
                }
                track.sourceNode = sourceNode;
            }
        });
        
        this.playStartTime = this.audioContext.currentTime - this.currentTime;
        this.updatePlayhead();
    }
    
    pause() {
        this.isPlaying = false;
        this.elements.playBtn.classList.remove('active');
        this.elements.playBtn.textContent = '▶';
        
        this.currentTime = this.audioContext.currentTime - this.playStartTime;
        
        this.tracks.forEach(track => {
            if (track.sourceNode) {
                try { track.sourceNode.stop(); } catch (e) {}
                track.sourceNode = null;
            }
        });
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    stop() {
        const wasPlaying = this.isPlaying;
        this.isPlaying = false;
        this.isRecording = false;
        this.currentTime = 0;
        this.elements.playBtn.classList.remove('active');
        this.elements.playBtn.textContent = '▶';
        this.elements.recordBtn.classList.remove('active');
        
        this.tracks.forEach(track => {
            if (track.sourceNode) {
                try { track.sourceNode.stop(); } catch (e) {}
                track.sourceNode = null;
            }
            if (track.mediaRecorder && track.mediaRecorder.state !== 'inactive') {
                track.mediaRecorder.stop();
            }
        });
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.elements.timeDisplay.textContent = '00:00.000';
        this.updatePlayheadPosition();
    }
    
    async toggleRecording() {
        this.initAudio();
        if (this.isRecording) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }
    
    async startRecording() {
        // Check if we have permission first
        if (!this.micPermissionGranted) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                if (result.state === 'denied') {
                    this.showPermissionDeniedModal();
                    return;
                }
            } catch (e) {
                // permissions API not supported, try requesting directly
            }
            
            // Try to get permission
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                this.micPermissionGranted = true;
                this.hideMicPermissionButton();
            } catch (err) {
                this.showPermissionDeniedModal();
                return;
            }
        }
        
        // Check for armed tracks
        const armedTracks = this.tracks.filter(t => t.armed);
        if (armedTracks.length === 0) {
            alert('Please arm at least one track (click the R button) before recording.');
            return;
        }
        
        this.isRecording = true;
        this.elements.recordBtn.classList.add('active');
        
        // Start recording on armed tracks
        for (const track of armedTracks) {
            await this.startTrackRecording(track);
        }
        
        // Auto-play during recording if not already playing
        if (!this.isPlaying) {
            this.playStartTime = this.audioContext.currentTime - this.currentTime;
            this.updatePlayhead();
        }
    }
    
    async startTrackRecording(track) {
        try {
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            track.mediaStream = stream;
            
            const source = this.audioContext.createMediaStreamSource(stream);
            source.connect(track.gainNode);
            
            let mimeType = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            }
            
            track.mediaRecorder = new MediaRecorder(stream, { mimeType });
            track.chunks = [];
            
            track.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) track.chunks.push(e.data);
            };
            
            track.mediaRecorder.onstop = async () => {
                if (track.chunks.length > 0) {
                    const blob = new Blob(track.chunks, { type: mimeType });
                    const arrayBuffer = await blob.arrayBuffer();
                    try {
                        track.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        this.drawWaveform(track);
                    } catch (err) {
                        console.error('Decode error:', err);
                    }
                }
                stream.getTracks().forEach(t => t.stop());
                track.mediaStream = null;
            };
            
            track.mediaRecorder.start();
        } catch (err) {
            console.error('Recording error:', err);
        }
    }
    
    stopRecording() {
        this.isRecording = false;
        this.elements.recordBtn.classList.remove('active');
        
        this.tracks.forEach(track => {
            if (track.mediaRecorder && track.mediaRecorder.state === 'recording') {
                track.mediaRecorder.stop();
            }
        });
        
        // Don't stop the playhead update - let it continue if playing
        if (!this.isPlaying && this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }
    
    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.elements.loopBtn.classList.toggle('active', this.isLooping);
    }
    
    updatePlayhead() {
        if (!this.isPlaying && !this.isRecording) return;
        
        this.currentTime = this.audioContext.currentTime - this.playStartTime;
        
        // Handle loop boundary
        if (this.isLooping && this.currentTime >= this.loopEnd) {
            this.currentTime = this.loopStart;
            this.playStartTime = this.audioContext.currentTime - this.loopStart;
            
            // Restart all sources
            this.tracks.forEach(track => {
                if (track.sourceNode) {
                    try { track.sourceNode.stop(); } catch (e) {}
                    track.sourceNode = null;
                }
                if (track.audioBuffer) {
                    const sourceNode = this.audioContext.createBufferSource();
                    sourceNode.buffer = track.audioBuffer;
                    sourceNode.connect(track.gainNode);
                    sourceNode.loop = true;
                    sourceNode.loopStart = this.loopStart;
                    sourceNode.loopEnd = this.loopEnd;
                    sourceNode.start(0, this.loopStart);
                    track.sourceNode = sourceNode;
                }
            });
        }
        
        this.elements.timeDisplay.textContent = this.formatTime(this.currentTime);
        this.updatePlayheadPosition();
        
        this.animationFrameId = requestAnimationFrame(() => this.updatePlayhead());
    }
    
    updatePlayheadPosition() {
        // Remove existing playhead
        const existingPlayhead = document.querySelector('.playhead');
        if (existingPlayhead) existingPlayhead.remove();
        
        // Create playhead in timeline area
        const playhead = document.createElement('div');
        playhead.className = 'playhead';
        playhead.style.left = `${this.currentTime * this.pixelsPerSecond}px`;
        this.elements.timelineGrid.appendChild(playhead);
    }
    
    drawWaveform(track) {
        const canvas = document.getElementById(`canvas-${track.id}`);
        if (!canvas || !track.audioBuffer) return;
        
        // Ensure canvas is properly sized
        const row = document.getElementById(`row-${track.id}`);
        if (row) {
            const rect = row.getBoundingClientRect();
            if (canvas.width !== rect.width) {
                canvas.width = rect.width;
            }
            if (canvas.height !== rect.height) {
                canvas.height = rect.height;
            }
        }
        
        const ctx = canvas.getContext('2d');
        const data = track.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / canvas.width);
        const amp = canvas.height / 2;
        
        // Clear canvas
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw center line
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, amp);
        ctx.lineTo(canvas.width, amp);
        ctx.stroke();
        
        // Draw waveform
        ctx.beginPath();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < canvas.width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const idx = (i * step) + j;
                if (idx < data.length) {
                    const datum = data[idx];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }
            ctx.lineTo(i, (1 + min) * amp);
            ctx.lineTo(i, (1 + max) * amp);
        }
        ctx.stroke();
    }
    
    async handleFileDrop(files) {
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                const arrayBuffer = await file.arrayBuffer();
                try {
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    const trackId = this.nextTrackId++;
                    const track = {
                        id: trackId,
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        volume: 0.8,
                        pan: 0,
                        muted: false,
                        soloed: false,
                        armed: false,
                        audioBuffer: audioBuffer,
                        sourceNode: null,
                        gainNode: this.audioContext.createGain(),
                        panNode: this.audioContext.createStereoPanner(),
                        mediaStream: null,
                        mediaRecorder: null,
                        chunks: []
                    };
                    
                    track.gainNode.connect(track.panNode);
                    track.panNode.connect(this.masterGain);
                    
                    this.tracks.push(track);
                    this.renderTrackHeader(track);
                    this.renderTrackRow(track);
                    this.updateTrackAudio(track);
                    
                    // Draw waveform after canvas is set up
                    requestAnimationFrame(() => this.drawWaveform(track));
                } catch (err) {
                    console.error('Error decoding audio:', err);
                }
            }
        }
    }
    
    startRenderLoop() {
        const meterCanvas = this.elements.masterMeter;
        const ctx = meterCanvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const draw = () => {
            requestAnimationFrame(draw);
            this.analyser.getByteTimeDomainData(dataArray);
            
            ctx.fillStyle = '#222';
            ctx.fillRect(0, 0, meterCanvas.width, meterCanvas.height);
            
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#4CAF50';
            ctx.beginPath();
            
            const sliceWidth = meterCanvas.width / bufferLength;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * meterCanvas.height / 2;
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                
                x += sliceWidth;
            }
            
            ctx.stroke();
        };
        draw();
    }
    
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}

// Initialize DAW
const daw = new JustDAW();

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Just-DAW: Service Worker registered with scope:', registration.scope);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New version available
                            console.log('Just-DAW: New version available!');
                        }
                    });
                });
            })
            .catch((error) => {
                console.log('Just-DAW: Service Worker registration failed:', error);
            });
    });
}