export const BPM = 110;
const SPB = 60 / BPM;
const SPS = SPB / 4;
const LOOP_STEPS = 64;

const CHORDS = [
  [45, 48, 52],
  [41, 45, 48],
  [48, 52, 55],
  [43, 47, 50],
];
const ARP_SEQ = [0, 1, 2, 3, 2, 1];

const freq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export class AudioEngine {
  muted = false;

  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private delaySend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private nextStep = 0;
  private nextStepTime = 0;
  private musicStart = 0;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    const limiter = ctx.createDynamicsCompressor();
    this.master.connect(limiter).connect(ctx.destination);

    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.8;
    this.musicGain.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    const delay = ctx.createDelay(1);
    delay.delayTime.value = SPB * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    delay.connect(feedback).connect(delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    delay.connect(wet).connect(this.musicGain);
    this.delaySend = ctx.createGain();
    this.delaySend.connect(delay);

    const noiseLen = Math.floor(ctx.sampleRate * 1);
    this.noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

    this.musicStart = ctx.currentTime + 0.1;
    this.nextStepTime = this.musicStart;
    this.nextStep = 0;
    window.setInterval(() => this.schedule(), 30);
  }

  beat(fallbackTime: number): number {
    if (this.ctx?.state !== "running") return fallbackTime / SPB;
    return Math.max(0, (this.ctx.currentTime - this.musicStart) / SPB);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : 0.6,
        this.ctx.currentTime,
        0.03,
      );
    }
    return this.muted;
  }

  suspend(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }

  private schedule(): void {
    const ctx = this.ctx!;
    if (ctx.state !== "running") return;
    const horizon = ctx.currentTime + 0.15;
    while (this.nextStepTime < horizon) {
      this.step(this.nextStep % LOOP_STEPS, this.nextStepTime);
      this.nextStep++;
      this.nextStepTime += SPS;
    }
  }

  private step(s: number, t: number): void {
    const chord = CHORDS[Math.floor(s / 16)];
    const inBar = s % 16;

    if (inBar % 4 === 0) this.kick(t);
    if (inBar === 4 || inBar === 12) this.clap(t);
    if (inBar % 4 === 2) this.hat(t);

    if (inBar % 2 === 0) {
      const octaveUp = inBar === 6 || inBar === 14 ? 12 : 0;
      this.bass(freq(chord[0] - 12 + octaveUp), t);
    }
    const idx = ARP_SEQ[s % ARP_SEQ.length];
    this.arp(freq(idx === 3 ? chord[0] + 24 : chord[idx] + 12), t);
    if (inBar === 0) this.pad(chord, t);
  }

  private env(t: number, attack: number, peak: number, dur: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start(t);
    src.stop(t + dur);
    return src;
  }

  private kick(t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    osc.connect(this.env(t, 0.005, 0.5, 0.25)).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  private clap(t: number): void {
    const ctx = this.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    this.noiseSource(t, 0.15)
      .connect(bp)
      .connect(this.env(t, 0.005, 0.22, 0.13))
      .connect(this.musicGain);
  }

  private hat(t: number): void {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7500;
    this.noiseSource(t, 0.06)
      .connect(hp)
      .connect(this.env(t, 0.002, 0.1, 0.05))
      .connect(this.musicGain);
  }

  private bass(f: number, t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 2;
    osc
      .connect(lp)
      .connect(this.env(t, 0.01, 0.16, SPS * 1.8))
      .connect(this.musicGain);
    osc.start(t);
    osc.stop(t + SPS * 2);
  }

  private arp(f: number, t: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2500;
    const g = this.env(t, 0.005, 0.06, SPS * 0.9);
    osc.connect(lp).connect(g);
    g.connect(this.musicGain);
    g.connect(this.delaySend);
    osc.start(t);
    osc.stop(t + SPS);
  }

  private pad(chord: number[], t: number): void {
    const ctx = this.ctx!;
    for (let i = 0; i < chord.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq(chord[i] + 12);
      osc.detune.value = (i - 1) * 6;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800;
      osc
        .connect(lp)
        .connect(this.env(t, 0.5, 0.035, SPB * 4))
        .connect(this.musicGain);
      osc.start(t);
      osc.stop(t + SPB * 4 + 0.1);
    }
  }

  private blip(
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    when = 0,
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    osc.connect(this.env(t, 0.005, vol, dur)).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur);
  }

  jump(): void {
    this.blip(220, 660, 0.18, "square", 0.12);
  }
  jump2(): void {
    this.blip(330, 880, 0.15, "square", 0.1);
  }
  dive(): void {
    this.blip(500, 120, 0.2, "sawtooth", 0.1);
  }
  land(): void {
    this.blip(150, 60, 0.08, "triangle", 0.1);
  }
  fall(): void {
    this.blip(500, 55, 0.7, "sawtooth", 0.16);
  }

  orb(combo: number): void {
    const f = 700 * 1.09 ** Math.min(combo, 10);
    this.blip(f, f * 1.5, 0.09, "triangle", 0.14);
  }

  shieldGet(): void {
    this.blip(392, 784, 0.15, "sine", 0.15);
    this.blip(587, 1175, 0.15, "sine", 0.12, 0.06);
  }

  shieldBreak(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2000, t);
    lp.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    this.noiseSource(t, 0.25)
      .connect(lp)
      .connect(this.env(t, 0.005, 0.3, 0.25))
      .connect(this.sfxGain);
    this.blip(300, 80, 0.3, "sawtooth", 0.18);
  }

  nearMiss(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(4000, t + 0.15);
    bp.Q.value = 2;
    this.noiseSource(t, 0.15)
      .connect(bp)
      .connect(this.env(t, 0.01, 0.18, 0.15))
      .connect(this.sfxGain);
  }

  milestone(): void {
    this.blip(523, 523, 0.09, "square", 0.12);
    this.blip(659, 659, 0.09, "square", 0.12, 0.07);
    this.blip(784, 784, 0.09, "square", 0.12, 0.14);
    this.blip(1046, 1046, 0.18, "square", 0.12, 0.21);
  }

  death(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const dur = 0.45;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    this.noiseSource(t, dur)
      .connect(lp)
      .connect(this.env(t, 0.005, 0.35, dur))
      .connect(this.sfxGain);
    this.blip(220, 35, 0.5, "sawtooth", 0.18);
  }
}
