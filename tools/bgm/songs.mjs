// ほこりちゃんの BGM（「かなでる」の曲 JSON を作る）
// どの曲も「オルゴール・チェレスタ・ピチカート・やわらかい弦」を軸に、場面ごとに楽器を足す。
// 時間の単位は拍（4/4 拍子、1 小節 = 4 拍）。ループ曲は loopBars ぶんを 1 周として書く。

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C#5" → MIDI 番号 */
export const midi = (name) => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`音名が読めません: ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};

const QUALITY = {
  '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus4: [0, 5, 7], '7sus4': [0, 5, 7, 10], add9: [0, 4, 7, 14], m9: [0, 3, 7, 10, 14], dim: [0, 3, 6],
};
/** 和音記号 → { tones: 構成音（ルート音域 oct）, bass: 低音（2 オクターブ目）} */
export function chord(sym, oct = 4) {
  const [main, slash] = sym.split('/');
  const m = /^([A-G][#b]?)(.*)$/.exec(main);
  const q = QUALITY[m[2]];
  if (!q) throw new Error(`和音が読めません: ${sym}`);
  const root = midi(`${m[1]}${oct}`);
  const bassName = slash ?? m[1];
  let bass = midi(`${bassName}2`);
  if (bass > 47) bass -= 12; // 低音は B2 まで
  return { tones: q.map((i) => root + i), bass };
}

/** 小節ごとの和音の列 → [{ t, d, sym }]。1 小節に 2 つなら "C7sus4 C7" のように空白で区切る */
export function progression(bars) {
  const out = [];
  bars.forEach((bar, i) => {
    const syms = bar.split(' ');
    const d = 4 / syms.length;
    syms.forEach((sym, k) => out.push({ t: i * 4 + k * d, d, sym }));
  });
  return out;
}

/** 旋律 "C5/1 E5/.5 r/.5 | ..."（音/長さ）→ 音符の列。小節線 | ごとに 4 拍か確かめる */
export function melody(text, { start = 0, vel = 0.62, accent = 0.08 } = {}) {
  const notes = [];
  let t = start;
  text.split('|').forEach((bar, i) => {
    let sum = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      const [n, d] = tok.split('/');
      const len = Number(d);
      if (n !== 'r') {
        const onBeat = Math.abs(t - Math.round(t)) < 1e-6;
        notes.push([t, n, len * 0.95, vel + (onBeat ? accent : 0)]);
      }
      t += len;
      sum += len;
    }
    if (Math.abs(sum - 4) > 1e-6) throw new Error(`旋律の ${i + 1} 小節目が ${sum} 拍です: ${bar}`);
  });
  return notes;
}

/** のばした和音（パッド・弦） */
export function pads(prog, { oct = 4, vel = 0.5, gap = 0.05 } = {}) {
  return prog.flatMap(({ t, d, sym }) => chord(sym, oct).tones.map((n) => [t, n, d - gap, vel]));
}

/** 和音を決まったリズムで鳴らす（ギターのストローク・スタブ） hits: [[小節内の拍, 長さ, 強さ]] */
export function strums(prog, hits, { oct = 4, top = 0 } = {}) {
  const out = [];
  for (const { t, d, sym } of prog) {
    const tones = chord(sym, oct).tones;
    if (top) tones.push(tones[0] + 12);
    for (const [b, len, v] of hits) if (b < d) for (const n of tones) out.push([t + b, n, len, v]);
  }
  return out;
}

/** 分散和音。order は構成音（オクターブ上に続く）の番号の列、step は拍 */
export function arpeggio(prog, order, { oct = 4, step = 0.5, vel = 0.5, len = null, accent = 0.12 } = {}) {
  const out = [];
  for (const { t, d, sym } of prog) {
    const base = chord(sym, oct).tones.slice(0, 3);
    const tone = (i) => base[i % 3] + 12 * Math.floor(i / 3);
    const n = Math.round(d / step);
    for (let k = 0; k < n; k++) out.push([t + k * step, tone(order[k % order.length]), len ?? step * 0.9, vel + (k % 4 === 0 ? accent : 0)]);
  }
  return out;
}

/** 低音。pattern: [[小節内の拍, 'r' ルート / '5' 5度 / 'o' オクターブ上, 長さ, 強さ]] */
export function bassline(prog, pattern) {
  const out = [];
  for (const { t, d, sym } of prog) {
    const { bass, tones } = chord(sym, 4);
    const fifth = bass + ((tones[2] - tones[0]) % 12);
    for (const [b, kind, len, v] of pattern) {
      if (b >= d) continue;
      out.push([t + b, kind === '5' ? fifth : kind === 'o' ? bass + 12 : bass, len, v]);
    }
  }
  return out;
}

const bar = (s) => s.replace(/\s+/g, '');
/** ドラム譜面を n 小節くり返す（1 小節 16 マス） */
const rep = (pattern, n) => Array.from({ length: n }, () => bar(pattern)).join('');

const tr = (id, name, inst, notes, extra = {}) => ({ id, name, inst, volume: 0, sends: { reverb: 0.2 }, ...extra, clips: [{ at: 0, notes }] });

/* ───────────── 1. おうち（昼） ───────────── */
// ほこりちゃんのテーマ。夜・おしまいの曲でも同じ旋律を使う
const HOME_A = [
  'C5/1 F5/1 A5/1.5 G5/.5', 'E5/1 G5/1 C5/2', 'D5/1 F5/1 A5/1 G5/.5 F5/.5', 'G5/3 r/1',
  'C5/1 F5/1 A5/1.5 C6/.5', 'A5/1 G5/1 F5/2', 'D5/1 F5/1 A#5/1 A5/.5 G5/.5', 'G5/1 E5/1 C5/2',
].join('|');
const HOME_B = [
  'F5/1.5 D5/.5 F5/1 A5/1', 'G5/1.5 E5/.5 C5/2', 'E5/1.5 C5/.5 E5/1 G5/1', 'F5/2 A5/2',
  'A#5/1 A5/1 G5/1 F5/1', 'E5/1 F5/1 G5/2', 'A5/1 G5/1 F5/1 C5/1', 'F5/3 r/1',
].join('|');
const HOME_PROG_A = ['F', 'Am7', 'A#maj7', 'C7sus4 C7', 'F', 'Dm7', 'Gm7', 'C7'];
const HOME_PROG_B = ['A#maj7', 'C', 'Am7', 'Dm7', 'Gm7', 'C7', 'F', 'C7sus4 F'];

function home() {
  const prog = progression([...HOME_PROG_A, ...HOME_PROG_B]);
  return {
    name: 'Hokori-chan no Heya', bpm: 85, loopBars: 16, key: 'F major',
    tracks: [
      tr('mbox', 'オルゴール（旋律）', 'musicbox', melody(`${HOME_A}|${HOME_B}`), { volume: 3, sends: { reverb: 0.3, delay: 0.08 }, humanize: { time: 0.006, vel: 0.05 } }),
      tr('uke', 'ナイロンギター（ウクレレ風）', 'nylon', strums(prog, [[0, 0.9, 0.5], [1.5, 0.4, 0.35], [2, 0.9, 0.45], [3, 0.4, 0.3], [3.5, 0.4, 0.35]], { oct: 4 }), { volume: -4, pan: -0.25, strum: 0.018, transpose: 0, humanize: { time: 0.008, vel: 0.06 } }),
      tr('pizz', 'ピチカート（低音）', 'pizz', bassline(prog, [[0, 'r', 0.8, 0.75], [2, '5', 0.8, 0.6], [3, 'o', 0.4, 0.45]]), { volume: 2 }),
      tr('glock', 'グロッケン', 'glock', arpeggio(prog, [3, 4, 5, 4], { oct: 5, step: 1, vel: 0.3, accent: 0.05 }).filter(([t]) => t % 8 >= 4), { volume: -9, pan: 0.3, sends: { reverb: 0.35, delay: 0.15 } }),
      tr('pad', 'パッド', 'airpad', pads(prog, { oct: 4, vel: 0.4 }), { volume: -14, sends: { reverb: 0.3 } }),
      {
        id: 'perc', name: 'やさしいリズム', type: 'drums', kit: 'lofi', volume: -6, sends: { reverb: 0.1 }, humanize: { time: 0.006 },
        clips: [{ at: 0, len: 64, grid: { kick: rep('x.......x.......', 16), rim: rep('....o.......o...', 16), shaker: rep('..o...o...o...o.', 16) } }],
      },
    ],
  };
}

/* ───────────── 2. おうち（夜） ───────────── */
function night() {
  const prog = progression([...HOME_PROG_A, 'A#maj7', 'Am7', 'Gm7', 'C7sus4']);
  const tail = 'D5/2 F5/2|C5/2 E5/2|D5/1 F5/1 A#5/2|G5/4';
  return {
    name: 'Ohiru-ne no Komoriuta', bpm: 60, loopBars: 12, key: 'F major',
    tracks: [
      tr('mbox', 'オルゴール（旋律）', 'musicbox', melody(`${HOME_A}|${tail}`, { vel: 0.5, accent: 0.05 }), { volume: 2, sends: { reverb: 0.45, delay: 0.1 }, humanize: { time: 0.01, vel: 0.05 } }),
      tr('piano', 'やわらかいピアノ（分散和音）', 'softpiano', arpeggio(prog, [0, 1, 2, 3, 2, 1, 4, 2], { oct: 3, step: 0.5, vel: 0.3, len: 1.4, accent: 0.06 }), { volume: -3, pan: -0.15, sends: { reverb: 0.4 }, humanize: { time: 0.012, vel: 0.05 } }),
      tr('pad', 'パッド', 'airpad', pads(prog, { oct: 4, vel: 0.35 }), { volume: -12, sends: { reverb: 0.4 } }),
      tr('bass', '低音', 'subbass', bassline(prog, [[0, 'r', 3.8, 0.5]]), { volume: -6 }),
    ],
  };
}

/* ───────────── 3. まち ───────────── */
function town() {
  const prog = progression(['C', 'G/B', 'Am', 'Em/G', 'F', 'C/E', 'Dm7', 'G7', 'C', 'G/B', 'Am', 'Em/G', 'F', 'G', 'C', 'C7', 'F', 'G', 'Em', 'Am', 'Dm7', 'G', 'Fmaj7', 'G7']);
  const A = 'E5/.5 G5/.5 C6/1 B5/.5 A5/.5 G5/1|D5/.5 G5/.5 B5/1 A5/.5 G5/.5 D5/1|C5/.5 E5/.5 A5/1 G5/.5 E5/.5 C5/1|B4/.5 E5/.5 G5/2 r/1';
  const mel = [
    A, 'A5/.5 G5/.5 F5/.5 E5/.5 F5/1 A5/1|G5/.5 F5/.5 E5/.5 D5/.5 E5/1 G5/1|F5/.5 E5/.5 D5/.5 C5/.5 D5/1 F5/1|D5/1.5 E5/.5 D5/1 r/1',
    A, 'A5/.5 G5/.5 F5/.5 E5/.5 F5/1 C6/1|B5/.5 A5/.5 G5/.5 F5/.5 D5/1 B4/1|C6/2 G5/1 E5/1|C5/2 r/2',
    'A5/1.5 G5/.5 F5/1 C5/1|D5/1.5 E5/.5 F5/1 G5/1|G5/1.5 F5/.5 E5/1 B4/1|C5/1.5 D5/.5 E5/2',
    'F5/1 E5/1 D5/1 F5/1|A5/1 G5/1 F5/1 D5/1|E5/1 F5/1 A5/1 C6/1|B5/2 G5/.5 F5/.5 E5/.5 D5/.5',
  ].join('|');
  return {
    name: 'Machi wo Sanpo', bpm: 108, loopBars: 24, key: 'C major',
    tracks: [
      tr('flute', 'フルート（旋律）', 'flute', melody(mel, { vel: 0.6 }), { volume: 0, pan: 0.1, sends: { reverb: 0.25, delay: 0.06 }, humanize: { time: 0.006, vel: 0.05 } }),
      tr('uke', 'ナイロンギター', 'nylon', strums(prog, [[0, 0.45, 0.5], [1, 0.45, 0.35], [1.5, 0.45, 0.4], [2.5, 0.45, 0.4], [3, 0.45, 0.35], [3.5, 0.45, 0.4]]), { volume: -4, pan: -0.3, strum: 0.014, humanize: { time: 0.006, vel: 0.07 } }),
      tr('pizz', 'ピチカート', 'pizz', arpeggio(prog, [0, 2, 1, 2], { oct: 4, step: 1, vel: 0.35 }), { volume: -7, pan: 0.35 }),
      tr('glock', 'グロッケン', 'glock', melody(mel, { vel: 0.35, accent: 0 }).filter(([t]) => Math.floor(t / 32) % 3 === 1), { volume: -12, transpose: 12, pan: 0.2, sends: { reverb: 0.3 } }),
      tr('bass', 'ベース', 'ebass', bassline(prog, [[0, 'r', 0.9, 0.75], [1.5, 'r', 0.4, 0.5], [2, '5', 0.9, 0.65], [3.5, 'o', 0.4, 0.45]]), { volume: -1 }),
      {
        id: 'drums', name: 'ドラム', type: 'drums', kit: 'acoustic', volume: -5, sends: { reverb: 0.1 }, humanize: { time: 0.005 }, swing: 0.08,
        clips: [{ at: 0, len: 96, grid: { kick: rep('x.......x.x.....', 24), rim: rep('....x.......x...', 24), shaker: rep('o.x.o.x.o.x.o.x.', 24), tamb: rep('............x...', 24) } }],
      },
    ],
  };
}

/* ───────────── 4. おそうじ ───────────── */
function cleaning() {
  const prog = progression(['G', 'Em', 'C', 'D', 'G', 'Em', 'Am7', 'D7', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'D7']);
  const A = 'G5/.5 r/.5 B5/.5 D6/.5 B5/.5 G5/.5 A5/1|E5/.5 r/.5 G5/.5 B5/.5 G5/.5 E5/.5 F#5/1';
  const mel = [
    A, 'C5/.5 E5/.5 G5/.5 C6/.5 B5/.5 G5/.5 E5/.5 G5/.5|A5/1 F#5/1 D5/1 r/1',
    A, 'C6/.5 B5/.5 A5/.5 G5/.5 E5/.5 G5/.5 A5/1|F#5/.5 A5/.5 C6/.5 A5/.5 F#5/1 D5/1',
    'E5/1 G5/.5 E5/.5 C6/1 B5/1|A5/1 F#5/.5 A5/.5 D6/2|B5/.5 A5/.5 F#5/.5 D5/.5 B4/1 D5/1|E5/.5 F#5/.5 G5/.5 A5/.5 B5/2',
    'C6/.5 B5/.5 A5/.5 G5/.5 E5/1 G5/1|F#5/.5 G5/.5 A5/.5 B5/.5 A5/2|G5/.5 B5/.5 D6/.5 B5/.5 G5/1 D5/1|F#5/.5 E5/.5 D5/.5 C5/.5 A4/.5 B4/.5 C5/.5 D5/.5',
  ].join('|');
  return {
    name: 'Osouji Time', bpm: 120, loopBars: 16, key: 'G major',
    tracks: [
      tr('lead', 'ピコピコ（旋律）', 'chip', melody(mel, { vel: 0.55 }).map(([t, n, d, v]) => [t, n, Math.min(d, 0.4), v]), { volume: -2, pan: 0.05, sends: { reverb: 0.12, delay: 0.1 } }),
      tr('mar', 'マリンバ', 'marimba', arpeggio(prog, [0, 1, 2, 3, 2, 1, 2, 1], { oct: 4, step: 0.5, vel: 0.45 }), { volume: -3, pan: -0.25, humanize: { time: 0.004, vel: 0.06 } }),
      tr('xylo', 'シロフォン（合いの手）', 'glock', strums(prog, [[1.5, 0.3, 0.4], [3.5, 0.3, 0.35]], { oct: 5 }), { volume: -14, pan: 0.3, sends: { reverb: 0.2 } }),
      tr('pizz', 'ピチカート（低音）', 'pizz', bassline(prog, [[0, 'r', 0.45, 0.8], [1, 'o', 0.45, 0.55], [2, '5', 0.45, 0.7], [3, 'o', 0.45, 0.55], [3.5, '5', 0.45, 0.5]]), { volume: 3, transpose: 12 }),
      tr('bass', 'ベース', 'pluckbass', bassline(prog, [[0, 'r', 0.4, 0.7], [2, '5', 0.4, 0.6]]), { volume: -6 }),
      {
        id: 'drums', name: 'ドラム', type: 'drums', kit: 'lofi', volume: -3, sends: { reverb: 0.08 }, humanize: { time: 0.004 },
        clips: [{ at: 0, len: 64, grid: { kick: rep('x.....x.x.......', 16), clap: rep('....x.......x...', 16), hat: rep('x.o.x.o.x.o.x.oo', 16) } }],
      },
    ],
  };
}

/* ───────────── 5. 大そうじ大会 ───────────── */
function contest() {
  const prog = progression(['Am', 'F', 'G', 'E7', 'Am', 'F', 'G', 'E7', 'F', 'G', 'Em', 'Am', 'F', 'G', 'E7sus4', 'E7']);
  const A = 'A5/.5 A5/.5 E5/.5 A5/.5 C6/.5 B5/.5 A5/1|F5/.5 F5/.5 C5/.5 F5/.5 A5/.5 G5/.5 F5/1|G5/.5 G5/.5 D5/.5 G5/.5 B5/.5 A5/.5 G5/.5 B5/.5';
  const mel = [
    A, 'G#5/1 E5/1 B4/1 E5/1', A, 'G#5/.5 A5/.5 B5/.5 C6/.5 D6/1 E6/1',
    'C6/1 A5/.5 F5/.5 C6/1 D6/1|B5/1 G5/.5 D5/.5 B5/1 C6/1|B5/.5 A5/.5 G5/.5 E5/.5 G5/1 B5/1|C6/.5 B5/.5 A5/.5 E5/.5 A5/2',
    'A5/.5 C6/.5 A5/.5 F5/.5 C6/1 A5/1|B5/.5 D6/.5 B5/.5 G5/.5 D6/1 B5/1|A5/1 B5/1 A5/1 B5/1|G#5/.5 B5/.5 D6/.5 B5/.5 G#5/.5 E5/.5 G#5/.5 B5/.5',
  ].join('|');
  return {
    name: 'Oosouji Taikai', bpm: 140, loopBars: 16, key: 'A minor',
    tracks: [
      tr('lead', 'ピコピコ（旋律）', 'squarelead', melody(mel, { vel: 0.6 }).map(([t, n, d, v]) => [t, n, Math.min(d, 0.45), v]), { volume: -1, sends: { reverb: 0.1, delay: 0.08 } }),
      tr('xylo', 'シロフォン（旋律の重ね）', 'marimba', melody(mel, { vel: 0.5 }), { volume: -6, transpose: 12, pan: 0.25 }),
      tr('brass', 'ブラス（合いの手）', 'brass', strums(prog, [[0.5, 0.35, 0.65], [1.5, 0.35, 0.55], [2.5, 0.35, 0.6], [3.5, 0.35, 0.55]], { oct: 4 }), { volume: -6, pan: -0.25, sends: { reverb: 0.15 } }),
      tr('pizz', 'ピチカート', 'pizz', arpeggio(prog, [0, 1, 2, 1], { oct: 4, step: 0.5, vel: 0.4 }), { volume: -6, pan: 0.35 }),
      tr('bass', 'ベース', 'synthbass', bassline(prog, [[0, 'r', 0.4, 0.8], [0.5, 'o', 0.4, 0.55], [1, 'r', 0.4, 0.7], [1.5, 'o', 0.4, 0.55], [2, 'r', 0.4, 0.75], [2.5, 'o', 0.4, 0.55], [3, '5', 0.4, 0.7], [3.5, 'o', 0.4, 0.55]]), { volume: -4 }),
      {
        id: 'drums', name: 'ドラム', type: 'drums', kit: 'acoustic', volume: -2, sends: { reverb: 0.1 }, humanize: { time: 0.004 },
        clips: [{
          at: 0, len: 64, grid: {
            kick: rep('x...x...x...x...', 16), snare: rep('....x.......x...', 15) + bar('....x...x.x.xxxx'), clap: rep('....x.......x...', 16),
            hat: rep('x.x.x.x.x.xxx.x.', 16), crash: bar('X...............') + '.'.repeat(16 * 7) + bar('X...............') + '.'.repeat(16 * 7),
          },
        }],
      },
    ],
  };
}

/* ───────────── 6. 空へ ───────────── */
function sky() {
  const prog = progression(['D', 'A/C#', 'Bm', 'G', 'D/F#', 'G', 'Em7', 'A', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'D', 'A']);
  const mel = [
    'F#5/2 A5/1 D6/1|C#6/2 B5/1 A5/1|B5/1.5 A5/.5 F#5/2|G5/1 A5/1 B5/2',
    'A5/2 F#5/1 A5/1|D6/2 B5/1 G5/1|E5/1 F#5/1 G5/1 B5/1|A5/3 r/1',
    'B5/1.5 A5/.5 G5/1 D5/1|C#6/1.5 B5/.5 A5/1 E5/1|A5/1 C#6/1 F#5/2|D6/1.5 C#6/.5 B5/2',
    'B5/1 A5/1 G5/1 B5/1|C#6/1 E6/1 A5/2|D6/3 A5/1|A5/1 B5/1 C#6/2',
  ].join('|');
  return {
    name: 'Fuwafuwa Kumo ni Notte', bpm: 100, loopBars: 16, key: 'D major',
    tracks: [
      tr('flute', 'フルート（旋律）', 'flute', melody(mel, { vel: 0.62 }), { volume: 1, sends: { reverb: 0.35, delay: 0.12 }, humanize: { time: 0.006, vel: 0.04 } }),
      tr('harp', 'ハープ', 'harp', arpeggio(prog, [0, 1, 2, 3, 4, 5, 4, 3], { oct: 3, step: 0.5, vel: 0.42, len: 1.2 }), { volume: -3, pan: -0.25, sends: { reverb: 0.35 }, humanize: { time: 0.005, vel: 0.05 } }),
      tr('cel', 'チェレスタ', 'celesta', arpeggio(prog, [2, 4, 3, 5], { oct: 5, step: 1, vel: 0.3, accent: 0.04 }).map(([t, n, d, v]) => [t + 0.5, n, d, v]), { volume: -10, pan: 0.35, sends: { reverb: 0.4, delay: 0.2 } }),
      tr('strings', 'ストリングス', 'strings', pads(prog, { oct: 4, vel: 0.42 }), { volume: -9, sends: { reverb: 0.35 } }),
      tr('bass', '低音', 'subbass', bassline(prog, [[0, 'r', 1.9, 0.6], [2, '5', 1.9, 0.5]]), { volume: -5 }),
      {
        id: 'perc', name: 'シェイカー', type: 'drums', kit: 'acoustic', volume: -8, sends: { reverb: 0.15 },
        clips: [{ at: 0, len: 64, grid: { shaker: rep('x.o.x.o.x.o.x.o.', 16), kick: rep('o...............', 16) } }],
      },
    ],
  };
}

/* ───────────── 7. 世界へ ───────────── */
function world() {
  const prog = progression(['A', 'F#m', 'D', 'E', 'A', 'C#m', 'D', 'E', 'F#m', 'D', 'A', 'E', 'F#m', 'D', 'Bm7', 'E']);
  const mel = [
    'E5/1 A5/1 B5/.5 C#6/.5 B5/1|A5/1 F#5/1 E5/2|F#5/1 A5/1 B5/1 A5/.5 F#5/.5|E5/3 r/1',
    'E5/1 A5/1 B5/.5 C#6/.5 E6/1|C#6/1 B5/1 G#5/2|A5/1 F#5/1 A5/.5 B5/.5 A5/1|B5/3 r/1',
    'C#6/1.5 B5/.5 A5/1 F#5/1|A5/1.5 F#5/.5 E5/2|E5/1 A5/1 C#6/1 E6/1|B5/2 G#5/2',
    'A5/1 C#6/1 B5/1 A5/1|F#5/1 A5/1 F#5/1 E5/1|D5/1 F#5/1 A5/1 B5/1|G#5/2 B5/2',
  ].join('|');
  return {
    name: 'Chiisana Chikyuugi', bpm: 96, loopBars: 16, key: 'A major',
    tracks: [
      tr('mar', 'マリンバ（旋律）', 'marimba', melody(mel, { vel: 0.62 }), { volume: 2, pan: 0.1, sends: { reverb: 0.25, delay: 0.08 }, humanize: { time: 0.005, vel: 0.05 } }),
      tr('kal', 'カリンバ', 'kalimba', arpeggio(prog, [0, 2, 1, 3, 2, 1, 3, 2], { oct: 4, step: 0.5, vel: 0.4 }), { volume: -4, pan: -0.3, sends: { reverb: 0.25 }, humanize: { time: 0.006, vel: 0.06 } }),
      tr('gtr', 'ギター', 'guitar', strums(prog, [[0, 1.4, 0.45], [1.5, 0.4, 0.3], [2.5, 1.4, 0.4]], { oct: 3, top: 1 }), { volume: -8, pan: 0.3, strum: 0.02 }),
      tr('strings', 'ストリングス', 'strings', pads(prog, { oct: 4, vel: 0.35 }), { volume: -14, sends: { reverb: 0.35 } }),
      tr('bass', 'ベース', 'ebass', bassline(prog, [[0, 'r', 1.4, 0.7], [1.5, '5', 0.4, 0.5], [2.5, 'r', 1.4, 0.6]]), { volume: -2 }),
      {
        id: 'perc', name: '手の打楽器', type: 'drums', kit: 'acoustic', volume: -5, sends: { reverb: 0.15 }, humanize: { time: 0.006 },
        clips: [{ at: 0, len: 64, grid: { tom3: rep('x.....x.....x...', 16), tom2: rep('......x.....x.x.', 16), perc: rep('..x.......x.....', 16), shaker: rep('x.oxx.oxx.oxx.ox', 16) } }],
      },
    ],
  };
}

/* ───────────── 8. 宇宙へ ───────────── */
function space() {
  const prog = progression(['Em', 'Cmaj7', 'G', 'D/F#', 'Em', 'Cmaj7', 'Am7', 'D', 'Cmaj7', 'D', 'Bm7', 'Em7', 'Cmaj7', 'D', 'Am7', 'B7']);
  const mel = [
    'B5/1.5 G5/.5 E5/1 F#5/1|G5/1.5 E5/.5 B5/2|D6/1.5 B5/.5 G5/1 A5/1|F#5/2 A5/2',
    'B5/1.5 G5/.5 E5/1 F#5/1|G5/1 B5/1 E6/2|C6/1.5 B5/.5 A5/1 G5/1|F#5/3 r/1',
    'E6/2 D6/1 B5/1|A5/2 F#5/1 A5/1|B5/1.5 A5/.5 F#5/1 D5/1|E5/2 G5/1 B5/1',
    'C6/1 B5/1 G5/1 E5/1|D6/1 A5/1 F#5/1 A5/1|G5/1 A5/1 B5/1 C6/1|B5/2 A5/1 F#5/1',
  ].join('|');
  return {
    name: 'Hoshikuzu no Kidou', bpm: 104, loopBars: 16, key: 'E minor',
    tracks: [
      tr('cel', 'チェレスタ（旋律）', 'celesta', melody(mel, { vel: 0.6 }), { volume: 3, sends: { reverb: 0.35, delay: 0.18 }, humanize: { time: 0.005, vel: 0.05 } }),
      tr('glock', 'グロッケン（旋律の重ね）', 'glock', melody(mel, { vel: 0.35, accent: 0 }), { volume: -11, transpose: 12, pan: 0.2, sends: { reverb: 0.4 } }),
      tr('arp', 'シンセの分散和音', { preset: 'pluck', filter: { cutoff: 1400 } }, arpeggio(prog, [0, 1, 2, 3, 4, 3, 2, 1], { oct: 4, step: 0.25, vel: 0.35, len: 0.2 }), { volume: -9, pan: -0.25, sends: { reverb: 0.25, delay: 0.3 } }),
      tr('pad', 'ガラスパッド', 'glasspad', pads(prog, { oct: 4, vel: 0.4 }), { volume: -10, sends: { reverb: 0.4 } }),
      tr('bass', 'ベース', 'subbass', bassline(prog, [[0, 'r', 0.9, 0.7], [1.5, 'r', 0.4, 0.5], [2, 'o', 0.9, 0.55], [3, '5', 0.9, 0.55]]), { volume: -3 }),
      {
        id: 'drums', name: 'ドラム', type: 'drums', kit: '808', volume: -6, sends: { reverb: 0.15 },
        clips: [{ at: 0, len: 64, grid: { kick: rep('x.........x.....', 16), snap: rep('........x.......', 16), hat: rep('..o...o...o...oo', 16) } }],
      },
    ],
  };
}

/* ───────────── 9. 銀河へ ───────────── */
function galaxy() {
  const prog = progression(['Dmaj7', 'E/D', 'Dmaj7', 'E/D', 'Bm7', 'C#m7', 'Gmaj7', 'A', 'Gmaj7', 'A', 'F#m7', 'Bm7', 'Gmaj7', 'A', 'Gmaj7', 'A']);
  const mel = [
    'A5/2 C#6/1 E6/1|B5/2 G#5/1 E5/1|F#5/2 A5/1 C#6/1|B5/3 r/1',
    'D6/1.5 C#6/.5 B5/1 A5/1|G#5/1 B5/1 E6/2|D6/1.5 B5/.5 F#5/2|E5/1 A5/1 C#6/2',
    'B5/2 D6/1 F#6/1|E6/2 C#6/1 A5/1|C#6/1.5 A5/.5 E5/2|F#5/1 A5/1 D6/2',
    'B5/1 A5/1 F#5/1 D5/1|E5/1 A5/1 C#6/1 E6/1|D6/2 B5/2|C#6/3 r/1',
  ].join('|');
  return {
    name: 'Ginga no Uzumaki', bpm: 90, loopBars: 16, key: 'D major (lydian)',
    tracks: [
      tr('mbox', 'オルゴール（旋律）', 'musicbox', melody(mel, { vel: 0.58 }), { volume: 3, sends: { reverb: 0.45, delay: 0.2 }, humanize: { time: 0.006, vel: 0.05 } }),
      tr('harp', 'ハープ（うずまき）', 'harp', arpeggio(prog, [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1], { oct: 3, step: 0.333333, vel: 0.36, len: 1 }), { volume: -6, pan: -0.3, sends: { reverb: 0.4, delay: 0.15 }, humanize: { time: 0.004, vel: 0.05 } }),
      tr('glass', 'ガラスパッド', 'glasspad', pads(prog, { oct: 4, vel: 0.42 }), { volume: -8, sends: { reverb: 0.45 } }),
      tr('air', '空気のパッド', 'airpad', pads(prog, { oct: 5, vel: 0.3 }), { volume: -14, pan: 0.2, sends: { reverb: 0.5 } }),
      tr('bass', '低音', 'subbass', bassline(prog, [[0, 'r', 3.8, 0.6]]), { volume: -4 }),
      {
        id: 'drums', name: 'ドラム', type: 'drums', kit: 'lofi', volume: -9, sends: { reverb: 0.25 },
        clips: [{ at: 0, len: 64, grid: { kick: rep('x.......x.......', 16), ride: rep('o...o...o...o...', 16) } }],
      },
    ],
  };
}

/* ───────────── 10. しゃぼん玉へ ───────────── */
function bubbles() {
  const prog = progression(['G', 'Bm/F#', 'Em', 'C', 'G/D', 'C', 'Am7', 'D7', 'Em', 'C', 'G', 'D/F#', 'Em', 'Am7', 'Cm', 'D7']);
  const mel = [
    'D5/.5 G5/.5 B5/.5 D6/.5 B5/1 G5/1|F#5/.5 B5/.5 D6/1 B5/1 F#5/1|G5/.5 B5/.5 E6/1 D6/.5 B5/.5 G5/1|E5/.5 G5/.5 C6/1 B5/1 A5/1',
    'B5/1 D6/.5 B5/.5 G5/1 D5/1|E5/1 G5/.5 E5/.5 C6/2|A5/.5 B5/.5 C6/.5 D6/.5 E6/1 C6/1|D6/2 C6/1 A5/1',
    'B5/1 G5/.5 B5/.5 E6/2|C6/1 G5/.5 C6/.5 E6/2|D6/.5 C6/.5 B5/.5 A5/.5 G5/1 B5/1|A5/2 F#5/1 D5/1',
    'G5/.5 A5/.5 B5/.5 G5/.5 E5/1 G5/1|C6/.5 B5/.5 A5/.5 G5/.5 E5/1 A5/1|D#5/1 G5/1 C6/2|A5/1 C6/1 F#5/1 D5/1',
  ].join('|');
  const bubbleAt = [6, 14.5, 22, 30.5, 38, 46.5, 54, 62.5];
  return {
    name: 'Shabondama no Uchuu', bpm: 92, loopBars: 16, key: 'G major',
    tracks: [
      tr('mbox', 'オルゴール（旋律）', 'musicbox', melody(mel, { vel: 0.6 }), { volume: 3, sends: { reverb: 0.35, delay: 0.12 }, humanize: { time: 0.006, vel: 0.05 } }),
      tr('bell', 'ベルキー（あわの音）', 'bellkeys', strums(prog, [[0.5, 0.3, 0.4], [1.5, 0.3, 0.35], [2.5, 0.3, 0.4], [3.5, 0.3, 0.35]], { oct: 4 }), { volume: -9, pan: -0.25, sends: { reverb: 0.3, delay: 0.15 } }),
      tr('cel', 'チェレスタ', 'celesta', arpeggio(prog, [3, 5, 4, 6], { oct: 4, step: 0.5, vel: 0.3, accent: 0.05 }).filter(([t]) => t % 4 >= 2), { volume: -9, pan: 0.35, sends: { reverb: 0.4, delay: 0.2 } }),
      tr('choir', 'クワイア（うー）', 'choiroo', pads(prog, { oct: 4, vel: 0.35 }), { volume: -12, sends: { reverb: 0.45 } }),
      tr('pizz', 'ピチカート（低音）', 'pizz', bassline(prog, [[0, 'r', 0.45, 0.8], [1, 'o', 0.45, 0.5], [2, '5', 0.45, 0.7], [3, 'o', 0.45, 0.5]]), { volume: 3, transpose: 12 }),
      tr('bass', '低音', 'subbass', bassline(prog, [[0, 'r', 1.8, 0.55], [2, '5', 1.8, 0.45]]), { volume: -8 }),
      {
        id: 'perc', name: 'リズム', type: 'drums', kit: 'lofi', volume: -7, sends: { reverb: 0.15 },
        clips: [{ at: 0, len: 64, grid: { kick: rep('x.......x.......', 16), snap: rep('....x.......x...', 16), shaker: rep('..o...o...o...o.', 16) } }],
      },
      { id: 'fx', name: 'しゃぼん玉', type: 'sfx', volume: -16, clips: bubbleAt.map((at, i) => ({ at, sfx: { preset: 'bubble', pitch: [0, 4, 7, 2][i % 4], seed: i + 1 }, gain: -2 })) },
    ],
  };
}

/* ───────────── 11. おしまい（ループしない） ───────────── */
function finale() {
  const intro = progression(['F', 'Am7', 'A#maj7', 'C7sus4']);
  const body = progression([...HOME_PROG_A, ...HOME_PROG_B]).map((c) => ({ ...c, t: c.t + 16 }));
  const outro = progression(['A#maj7', 'C7sus4', 'F', 'F']).map((c) => ({ ...c, t: c.t + 80 }));
  const all = [...intro, ...body, ...outro];
  const melA = melody(HOME_A, { start: 16, vel: 0.55, accent: 0.05 });
  const melB = melody(HOME_B, { start: 48, vel: 0.62, accent: 0.06 });
  const ending = melody('D5/2 F5/2|G5/2 E5/2|F5/4|r/4', { start: 80, vel: 0.5, accent: 0 });
  return {
    name: 'Mada Onaka ga Suiteru', bpm: 70, key: 'F major', fade: false, bars: 24, tail: 6,
    tracks: [
      tr('mbox', 'オルゴール（旋律）', 'musicbox', [...melA, ...ending], { volume: 3, sends: { reverb: 0.45, delay: 0.1 }, humanize: { time: 0.01, vel: 0.04 } }),
      tr('piano', 'ピアノ（旋律）', 'softpiano', melB, { volume: 4, sends: { reverb: 0.4 }, humanize: { time: 0.01, vel: 0.05 } }),
      tr('lh', 'ピアノ（分散和音）', 'softpiano', [
        ...arpeggio(all, [0, 1, 2, 3, 2, 1, 4, 2], { oct: 3, step: 0.5, vel: 0.3, len: 1.5, accent: 0.06 }).filter(([t]) => t < 88),
        ...chord('F', 3).tones.map((n) => [88, n, 8, 0.35]),
      ], { volume: -2, pan: -0.15, sends: { reverb: 0.4 }, humanize: { time: 0.012, vel: 0.05 } }),
      tr('strings', 'ストリングス', 'strings', pads([...body, ...outro], { oct: 4, vel: 0.45 }), {
        volume: -8, sends: { reverb: 0.45 }, auto: { volume: [[16, -16], [44, -8], [48, -2], [76, 0], [84, -4], [96, -24]] },
      }),
      tr('bass', '低音', 'subbass', bassline([...body, ...outro], [[0, 'r', 3.8, 0.5]]).filter(([t]) => t < 92), { volume: -6, auto: { volume: [[16, -10], [48, 0]] } }),
      { id: 'fx', name: 'きらきら', type: 'sfx', volume: -14, clips: [{ at: 88, sfx: { preset: 'sparkle', length: 2.5, space: 0.7 }, gain: -4 }] },
    ],
  };
}

/** id → 曲。場面の説明は試聴ページとゲームの両方で使う */
export const SONGS = [
  { id: 'home', title: 'ほこりちゃんのへや', scene: 'おうち（朝〜夕方）', make: home },
  { id: 'night', title: 'おひるねのこもりうた', scene: 'おうち（夜・ほこりちゃんがねているとき）', make: night },
  { id: 'town', title: 'まちをさんぽ', scene: 'まち', make: town },
  { id: 'cleaning', title: 'おそうじタイム', scene: 'おそうじ（家・町の掃除場所）', make: cleaning },
  { id: 'contest', title: '大そうじ大会', scene: '町内会の大そうじ大会', make: contest },
  { id: 'sky', title: 'ふわふわ雲にのって', scene: '空へ', make: sky },
  { id: 'world', title: 'ちいさな地球儀', scene: '世界へ', make: world },
  { id: 'space', title: 'ほしくずの軌道', scene: '宇宙へ', make: space },
  { id: 'galaxy', title: '銀河のうずまき', scene: '銀河へ', make: galaxy },
  { id: 'bubbles', title: 'しゃぼん玉のうちゅう', scene: 'しゃぼん玉へ（終章）', make: bubbles },
  { id: 'finale', title: 'まだおなかがすいてる', scene: 'おしまいの場面（ループしない）', make: finale },
];
