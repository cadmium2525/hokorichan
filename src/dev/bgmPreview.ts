// BGM の試聴ページ（bgm.html）。public/bgm/bgm.json の曲を、ゲームと同じようにループ・クロスフェードで鳴らす

interface BgmTrack {
  id: string;
  title: string;
  scene: string;
  bpm: number;
  key: string;
  duration: number;
  loop: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  kb: number;
}

interface Playing {
  id: string;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** 再生を始めた時刻（ctx.currentTime）と、そのときの曲の位置 */
  t0: number;
  offset: number;
}

const FADE = 0.8;
const root = document.getElementById('bgm')!;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let tracks: BgmTrack[] = [];
let playing: Playing | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

const style = document.createElement('style');
style.textContent = `
:root { --bg: #fff6ec; --card: #ffffff; --ink: #4a3a46; --sub: #8a7884; --pink: #f08aa6; --pinkd: #d9607f; --line: #f1e1d6; --bar: #f6e7ee; }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, "Hiragino Maru Gothic ProN", "Hiragino Sans", sans-serif; -webkit-text-size-adjust: 100%; }
#bgm { max-width: 560px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); }
h1 { font-size: 20px; margin: 4px 0 4px; }
.lead { font-size: 13px; color: var(--sub); line-height: 1.6; margin: 0 0 12px; }
.vol { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
.vol input { flex: 1; accent-color: var(--pink); }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; margin-bottom: 10px; }
.card.on { border-color: var(--pink); box-shadow: 0 0 0 2px #f08aa633; }
.row { display: flex; align-items: center; gap: 12px; }
.play { flex: none; width: 48px; height: 48px; border-radius: 50%; border: none; background: var(--pink); color: #fff; font-size: 18px; cursor: pointer; touch-action: manipulation; }
.play:active { background: var(--pinkd); }
.info { flex: 1; min-width: 0; }
.num { font-size: 11px; color: var(--sub); }
.title { font-weight: 700; font-size: 15px; }
.scene { font-size: 12px; color: var(--sub); margin-top: 2px; }
.meta { font-size: 11px; color: var(--sub); margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px 10px; }
.seek { position: relative; height: 22px; margin-top: 8px; cursor: pointer; touch-action: none; }
.seek .bg { position: absolute; left: 0; right: 0; top: 8px; height: 6px; border-radius: 3px; background: var(--bar); }
.seek .fill { position: absolute; left: 0; top: 8px; height: 6px; border-radius: 3px; background: var(--pink); width: 0; }
.seek .mark { position: absolute; top: 4px; width: 2px; height: 14px; background: #c9a8b8; }
.tools { display: flex; gap: 8px; margin-top: 6px; }
.tools button { font-size: 12px; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--line); background: #fffaf6; color: var(--ink); cursor: pointer; touch-action: manipulation; }
.tools a { font-size: 12px; padding: 6px 10px; color: var(--sub); }
.time { font-size: 11px; color: var(--sub); font-variant-numeric: tabular-nums; margin-left: auto; align-self: center; }
.err { color: #c0392b; font-size: 13px; }
`;
document.head.append(style);

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function audio(): AudioContext {
  if (!ctx) {
    // iPhone の消音スイッチがオンでも鳴るように（対応している Safari だけ）
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = Number(localStorage.getItem('bgmPreviewVol') ?? 0.8);
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function load(t: BgmTrack): Promise<AudioBuffer> {
  let p = buffers.get(t.id);
  if (!p) {
    p = fetch(`bgm/${t.id}.mp3`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => audio().decodeAudioData(b));
    buffers.set(t.id, p);
  }
  return p;
}

/** いまの曲の位置（秒） */
function position(p: Playing, t: BgmTrack): number {
  const c = ctx!;
  let pos = p.offset + (c.currentTime - p.t0);
  if (t.loop && t.loopStart !== null && t.loopEnd !== null && pos >= t.loopEnd) {
    const len = t.loopEnd - t.loopStart;
    pos = t.loopStart + ((pos - t.loopStart) % len);
  }
  return Math.min(pos, t.duration);
}

function fadeOutCurrent(): void {
  if (!playing || !ctx) return;
  const { src, gain } = playing;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE);
  src.stop(now + FADE + 0.05);
  playing = null;
}

async function play(t: BgmTrack, at?: number): Promise<void> {
  const c = audio();
  const buf = await load(t);
  fadeOutCurrent();
  const src = c.createBufferSource();
  src.buffer = buf;
  if (t.loop && t.loopStart !== null && t.loopEnd !== null) {
    src.loop = true;
    src.loopStart = t.loopStart;
    src.loopEnd = t.loopEnd;
  }
  const gain = c.createGain();
  src.connect(gain).connect(master!);
  const now = c.currentTime;
  const offset = at ?? t.loopStart ?? 0;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + (at === undefined ? FADE : 0.05));
  src.start(now, offset);
  const p: Playing = { id: t.id, src, gain, t0: now, offset };
  src.onended = () => {
    if (playing === p) {
      playing = null;
      render();
    }
  };
  playing = p;
  render();
}

