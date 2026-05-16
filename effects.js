// Just-DAW Effects Modules
// Each effect class manages its own Web Audio nodes and parameter UI

class EffectBase {
    constructor(audioContext, type) {
        this.audioContext = audioContext;
        this.type = type;
        this.enabled = true;
        this.nodes = [];
    }

    // Connect effect into a chain: input -> effect -> output
    connect(inputNode, outputNode) {
        if (this.enabled && this.nodes.length > 0) {
            inputNode.connect(this.nodes[0]);
            this.nodes[this.nodes.length - 1].connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    // Bypass: connect input directly to output
    bypass(inputNode, outputNode) {
        inputNode.connect(outputNode);
    }

    // Disconnect all nodes
    disconnect() {
        this.nodes.forEach(node => {
            try { node.disconnect(); } catch (e) {}
        });
    }

    // Toggle effect on/off
    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    // Build the parameter UI for this effect
    renderUI(container, trackId, effectId, daw) {
        // Override in subclasses
    }

    // Get default parameters
    static getDefaultParams() {
        return {};
    }
}

// ─── Reverb ──────────────────────────────────────────────────────────────────
class ReverbEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'reverb');
        this.params = ReverbEffect.getDefaultParams();
        this.buildNodes();
    }

    static getDefaultParams() {
        return { decay: 2.0, mix: 0.3 };
    }

    buildNodes() {
        this.convolver = this.audioContext.createConvolver();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.outputGain = this.audioContext.createGain();

        // Generate impulse response
        this.generateImpulse();

        // Routing: input -> dry -> output, input -> convolver -> wet -> output
        this.dryGain.connect(this.outputGain);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.outputGain);

        this.nodes = [this.dryGain, this.convolver, this.wetGain, this.outputGain];
        this.updateParams();
    }

    generateImpulse() {
        const sampleRate = this.audioContext.sampleRate;
        const length = sampleRate * this.params.decay;
        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        this.convolver.buffer = impulse;
    }

    updateParams() {
        this.dryGain.gain.value = 1 - this.params.mix;
        this.wetGain.gain.value = this.params.mix;
        // Regenerate impulse if decay changed significantly
        this.generateImpulse();
    }

    connect(inputNode, outputNode) {
        if (this.enabled) {
            inputNode.connect(this.dryGain);
            inputNode.connect(this.convolver);
            this.outputGain.connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    renderUI(container, trackId, effectId, daw) {
        const wrapper = document.createElement('div');
        wrapper.className = 'effect-param';
        wrapper.innerHTML = `
            <div class="effect-param-row">
                <label>Decay</label>
                <input type="range" min="0.1" max="5" step="0.1" value="${this.params.decay}">
                <span class="effect-param-value">${this.params.decay.toFixed(1)}s</span>
            </div>
            <div class="effect-param-row">
                <label>Mix</label>
                <input type="range" min="0" max="1" step="0.01" value="${this.params.mix}">
                <span class="effect-param-value">${Math.round(this.params.mix * 100)}%</span>
            </div>
        `;

        wrapper.querySelector('input[type="range"]').addEventListener('input', (e) => {
            this.params.decay = parseFloat(e.target.value);
            this.updateParams();
            wrapper.querySelector('.effect-param-value').textContent = `${this.params.decay.toFixed(1)}s`;
        });

        const mixInput = wrapper.querySelectorAll('input[type="range"]')[1];
        const mixDisplay = wrapper.querySelectorAll('.effect-param-value')[1];
        mixInput.addEventListener('input', (e) => {
            this.params.mix = parseFloat(e.target.value);
            this.updateParams();
            mixDisplay.textContent = `${Math.round(this.params.mix * 100)}%`;
        });

        container.appendChild(wrapper);
    }
}

// ─── Delay ───────────────────────────────────────────────────────────────────
class DelayEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'delay');
        this.params = DelayEffect.getDefaultParams();
        this.buildNodes();
    }

    static getDefaultParams() {
        return { time: 0.3, feedback: 0.4, mix: 0.3 };
    }

    buildNodes() {
        this.delayNode = this.audioContext.createDelay(5.0);
        this.feedbackGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.outputGain = this.audioContext.createGain();

        // Feedback loop: delay -> feedback -> delay
        this.delayNode.connect(this.feedbackGain);
        this.feedbackGain.connect(this.delayNode);

        this.dryGain.connect(this.outputGain);
        this.delayNode.connect(this.wetGain);
        this.wetGain.connect(this.outputGain);

        this.nodes = [this.dryGain, this.delayNode, this.feedbackGain, this.wetGain, this.outputGain];
        this.updateParams();
    }

    updateParams() {
        this.delayNode.delayTime.value = this.params.time;
        this.feedbackGain.gain.value = this.params.feedback;
        this.dryGain.gain.value = 1 - this.params.mix;
        this.wetGain.gain.value = this.params.mix;
    }

    connect(inputNode, outputNode) {
        if (this.enabled) {
            inputNode.connect(this.dryGain);
            inputNode.connect(this.delayNode);
            this.outputGain.connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    renderUI(container, trackId, effectId, daw) {
        const wrapper = document.createElement('div');
        wrapper.className = 'effect-param';
        wrapper.innerHTML = `
            <div class="effect-param-row">
                <label>Time</label>
                <input type="range" min="0.01" max="1" step="0.01" value="${this.params.time}">
                <span class="effect-param-value">${Math.round(this.params.time * 1000)}ms</span>
            </div>
            <div class="effect-param-row">
                <label>Feedback</label>
                <input type="range" min="0" max="0.9" step="0.01" value="${this.params.feedback}">
                <span class="effect-param-value">${Math.round(this.params.feedback * 100)}%</span>
            </div>
            <div class="effect-param-row">
                <label>Mix</label>
                <input type="range" min="0" max="1" step="0.01" value="${this.params.mix}">
                <span class="effect-param-value">${Math.round(this.params.mix * 100)}%</span>
            </div>
        `;

        const inputs = wrapper.querySelectorAll('input[type="range"]');
        const displays = wrapper.querySelectorAll('.effect-param-value');

        inputs[0].addEventListener('input', (e) => {
            this.params.time = parseFloat(e.target.value);
            this.updateParams();
            displays[0].textContent = `${Math.round(this.params.time * 1000)}ms`;
        });
        inputs[1].addEventListener('input', (e) => {
            this.params.feedback = parseFloat(e.target.value);
            this.updateParams();
            displays[1].textContent = `${Math.round(this.params.feedback * 100)}%`;
        });
        inputs[2].addEventListener('input', (e) => {
            this.params.mix = parseFloat(e.target.value);
            this.updateParams();
            displays[2].textContent = `${Math.round(this.params.mix * 100)}%`;
        });

        container.appendChild(wrapper);
    }
}

// ─── Compressor ──────────────────────────────────────────────────────────────
class CompressorEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'compressor');
        this.params = CompressorEffect.getDefaultParams();
        this.buildNodes();
    }

    static getDefaultParams() {
        return { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 };
    }

    buildNodes() {
        this.compressor = this.audioContext.createDynamicsCompressor();
        this.nodes = [this.compressor];
        this.updateParams();
    }

    updateParams() {
        this.compressor.threshold.value = this.params.threshold;
        this.compressor.ratio.value = this.params.ratio;
        this.compressor.attack.value = this.params.attack;
        this.compressor.release.value = this.params.release;
    }

    connect(inputNode, outputNode) {
        if (this.enabled) {
            inputNode.connect(this.compressor);
            this.compressor.connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    renderUI(container, trackId, effectId, daw) {
        const wrapper = document.createElement('div');
        wrapper.className = 'effect-param';
        wrapper.innerHTML = `
            <div class="effect-param-row">
                <label>Thresh</label>
                <input type="range" min="-60" max="0" step="1" value="${this.params.threshold}">
                <span class="effect-param-value">${this.params.threshold}dB</span>
            </div>
            <div class="effect-param-row">
                <label>Ratio</label>
                <input type="range" min="1" max="20" step="0.5" value="${this.params.ratio}">
                <span class="effect-param-value">${this.params.ratio}:1</span>
            </div>
            <div class="effect-param-row">
                <label>Attack</label>
                <input type="range" min="0.001" max="0.1" step="0.001" value="${this.params.attack}">
                <span class="effect-param-value">${Math.round(this.params.attack * 1000)}ms</span>
            </div>
            <div class="effect-param-row">
                <label>Release</label>
                <input type="range" min="0.01" max="1" step="0.01" value="${this.params.release}">
                <span class="effect-param-value">${Math.round(this.params.release * 1000)}ms</span>
            </div>
        `;

        const inputs = wrapper.querySelectorAll('input[type="range"]');
        const displays = wrapper.querySelectorAll('.effect-param-value');

        inputs[0].addEventListener('input', (e) => {
            this.params.threshold = parseFloat(e.target.value);
            this.updateParams();
            displays[0].textContent = `${this.params.threshold}dB`;
        });
        inputs[1].addEventListener('input', (e) => {
            this.params.ratio = parseFloat(e.target.value);
            this.updateParams();
            displays[1].textContent = `${this.params.ratio}:1`;
        });
        inputs[2].addEventListener('input', (e) => {
            this.params.attack = parseFloat(e.target.value);
            this.updateParams();
            displays[2].textContent = `${Math.round(this.params.attack * 1000)}ms`;
        });
        inputs[3].addEventListener('input', (e) => {
            this.params.release = parseFloat(e.target.value);
            this.updateParams();
            displays[3].textContent = `${Math.round(this.params.release * 1000)}ms`;
        });

        container.appendChild(wrapper);
    }
}

// ─── EQ (3-band) ─────────────────────────────────────────────────────────────
class EQEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'eq');
        this.params = EQEffect.getDefaultParams();
        this.buildNodes();
    }

    static getDefaultParams() {
        return { low: 0, mid: 0, high: 0 };
    }

    buildNodes() {
        // Low shelf
        this.lowFilter = this.audioContext.createBiquadFilter();
        this.lowFilter.type = 'lowshelf';
        this.lowFilter.frequency.value = 320;

        // Mid peaking
        this.midFilter = this.audioContext.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = 1000;
        this.midFilter.Q.value = 0.5;

        // High shelf
        this.highFilter = this.audioContext.createBiquadFilter();
        this.highFilter.type = 'highshelf';
        this.highFilter.frequency.value = 3200;

        this.nodes = [this.lowFilter, this.midFilter, this.highFilter];
        this.updateParams();
    }

    updateParams() {
        this.lowFilter.gain.value = this.params.low;
        this.midFilter.gain.value = this.params.mid;
        this.highFilter.gain.value = this.params.high;
    }

    connect(inputNode, outputNode) {
        if (this.enabled) {
            inputNode.connect(this.lowFilter);
            this.lowFilter.connect(this.midFilter);
            this.midFilter.connect(this.highFilter);
            this.highFilter.connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    renderUI(container, trackId, effectId, daw) {
        const wrapper = document.createElement('div');
        wrapper.className = 'effect-param';
        wrapper.innerHTML = `
            <div class="effect-param-row">
                <label>Low</label>
                <input type="range" min="-12" max="12" step="0.5" value="${this.params.low}">
                <span class="effect-param-value">${this.params.low > 0 ? '+' : ''}${this.params.low}dB</span>
            </div>
            <div class="effect-param-row">
                <label>Mid</label>
                <input type="range" min="-12" max="12" step="0.5" value="${this.params.mid}">
                <span class="effect-param-value">${this.params.mid > 0 ? '+' : ''}${this.params.mid}dB</span>
            </div>
            <div class="effect-param-row">
                <label>High</label>
                <input type="range" min="-12" max="12" step="0.5" value="${this.params.high}">
                <span class="effect-param-value">${this.params.high > 0 ? '+' : ''}${this.params.high}dB</span>
            </div>
        `;

        const inputs = wrapper.querySelectorAll('input[type="range"]');
        const displays = wrapper.querySelectorAll('.effect-param-value');

        ['low', 'mid', 'high'].forEach((band, i) => {
            inputs[i].addEventListener('input', (e) => {
                this.params[band] = parseFloat(e.target.value);
                this.updateParams();
                displays[i].textContent = `${this.params[band] > 0 ? '+' : ''}${this.params[band]}dB`;
            });
        });

        container.appendChild(wrapper);
    }
}

// ─── Distortion ──────────────────────────────────────────────────────────────
class DistortionEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'distortion');
        this.params = DistortionEffect.getDefaultParams();
        this.buildNodes();
    }

    static getDefaultParams() {
        return { amount: 20, mix: 0.5 };
    }

    buildNodes() {
        this.waveShaper = this.audioContext.createWaveShaper();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.outputGain = this.audioContext.createGain();

        this.dryGain.connect(this.outputGain);
        this.waveShaper.connect(this.wetGain);
        this.wetGain.connect(this.outputGain);

        this.nodes = [this.dryGain, this.waveShaper, this.wetGain, this.outputGain];
        this.updateParams();
    }

    // Generate distortion curve
    makeDistortionCurve(amount) {
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    updateParams() {
        this.waveShaper.curve = this.makeDistortionCurve(this.params.amount);
        this.waveShaper.oversample = '4x';
        this.dryGain.gain.value = 1 - this.params.mix;
        this.wetGain.gain.value = this.params.mix;
    }

    connect(inputNode, outputNode) {
        if (this.enabled) {
            inputNode.connect(this.dryGain);
            inputNode.connect(this.waveShaper);
            this.outputGain.connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    renderUI(container, trackId, effectId, daw) {
        const wrapper = document.createElement('div');
        wrapper.className = 'effect-param';
        wrapper.innerHTML = `
            <div class="effect-param-row">
                <label>Drive</label>
                <input type="range" min="0" max="100" step="1" value="${this.params.amount}">
                <span class="effect-param-value">${this.params.amount}</span>
            </div>
            <div class="effect-param-row">
                <label>Mix</label>
                <input type="range" min="0" max="1" step="0.01" value="${this.params.mix}">
                <span class="effect-param-value">${Math.round(this.params.mix * 100)}%</span>
            </div>
        `;

        const inputs = wrapper.querySelectorAll('input[type="range"]');
        const displays = wrapper.querySelectorAll('.effect-param-value');

        inputs[0].addEventListener('input', (e) => {
            this.params.amount = parseFloat(e.target.value);
            this.updateParams();
            displays[0].textContent = `${this.params.amount}`;
        });
        inputs[1].addEventListener('input', (e) => {
            this.params.mix = parseFloat(e.target.value);
            this.updateParams();
            displays[1].textContent = `${Math.round(this.params.mix * 100)}%`;
        });

        container.appendChild(wrapper);
    }
}

// ─── Effect Factory ──────────────────────────────────────────────────────────
const EffectFactory = {
    types: {
        reverb: ReverbEffect,
        delay: DelayEffect,
        compressor: CompressorEffect,
        eq: EQEffect,
        distortion: DistortionEffect
    },

    create(audioContext, type) {
        const EffectClass = this.types[type];
        if (EffectClass) {
            return new EffectClass(audioContext);
        }
        return null;
    },

    getAvailableTypes() {
        return Object.keys(this.types);
    },

    getDisplayName(type) {
        const names = {
            reverb: 'Reverb',
            delay: 'Delay',
            compressor: 'Compressor',
            eq: 'EQ',
            distortion: 'Distortion'
        };
        return names[type] || type;
    }
};