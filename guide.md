You are an expert Frontend Engineer and Web Audio API specialist. We are building a lightweight, responsive, browser-based Digital Audio Workstation (DAW) called "Just-DAW" based on the attached UI layout. 

### Core Tech Stack Constraints
- **Frontend:** Single-page Vanilla HTML5/CSS3 and clean, modular JavaScript (ES6+). No heavy framework overhead unless requested.
- **Audio Engine:** Native Web Audio API (`AudioContext`, `GainNode`, `PanNode`, `AudioWorklet` if necessary for performance).
- **Waveform Rendering:** HTML5 `<canvas>` for high-performance, lightweight rendering of audio buffers.

---

### Phase 1: Structural & UI Blueprint (The BandLab-Style Layout)
Implement a dark-themed, sleek layout matching the provided screenshot reference:

1. **Top Control Bar (Transport):**
   - Left: App Logo/Name ("Just-DAW"), Tempo/BPM selector (default 120), Time Signature (4/4).
   - Center: Transport controls (Play, Pause, Stop, Record toggle, Loop toggle) and a digital time counter (00:00.0).
   - Right: Master Volume slider, Master Level meter (visual feedback), and global utility buttons.

2. **Main Workspace Splitter:**
   - **Left Sidebar (Track Headers):** A scrollable column containing individual track control cards. Each card must include:
     - Track Name/Number (e.g., "01 Voice/Audio")
     - Mute (M) and Solo (S) toggles.
     - Volume fader slider.
     - Pan knob or slider (Left/Right balance).
     - "Add Track" button at the top of the sidebar.
   - **Right Area (Timeline/Grid):**
     - Top: A fixed timeline ruler displaying bars/beats numbers (1, 2, 3, 4...).
     - Main Body: A vertical stack of timeline rows corresponding precisely to the track headers on the left.
     - Each track row displays loaded audio regions as colored waveforms over a dark grid.
     - Bottom of the timeline: A dedicated "Drop zone" for dragging and dropping audio files.

3. **Bottom Tool Tray:**
   - Persistent footer with quick access toggles: AutoPitch, Fx Effects, Editor, Lyrics/Notes, and keyboard Shortcuts.

---

### Phase 2: Core JavaScript Audio Engine Architecture
You must implement a clean, decoupled architecture: **Data Model ➔ Web Audio Graph ➔ Canvas Render Loop**.

1. **State Management:**
   - Maintain a global array of `tracks`. Each track object should hold: `id`, `name`, `volume`, `pan`, `muted`, `soloed`, and an array of `audioRegions` (containing `audioBuffer`, `startTime`, `duration`).
   - Global transport state: `isPlaying`, `currentTime`, `bpm`.

2. **Web Audio Routing Graph:**
   For every track added, construct a dedicated routing node chain:
   `[AudioBufferSourceNode] ➔ [PanNode] ➔ [GainNode (Volume)] ➔ [Track Mute/Solo GainNode] ➔ [Master GainNode] ➔ [audioContext.destination]`

3. **Waveform Canvas Rendering:**
   - Write an optimized function that downsamples the `AudioBuffer` channel data into peaks.
   - Render the waveform onto an HTML5 `<canvas>` for that track's region, scaling dynamically based on pixels-per-second zoom factors.

4. **File Ingestion:**
   - Implement an HTML5 Drag-and-Drop listener on the timeline workspace.
   - When an audio file (`.mp3`, `.wav`, `.ogg`) is dropped, intercept the event, read it via `FileReader` as an `ArrayBuffer`, decode it using `audioContext.decodeAudioData()`, and instantiate it as a new track.

---

### Your First Task
Let's start by generating the foundational file structure. Create a clean, responsive HTML file (`index.html`), a CSS file (`styles.css`) utilizing modern flexbox/grid for the multi-pane layouts, and a modular JavaScript setup (`app.js` or separate core modules) establishing the empty state layout and the initial Web Audio context initialization. 

Provide the code sequentially, prioritizing the HTML and CSS skeleton first to ensure the visual grid perfectly aligns track headers with the timeline rows.
