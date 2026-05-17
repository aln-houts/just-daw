// Just-DAW Effects Modules — Knob-style UI, no duplication bug

class EffectBase {
    constructor(audioContext, type) {
        this.audioContext = audioContext;
        this.type = type;
        this.enabled = true;
        this.nodes = [];
        this.id = null;
    }

    connect(inputNode, outputNode) {
        if (this.enabled && this.nodes.length > 0) {
            inputNode.connect(this.nodes[0]);
            this.nodes[this.nodes.length - 1].connect(outputNode);
        } else {
            inputNode.connect(outputNode);
        }
    }

    disconnect() {
        this.nodes.forEach(n => { try { n.disconnect(); } catch(e){} });
    }

    toggle() { this.enabled = !this.enabled; return this.enabled; }

    static getDefaultParams() { return {}; }

    // Render a rotary knob
    renderKnob(container, label, paramKey, min, max, step, formatVal) {
        const wrap = document.createElement('div');
        wrap.className = 'knob-wrap';
        
        const knob = document.createElement('div');
        knob.className = 'knob';
        
        const range = max - min;
        const normalized = (this.params[paramKey] - min) / range;
        const angle = -135 + (normalized * 270); // -135 to +135 degrees
        
        knob.innerHTML = `
            <div class="knob-body" style="transform: rotate(${angle}deg)">
                <div class="knob-indicator"></div>
            </div>
            <div class="knob-label">${label}</div>
            <div class="knob-value">${formatVal(this.params[paramKey])}</div>
        `;
        
        // Drag to adjust
        let startY, startVal;
        const knobBody = knob.querySelector('.knob-body');
        
        const onStart = (e) => {
            e.preventDefault();
            startY = e.clientY || e.touches?.[0]?.clientY;
            startVal = this.params[paramKey];
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        };
        const onMove = (e) => {
            e.preventDefault();
            const y = e.clientY || e.touches?.[0]?.clientY;
            const delta = (startY - y) * step * 2; // drag up = increase
            let val = startVal + delta;
            if (val < min) val = min;
            if (val > max) val = max;
            val = Math.round(val / step) * step;
            this.params[paramKey] = val;
            this.updateParams();
            const n = (val - min) / range;
            knobBody.style.transform = `rotate(${-135 + n * 270}deg)`;
            knob.querySelector('.knob-value').textContent = formatVal(val);
        };
        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
        
        knobBody.addEventListener('mousedown', onStart);
        knobBody.addEventListener('touchstart', onStart, { passive: false });
        
        wrap.appendChild(knob);
        container.appendChild(wrap);
    }

    renderUI(container) {
        // Override in subclasses — use this.renderKnob()
    }
}

// ─── Reverb ──────────────────────────────────────────────────────────────────
class ReverbEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'reverb');
        this.params = { decay: 2.0, mix: 0.3 };
        this.buildNodes();
    }

    buildNodes() {
        this.convolver = this.audioContext.createConvolver();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.outputGain = this.audioContext.createGain();
        this.generateImpulse();
        this.dryGain.connect(this.outputGain);
        this.convolver.connect(this.wetGain);
        this.wetGain.connect(this.outputGain);
        this.nodes = [this.dryGain, this.convolver, this.wetGain, this.outputGain];
        this.updateParams();
    }

    generateImpulse() {
        const sr = this.audioContext.sampleRate;
        const len = sr * this.params.decay;
        const imp = this.audioContext.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
            const d = imp.getChannelData(ch);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        }
        this.convolver.buffer = imp;
    }

    updateParams() {
        this.dryGain.gain.value = 1 - this.params.mix;
        this.wetGain.gain.value = this.params.mix;
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

    renderUI(container) {
        const row = document.createElement('div'); row.className = 'effect-knobs-row';
        this.renderKnob(row, 'Decay', 'decay', 0.1, 5, 0.1, v => v.toFixed(1) + 's');
        this.renderKnob(row, 'Mix', 'mix', 0, 1, 0.01, v => Math.round(v * 100) + '%');
        container.appendChild(row);
    }
}

// ─── Delay ───────────────────────────────────────────────────────────────────
class DelayEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'delay');
        this.params = { time: 0.3, feedback: 0.4, mix: 0.3 };
        this.buildNodes();
    }

    buildNodes() {
        this.delayNode = this.audioContext.createDelay(5.0);
        this.feedbackGain = this.audioContext.createGain();
        this.dryGain = this.audioContext.createGain();
        this.wetGain = this.audioContext.createGain();
        this.outputGain = this.audioContext.createGain();
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

    renderUI(container) {
        const row1 = document.createElement('div'); row1.className = 'effect-knobs-row';
        this.renderKnob(row1, 'Time', 'time', 0.01, 1, 0.01, v => Math.round(v * 1000) + 'ms');
        container.appendChild(row1);
        const row2 = document.createElement('div'); row2.className = 'effect-knobs-row';
        this.renderKnob(row2, 'Fdbk', 'feedback', 0, 0.9, 0.01, v => Math.round(v * 100) + '%');
        this.renderKnob(row2, 'Mix', 'mix', 0, 1, 0.01, v => Math.round(v * 100) + '%');
        container.appendChild(row2);
    }
}

