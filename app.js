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
        
        // Tracks - now with blocks (clips) instead of single audioBuffer
        this.tracks = [];
        this.nextTrackId = 1;
        this.nextBlockId = 1;
        
        // Mic input sources
        this.audioInputDevices = [];
        
        // Drag state
        this.isDraggingPlayhead = false;
        
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
        this.setupPlayheadDrag();
    }
    
    setupResizeHandler() {
        const resizeObserver = new ResizeObserver(() => {
            this.tracks.forEach(track => {
                this.drawTrackWaveforms(track);
            });
            this.renderRuler();
        });
        resizeObserver.observe(this.elements.timelineGrid);
    }
    
    async checkMicPermission() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('getUserMedia not supported in this browser');
            this.showMicNotSupported();
            return;
        }

        if (navigator.permissions && navigator.permissions.query) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' });
                this.updateMicPermissionUI(result.state);
                result.onchange = () => this.updateMicPermissionUI(result.state);
                return;
            } catch (e) {
                console.log('Permissions API not available for microphone');
            }
        }
        
        // Fallback: try to get a stream to check permission
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());
            this.micPermissionGranted = true;
            this.hideMicPermissionButton();
            await this.enumerateAudioInputs();
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                this.showPermissionDeniedModal();
            } else {
                this.showMicPermissionButton();
            }
        }
    }
    
    async enumerateAudioInputs() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.audioInputDevices = devices.filter(d => d.kind === 'audioinput');
            // Re-render all track headers to show input selectors
            this.refreshAllTrackInputSelectors();
        } catch (e) {
            console.error('Could not enumerate devices:', e);
        }
    }
    
    refreshAllTrackInputSelectors() {
        this.tracks.forEach(track => {
            this.renderTrackInputSelector(track);
        });
    }
    
    renderTrackInputSelector(track) {
        const header = document.getElementById(`header-${track.id}`);
        if (!header) return;
        
        // Remove existing input selector for this track
        const existing = header.querySelector('.track-input-selector');
        if (existing) existing.remove();
        
        if (this.audioInputDevices.length === 0) return;
        
        const container = document.createElement('div');
        container.className = 'track-input-selector';
        
        const label = document.createElement('label');
        label.textContent = 'Input:';
        
        const select = document.createElement('select');
        select.id = `input-select-${track.id}`;
        
        this.audioInputDevices.forEach((device, idx) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Mic ${idx + 1}`;
            select.appendChild(option);
        });
        
        // Set current value
        select.value = track.inputDeviceId || (this.audioInputDevices[0] ? this.audioInputDevices[0].deviceId : '');
        
        select.addEventListener('change', (e) => {
            track.inputDeviceId = e.target.value;
        });
        
        container.appendChild(label);
        container.appendChild(select);
        
        // Insert after track controls, before faders
        const controls = header.querySelector('.track-controls');
        controls.after(container);
    }
    
    updateMicPermissionUI(state) {
        if (state === 'granted') {
            this.micPermissionGranted = true;
            this.hideMicPermissionButton();
            this.enumerateAudioInputs();
        } else if (state === 'prompt') {
            this.showMicPermissionButton();
        } else {
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
            await this.enumerateAudioInputs();
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
                await this.enumerateAudioInputs();
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
    
    setupPlayheadDrag() {
        const ruler = this.elements.timelineRuler;
        const grid = this.elements.timelineGrid;
        
        // Handle mouse down on ruler or grid to start dragging playhead
        const onMouseDown = (e) => {
            // Only start drag if clicking on the ruler area or the grid area (not on blocks)
            const target = e.target;
            if (target.closest('.audio-block')) return;
            
            this.isDraggingPlayhead = true;
            this.setPlayheadFromMouse(e);
            document.body.style.cursor = 'col-resize';
        };
        
        const onMouseMove = (e) => {
            if (!this.isDraggingPlayhead) return;
            this.setPlayheadFromMouse(e);
        };
        
        const onMouseUp = () => {
            if (this.isDraggingPlayhead) {
                this.isDraggingPlayhead = false;
                document.body.style.cursor = '';
            }
        };
        
        ruler.addEventListener('mousedown', onMouseDown);
        grid.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    
    setPlayheadFromMouse(e) {
        // Determine which element was clicked to calculate correct offset
        const target = e.currentTarget || e.target;
        const rect = target.closest('.timeline-area').querySelector('.timeline-grid').getBoundingClientRect();
        const scrollLeft = this.elements.timelineGrid.scrollLeft;
        const x = e.clientX - rect.left + scrollLeft;
        const time = Math.max(0, x / this.pixelsPerSecond);
        
        const wasPlaying = this.isPlaying;
        if (wasPlaying) {
            // Stop current playback
            this.tracks.forEach(track => {
                if (track.sourceNode) {
                    try { track.sourceNode.stop(); } catch (e) {}
                    track.sourceNode = null;
                }
            });
        }
        
        this.currentTime = time;
        this.playStartTime = this.audioContext.currentTime - this.currentTime;
        this.elements.timeDisplay.textContent = this.formatTime(this.currentTime);
        this.updatePlayheadPosition();
        
        if (wasPlaying) {
            // Restart playback from new position
            this.playFromCurrentTime();
        }
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
            blocks: [], // Array of audio blocks instead of single audioBuffer
            sourceNode: null,
            gainNode: this.audioContext.createGain(),
            panNode: this.audioContext.createStereoPanner(),
            mediaStream: null,
            mediaRecorder: null,
            chunks: [],
            recordingStartTime: null,
            recordingBlockId: null,
            inputDeviceId: this.audioInputDevices.length > 0 ? this.audioInputDevices[0].deviceId : null,
            effects: [], // Array of effect instances
            nextEffectId: 1
        };
        
        // Connect audio graph: gain -> [effects chain] -> pan -> master
        this.rebuildTrackAudioGraph(track);
        
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
    
    // Rebuild the audio graph for a track: gain -> [effects] -> pan -> master
    rebuildTrackAudioGraph(track) {
        // Disconnect existing connections
        try { track.gainNode.disconnect(); } catch (e) {}
        try { track.panNode.disconnect(); } catch (e) {}
        track.effects.forEach(effect => effect.disconnect());

        if (track.effects.length === 0) {
            // No effects: gain -> pan -> master
            track.gainNode.connect(track.panNode);
            track.panNode.connect(this.masterGain);
        } else {
            // gain -> effect1 -> effect2 -> ... -> pan -> master
            track.gainNode.connect(track.effects[0].nodes[0] || track.panNode);
            for (let i = 0; i < track.effects.length; i++) {
                const nextTarget = i < track.effects.length - 1
                    ? (track.effects[i + 1].nodes[0] || track.panNode)
                    : track.panNode;
                track.effects[i].connect(track.effects[i].nodes[0] || track.gainNode, nextTarget);
            }
            track.panNode.connect(this.masterGain);
        }
    }

    addEffectToTrack(trackId, effectType) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const effect = EffectFactory.create(this.audioContext, effectType);
        if (!effect) return;

        effect.id = track.nextEffectId++;
        track.effects.push(effect);
        this.rebuildTrackAudioGraph(track);
        this.renderEffectsRack(track);
    }

    removeEffectFromTrack(trackId, effectId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const index = track.effects.findIndex(e => e.id === effectId);
        if (index > -1) {
            track.effects[index].disconnect();
            track.effects.splice(index, 1);
            this.rebuildTrackAudioGraph(track);
            this.renderEffectsRack(track);
        }
    }

    toggleEffect(trackId, effectId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const effect = track.effects.find(e => e.id === effectId);
        if (effect) {
            effect.toggle();
            this.rebuildTrackAudioGraph(track);
            this.renderEffectsRack(track);
        }
    }

    moveEffect(trackId, effectId, direction) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;

        const index = track.effects.findIndex(e => e.id === effectId);
        if (index === -1) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= track.effects.length) return;

        // Swap
        [track.effects[index], track.effects[newIndex]] = [track.effects[newIndex], track.effects[index]];
        this.rebuildTrackAudioGraph(track);
        this.renderEffectsRack(track);
    }

    renderEffectsRack(track) {
        const header = document.getElementById(`header-${track.id}`);
        if (!header) return;

        // Remove existing rack
        const existingRack = header.querySelector('.effects-rack');
        if (existingRack) existingRack.remove();

        const rack = document.createElement('div');
        rack.className = 'effects-rack';

        // Add effect button
        const addBtn = document.createElement('button');
        addBtn.className = 'effects-add-btn';
        addBtn.textContent = '+ Effect';
        addBtn.title = 'Add effect';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            this.showEffectMenu(track.id, addBtn);
        };
        rack.appendChild(addBtn);

        // Render each effect
        track.effects.forEach((effect, index) => {
            const slot = document.createElement('div');
            slot.className = `effect-slot ${effect.enabled ? 'active' : 'bypassed'}`;

            const topRow = document.createElement('div');
            topRow.className = 'effect-slot-top';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'effect-slot-name';
            nameSpan.textContent = EffectFactory.getDisplayName(effect.type);
            topRow.appendChild(nameSpan);

            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'effect-toggle-btn';
            toggleBtn.textContent = effect.enabled ? 'ON' : 'OFF';
            toggleBtn.title = 'Toggle effect';
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleEffect(track.id, effect.id);
            };
            topRow.appendChild(toggleBtn);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'effect-remove-btn';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove effect';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeEffectFromTrack(track.id, effect.id);
            };
            topRow.appendChild(removeBtn);

            slot.appendChild(topRow);

            // Reorder buttons
            const reorderRow = document.createElement('div');
            reorderRow.className = 'effect-reorder';

            const upBtn = document.createElement('button');
            upBtn.textContent = '▲';
            upBtn.title = 'Move up';
            upBtn.onclick = (e) => {
                e.stopPropagation();
                this.moveEffect(track.id, effect.id, -1);
            };
            reorderRow.appendChild(upBtn);

            const downBtn = document.createElement('button');
            downBtn.textContent = '▼';
            downBtn.title = 'Move down';
            downBtn.onclick = (e) => {
                e.stopPropagation();
                this.moveEffect(track.id, effect.id, 1);
            };
            reorderRow.appendChild(downBtn);

            slot.appendChild(reorderRow);

            // Effect parameters
            const paramsContainer = document.createElement('div');
            paramsContainer.className = 'effect-params';
            effect.renderUI(paramsContainer, track.id, effect.id, this);
            slot.appendChild(paramsContainer);

            rack.appendChild(slot);
        });

        // Insert rack after faders
        const faders = header.querySelector('.track-faders');
        if (faders) {
            faders.after(rack);
        } else {
            header.appendChild(rack);
        }
    }

    showEffectMenu(trackId, anchorBtn) {
        // Remove existing menu
        const existing = document.getElementById('effect-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.id = 'effect-menu';
        menu.className = 'effect-menu';

        EffectFactory.getAvailableTypes().forEach(type => {
            const item = document.createElement('button');
            item.className = 'effect-menu-item';
            item.textContent = EffectFactory.getDisplayName(type);
            item.onclick = (e) => {
                e.stopPropagation();
                this.addEffectToTrack(trackId, type);
                menu.remove();
            };
            menu.appendChild(item);
        });

        // Position near the button
        const rect = anchorBtn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.zIndex = '500';

        document.body.appendChild(menu);

        // Close on outside click
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
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
        
        // Render input selector for this track
        this.renderTrackInputSelector(track);
        
        // Render effects rack
        this.renderEffectsRack(track);
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
        
        const rect = row.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        
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
        
        const content = document.createElement('div');
        content.style.position = 'relative';
        content.style.width = `${totalSeconds * this.pixelsPerSecond}px`;
        content.style.height = '100%';
        
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
        this.renderRuler();
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
        
        this.playStartTime = this.audioContext.currentTime - this.currentTime;
        this.playFromCurrentTime();
        this.updatePlayhead();
    }
    
    playFromCurrentTime() {
        // Start sources for all tracks with blocks that overlap currentTime
        this.tracks.forEach(track => {
            if (track.sourceNode) {
                try { track.sourceNode.stop(); } catch (e) {}
                track.sourceNode = null;
            }
            
            // Find blocks that should be playing at currentTime
            track.blocks.forEach(block => {
                if (this.currentTime >= block.startTime && this.currentTime < block.endTime) {
                    const sourceNode = this.audioContext.createBufferSource();
                    sourceNode.buffer = block.audioBuffer;
                    sourceNode.connect(track.gainNode);
                    
                    const offsetInBlock = this.currentTime - block.startTime;
                    const remainingDuration = block.endTime - this.currentTime;
                    
                    sourceNode.start(0, offsetInBlock, remainingDuration);
                    track.sourceNode = sourceNode;
                }
            });
        });
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
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(t => t.stop());
                this.micPermissionGranted = true;
                this.hideMicPermissionButton();
                await this.enumerateAudioInputs();
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
        
        // Record start time for block positioning
        const recordStartTime = this.isPlaying ? this.currentTime : 0;
        
        // Start recording on armed tracks
        for (const track of armedTracks) {
            await this.startTrackRecording(track, recordStartTime);
        }
        
        // Auto-play during recording if not already playing
        if (!this.isPlaying) {
            this.playStartTime = this.audioContext.currentTime;
            this.currentTime = 0;
            this.updatePlayhead();
        }
    }
    
    async startTrackRecording(track, recordStartTime) {
        try {
            const constraints = {
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            };
            
            // Use track's selected input device if available
            if (track.inputDeviceId) {
                constraints.audio.deviceId = { exact: track.inputDeviceId };
            }
            
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
            track.recordingStartTime = recordStartTime;
            
            track.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) track.chunks.push(e.data);
            };
            
            track.mediaRecorder.onstop = async () => {
                if (track.chunks.length > 0) {
                    const blob = new Blob(track.chunks, { type: mimeType });
                    const arrayBuffer = await blob.arrayBuffer();
                    try {
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        
                        // Create a new audio block
                        const block = {
                            id: this.nextBlockId++,
                            audioBuffer: audioBuffer,
                            startTime: track.recordingStartTime,
                            endTime: track.recordingStartTime + audioBuffer.duration,
                            duration: audioBuffer.duration
                        };
                        
                        track.blocks.push(block);
                        this.drawTrackWaveforms(track);
                        this.renderAudioBlock(track, block);
                    } catch (err) {
                        console.error('Decode error:', err);
                    }
                }
                stream.getTracks().forEach(t => t.stop());
                track.mediaStream = null;
                track.recordingStartTime = null;
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
                // Find and play blocks at loop start
                track.blocks.forEach(block => {
                    if (this.currentTime >= block.startTime && this.currentTime < block.endTime) {
                        const sourceNode = this.audioContext.createBufferSource();
                        sourceNode.buffer = block.audioBuffer;
                        sourceNode.connect(track.gainNode);
                        sourceNode.loop = true;
                        sourceNode.loopStart = this.loopStart;
                        sourceNode.loopEnd = this.loopEnd;
                        sourceNode.start(0, this.loopStart);
                        track.sourceNode = sourceNode;
                    }
                });
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
    
    renderAudioBlock(track, block) {
        const row = document.getElementById(`row-${track.id}`);
        if (!row) return;
        
        // Remove existing block element if any (for same block id)
        const existingBlock = document.getElementById(`block-${block.id}`);
        if (existingBlock) existingBlock.remove();
        
        const blockEl = document.createElement('div');
        blockEl.className = 'audio-block';
        blockEl.id = `block-${block.id}`;
        blockEl.style.left = `${block.startTime * this.pixelsPerSecond}px`;
        blockEl.style.width = `${block.duration * this.pixelsPerSecond}px`;
        
        // Block label
        const label = document.createElement('span');
        label.className = 'audio-block-label';
        label.textContent = `Recording ${block.id}`;
        blockEl.appendChild(label);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'audio-block-delete';
        deleteBtn.textContent = '✕';
        deleteBtn.title = 'Delete block';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.deleteBlock(track.id, block.id);
        };
        blockEl.appendChild(deleteBtn);
        
        row.appendChild(blockEl);
    }
    
    deleteBlock(trackId, blockId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;
        
        const blockIndex = track.blocks.findIndex(b => b.id === blockId);
        if (blockIndex > -1) {
            track.blocks.splice(blockIndex, 1);
            
            // Remove block element
            const blockEl = document.getElementById(`block-${blockId}`);
            if (blockEl) blockEl.remove();
            
            // Redraw waveforms
            this.drawTrackWaveforms(track);
        }
    }
    
    drawTrackWaveforms(track) {
        const canvas = document.getElementById(`canvas-${track.id}`);
        if (!canvas) return;
        
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
        
        // Clear canvas completely
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw center line
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        
        // Draw waveforms for each block
        track.blocks.forEach(block => {
            this.drawBlockWaveform(ctx, canvas, block);
        });
    }
    
    drawBlockWaveform(ctx, canvas, block) {
        if (!block.audioBuffer) return;
        
        const data = block.audioBuffer.getChannelData(0);
        const amp = canvas.height / 2;
        
        // Calculate pixel positions for this block
        const startPixel = block.startTime * this.pixelsPerSecond;
        const blockPixelWidth = block.duration * this.pixelsPerSecond;
        
        const step = Math.ceil(data.length / blockPixelWidth);
        
        ctx.beginPath();
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 1;
        
        for (let i = 0; i < blockPixelWidth; i++) {
            const x = startPixel + i;
            if (x < 0 || x >= canvas.width) continue;
            
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const idx = Math.floor(i * step) + j;
                if (idx < data.length) {
                    const datum = data[idx];
                    if (datum < min) min = datum;
                    if (datum > max) max = datum;
                }
            }
            ctx.lineTo(x, (1 + min) * amp);
            ctx.lineTo(x, (1 + max) * amp);
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
                    
                    // Create a block for the dropped file
                    const block = {
                        id: this.nextBlockId++,
                        audioBuffer: audioBuffer,
                        startTime: 0,
                        endTime: audioBuffer.duration,
                        duration: audioBuffer.duration
                    };
                    
                    const track = {
                        id: trackId,
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        volume: 0.8,
                        pan: 0,
                        muted: false,
                        soloed: false,
                        armed: false,
                        blocks: [block],
                        sourceNode: null,
                        gainNode: this.audioContext.createGain(),
                        panNode: this.audioContext.createStereoPanner(),
                        mediaStream: null,
                        mediaRecorder: null,
                        chunks: [],
                        recordingStartTime: null,
                        inputDeviceId: this.audioInputDevices.length > 0 ? this.audioInputDevices[0].deviceId : null,
                        effects: [],
                        nextEffectId: 1
                    };
                    
                    this.rebuildTrackAudioGraph(track);
                    
                    this.tracks.push(track);
                    this.renderTrackHeader(track);
                    this.renderTrackRow(track);
                    this.updateTrackAudio(track);
                    
                    // Draw waveform and block after canvas is set up
                    requestAnimationFrame(() => {
                        this.drawTrackWaveforms(track);
                        this.renderAudioBlock(track, block);
                    });
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
                
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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