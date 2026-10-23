// 効果音はすべてWeb Audioで合成する。BGMだけは public/bgm/ の mp3（tools/bgm で作曲）を鳴らす。
import type { BgmId } from './music.ts';

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

/** public/bgm/bgm.json の1曲ぶん（ループの位置は秒） */
interface BgmInfo {
  id: string;
  loop: boolean;
  loopStart: number | null;
  loopEnd: number | null;
}

/** BGMの音量（効果音より控えめに） */
const MUSIC_GAIN = 0.5;
/** 曲の切りかえのクロスフェード（秒） */
const MUSIC_FADE = 1.0;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hum: { osc: OscillatorNode; gain: GainNode } | null = null;
  private manifest: Promise<Map<string, BgmInfo>> | null = null;
  /** mp3 のまま持っておく（デコード済みは大きいので、いま鳴らす曲だけ） */
  private encoded = new Map<string, Promise<ArrayBuffer | null>>();
  private wantMusic: BgmId | null = null;
  private current: { id: BgmId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicToken = 0;
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
      if (this.wantMusic && !this.current) void this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopHum();
      this.fadeOutMusic(0.3);
    } else if (this.wantMusic) void this.startMusic();
  }

  /** アプリが裏に回ったら止め、もどったら続きから */
  setPaused(paused: boolean): void {
    if (!this.ctx) return;
    if (paused && this.ctx.state === 'running') void this.ctx.suspend();
    else if (!paused && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** この曲を流す（同じ曲ならそのまま。ちがえばクロスフェード） */
  music(id: BgmId): void {
    if (this.wantMusic === id) return;
    this.wantMusic = id;
    // 音を出せる前（タイトル画面）から読みこんでおき、タップしたらすぐ鳴らす
    if (this.enabled) {
      void this.bgmInfo(id);
      void this.bgmBytes(id);
    }
    void this.startMusic();
  }

  private async startMusic(): Promise<void> {
    const id = this.wantMusic;
    if (!id || !this.enabled || !this.ctx || !this.master || this.current?.id === id) return;
    const token = ++this.musicToken;
    const [info, bytes] = await Promise.all([this.bgmInfo(id), this.bgmBytes(id)]);
    if (token !== this.musicToken || !info || !bytes || !this.ctx || !this.master) return;
    let buffer: AudioBuffer;
    try {
      buffer = await this.ctx.decodeAudioData(bytes.slice(0));
    } catch {
      return;
    }
    // 読みこむあいだに曲が変わったり、音を消されたりしたら鳴らさない
    if (token !== this.musicToken || !this.enabled || this.wantMusic !== id) return;
    this.fadeOutMusic(MUSIC_FADE);
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (info.loop && info.loopStart !== null && info.loopEnd !== null) {
      src.loop = true;
      src.loopStart = info.loopStart;
      src.loopEnd = info.loopEnd;
    }
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(MUSIC_GAIN, now + MUSIC_FADE);
    src.connect(gain).connect(this.master);
    src.start(now, info.loopStart ?? 0);
    // ループしない曲（おしまい）は鳴り終わっても current に残し、タップでまた始まらないようにする
    this.current = { id, src, gain };
  }

  private fadeOutMusic(seconds: number): void {
    const cur = this.current;
    this.current = null;
    if (!cur || !this.ctx) return;
    const t = this.ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
    cur.gain.gain.linearRampToValueAtTime(0, t + seconds);
    cur.src.stop(t + seconds + 0.05);
  }

  private bgmInfo(id: BgmId): Promise<BgmInfo | undefined> {
    this.manifest ??= fetch('bgm/bgm.json')
      .then((r) => (r.ok ? (r.json() as Promise<{ tracks: BgmInfo[] }>) : { tracks: [] }))
      .then((m) => new Map(m.tracks.map((t) => [t.id, t])))
      .catch(() => {
        this.manifest = null; // 通信できなかったら、次の曲のときにもう一度
        return new Map<string, BgmInfo>();
      });
    return this.manifest.then((m) => m.get(id));
  }

  private bgmBytes(id: BgmId): Promise<ArrayBuffer | null> {
    let p = this.encoded.get(id);
    if (!p) {
      p = fetch(`bgm/${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null)
        .then((b) => {
          if (!b) this.encoded.delete(id);
          return b;
        });
      this.encoded.set(id, p);
    }
    return p;
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
