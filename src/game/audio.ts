// 効果音はすべてWeb Audioで合成する。音源ファイルは使わない。

export type SoundName = 'collect' | 'reward' | 'feed' | 'happy' | 'upgrade' | 'dry' | 'tap' | 'deny';

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number; slide?: number };

const SOUNDS: Record<SoundName, Note[]> = {
  collect: [{ freq: 660, at: 0, dur: 0.07, type: 'triangle', slide: 990, gain: 0.18 }],
  reward: [523, 659, 784, 1047].map((freq, i) => ({ freq, at: i * 0.09, dur: 0.16, type: 'triangle' as const })),
  feed: [
    { freq: 220, at: 0, dur: 0.08, type: 'square', gain: 0.06, slide: 160 },
    { freq: 240, at: 0.14, dur: 0.08, type: 'square', gain: 0.06, slide: 170 },
    { freq: 230, at: 0.28, dur: 0.08, type: 'square', gain: 0.06, slide: 165 },
  ],
  happy: [
    { freq: 784, at: 0, dur: 0.1, type: 'sine' },
    { freq: 988, at: 0.1, dur: 0.18, type: 'sine' },
  ],
  upgrade: [392, 523, 659, 784, 1047].map((freq, i) => ({ freq, at: i * 0.07, dur: 0.2, type: 'sine' as const })),
  dry: [{ freq: 300, at: 0, dur: 0.45, type: 'sine', slide: 900, gain: 0.12 }],
  tap: [{ freq: 880, at: 0, dur: 0.04, type: 'sine', gain: 0.08 }],
  deny: [{ freq: 200, at: 0, dur: 0.12, type: 'square', gain: 0.05, slide: 150 }],
};

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  /** iOSはユーザー操作内でAudioContextを作る/再開する必要がある */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.6;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stopHum();
  }

  play(name: SoundName): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    for (const n of SOUNDS[name]) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = n.type ?? 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.at);
      if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide, now + n.at + n.dur);
      const peak = n.gain ?? 0.14;
      gain.gain.setValueAtTime(0.0001, now + n.at);
      gain.gain.exponentialRampToValueAtTime(peak, now + n.at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + n.dur);
      osc.connect(gain).connect(this.master);
      osc.start(now + n.at);
      osc.stop(now + n.at + n.dur + 0.02);
    }
  }

  /** 吸引中の小さなモーター音 */
  startHum(): void {
    if (!this.enabled || !this.ctx || !this.master || this.hum) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 95;
    gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.025, this.ctx.currentTime + 0.08);
    osc.connect(gain).connect(this.master);
    osc.start();
    this.hum = { osc, gain };
  }

  stopHum(): void {
    if (!this.hum || !this.ctx) return;
    const { osc, gain } = this.hum;
    this.hum = null;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    osc.stop(t + 0.1);
  }
}
