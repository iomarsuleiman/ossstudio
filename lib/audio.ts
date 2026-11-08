// Generative gallery ambience: soft pads, sparse piano-like notes and a
// spacious room tone, plus quiet footsteps and paper/ink transition sounds.
// Everything is synthesised with Web Audio, so it is original and needs no
// licence. Nothing plays until the visitor chooses "Enter with sound".

const CHORDS = [
  [146.83, 220.0, 277.18, 329.63], // D  A  C# E   (Dmaj9 colour)
  [123.47, 185.0, 220.0, 293.66],  // B  F# A  D   (Bm7)
  [98.0, 196.0, 246.94, 293.66],   // G  G  B  D   (Gmaj)
  [110.0, 164.81, 220.0, 277.18],  // A  E  A  C#  (A)
];
const MELODY = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 493.88, 440.0];

export class GalleryAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private timers: number[] = [];
  private chordIndex = 0;
  private _volume = 0.7;
  private _muted = true;
  private started = false;

  get muted() { return this._muted; }
  get volume() { return this._volume; }

  private ensure() {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet).connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.5;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) this.fadeTo(0, 0.6);
      else if (!this._muted) this.fadeTo(this._volume, 1.2);
    });
    return ctx;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private fadeTo(value: number, seconds: number) {
    if (!this.ctx) return;
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(value, now + seconds);
  }

  /** Must be called from a user gesture. */
  async enable() {
    const ctx = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
    this._muted = false;
    this.fadeTo(this._volume, 2.5);
    if (!this.started) {
      this.started = true;
      this.loop();
    }
  }

  disable() {
    this._muted = true;
    this.fadeTo(0, 0.8);
  }

  setVolume(v: number) {
    this._volume = v;
    if (!this._muted) this.fadeTo(v, 0.3);
  }

  private loop() {
    const ctx = this.ctx!;
    const playChord = () => {
      const chord = CHORDS[this.chordIndex++ % CHORDS.length];
      chord.forEach((f, i) => this.pad(f, ctx.currentTime + i * 0.25, 9));
      this.timers.push(window.setTimeout(playChord, 8000));
    };
    const playNote = () => {
      if (Math.random() < 0.8) {
        const f = MELODY[Math.floor(Math.random() * MELODY.length)];
        this.piano(f, ctx.currentTime, 0.05 + Math.random() * 0.04);
        if (Math.random() < 0.3) this.piano(f * 1.5, ctx.currentTime + 0.35, 0.035);
      }
      this.timers.push(window.setTimeout(playNote, 2200 + Math.random() * 3800));
    };
    playChord();
    this.timers.push(window.setTimeout(playNote, 1800));
  }

  private pad(freq: number, at: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.06, at + 3);
    g.gain.linearRampToValueAtTime(0.045, at + dur - 3);
    g.gain.linearRampToValueAtTime(0, at + dur);
    g.connect(lp).connect(this.music);
    for (const detune of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = freq;
      o.detune.value = detune;
      o.connect(g);
      o.start(at);
      o.stop(at + dur + 0.1);
    }
  }

  private piano(freq: number, at: number, level: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, at + 3.2);
    g.connect(this.music);
    [1, 2, 3].forEach((h, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * h;
      const hg = ctx.createGain();
      hg.gain.value = [1, 0.18, 0.06][i];
      o.connect(hg).connect(g);
      o.start(at);
      o.stop(at + 3.3);
    });
  }

  private noise(dur: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  footstep() {
    if (!this.ctx || this._muted) return;
    const ctx = this.ctx;
    const src = this.noise(0.08);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 380 + Math.random() * 160;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    const now = ctx.currentTime;
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.08);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(now);
  }

  /** Soft paper/ink sweep used for painting entry and teleport. */
  sweep(reverse = false) {
    if (!this.ctx || this._muted) return;
    const ctx = this.ctx;
    const src = this.noise(1.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 0.8;
    const now = ctx.currentTime;
    bp.frequency.setValueAtTime(reverse ? 2400 : 300, now);
    bp.frequency.exponentialRampToValueAtTime(reverse ? 300 : 2400, now + 1.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.06, now + 0.3);
    g.gain.linearRampToValueAtTime(0, now + 1.15);
    src.connect(bp).connect(g).connect(this.sfx);
    src.start(now);
  }

  chime() {
    if (!this.ctx || this._muted) return;
    this.piano(1318.5, this.ctx.currentTime, 0.02);
  }
}

let instance: GalleryAudio | null = null;
export function getAudio() {
  if (!instance) instance = new GalleryAudio();
  return instance;
}
