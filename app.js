// Just-DAW Audio Engine & UI Controller
class JustDAW {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.analyser = null;
        this.isPlaying = false;
        this.isRecording = false;
        this.isLooping = false;
        this.loopStart = 0;
        this.loopEnd = 16;
        this.currentTime = 0;
        this.bpm = 120;
        this.playStartTime = 0;
        this.animationFrameId = null;
        this.pixelsPerSecond = 50;
        this.timelineScrollLeft = 0;
        this.tracks = [];
        this.nextTrackId = 1;
        this.nextBlockId = 1;
        this.selectedTrackId = null;
        this.selectedBlockId = null;
        this.audioInputDevices = [];
        this.isDraggingPlayhead = false;
        this.activePanel = null;
        this._lyricsText = '';
        this.micPermissionGranted = false;
        this._meterAnimationId = null;
        
        // Block drag state
        this.dragState = null; // { blockId, trackId, startX, startStartTime }
        
        // Clipboard for copy/paste
        this.clipboard = null; // { audioBuffer }
        
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
            dropZone: document.getElementById('drop-zone'),
            toolTray: document.querySelector('.tool-tray'),
            bottomPanel: document.getElementById('bottom-panel'),
            bottomPanelContent: document.getElementById('bottom-panel-content'),
            bottomPanelTitle: document.getElementById('bottom-panel-title'),
            bottomPanelClose: document.getElementById('bottom-panel-close')
        };
        
        this.init();
    }
    
    async init() {
        this.setupEventListeners();
        this.initAudio();
        this.addTrack();
        this.startRenderLoop();
        this.renderRuler();
        this.checkMicPermission();
        this.setupResizeHandler();
        this.setupPlayheadDrag();
        this.setupToolTray();
        this.setupTimelineClicks();
    }
    
    // ─── Audio ────────────────────────────────────────────────────────────────
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
        if (this.audioContext.state === 'suspended') this.audioContext.resume();
    }
    
    // ─── Track Selection ─────────────────────────────────────────────────────
    selectTrack(trackId) {
        if (this.selectedTrackId) {
            const prev = document.getElementById(`header-${this.selectedTrackId}`);
            if (prev) prev.classList.remove('selected');
            const prevRow = document.getElementById(`row-${this.selectedTrackId}`);
            if (prevRow) prevRow.classList.remove('selected');
        }
        this.selectedTrackId = trackId;
        if (trackId) {
            const h = document.getElementById(`header-${trackId}`);
            if (h) h.classList.add('selected');
            const r = document.getElementById(`row-${trackId}`);
            if (r) r.classList.add('selected');
        }
        if (this.activePanel === 'effects') this.openBottomPanel('effects');
    }
    
    selectBlock(blockId) {
        // Deselect previous
        if (this.selectedBlockId) {
            const prev = document.getElementById(`block-${this.selectedBlockId}`);
            if (prev) prev.classList.remove('selected');
        }
        this.selectedBlockId = blockId;
        if (blockId) {
            const el = document.getElementById(`block-${blockId}`);
            if (el) el.classList.add('selected');
        }
    }
    
    // ─── Timeline Click Handling ─────────────────────────────────────────────
    setupTimelineClicks() {
        // Click on track row background → select track
        this.elements.timelineGrid.addEventListener('click', (e) => {
            const trackRow = e.target.closest('.track-row');
            if (!trackRow) return;
            const trackId = parseInt(trackRow.id.replace('row-', ''));
            
            // If clicking on a block, handle block selection
            const blockEl = e.target.closest('.audio-block');
            if (blockEl) {
                e.stopPropagation();
                this.selectTrack(trackId);
                this.selectBlock(parseInt(blockEl.id.replace('block-', '')));
                return;
            }
            
            // Click on empty area of track row
            this.selectTrack(trackId);
            this.selectBlock(null);
        });
    }
    
    // ─── Block Dragging ──────────────────────────────────────────────────────
    setupBlockDrag(blockEl, trackId, block) {
        blockEl.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('audio-block-delete')) return;
            e.preventDefault();
            e.stopPropagation();
            
            this.selectTrack(trackId);
            this.selectBlock(block.id);
            
            this.dragState = {
                blockId: block.id,
                trackId: trackId,
                startX: e.clientX,
                startStartTime: block.startTime
            };
            blockEl.classList.add('dragging');
            document.body.style.cursor = 'grabbing';
        });
    }
    
    setupPlayheadDrag() {
        const ruler = this.elements.timelineRuler;
        const grid = this.elements.timelineGrid;
        
        const onMouseDown = (e) => {
            if (e.target.closest('.audio-block')) return;
            this.isDraggingPlayhead = true;
            this.setPlayheadFromMouse(e);
            document.body.style.cursor = 'col-resize';
        };
        const onMouseMove = (e) => {
            if (this.isDraggingPlayhead) this.setPlayheadFromMouse(e);
            if (this.dragState) this.handleBlockDrag(e);
        };
        const onMouseUp = () => {
            if (this.isDraggingPlayhead) {
                this.isDraggingPlayhead = false;
                document.body.style.cursor = '';
            }
            if (this.dragState) {
                const blockEl = document.getElementById(`block-${this.dragState.blockId}`);
                if (blockEl) blockEl.classList.remove('dragging');
                this.dragState = null;
            }
        };
        
        ruler.addEventListener('mousedown', onMouseDown);
        grid.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    
    handleBlockDrag(e) {
        if (!this.dragState) return;
        const ds = this.dragState;
        const track = this.tracks.find(t => t.id === ds.trackId);
        if (!track) return;
        const block = track.blocks.find(b => b.id === ds.blockId);
        if (!block) return;
        
        const dx = e.clientX - ds.startX;
        const dt = dx / this.pixelsPerSecond;
        let newStart = ds.startStartTime + dt;
        if (newStart < 0) newStart = 0;
        
        const duration = block.duration;
        block.startTime = newStart;
        block.endTime = newStart + duration;
        
        // Update DOM
        const blockEl = document.getElementById(`block-${ds.blockId}`);
        if (blockEl) {
            blockEl.style.left = `${newStart * this.pixelsPerSecond}px`;
        }
        
        // Redraw waveform
        this.drawTrackWaveforms(track);
    }
    
    // ─── Block Copy/Paste ───────────────────────────────────────────────────
    copySelectedBlock() {
        if (!this.selectedBlockId || !this.selectedTrackId) return;
        const track = this.tracks.find(t => t.id === this.selectedTrackId);
        if (!track) return;
        const block = track.blocks.find(b => b.id === this.selectedBlockId);
        if (!block || !block.audioBuffer) return;
        
        // Deep copy the audio buffer
        const copyBuffer = this.audioContext.createBuffer(
            block.audioBuffer.numberOfChannels,
            block.audioBuffer.length,
            block.audioBuffer.sampleRate
        );
        for (let ch = 0; ch < block.audioBuffer.numberOfChannels; ch++) {
            copyBuffer.getChannelData(ch).set(block.audioBuffer.getChannelData(ch));
        }
        this.clipboard = { audioBuffer: copyBuffer };
    }
    
    pasteBlock() {
        if (!this.clipboard || !this.selectedTrackId) return;
        const track = this.tracks.find(t => t.id === this.selectedTrackId);
        if (!track) return;
        
        const pasteTime = this.currentTime;
        const block = {
            id: this.nextBlockId++,
            audioBuffer: this.clipboard.audioBuffer,
            startTime: pasteTime,
            endTime: pasteTime + this.clipboard.audioBuffer.duration,
            duration: this.clipboard.audioBuffer.duration
        };
        track.blocks.push(block);
        this.drawTrackWaveforms(track);
        this.renderAudioBlock(track, block);
    }
    
    deleteSelectedBlock() {
        if (!this.selectedBlockId || !this.selectedTrackId) return;
        this.deleteBlock(this.selectedTrackId, this.selectedBlockId);
        this.selectedBlockId = null;
    }
    
    // ─── Event Listeners ────────────────────────────────────────────────────
    setupEventListeners() {
        this.elements.playBtn.addEventListener('click', () => this.togglePlayback());
        this.elements.stopBtn.addEventListener('click', () => this.stop());
        this.elements.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.elements.loopBtn.addEventListener('click', () => this.toggleLoop());
        this.elements.addTrackBtn.addEventListener('click', () => this.addTrack());
        this.elements.bpmInput.addEventListener('change', (e) => this.setBPM(e.target.value));
        this.elements.masterVol.addEventListener('input', (e) => this.setMasterVolume(e.target.value));
        
        if (this.elements.bottomPanelClose) {
            this.elements.bottomPanelClose.addEventListener('click', () => this.closeBottomPanel());
        }
        
        this.elements.timelineGrid.addEventListener('scroll', (e) => {
            this.timelineScrollLeft = e.target.scrollLeft;
            this.elements.timelineRuler.scrollLeft = e.target.scrollLeft;
        });
        
        // Drag and drop files
        const dz = this.elements.dropZone;
        const ta = this.elements.timelineArea;
        ta.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('active'); });
        ta.addEventListener('dragleave', (e) => { if (!ta.contains(e.relatedTarget)) dz.classList.remove('active'); });
        ta.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('active'); this.handleFileDrop(e.dataTransfer.files); });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayback();
                    break;
                case 'KeyR':
                    if (!e.ctrlKey && !e.metaKey) this.toggleRecording();
                    break;
                case 'KeyL':
                    this.toggleLoop();
                    break;
                case 'Escape':
                    this.closeBottomPanel();
                    this.selectBlock(null);
                    break;
                case 'KeyC':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.copySelectedBlock(); }
                    break;
                case 'KeyV':
                    if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.pasteBlock(); }
                    break;
                case 'Delete':
                case 'Backspace':
                    e.preventDefault();
                    this.deleteSelectedBlock();
                    break;
            }
        });
    }
    
    // ─── Tool Tray & Bottom Panel ───────────────────────────────────────────
    setupToolTray() {
        const map = { 'Fx Effects': 'effects', 'Editor': 'editor', 'Lyrics/Notes': 'lyrics', 'Shortcuts': 'shortcuts' };
        this.elements.toolTray.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.textContent.trim();
                if (text === 'AutoPitch') {
                    alert('AutoPitch: Select a block on a track to enable pitch correction.\n\n(Feature coming soon)');
                    return;
                }
                const panel = map[text];
                if (!panel) return;
                if (this.activePanel === panel) this.closeBottomPanel();
                else this.openBottomPanel(panel);
            });
        });
    }
    
    openBottomPanel(panel) {
        this.activePanel = panel;
        const c = this.elements.bottomPanelContent;
        c.innerHTML = '';
        const btns = this.elements.toolTray.querySelectorAll('.tool-btn');
        btns.forEach(b => b.classList.toggle('active',
            b.textContent.trim().toLowerCase().includes(panel) ||
            (panel === 'effects' && b.textContent.trim() === 'Fx Effects')));
        
        if (panel === 'effects') {
            this.initAudio();
            this.elements.bottomPanelTitle.textContent = 'Effects — ' + (this.selectedTrackId ? this.tracks.find(t => t.id === this.selectedTrackId)?.name || 'Track ' + this.selectedTrackId : 'No Track Selected');
            this.renderEffectsPanel(c);
        } else if (panel === 'editor') {
            this.elements.bottomPanelTitle.textContent = 'Editor';
            c.innerHTML = `<div class="panel-empty"><p><strong>Track Editor</strong></p><p style="margin-top:8px">${this.selectedTrackId ? 'Track ' + this.selectedTrackId + ' selected' : 'Select a track first'}</p></div>`;
        } else if (panel === 'lyrics') {
            this.elements.bottomPanelTitle.textContent = 'Lyrics/Notes';
            const ta = document.createElement('textarea');
            ta.className = 'lyrics-textarea';
            ta.placeholder = 'Write lyrics or notes here...';
            ta.value = this._lyricsText;
            ta.addEventListener('input', (e) => { this._lyricsText = e.target.value; });
            c.appendChild(ta);
        } else if (panel === 'shortcuts') {
            this.elements.bottomPanelTitle.textContent = 'Shortcuts';
            c.innerHTML = `<div class="shortcuts-list">
                <div class="shortcut-row"><kbd>Space</kbd><span>Play / Pause</span></div>
                <div class="shortcut-row"><kbd>R</kbd><span>Toggle Recording</span></div>
                <div class="shortcut-row"><kbd>L</kbd><span>Toggle Loop</span></div>
                <div class="shortcut-row"><kbd>Ctrl+C</kbd><span>Copy Block</span></div>
                <div class="shortcut-row"><kbd>Ctrl+V</kbd><span>Paste Block</span></div>
                <div class="shortcut-row"><kbd>Del</kbd><span>Delete Block</span></div>
                <div class="shortcut-row"><kbd>Esc</kbd><span>Deselect / Close Panel</span></div>
            </div>`;
        }
        this.elements.bottomPanel.classList.add('open');
    }
    
    closeBottomPanel() {
        this.activePanel = null;
        this.elements.bottomPanel.classList.remove('open');
        this.elements.toolTray.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    }
    
    renderEffectsPanel(container) {
        const track = this.tracks.find(t => t.id === this.selectedTrackId);
        if (!track) {
            container.innerHTML = '<div class="panel-empty">Select a track to manage its effects.<br><br>Click on a track header or timeline row to select a track, then open this panel.</div>';
            return;
        }
        
        // Full rebuild — clear container completely to avoid duplication
        container.innerHTML = '';
        
        const panel = document.createElement('div');
        panel.className = 'effects-panel';
        
        // Horizontal chain of effect squares
        const chain = document.createElement('div');
        chain.className = 'effects-chain';
        
        track.effects.forEach((effect, idx) => {
            const slot = document.createElement('div');
            slot.className = `effect-slot ${effect.enabled ? 'active' : 'bypassed'}`;
            
            // Header row: icon, name, toggle, remove
            const header = document.createElement('div');
            header.className = 'effect-slot-header';
            
            const icon = document.createElement('span');
            icon.className = 'effect-icon';
            icon.textContent = EffectFactory.getIcon(effect.type);
            header.appendChild(icon);
            
            const name = document.createElement('span');
            name.className = 'effect-slot-name';
            name.textContent = EffectFactory.getDisplayName(effect.type);
            header.appendChild(name);
            
            const toggle = document.createElement('button');
            toggle.className = 'effect-toggle-btn';
            toggle.textContent = effect.enabled ? 'ON' : 'OFF';
            toggle.onclick = () => { this.toggleEffect(track.id, effect.id); this.renderEffectsPanel(container); };
            header.appendChild(toggle);
            
            const rm = document.createElement('button');
            rm.className = 'effect-remove-btn';
            rm.textContent = '✕';
            rm.onclick = () => { this.removeEffectFromTrack(track.id, effect.id); this.renderEffectsPanel(container); };
            header.appendChild(rm);
            
            slot.appendChild(header);
            
            // Reorder row
            const reorder = document.createElement('div');
            reorder.className = 'effect-reorder';
            const up = document.createElement('button');
            up.textContent = '◀';
            up.disabled = idx === 0;
            up.onclick = () => { this.moveEffect(track.id, effect.id, -1); this.renderEffectsPanel(container); };
            reorder.appendChild(up);
            const down = document.createElement('button');
            down.textContent = '▶';
            down.disabled = idx === track.effects.length - 1;
            down.onclick = () => { this.moveEffect(track.id, effect.id, 1); this.renderEffectsPanel(container); };
            reorder.appendChild(down);
            slot.appendChild(reorder);
            
            // Knobs area
            const knobs = document.createElement('div');
            effect.renderUI(knobs);
            slot.appendChild(knobs);
            
            chain.appendChild(slot);
            
            // Arrow between effects
            if (idx < track.effects.length - 1) {
                const arrow = document.createElement('div');
                arrow.className = 'effect-chain-arrow';
                arrow.textContent = '→';
                chain.appendChild(arrow);
            }
        });
        
        panel.appendChild(chain);
        
        // Add effect row
        const addRow = document.createElement('div');
        addRow.className = 'effects-add-row';
        const sel = document.createElement('select');
        sel.className = 'effects-type-select';
        EffectFactory.getAvailableTypes().forEach(type => {
            const o = document.createElement('option');
            o.value = type;
            o.textContent = `${EffectFactory.getIcon(type)} ${EffectFactory.getDisplayName(type)}`;
            sel.appendChild(o);
        });
        addRow.appendChild(sel);
        const addBtn = document.createElement('button');
        addBtn.className = 'effects-add-btn';
        addBtn.textContent = '+ Add';
        addBtn.onclick = () => { this.addEffectToTrack(track.id, sel.value); this.renderEffectsPanel(container); };
        addRow.appendChild(addBtn);
        panel.appendChild(addRow);
        
        if (track.effects.length === 0) {
            panel.innerHTML += '<div class="panel-empty">No effects yet. Add one above.</div>';
        }
        
        container.appendChild(panel);
    }
    
    // ─── Transport ──────────────────────────────────────────────────────────
    async togglePlayback() {
        this.initAudio();
        if (this.isPlaying) this.pause();
        else this.play();
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
        const SCHEDULE_AHEAD = 2.0; // seconds to pre-schedule
        this.tracks.forEach(track => {
            if (track.sourceNode) { try { track.sourceNode.stop(); } catch(e){} track.sourceNode = null; }
            track.activeSources = track.activeSources || [];
            track.activeSources.forEach(s => { try { s.stop(); } catch(e){} });
            track.activeSources = [];
            track.blocks.forEach(block => {
                const blockEndTime = this.isLooping ? block.endTime : block.endTime;
                // Play blocks currently overlapping playback position
                if (this.currentTime >= block.startTime && this.currentTime < block.endTime) {
                    const src = this.audioContext.createBufferSource();
                    src.buffer = block.audioBuffer;
                    src.connect(track.gainNode);
                    const offset = this.currentTime - block.startTime;
                    const remaining = block.endTime - this.currentTime;
                    src.start(0, offset, remaining);
                    track.activeSources.push(src);
                }
                // Pre-schedule blocks that start within the lookahead window
                else if (block.startTime > this.currentTime && block.startTime < this.currentTime + SCHEDULE_AHEAD) {
                    const src = this.audioContext.createBufferSource();
                    src.buffer = block.audioBuffer;
                    src.connect(track.gainNode);
                    const when = block.startTime - this.currentTime;
                    src.start(this.audioContext.currentTime + when);
                    track.activeSources.push(src);
                }
            });
            track.sourceNode = track.activeSources.length > 0 ? track.activeSources[0] : null;
        });
    }
    
    pause() {
        this.isPlaying = false;
        this.elements.playBtn.classList.remove('active');
        this.elements.playBtn.textContent = '▶';
        this.currentTime = this.audioContext.currentTime - this.playStartTime;
        this.tracks.forEach(t => {
            if (t.activeSources) { t.activeSources.forEach(s => { try { s.stop(); } catch(e){} }); t.activeSources = []; }
            t.sourceNode = null;
        });
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    }
    
    stop() {
        this.isPlaying = false;
        this.isRecording = false;
        this.currentTime = 0;
        this.elements.playBtn.classList.remove('active');
        this.elements.playBtn.textContent = '▶';
        this.elements.recordBtn.classList.remove('active');
        this.tracks.forEach(t => {
            if (t.activeSources) { t.activeSources.forEach(s => { try { s.stop(); } catch(e){} }); t.activeSources = []; }
            t.sourceNode = null;
            if (t.mediaRecorder && t.mediaRecorder.state !== 'inactive') t.mediaRecorder.stop();
        });
        if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
        this.elements.timeDisplay.textContent = '00:00.000';
        this.updatePlayheadPosition();
    }
    
    updatePlayhead() {
        if (!this.isPlaying && !this.isRecording) return;
        this.currentTime = this.audioContext.currentTime - this.playStartTime;
        if (this.isLooping && this.currentTime >= this.loopEnd) {
            this.currentTime = this.loopStart;
            this.playStartTime = this.audioContext.currentTime - this.loopStart;
            // Stop all active sources
            this.tracks.forEach(t => {
                if (t.activeSources) { t.activeSources.forEach(s => { try { s.stop(); } catch(e){} }); }
                t.activeSources = [];
                t.sourceNode = null;
            });
            // Restart all blocks that fall within the loop range
            this.tracks.forEach(t => {
                t.blocks.forEach(b => {
                    // Block overlaps with loop range at all
                    if (b.startTime < this.loopEnd && b.endTime > this.loopStart) {
                        const s = this.audioContext.createBufferSource();
                        s.buffer = b.audioBuffer;
                        s.connect(t.gainNode);
                        // Calculate when this block should start relative to loop start
                        const blockStartInLoop = Math.max(b.startTime, this.loopStart);
                        const offsetInBlock = blockStartInLoop - b.startTime;
                        const when = blockStartInLoop - this.loopStart;
                        const remaining = Math.min(b.endTime, this.loopEnd) - blockStartInLoop;
                        s.start(this.audioContext.currentTime + when, offsetInBlock, remaining);
                        t.activeSources.push(s);
                    }
                });
                t.sourceNode = t.activeSources.length > 0 ? t.activeSources[0] : null;
            });
        }
        this.elements.timeDisplay.textContent = this.formatTime(this.currentTime);
        this.updatePlayheadPosition();
        this.animationFrameId = requestAnimationFrame(() => this.updatePlayhead());
    }
    
    updatePlayheadPosition() {
        let ph = document.querySelector('.playhead');
        if (ph) ph.remove();
        ph = document.createElement('div');
        ph.className = 'playhead';
        ph.style.left = `${this.currentTime * this.pixelsPerSecond}px`;
        this.elements.timelineGrid.appendChild(ph);
    }
    
    setPlayheadFromMouse(e) {
        const rect = this.elements.timelineGrid.getBoundingClientRect();
        const x = e.clientX - rect.left + this.elements.timelineGrid.scrollLeft;
        const time = Math.max(0, x / this.pixelsPerSecond);
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.tracks.forEach(t => { if (t.sourceNode) { try { t.sourceNode.stop(); } catch(e){} t.sourceNode = null; } });
        this.currentTime = time;
        this.playStartTime = this.audioContext.currentTime - this.currentTime;
        this.elements.timeDisplay.textContent = this.formatTime(this.currentTime);
        this.updatePlayheadPosition();
        if (wasPlaying) this.playFromCurrentTime();
    }
    
    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.elements.loopBtn.classList.toggle('active', this.isLooping);
    }
    
    setBPM(v) { this.bpm = parseInt(v); this.renderRuler(); }
    setMasterVolume(v) { if (this.masterGain) this.masterGain.gain.value = parseFloat(v); }
    
    // ─── Recording ──────────────────────────────────────────────────────────
    async toggleRecording() {
        this.initAudio();
        if (this.isRecording) this.stopRecording();
        else await this.startRecording();
    }
    
    async startRecording() {
        if (!this.micPermissionGranted) {
            try {
                const r = await navigator.permissions.query({ name: 'microphone' });
                if (r.state === 'denied') { this.showPermissionDeniedModal(); return; }
            } catch(e){}
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                s.getTracks().forEach(t => t.stop());
                this.micPermissionGranted = true;
                this.hideMicPermissionButton();
                await this.enumerateAudioInputs();
            } catch(err) { this.showPermissionDeniedModal(); return; }
        }
        const armed = this.tracks.filter(t => t.armed);
        if (armed.length === 0) { alert('Please arm at least one track (click the R button) before recording.'); return; }
        this.isRecording = true;
        this.elements.recordBtn.classList.add('active');
        const t0 = this.isPlaying ? this.currentTime : 0;
        for (const t of armed) await this.startTrackRecording(t, t0);
        if (!this.isPlaying) { this.playStartTime = this.audioContext.currentTime; this.currentTime = 0; this.updatePlayhead(); }
    }
    
    async startTrackRecording(track, t0) {
        try {
            const c = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
            if (track.inputDeviceId) c.audio.deviceId = { exact: track.inputDeviceId };
            const stream = await navigator.mediaDevices.getUserMedia(c);
            track.mediaStream = stream;
            const src = this.audioContext.createMediaStreamSource(stream);
            src.connect(track.gainNode);
            track._recordingSourceNode = src;
            let mt = 'audio/webm';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mt = 'audio/webm;codecs=opus';
            track.mediaRecorder = new MediaRecorder(stream, { mimeType: mt });
            track.chunks = [];
            track.recordingStartTime = t0;
            track.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) track.chunks.push(e.data); };
            track.mediaRecorder.onstop = async () => {
                if (track._recordingSourceNode) { try { track._recordingSourceNode.disconnect(); } catch(e){} track._recordingSourceNode = null; }
                if (track.chunks.length > 0) {
                    const blob = new Blob(track.chunks, { type: mt });
                    const ab = await blob.arrayBuffer();
                    try {
                        const buf = await this.audioContext.decodeAudioData(ab);
                        const block = { id: this.nextBlockId++, audioBuffer: buf, startTime: track.recordingStartTime, endTime: track.recordingStartTime + buf.duration, duration: buf.duration };
                        track.blocks.push(block);
                        this.drawTrackWaveforms(track);
                        this.renderAudioBlock(track, block);
                    } catch(e) { console.error('Decode error:', e); }
                }
                stream.getTracks().forEach(t => t.stop());
                track.mediaStream = null;
                track.recordingStartTime = null;
            };
            track.mediaRecorder.start();
        } catch(e) { console.error('Recording error:', e); }
    }
    
    stopRecording() {
        this.isRecording = false;
        this.elements.recordBtn.classList.remove('active');
        this.tracks.forEach(t => { if (t.mediaRecorder && t.mediaRecorder.state === 'recording') t.mediaRecorder.stop(); });
        if (!this.isPlaying && this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    }
    
    // ─── Tracks ─────────────────────────────────────────────────────────────
    addTrack() {
        const id = this.nextTrackId++;
        const track = {
            id, name: `Track ${id}`, volume: 0.8, pan: 0, muted: false, soloed: false, armed: false,
            blocks: [], sourceNode: null, activeSources: [],
            gainNode: this.audioContext.createGain(),
            panNode: this.audioContext.createStereoPanner(),
            mediaStream: null, mediaRecorder: null, chunks: [],
            recordingStartTime: null, inputDeviceId: null,
            effects: [], nextEffectId: 1
        };
        this.rebuildTrackAudioGraph(track);
        this.tracks.push(track);
        this.renderTrackHeader(track);
        this.renderTrackRow(track);
        this.updateTrackAudio(track);
        this.selectTrack(id);
    }
    
    deleteTrack(id) {
        const idx = this.tracks.findIndex(t => t.id === id);
        if (idx < 0) return;
        const t = this.tracks[idx];
        if (t.activeSources) { t.activeSources.forEach(s => { try { s.stop(); } catch(e){} }); t.activeSources = []; }
        t.sourceNode = null;
        if (t.mediaRecorder && t.mediaRecorder.state !== 'inactive') t.mediaRecorder.stop();
        if (t.mediaStream) t.mediaStream.getTracks().forEach(tr => tr.stop());
        t.gainNode.disconnect(); t.panNode.disconnect();
        t.effects.forEach(e => e.disconnect());
        this.tracks.splice(idx, 1);
        if (this.selectedTrackId === id) {
            this.selectedTrackId = this.tracks.length > 0 ? this.tracks[0].id : null;
            if (this.selectedTrackId) this.selectTrack(this.selectedTrackId);
        }
        const h = document.getElementById(`header-${id}`);
        const r = document.getElementById(`row-${id}`);
        if (h) h.remove();
        if (r) r.remove();
    }
    
    rebuildTrackAudioGraph(track) {
        try { track.gainNode.disconnect(); } catch(e){}
        try { track.panNode.disconnect(); } catch(e){}
        track.effects.forEach(e => e.disconnect());
        // Build chain: gainNode -> [enabled effects in order] -> panNode -> masterGain
        const enabledEffects = track.effects.filter(e => e.enabled);
        if (enabledEffects.length === 0) {
            track.gainNode.connect(track.panNode);
            track.panNode.connect(this.masterGain);
        } else {
            track.gainNode.connect(enabledEffects[0].nodes[0] || track.panNode);
            for (let i = 0; i < enabledEffects.length; i++) {
                const next = i < enabledEffects.length - 1 ? (enabledEffects[i+1].nodes[0] || track.panNode) : track.panNode;
                enabledEffects[i].connect(enabledEffects[i].nodes[0] || track.gainNode, next);
            }
            track.panNode.connect(this.masterGain);
        }
    }
    
    renderTrackHeader(track) {
        const esc = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
        const h = document.createElement('div');
        h.className = 'track-header' + (track.id === this.selectedTrackId ? ' selected' : '');
        h.id = `header-${track.id}`;
        h.innerHTML = `
            <div class="track-header-top">
                <span class="track-name">${esc(track.name)}</span>
                <button class="arm-btn ${track.armed ? 'active' : ''}" title="Record Arm">R</button>
            </div>
            <div class="track-controls">
                <button class="mute-btn ${track.muted ? 'active' : ''}" title="Mute">M</button>
                <button class="solo-btn ${track.soloed ? 'active' : ''}" title="Solo">S</button>
                <button class="track-fx-btn" title="Effects">FX</button>
            </div>
            <div class="track-knobs">
                <div class="track-knob" id="vol-knob-${track.id}"></div>
                <div class="track-knob" id="pan-knob-${track.id}"></div>
            </div>
            <div class="track-input-selector">
                <select title="Input"><option value="">Default</option></select>
            </div>
        `;
        this.elements.trackHeaders.appendChild(h);
        
        h.querySelector('.arm-btn').onclick = (e) => { e.stopPropagation(); this.toggleArm(track.id); };
        h.querySelector('.track-fx-btn').onclick = (e) => { e.stopPropagation(); this.selectTrack(track.id); this.openBottomPanel('effects'); };
        h.querySelector('.mute-btn').onclick = (e) => { e.stopPropagation(); this.toggleMute(track.id); };
        h.querySelector('.solo-btn').onclick = (e) => { e.stopPropagation(); this.toggleSolo(track.id); };
        h.querySelector('.track-input-selector select').onchange = (e) => { e.stopPropagation(); track.inputDeviceId = e.target.value || null; };
        
        // Build knobs
        this.buildTrackKnob(`vol-knob-${track.id}`, track.volume, 0, 1, 0.01, v => {
            this.setTrackVolume(track.id, v);
        });
        this.buildTrackKnob(`pan-knob-${track.id}`, track.pan, -1, 1, 0.01, v => {
            this.setTrackPan(track.id, v);
        });
        
        this.renderTrackInputSelector(track);
    }
    
    buildTrackKnob(id, initialVal, min, max, step, onChange) {
        const container = document.getElementById(id);
        if (!container) return;
        container.innerHTML = '';
        
        const range = max - min;
        const normalized = (initialVal - min) / range;
        const angle = -135 + (normalized * 270);
        
        const label = id.includes('vol') ? 'Vol' : 'Pan';
        
        const knob = document.createElement('div');
        knob.className = 'knob';
        knob.innerHTML = `
            <div class="knob-body" style="transform: rotate(${angle}deg)">
                <div class="knob-indicator"></div>
            </div>
            <div class="knob-label">${label}</div>
        `;
        
        let startY, startVal;
        const knobBody = knob.querySelector('.knob-body');
        
        const onStart = (e) => {
            e.preventDefault(); e.stopPropagation();
            startY = e.clientY || e.touches?.[0]?.clientY;
            startVal = initialVal;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };
        const onMove = (e) => {
            e.preventDefault();
            const y = e.clientY || e.touches?.[0]?.clientY;
            const delta = (startY - y) * step * 2;
            let val = startVal + delta;
            if (val < min) val = min;
            if (val > max) val = max;
            val = Math.round(val / step) * step;
            const n = (val - min) / range;
            knobBody.style.transform = `rotate(${-135 + n * 270}deg)`;
            onChange(val);
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        
        knobBody.addEventListener('mousedown', onStart);
        knobBody.addEventListener('touchstart', onStart, { passive: false });
        
        container.appendChild(knob);
    }
    
    renderTrackInputSelector(track) {
        const h = document.getElementById(`header-${track.id}`);
        if (!h) return;
        const sel = h.querySelector('.track-input-selector select');
        if (!sel) return;
        const cur = sel.value;
        while (sel.options.length > 1) sel.remove(1);
        this.audioInputDevices.forEach((d, i) => {
            const o = document.createElement('option');
            o.value = d.deviceId;
            o.textContent = d.label || `Mic ${i+1}`;
            sel.appendChild(o);
        });
        sel.value = cur;
    }
    
    renderTrackRow(track) {
        const row = document.createElement('div');
        row.className = 'track-row' + (track.id === this.selectedTrackId ? ' selected' : '');
        row.id = `row-${track.id}`;
        row.innerHTML = `<canvas id="canvas-${track.id}"></canvas>`;
        this.elements.timelineGrid.appendChild(row);
        requestAnimationFrame(() => this.setupCanvas(track));
    }
    
    setupCanvas(track) {
        const c = document.getElementById(`canvas-${track.id}`);
        if (!c) return;
        const r = document.getElementById(`row-${track.id}`);
        if (!r) return;
        const rect = r.getBoundingClientRect();
        c.width = rect.width; c.height = rect.height;
        this.drawEmptyWaveform(track);
    }
    
    drawEmptyWaveform(track) {
        const c = document.getElementById(`canvas-${track.id}`);
        if (!c) return;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1e1e1e';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.strokeStyle = '#333';
        ctx.beginPath(); ctx.moveTo(0, c.height/2); ctx.lineTo(c.width, c.height/2); ctx.stroke();
    }
    
    updateTrackAudio(track) {
        const hasSolo = this.tracks.some(t => t.soloed);
        let val;
        if (track.muted) {
            val = 0;
        } else if (hasSolo) {
            val = track.soloed ? track.volume : 0;
        } else {
            val = track.volume;
        }
        track.gainNode.gain.value = val;
        track.panNode.pan.value = track.pan;
    }
    
    toggleMute(id) {
        const t = this.tracks.find(x => x.id === id);
        if (t) {
            t.muted = !t.muted;
            this.updateTrackAudio(t);
            const btn = document.querySelector(`#header-${id} .mute-btn`);
            if (btn) {
                btn.classList.toggle('active', t.muted);
                btn.style.backgroundColor = t.muted ? '#ff9800' : '';
                btn.style.color = t.muted ? '#fff' : '';
            }
        }
    }
    toggleSolo(id) {
        const t = this.tracks.find(x => x.id === id);
        if (t) {
            t.soloed = !t.soloed;
            this.handleSolo();
            const btn = document.querySelector(`#header-${id} .solo-btn`);
            if (btn) {
                btn.classList.toggle('active', t.soloed);
                btn.style.backgroundColor = t.soloed ? '#2196F3' : '';
                btn.style.color = t.soloed ? '#fff' : '';
            }
        }
    }
    handleSolo() {
        const s = this.tracks.some(t => t.soloed);
        this.tracks.forEach(t => { t.gainNode.gain.value = s ? (t.soloed ? t.volume : 0) : (t.muted ? 0 : t.volume); });
    }
    toggleArm(id) {
        const t = this.tracks.find(x => x.id === id);
        if (t) {
            t.armed = !t.armed;
            const btn = document.querySelector(`#header-${id} .arm-btn`);
            if (btn) {
                btn.classList.toggle('active', t.armed);
                btn.style.backgroundColor = t.armed ? '#f44336' : '';
                btn.style.color = t.armed ? '#fff' : '';
            }
        }
    }
    setTrackVolume(id, v) { const t = this.tracks.find(x => x.id === id); if (t) { t.volume = parseFloat(v); this.updateTrackAudio(t); } }
    setTrackPan(id, v) { const t = this.tracks.find(x => x.id === id); if (t) { t.pan = parseFloat(v); this.updateTrackAudio(t); } }
    
    // ─── Audio Blocks ───────────────────────────────────────────────────────
    renderAudioBlock(track, block) {
        const row = document.getElementById(`row-${track.id}`);
        if (!row) return;
        let el = document.getElementById(`block-${block.id}`);
        if (el) el.remove();
        
        el = document.createElement('div');
        el.className = 'audio-block' + (block.id === this.selectedBlockId ? ' selected' : '');
        el.id = `block-${block.id}`;
        el.style.left = `${block.startTime * this.pixelsPerSecond}px`;
        el.style.width = `${block.duration * this.pixelsPerSecond}px`;
        
        const label = document.createElement('span');
        label.className = 'audio-block-label';
        label.textContent = `Clip ${block.id}`;
        el.appendChild(label);
        
        const del = document.createElement('button');
        del.className = 'audio-block-delete';
        del.textContent = '✕';
        del.title = 'Delete (Del)';
        del.onclick = (e) => { e.stopPropagation(); this.deleteBlock(track.id, block.id); };
        el.appendChild(del);
        
        row.appendChild(el);
        this.setupBlockDrag(el, track.id, block);
    }
    
    deleteBlock(trackId, blockId) {
        const track = this.tracks.find(t => t.id === trackId);
        if (!track) return;
        const idx = track.blocks.findIndex(b => b.id === blockId);
        if (idx < 0) return;
        track.blocks.splice(idx, 1);
        const el = document.getElementById(`block-${blockId}`);
        if (el) el.remove();
        this.drawTrackWaveforms(track);
        if (this.selectedBlockId === blockId) this.selectedBlockId = null;
    }
    
    drawTrackWaveforms(track) {
        const c = document.getElementById(`canvas-${track.id}`);
        if (!c) return;
        const r = document.getElementById(`row-${track.id}`);
        if (r) { const rect = r.getBoundingClientRect(); if (c.width !== rect.width) c.width = rect.width; if (c.height !== rect.height) c.height = rect.height; }
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.moveTo(0, c.height/2); ctx.lineTo(c.width, c.height/2); ctx.stroke();
        track.blocks.forEach(b => this.drawBlockWaveform(ctx, c, b));
    }
    
    drawBlockWaveform(ctx, canvas, block) {
        if (!block.audioBuffer) return;
        const data = block.audioBuffer.getChannelData(0);
        const amp = canvas.height / 2;
        const startPx = block.startTime * this.pixelsPerSecond;
        const blockPx = block.duration * this.pixelsPerSecond;
        const step = Math.ceil(data.length / blockPx);
        ctx.beginPath(); ctx.strokeStyle = '#4CAF50'; ctx.lineWidth = 1;
        for (let i = 0; i < blockPx; i++) {
            const x = startPx + i;
            if (x < 0 || x >= canvas.width) continue;
            let min = 1.0, max = -1.0;
            for (let j = 0; j < step; j++) {
                const idx = Math.floor(i * step) + j;
                if (idx < data.length) { const d = data[idx]; if (d < min) min = d; if (d > max) max = d; }
            }
            ctx.lineTo(x, (1 + min) * amp); ctx.lineTo(x, (1 + max) * amp);
        }
        ctx.stroke();
    }
    
    // ─── Effects ────────────────────────────────────────────────────────────
    addEffectToTrack(trackId, type) {
        this.initAudio();
        const t = this.tracks.find(x => x.id === trackId);
        if (!t) return;
        const fx = EffectFactory.create(this.audioContext, type);
        if (!fx) return;
        fx.id = t.nextEffectId++;
        t.effects.push(fx);
        this.rebuildTrackAudioGraph(t);
        this.updateEffectsIndicator(t);
    }
    removeEffectFromTrack(trackId, fxId) {
        const t = this.tracks.find(x => x.id === trackId);
        if (!t) return;
        const idx = t.effects.findIndex(e => e.id === fxId);
        if (idx < 0) return;
        t.effects[idx].disconnect();
        t.effects.splice(idx, 1);
        this.rebuildTrackAudioGraph(t);
        this.updateEffectsIndicator(t);
    }
    toggleEffect(trackId, fxId) {
        const t = this.tracks.find(x => x.id === trackId);
        if (!t) return;
        const fx = t.effects.find(e => e.id === fxId);
        if (fx) { fx.toggle(); this.rebuildTrackAudioGraph(t); this.updateEffectsIndicator(t); }
    }
    moveEffect(trackId, fxId, dir) {
        const t = this.tracks.find(x => x.id === trackId);
        if (!t) return;
        const idx = t.effects.findIndex(e => e.id === fxId);
        if (idx < 0) return;
        const ni = idx + dir;
        if (ni < 0 || ni >= t.effects.length) return;
        [t.effects[idx], t.effects[ni]] = [t.effects[ni], t.effects[idx]];
        this.rebuildTrackAudioGraph(t);
    }
    updateEffectsIndicator(track) {
        const h = document.getElementById(`header-${track.id}`);
        if (!h) return;
        let ind = h.querySelector('.track-effects-indicator');
        if (!ind) { ind = document.createElement('div'); ind.className = 'track-effects-indicator'; h.appendChild(ind); }
        ind.innerHTML = track.effects.length > 0 ? `<span class="effects-badge">${track.effects.length} FX</span>` : '';
    }
    
    // ─── Mic Permission ─────────────────────────────────────────────────────
    async checkMicPermission() {
        if (!navigator.mediaDevices?.getUserMedia) { this.showMicNotSupported(); return; }
        if (navigator.permissions?.query) {
            try {
                const r = await navigator.permissions.query({ name: 'microphone' });
                this.updateMicPermissionUI(r.state);
                r.onchange = () => this.updateMicPermissionUI(r.state);
                return;
            } catch(e){}
        }
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach(t => t.stop());
            this.micPermissionGranted = true;
            this.hideMicPermissionButton();
            await this.enumerateAudioInputs();
        } catch(e) {
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') this.showPermissionDeniedModal();
            else this.showMicPermissionButton();
        }
    }
    
    async enumerateAudioInputs() {
        try {
            const devs = await navigator.mediaDevices.enumerateDevices();
            this.audioInputDevices = devs.filter(d => d.kind === 'audioinput');
            this.tracks.forEach(t => this.renderTrackInputSelector(t));
        } catch(e) { console.error(e); }
    }
    
    updateMicPermissionUI(state) {
        if (state === 'granted') { this.micPermissionGranted = true; this.hideMicPermissionButton(); this.enumerateAudioInputs(); }
        else if (state === 'prompt') this.showMicPermissionButton();
        else this.showPermissionDeniedModal();
    }
    
    showMicPermissionButton() {
        if (document.getElementById('mic-permission-btn')) return;
        const b = document.createElement('button');
        b.id = 'mic-permission-btn'; b.className = 'mic-permission-btn'; b.textContent = '🎤 Enable Microphone';
        b.onclick = () => this.requestMicPermission();
        this.elements.recordBtn.parentNode.insertBefore(b, this.elements.recordBtn);
    }
    hideMicPermissionButton() { const b = document.getElementById('mic-permission-btn'); if (b) b.remove(); }
    
    showMicNotSupported() {
        if (document.getElementById('mic-not-supported-msg')) return;
        const m = document.createElement('span');
        m.id = 'mic-not-supported-msg'; m.style.color = '#ff9800'; m.style.fontSize = '12px'; m.textContent = '🎤 Mic not supported';
        this.elements.recordBtn.parentNode.insertBefore(m, this.elements.recordBtn);
    }
    
    async requestMicPermission() {
        try {
            const s = await navigator.mediaDevices.getUserMedia({ audio: true });
            s.getTracks().forEach(t => t.stop());
            this.hideMicPermissionButton(); this.micPermissionGranted = true; await this.enumerateAudioInputs();
        } catch(e) {
            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') this.showPermissionDeniedModal();
            else alert('Could not access microphone: ' + e.message);
        }
    }
    
    showPermissionDeniedModal() {
        const ex = document.getElementById('permission-modal');
        if (ex) ex.remove();
        const m = document.createElement('div');
        m.id = 'permission-modal'; m.className = 'permission-modal';
        m.innerHTML = `<div class="permission-modal-content">
            <h3>Microphone Access Required</h3>
            <p>To record audio, Just-DAW needs access to your microphone.</p>
            <button id="permission-retry-btn" class="permission-retry-btn">Allow Microphone Access</button>
            <button id="permission-close-btn" class="permission-close-btn">Close</button>
        </div>`;
        document.body.appendChild(m);
        document.getElementById('permission-retry-btn').onclick = async () => {
            try {
                const s = await navigator.mediaDevices.getUserMedia({ audio: true });
                s.getTracks().forEach(t => t.stop());
                m.remove(); this.hideMicPermissionButton(); this.micPermissionGranted = true; await this.enumerateAudioInputs();
            } catch(e) { alert('Permission denied.'); }
        };
        document.getElementById('permission-close-btn').onclick = () => m.remove();
    }
    
    // ─── Ruler ──────────────────────────────────────────────────────────────
    renderRuler() {
        const ruler = this.elements.timelineRuler;
        ruler.innerHTML = '';
        const w = Math.max(ruler.offsetWidth, this.elements.timelineGrid.scrollWidth);
        const totalSec = Math.max(w / this.pixelsPerSecond, 120);
        const content = document.createElement('div');
        content.style.position = 'relative';
        content.style.width = `${totalSec * this.pixelsPerSecond}px`;
        content.style.height = '100%';
        const bps = this.bpm / 60;
        const ppb = this.pixelsPerSecond / bps;
        const totalBeats = Math.ceil(totalSec * bps);
        for (let beat = 0; beat < totalBeats; beat++) {
            const m = beat % 4 === 0;
            const x = beat * ppb;
            const mark = document.createElement('div');
            mark.style.cssText = `position:absolute;left:${x}px;top:0;width:1px;height:${m ? 20 : 10}px;background:${m ? '#888' : '#555'};`;
            content.appendChild(mark);
            if (m) {
                const lbl = document.createElement('span');
                lbl.textContent = String(Math.floor(beat / 4) + 1);
                lbl.style.cssText = `position:absolute;left:${x+3}px;top:2px;font-size:10px;color:#aaa;font-weight:bold;`;
                content.appendChild(lbl);
            }
        }
        ruler.appendChild(content);
    }
    
    setupResizeHandler() {
        new ResizeObserver(() => {
            this.tracks.forEach(t => this.drawTrackWaveforms(t));
            this.renderRuler();
        }).observe(this.elements.timelineGrid);
    }
    
    // ─── File Drop ──────────────────────────────────────────────────────────
    async handleFileDrop(files) {
        this.initAudio();
        for (const file of files) {
            if (!file.type.startsWith('audio/')) continue;
            try {
                const ab = await file.arrayBuffer();
                const buf = await this.audioContext.decodeAudioData(ab);
                const tid = this.nextTrackId++;
                const block = { id: this.nextBlockId++, audioBuffer: buf, startTime: 0, endTime: buf.duration, duration: buf.duration };
                const track = {
                    id: tid, name: file.name.replace(/\.[^/.]+$/, ''), volume: 0.8, pan: 0,
                    muted: false, soloed: false, armed: false,
                    blocks: [block], sourceNode: null, activeSources: [],
                    gainNode: this.audioContext.createGain(), panNode: this.audioContext.createStereoPanner(),
                    mediaStream: null, mediaRecorder: null, chunks: [],
                    recordingStartTime: null, inputDeviceId: null,
                    effects: [], nextEffectId: 1
                };
                this.rebuildTrackAudioGraph(track);
                this.tracks.push(track);
                this.renderTrackHeader(track);
                this.renderTrackRow(track);
                this.updateTrackAudio(track);
                requestAnimationFrame(() => { this.drawTrackWaveforms(track); this.renderAudioBlock(track, block); });
            } catch(e) { console.error('Error decoding audio:', e); alert(`Could not load "${file.name}": ${e.message}`); }
        }
    }
    
    // ─── Meter ──────────────────────────────────────────────────────────────
    startRenderLoop() {
        if (this._meterAnimationId) cancelAnimationFrame(this._meterAnimationId);
        const mc = this.elements.masterMeter;
        const ctx = mc.getContext('2d');
        const len = this.analyser.frequencyBinCount;
        const arr = new Uint8Array(len);
        const draw = () => {
            this._meterAnimationId = requestAnimationFrame(draw);
            this.analyser.getByteTimeDomainData(arr);
            ctx.fillStyle = '#222'; ctx.fillRect(0, 0, mc.width, mc.height);
            ctx.lineWidth = 1; ctx.strokeStyle = '#4CAF50'; ctx.beginPath();
            const sw = mc.width / len;
            let x = 0;
            for (let i = 0; i < len; i++) {
                const v = arr[i] / 128.0;
                const y = v * mc.height / 2;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                x += sw;
            }
            ctx.stroke();
        };
        draw();
    }
    
    formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000);
        return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
    }
}

const daw = new JustDAW();

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}