function stop(): void {
  fadeOutCurrent();
  render();
}

function card(t: BgmTrack, i: number): string {
  const on = playing?.id === t.id;
  const marks = t.loop && t.loopStart !== null && t.loopEnd !== null
    ? [t.loopStart, t.loopEnd].map((s) => `<div class="mark" style="left:${(s / t.duration) * 100}%"></div>`).join('')
    : '';
  return `<div class="card${on ? ' on' : ''}" data-id="${t.id}">
    <div class="row">
      <button class="play" data-act="toggle" aria-label="${on ? '止める' : '再生'}">${on ? '■' : '▶'}</button>
      <div class="info">
        <div class="num">${i + 1}. ${t.id}.mp3</div>
        <div class="title">${t.title}</div>
        <div class="scene">${t.scene}</div>
      </div>
    </div>
    <div class="seek" data-act="seek"><div class="bg"></div>${marks}<div class="fill"></div></div>
    <div class="tools">
      ${t.loop ? '<button data-act="seam">つなぎ目を聞く</button>' : ''}
      <a href="bgm/${t.id}.mp3" download>ダウンロード</a>
      <span class="time">0:00 / ${fmt(t.loop && t.loopEnd !== null && t.loopStart !== null ? t.loopEnd - t.loopStart : t.duration)}</span>
    </div>
    <div class="meta"><span>${t.loop ? 'ループ' : 'ループしない'}</span><span>${t.bpm} BPM</span><span>${t.key}</span><span>${t.kb} KB</span></div>
  </div>`;
}

function render(): void {
  const list = root.querySelector('.list');
  if (list) list.innerHTML = tracks.map(card).join('');
}

function tick(): void {
  if (playing && ctx) {
    const t = tracks.find((x) => x.id === playing!.id);
    const el = root.querySelector<HTMLElement>(`.card[data-id="${playing.id}"]`);
    if (t && el) {
      const pos = position(playing, t);
      el.querySelector<HTMLElement>('.fill')!.style.width = `${(pos / t.duration) * 100}%`;
      const start = t.loop ? t.loopStart ?? 0 : 0;
      const len = t.loop && t.loopEnd !== null ? t.loopEnd - start : t.duration;
      el.querySelector<HTMLElement>('.time')!.textContent = `${fmt(Math.max(0, pos - start))} / ${fmt(len)}`;
    }
  }
  requestAnimationFrame(tick);
}

root.innerHTML = `
  <h1>ほこりちゃん BGM試聴</h1>
  <p class="lead">ゲームで流すBGMの候補です。▶で再生します。曲を切りかえると、ゲームと同じようにクロスフェードします。ループする曲は「つなぎ目を聞く」で、曲の終わりから頭へもどるところを確かめられます。</p>
  <label class="vol">音量 <input type="range" min="0" max="1" step="0.01" value="${localStorage.getItem('bgmPreviewVol') ?? 0.8}" /></label>
  <div class="list"></div>`;

root.querySelector<HTMLInputElement>('.vol input')!.addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  try {
    localStorage.setItem('bgmPreviewVol', String(v));
  } catch {
    // 保存できなくても再生には関係ない
  }
  if (master) master.gain.value = v;
});

root.addEventListener('pointerdown', (e) => {
  const seek = (e.target as HTMLElement).closest<HTMLElement>('[data-act="seek"]');
  if (!seek) return;
  const id = seek.closest<HTMLElement>('.card')!.dataset.id!;
  const t = tracks.find((x) => x.id === id)!;
  const r = seek.getBoundingClientRect();
  const at = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * t.duration;
  void play(t, Math.min(at, t.duration - 0.1));
});

root.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('button[data-act]');
  if (!btn) return;
  const id = btn.closest<HTMLElement>('.card')!.dataset.id!;
  const t = tracks.find((x) => x.id === id)!;
  if (btn.dataset.act === 'toggle') {
    if (playing?.id === id) stop();
    else void play(t);
  } else if (btn.dataset.act === 'seam' && t.loopEnd !== null) {
    void play(t, Math.max(t.loopStart ?? 0, t.loopEnd - 4));
  }
});

fetch('bgm/bgm.json')
  .then((r) => r.json() as Promise<{ tracks: BgmTrack[] }>)
  .then((m) => {
    tracks = m.tracks;
    render();
    requestAnimationFrame(tick);
  })
  .catch(() => {
    root.querySelector('.list')!.innerHTML = '<p class="err">曲の一覧を読みこめませんでした。</p>';
  });