// ─── Compressor ──────────────────────────────────────────────────────────────
class CompressorEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'compressor');
        this.params = { threshold: -24, ratio: 4, attack: 0.003, release: 0.25 };
        this.buildNodes();
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

    renderUI(container) {
        const row1 = document.createElement('div'); row1.className = 'effect-knobs-row';
        this.renderKnob(row1, 'Thresh', 'threshold', -60, 0, 1, v => v + 'dB');
        this.renderKnob(row1, 'Ratio', 'ratio', 1, 20, 0.5, v => v + ':1');
        container.appendChild(row1);
        const row2 = document.createElement('div'); row2.className = 'effect-knobs-row';
        this.renderKnob(row2, 'Atk', 'attack', 0.001, 0.1, 0.001, v => Math.round(v * 1000) + 'ms');
        this.renderKnob(row2, 'Rel', 'release', 0.01, 1, 0.01, v => Math.round(v * 1000) + 'ms');
        container.appendChild(row2);
    }
}

// ─── EQ ──────────────────────────────────────────────────────────────────────
class EQEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'eq');
        this.params = { low: 0, mid: 0, high: 0 };
        this.buildNodes();
    }

    buildNodes() {
        this.lowFilter = this.audioContext.createBiquadFilter();
        this.lowFilter.type = 'lowshelf';
        this.lowFilter.frequency.value = 320;
        this.midFilter = this.audioContext.createBiquadFilter();
        this.midFilter.type = 'peaking';
        this.midFilter.frequency.value = 1000;
        this.midFilter.Q.value = 0.5;
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

    renderUI(container) {
        const row1 = document.createElement('div'); row1.className = 'effect-knobs-row';
        this.renderKnob(row1, 'Mid', 'mid', -12, 12, 0.5, v => (v > 0 ? '+' : '') + v + 'dB');
        container.appendChild(row1);
        const row2 = document.createElement('div'); row2.className = 'effect-knobs-row';
        this.renderKnob(row2, 'Low', 'low', -12, 12, 0.5, v => (v > 0 ? '+' : '') + v + 'dB');
        this.renderKnob(row2, 'High', 'high', -12, 12, 0.5, v => (v > 0 ? '+' : '') + v + 'dB');
        container.appendChild(row2);
    }
}

// ─── Distortion ──────────────────────────────────────────────────────────────
class DistortionEffect extends EffectBase {
    constructor(audioContext) {
        super(audioContext, 'distortion');
        this.params = { amount: 20, mix: 0.5 };
        this.buildNodes();
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

    makeCurve(amt) {
        const s = this.audioContext.sampleRate;
        const c = new Float32Array(s);
        const d = Math.PI / 180;
        for (let i = 0; i < s; i++) {
            const x = (i * 2) / s - 1;
            c[i] = ((3 + amt) * x * 20 * d) / (Math.PI + amt * Math.abs(x));
        }
        return c;
    }

    updateParams() {
        this.waveShaper.curve = this.makeCurve(this.params.amount);
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

    renderUI(container) {
        const row = document.createElement('div'); row.className = 'effect-knobs-row';
        this.renderKnob(row, 'Drive', 'amount', 0, 100, 1, v => String(v));
        this.renderKnob(row, 'Mix', 'mix', 0, 1, 0.01, v => Math.round(v * 100) + '%');
        container.appendChild(row);
    }
}

// ─── Factory ─────────────────────────────────────────────────────────────────
const EffectFactory = {
    types: { reverb: ReverbEffect, delay: DelayEffect, compressor: CompressorEffect, eq: EQEffect, distortion: DistortionEffect },
    names: { reverb: 'Reverb', delay: 'Delay', compressor: 'Comp', eq: 'EQ', distortion: 'Dist' },
    icons: { reverb: '🌊', delay: '🔁', compressor: '📊', eq: '🎛️', distortion: '⚡' },

    create(audioContext, type) {
        const C = this.types[type];
        return C ? new C(audioContext) : null;
    },
    getAvailableTypes() { return Object.keys(this.types); },
    getDisplayName(type) { return this.names[type] || type; },
    getIcon(type) { return this.icons[type] || '🔧'; }
};