import type { Settings } from './save';

// Fully synthesized audio (no asset files): SFX + a soft generative ambient pad per zone.
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; sfxBus!: GainNode; musicBus!: GainNode;
  private padOsc: OscillatorNode[] = [];
  private padFilter!: BiquadFilterNode;
  private noiseBuf: AudioBuffer | null = null;
  private chord = '';
  constructor(private settings: () => Settings) {}

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new C() as AudioContext;
    } catch { return; }
    const c = this.ctx!;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.padFilter = c.createBiquadFilter(); this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 700; this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.musicBus);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 350; lfo.connect(lfoG); lfoG.connect(this.padFilter.frequency); lfo.start();
    for (let i = 0; i < 4; i++) {
      const o = c.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle';
      const g = c.createGain(); g.gain.value = i % 2 ? 0.018 : 0.04; o.connect(g); g.connect(this.padFilter); o.start(); this.padOsc.push(o);
    }
    const len = c.sampleRate * 0.6; this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.setZone('plaza');
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.music * 0.9, t, 0.3);
  }

  setZone(z: string) {
    if (!this.ctx || this.chord === z) return;
    this.chord = z;
    const chords: Record<string, number[]> = {
      plaza: [220, 277.18, 329.63, 440], foundry: [196, 233.08, 293.66, 392], docks: [174.61, 220, 261.63, 349.23], gardens: [246.94, 311.13, 369.99, 493.88], final: [261.63, 329.63, 392, 523.25],
    };
    const ch = chords[z] ?? chords.plaza; const t = this.ctx.currentTime;
    this.padOsc.forEach((o, i) => { o.frequency.setTargetAtTime(ch[i] / 2 * (i % 2 ? 1.003 : 1), t, 1.2); });
  }

  private env(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  private noise(dur: number, vol: number, freq = 1200, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx; if (!c || !this.noiseBuf) return;
    const t = c.currentTime; const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus); s.start(t); s.stop(t + dur);
  }

  play(name: string, p = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump': this.env(330, 0.12, 'square', 0.05, 520); break;
      case 'land': this.noise(0.08, 0.12 * p, 500); break;
      case 'shoot': this.env(900, 0.09, 'sawtooth', 0.04, 1600); break;
      case 'attach': this.env(520, 0.1, 'triangle', 0.12, 780); this.noise(0.05, 0.08, 3000, 'highpass'); break;
      case 'fail': this.env(240, 0.22, 'sawtooth', 0.07, 90); this.noise(0.15, 0.05, 2000, 'bandpass'); break;
      case 'release': this.env(700, 0.08, 'triangle', 0.06, 420); break;
      case 'collect': [880, 1108.73, 1318.51, 1760].forEach((f, i) => this.env(f, 0.25, 'triangle', 0.09, undefined, i * 0.06)); break;
      case 'quest': [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.env(f, 0.5, 'triangle', 0.1, undefined, i * 0.09)); break;
      case 'final': [261.63, 329.63, 392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.env(f, 1.2, 'sine', 0.1, undefined, i * 0.12)); break;
      case 'break': this.noise(0.7, 0.4, 900); this.env(90, 0.5, 'sawtooth', 0.15, 40); break;
      case 'thud': this.noise(0.12, Math.min(0.25, 0.06 * p), 300); break;
      case 'clank': this.env(180, 0.15, 'square', 0.05 * p, 120); this.noise(0.05, 0.06, 2500, 'highpass'); break;
      case 'spring': this.env(180, 0.35, 'sine', 0.15, 700); break;
      case 'splash': this.noise(0.5, 0.25, 1800, 'bandpass'); break;
      case 'respawn': this.env(300, 0.4, 'sine', 0.1, 900); break;
      case 'grab': this.env(400, 0.07, 'square', 0.05, 600); break;
      case 'throw': this.env(600, 0.12, 'sawtooth', 0.05, 250); break;
      case 'checkpoint': this.env(660, 0.15, 'triangle', 0.09); this.env(990, 0.25, 'triangle', 0.08, undefined, 0.1); break;
      case 'surge': this.env(110, 1.4, 'sawtooth', 0.08, 440); break;
      case 'talk': this.env(500 + Math.random() * 200, 0.05, 'square', 0.03); break;
      case 'ui': this.env(800, 0.05, 'triangle', 0.05); break;
      case 'crack': this.env(140, 0.2, 'square', 0.08, 70); this.noise(0.15, 0.15, 1200); break;
      case 'lever': this.env(300, 0.06, 'square', 0.06); this.env(450, 0.06, 'square', 0.05, undefined, 0.05); break;
      case 'gate': this.env(70, 0.4, 'sawtooth', 0.05, 110); break;
    }
  }
}
