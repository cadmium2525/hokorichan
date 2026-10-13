// キャラクターのドット絵ジェネレーター（「ピクセルアート設定資料 Ver.1」準拠）。
// 楕円・矩形などの部品に「左上から光が当たる」球/円柱の陰影を付けて塗り、最後に外側へ1pxの輪郭を足す。
// DOM や Canvas に依存しない純粋な関数なので、Node のテストでも検証できる。

export const CHAR_W = 32;
export const CHAR_H = 32;

export type CharacterId = 'boy' | 'girl' | 'mother' | 'friend' | 'friendMom' | 'shopkeeper' | 'florist' | 'baker' | 'grandma' | 'stationMaster' | 'teacher' | 'agent' | 'controller';
export type Facing = 'down' | 'up' | 'left' | 'right';
export type Pose = 'idle' | 'walk' | 'run' | 'clean' | 'wipe' | 'surprise' | 'joy' | 'talk' | 'give';
/** 掃除ポーズで手に持つ道具。hand（素手）と rag（ぞうきん）はしゃがんで拭く */
export type HeldTool = 'hand' | 'rag' | 'broom' | 'mop' | 'vacuum';
type StickTool = 'broom' | 'mop' | 'vacuum';

export const FRAMES = 4;

export type CharacterFrame = {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray;
  /** 道具の先（床に当たる点）のピクセル座標。掃除ポーズのみ */
  tip: { x: number; y: number } | null;
};

// ---- 色 ----

/** 明るい→ふつう→かげ→輪郭 の4段階 */
type Ramp = readonly [string, string, string, string];

const RAMPS = {
  skin: ['#fde7d6', '#f6d0b6', '#e8b294', '#9a5a48'],
  white: ['#ffffff', '#f6f0ea', '#dcd0c6', '#8a7a70'],
  coin: ['#fff3a8', '#f6d55c', '#d9a83a', '#8a6420'],
} as const satisfies Record<string, Ramp>;

const EYE = '#3b2622';
const EYE_SHINE = '#ffffff';
const BLUSH = '#f4a7b9';
const MOUTH = '#c0606e';
const MOUTH_IN = '#8e3a48';
const MARK = '#f2635a';
const SPARKLE = '#fbe85a';
const SPARKLE_IN = '#ffffff';

type Look = {
  hair: Ramp;
  /** 上の服（ワンピースならワンピース） */
  top: Ramp;
  /** ズボン（null ならワンピース） */
  bottom: Ramp | null;
  shoes: Ramp;
  style: 'short' | 'bob' | 'bun' | 'chef' | 'cap';
  apron?: Ramp;
  pocket?: string;
  clip?: string;
  glasses?: boolean;
};

const HAIR = {
  boy: ['#9a6a50', '#6b4a3a', '#4e3226', '#2e1a14'],
  girl: ['#a87050', '#7a4e38', '#5a3426', '#331c14'],
  mom: ['#b07a56', '#8a5a3c', '#6b4230', '#3a2218'],
  ginger: ['#e0955a', '#c0703a', '#93502a', '#4e2a16'],
  dark: ['#6a4c40', '#4a332a', '#33231c', '#1c120e'],
  grey: ['#f4f1ec', '#d9d4cc', '#b3aca2', '#6b625a'],
  plum: ['#a98ab8', '#7a5a8c', '#5a4068', '#30223a'],
} as const satisfies Record<string, Ramp>;

const CLOTH = {
  sky: ['#d6ebfa', '#9fc8ea', '#6f9fcb', '#3e5f86'],
  navy: ['#7f9cc4', '#5d7aa8', '#435a82', '#26344e'],
  pink: ['#fdd8e0', '#f4a7b9', '#d9798f', '#8e4558'],
  lavender: ['#ebe2f8', '#c7b4e6', '#9a86c6', '#5b4a82'],
  shoePink: ['#ffc8d2', '#f08a9a', '#c95f72', '#7a3040'],
  shoeBrown: ['#c08a64', '#a0644a', '#7a4632', '#3e2218'],
  mint: ['#d4f0e4', '#9fd8c4', '#6fb7a0', '#3a6e5e'],
  teal: ['#8fd0c0', '#5fae9c', '#3f8a7a', '#1f4a40'],
  sun: ['#fff0b8', '#f6d55c', '#d9b03a', '#7a5c18'],
  leaf: ['#c6e6a8', '#9cc97e', '#74a35a', '#3a5a2c'],
  orange: ['#f8d0a0', '#e8a868', '#c07c42', '#6a3e1e'],
  purple: ['#cdbdea', '#a58fd0', '#7d6aa8', '#43386a'],
  uniform: ['#8fa6d0', '#5d74a8', '#435a82', '#222e48'],
  coral: ['#f8e2a8', '#e8c070', '#c0944a', '#6a4a20'],
  capNavy: ['#6f84b0', '#3e5076', '#2c3a58', '#161e30'],
  suit: ['#8a8696', '#5a5664', '#43404c', '#22202a'],
  flight: ['#fbe0c8', '#f0a870', '#c8784a', '#6a3a1e'],
} as const satisfies Record<string, Ramp>;

const LOOKS: Record<CharacterId, Look> = {
  boy: { hair: HAIR.boy, top: CLOTH.sky, bottom: CLOTH.navy, shoes: CLOTH.shoePink, style: 'short' },
  girl: { hair: HAIR.girl, top: CLOTH.pink, bottom: null, shoes: CLOTH.shoePink, style: 'bob', clip: '#f08a9a' },
  mother: { hair: HAIR.mom, top: CLOTH.lavender, bottom: null, shoes: CLOTH.shoeBrown, style: 'bun', apron: RAMPS.white, pocket: '#f4a7b9' },
  friend: { hair: HAIR.ginger, top: CLOTH.mint, bottom: CLOTH.teal, shoes: CLOTH.sun, style: 'short' },
  friendMom: { hair: HAIR.dark, top: CLOTH.mint, bottom: null, shoes: CLOTH.shoeBrown, style: 'bun', apron: RAMPS.white, pocket: '#f6d55c' },
  shopkeeper: { hair: HAIR.plum, top: CLOTH.sun, bottom: null, shoes: CLOTH.shoeBrown, style: 'bob', apron: RAMPS.white, pocket: '#f08a9a' },
  florist: { hair: HAIR.girl, top: CLOTH.leaf, bottom: null, shoes: CLOTH.shoeBrown, style: 'bun', apron: RAMPS.white, pocket: '#f4a7b9' },
  baker: { hair: HAIR.dark, top: CLOTH.orange, bottom: null, shoes: CLOTH.shoeBrown, style: 'chef', apron: RAMPS.white, pocket: '#c07c42' },
  grandma: { hair: HAIR.grey, top: CLOTH.purple, bottom: null, shoes: CLOTH.shoeBrown, style: 'bun', glasses: true },
  stationMaster: { hair: HAIR.dark, top: CLOTH.uniform, bottom: CLOTH.navy, shoes: CLOTH.shoeBrown, style: 'cap' },
  teacher: { hair: HAIR.mom, top: CLOTH.coral, bottom: CLOTH.navy, shoes: CLOTH.shoeBrown, style: 'bob', glasses: true },
  agent: { hair: HAIR.dark, top: CLOTH.suit, bottom: CLOTH.suit, shoes: CLOTH.shoeBrown, style: 'short', glasses: true },
  // 宇宙ほこり管制センターの管制官（オレンジの飛行服、ヘッドセットの水色ランプ）
  controller: { hair: HAIR.plum, top: CLOTH.flight, bottom: CLOTH.flight, shoes: CLOTH.shoeBrown, style: 'bob', clip: '#7fd0d0' },
};

const TOOL_RAMPS: Record<StickTool, { stick: Ramp; head: Ramp }> = {
  broom: { stick: CLOTH.shoeBrown, head: ['#fbe6a8', '#e8c070', '#c0944a', '#6a4a20'] },
  mop: { stick: CLOTH.purple, head: RAMPS.white },
  vacuum: { stick: ['#c8d8f0', '#8fa8d8', '#5d7aa8', '#26344e'], head: CLOTH.navy },
};

// ---- 描画バッファ ----

const L = normalize(-0.55, -0.75, 0.65);

function normalize(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

/** 面の向き（法線）から 0:明るい 1:ふつう 2:かげ を決める */
function toneOf(nx: number, ny: number, nz: number): number {
  const d = nx * L[0] + ny * L[1] + nz * L[2];
  if (d > 0.72) return 0;
  if (d > 0.18) return 1;
  return 2;
}

/** 顔など、かげを控えめにしたいところ */
function softToneOf(nx: number, ny: number, nz: number): number {
  const d = nx * L[0] + ny * L[1] + nz * L[2];
  if (d > 0.9) return 0;
  if (d > -0.15) return 1;
  return 2;
}

class Canvas {
  readonly ramp: (Ramp | null)[];
  readonly tone: Uint8Array;
  /** 色を直接指定したピクセル（顔のパーツなど） */
  readonly flat: (string | null)[];
  /** 輪郭を付けない（あとから足すマークなど） */
  readonly noOutline: Uint8Array;
  readonly w: number;
  readonly h: number;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.ramp = new Array(w * h).fill(null);
    this.tone = new Uint8Array(w * h);
    this.flat = new Array(w * h).fill(null);
    this.noOutline = new Uint8Array(w * h);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  set(x: number, y: number, ramp: Ramp, tone: number): void {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.ramp[i] = ramp;
    this.tone[i] = tone;
    this.flat[i] = null;
  }

  dot(x: number, y: number, color: string, noOutline = false): void {
    if (!this.inside(x, y)) return;
    const i = y * this.w + x;
    this.flat[i] = color;
    if (noOutline) this.noOutline[i] = 1;
  }

  filled(x: number, y: number): boolean {
    if (!this.inside(x, y)) return false;
    const i = y * this.w + x;
    return this.ramp[i] !== null || this.flat[i] !== null;
  }

  /** 球のように陰影を付けた楕円 */
  ellipse(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, clip?: (x: number, y: number) => boolean, soft = false): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        const d2 = u * u + v * v;
        if (d2 > 1) continue;
        if (clip && !clip(x, y)) continue;
        this.set(x, y, ramp, soft ? softToneOf(u, v, Math.sqrt(1 - d2)) : toneOf(u, v, Math.sqrt(1 - d2)));
      }
    }
  }

  /** 円柱のように左右で陰影を付けた矩形（両端を含む） */
  rect(x0: number, y0: number, x1: number, y1: number, ramp: Ramp, opts: { flatTone?: number; bottomShade?: boolean } = {}): void {
    const cx = (x0 + x1 + 1) / 2;
    const hw = (x1 - x0 + 1) / 2;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let t: number;
        if (opts.flatTone !== undefined) t = opts.flatTone;
        else {
          const u = Math.max(-0.98, Math.min(0.98, (x + 0.5 - cx) / hw));
          t = toneOf(u, -0.25, Math.sqrt(1 - u * u));
        }
        if (opts.bottomShade && y === y1) t = Math.max(t, 2);
        this.set(x, y, ramp, t);
      }
    }
  }

  /** 台形（ワンピースのすそ）。上辺 x0..x1 から下辺 x0-spread..x1+spread へ広がる */
  skirt(x0: number, x1: number, y0: number, y1: number, spread: number, ramp: Ramp): void {
    for (let y = y0; y <= y1; y++) {
      const k = y1 === y0 ? 1 : (y - y0) / (y1 - y0);
      const s = Math.round(spread * k);
      const a = x0 - s;
      const b = x1 + s;
      const cx = (a + b + 1) / 2;
      const hw = (b - a + 1) / 2;
      for (let x = a; x <= b; x++) {
        const u = Math.max(-0.98, Math.min(0.98, (x + 0.5 - cx) / hw));
        let t = toneOf(u, -0.2, Math.sqrt(1 - u * u));
        if (y === y1) t = Math.max(t, 2);
        this.set(x, y, ramp, t);
      }
    }
  }

  /** 太さ1〜2pxの線（道具の柄） */
  line(x0: number, y0: number, x1: number, y1: number, ramp: Ramp, thick = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n);
      const y = Math.round(y0 + ((y1 - y0) * i) / n);
      this.set(x, y, ramp, 1);
      if (thick > 1) this.set(x + 1, y, ramp, 2);
    }
  }

  /** 外側に1pxの輪郭を足す。色はとなりの部品のいちばん暗い色 */
  outline(): void {
    const add: Array<[number, string]> = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.filled(x, y)) continue;
        let color: string | null = null;
        // 下と横を優先（足元・体の輪郭が自然に暗くなる）
        for (const [dx, dy] of [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inside(nx, ny)) continue;
          const j = ny * this.w + nx;
          if (this.noOutline[j]) continue;
          const r = this.ramp[j];
          if (r) {
            color = r[3];
            break;
          }
          if (this.flat[j]) color = EYE;
        }
        if (color) add.push([y * this.w + x, color]);
      }
    }
    for (const [i, c] of add) this.flat[i] = c;
  }

  toRGBA(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h; i++) {
      const c = this.flat[i] ?? (this.ramp[i] ? this.ramp[i]![this.tone[i]] : null);
      if (!c) continue;
      out[i * 4] = parseInt(c.slice(1, 3), 16);
      out[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
      out[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}

// ---- ポーズ ----

type Limb = { dx: number; dy: number };

type Rig = {
  /** 上半身（頭と胴）の上下 */
  bob: number;
  /** 体全体を左右にずらす（走りの前傾など） */
  lean: number;
  legL: Limb;
  legR: Limb;
  armL: Limb & { up?: boolean };
  armR: Limb & { up?: boolean; out?: boolean };
  face: 'smile' | 'blink' | 'open' | 'o' | 'happy';
  crouch: number;
};

function baseRig(): Rig {
  return {
    bob: 0,
    lean: 0,
    legL: { dx: 0, dy: 0 },
    legR: { dx: 0, dy: 0 },
    armL: { dx: 0, dy: 0 },
    armR: { dx: 0, dy: 0 },
    face: 'smile',
    crouch: 0,
  };
}

function rigFor(pose: Pose, frame: number, side: boolean): Rig {
  const r = baseRig();
  const f = ((frame % FRAMES) + FRAMES) % FRAMES;
  switch (pose) {
    case 'idle':
      r.bob = f === 1 || f === 2 ? 1 : 0;
      if (f === 3) r.face = 'blink';
      break;
    case 'walk':
    case 'run': {
      const big = pose === 'run' ? 2 : 1;
      const s = [1, 0, -1, 0][f];
      r.bob = f % 2 === 1 ? -1 : 0;
      if (side) {
        r.legL = { dx: -2 * s * big, dy: 0 };
        r.legR = { dx: 2 * s * big, dy: 0 };
        r.armL = { dx: 2 * s * big, dy: 0 };
        r.armR = { dx: -2 * s * big, dy: 0 };
        if (pose === 'run') r.lean = -1;
      } else {
        r.legL = { dx: 0, dy: s > 0 ? -big : 0 };
        r.legR = { dx: 0, dy: s < 0 ? -big : 0 };
        r.armL = { dx: 0, dy: s * big };
        r.armR = { dx: 0, dy: -s * big };
      }
      if (pose === 'run') r.face = 'open';
      break;
    }
    case 'surprise':
      r.bob = [-2, -1, 0, 0][f];
      r.legL.dy = r.legR.dy = r.bob < 0 ? r.bob : 0;
      r.armL = { dx: 0, dy: -2, up: true };
      r.armR = { dx: 0, dy: -2, up: true };
      r.face = 'o';
      break;
    case 'joy':
      r.bob = [0, -2, -1, 0][f];
      r.legL.dy = r.legR.dy = r.bob;
      r.armL = { dx: 0, dy: 0, up: true };
      r.armR = { dx: 0, dy: 0, up: true };
      r.face = 'happy';
      break;
    case 'talk':
      r.face = f % 2 === 0 ? 'open' : 'smile';
      r.armR = { dx: 0, dy: f % 2 === 0 ? -1 : 0 };
      break;
    case 'give':
      r.bob = f === 2 ? 1 : 0;
      r.armR = { dx: 0, dy: 0, out: true };
      r.face = 'happy';
      break;
    case 'clean':
      r.bob = f % 2;
      r.lean = -1;
      break;
    case 'wipe':
      r.crouch = 4;
      break;
  }
  return r;
}

// ---- 部品 ----

function drawLegs(c: Canvas, look: Look, rig: Rig, facing: Facing, top: number): void {
  const side = facing === 'left' || facing === 'right';
  const bottom = 30;
  const legs: Array<[number, Limb]> = side
    ? [
        [14, rig.legL],
        [16, rig.legR],
      ]
    : [
        [12, rig.legL],
        [17, rig.legR],
      ];
  for (const [x, l] of legs) {
    const x0 = x + l.dx + rig.lean;
    const yEnd = bottom + l.dy;
    // 足（肌）と靴
    c.rect(x0, top, x0 + 2, yEnd - 2, RAMPS.skin);
    if (side) c.rect(x0 - 1, yEnd - 1, x0 + 2, yEnd, look.shoes, { bottomShade: true });
    else c.rect(x0, yEnd - 1, x0 + 2, yEnd, look.shoes, { bottomShade: true });
  }
}

function drawBody(c: Canvas, look: Look, rig: Rig, facing: Facing, y0: number): number {
  const side = facing === 'left' || facing === 'right';
  const lx = rig.lean;
  const dress = look.bottom === null;
  const long = look.style === 'bun' || look.style === 'chef' || !!look.apron;
  // 胴
  const tx0 = side ? 12 + lx : 11;
  const tx1 = side ? 19 + lx : 20;
  let legTop: number;
  if (dress) {
    const yEnd = long ? 27 : 26;
    c.rect(tx0, y0, tx1, y0 + 4, look.top);
    c.skirt(tx0, tx1, y0 + 5, yEnd - rig.crouch, side ? 1 : 2, look.top);
    if (look.apron && facing !== 'up') {
      const ax0 = side ? (facing === 'left' ? tx0 - 1 : tx1 - 3) : 13;
      const ax1 = side ? (facing === 'left' ? tx0 + 2 : tx1 + 1) : 18;
      c.rect(ax0, y0 + 2, ax1, yEnd - 1 - rig.crouch, look.apron, { flatTone: 1 });
      if (!side) {
        // ひもと胸あて
        c.set(13, y0, look.apron, 0);
        c.set(18, y0, look.apron, 0);
        if (look.pocket) for (let x = 14; x <= 17; x++) for (let y = y0 + 6; y <= y0 + 7; y++) c.dot(x, y - rig.crouch, look.pocket);
      }
    } else if (!look.apron && facing === 'down') {
      // えり
      for (let x = 14; x <= 17; x++) c.set(x, y0, RAMPS.white, x < 16 ? 0 : 1);
    }
    legTop = yEnd + 1 - rig.crouch;
  } else {
    c.rect(tx0, y0, tx1, y0 + 5, look.top);
    if (facing === 'down') for (let x = 14; x <= 17; x++) c.set(x, y0, RAMPS.white, x < 16 ? 0 : 1);
    c.rect(tx0, y0 + 6 - rig.crouch, tx1, y0 + 8 - rig.crouch, look.bottom!, { bottomShade: true });
    legTop = y0 + 9 - rig.crouch;
  }
  return legTop;
}

function drawArms(c: Canvas, look: Look, rig: Rig, facing: Facing, y0: number, tool: HeldTool | null, frame: number): { x: number; y: number } | null {
  const side = facing === 'left' || facing === 'right';
  if (rig.crouch > 0 || tool) return null; // 掃除ポーズは別に描く
  if (side) {
    // 手前の腕だけ見える
    const a = rig.armL;
    const x = 15 + rig.lean + Math.round(a.dx / 2);
    c.rect(x, y0 + 1, x + 1, y0 + 3, look.top);
    c.rect(x + Math.sign(a.dx), y0 + 4, x + 1 + Math.sign(a.dx), y0 + 5, RAMPS.skin);
    return null;
  }
  for (const [x, a] of [
    [9, rig.armL],
    [21, rig.armR],
  ] as const) {
    const out = 'out' in a && a.out;
    if ('up' in a && a.up) {
      // ばんざい
      const dir = x < 16 ? -1 : 1;
      c.rect(x, y0 - 1 + a.dy, x + 1, y0 + 1 + a.dy, look.top);
      c.rect(x + dir, y0 - 4 + a.dy, x + 1 + dir, y0 - 2 + a.dy, RAMPS.skin);
    } else if (out) {
      // 手を前にさしだす（お小遣いを渡す）
      c.rect(x, y0 + 1, x + 2, y0 + 2, look.top);
      c.rect(x + 3, y0 + 1, x + 4, y0 + 2, RAMPS.skin);
      c.ellipse(x + 6.5, y0 + 1.5 + (frame % 2 === 0 ? 0 : -1), 2, 2, RAMPS.coin);
      c.dot(x + 6, y0 + 1 + (frame % 2 === 0 ? 0 : -1), '#fffbe0');
    } else {
      c.rect(x, y0 + 1 + a.dy, x + 1, y0 + 3 + a.dy, look.top);
      c.rect(x, y0 + 4 + a.dy, x + 1, y0 + 5 + a.dy, RAMPS.skin);
    }
  }
  return null;
}

function drawHead(c: Canvas, look: Look, rig: Rig, facing: Facing, dy: number): void {
  const cx = 16 + rig.lean;
  const cy = (look.style === 'bun' || look.style === 'chef' ? 11 : 10) + dy;
  const hair = look.hair;
  const side = facing === 'left' || facing === 'right';
  const back = facing === 'up';
  // 後ろ髪（おかっぱは肩まで）
  if (look.style === 'bob') {
    if (side) c.rect(cx - 2, cy + 1, cx + 6, cy + 8, hair);
    else c.rect(cx - 9, cy, cx + 8, cy + 7, hair);
  }
  // お団子・コック帽
  if (look.style === 'bun') {
    if (side) c.ellipse(cx + 5.5, cy - 6, 3, 3, hair);
    else c.ellipse(cx, cy - 8.5, 3.5, 3, hair);
  }
  // 頭（髪）
  c.ellipse(cx, cy, 8.5, 8, hair);
  if (back) {
    // 後ろ姿：うなじと髪のすじ
    c.rect(cx - 2, cy + 7, cx + 1, cy + 7, RAMPS.skin, { flatTone: 2 });
    for (const x of [cx - 4, cx + 1, cx + 5]) c.set(x, cy + 3, hair, 2);
    hairShine(c, cx, cy, hair, facing);
    hat(c, look, cx, cy, side);
    return;
  }
  // 顔
  if (side) {
    c.ellipse(cx - 2, cy + 2, 6, 5.6, RAMPS.skin, (x) => x <= cx + 2, true);
    // 前髪
    c.ellipse(cx - 1, cy - 3.5, 7.5, 4.5, hair, (x) => x <= cx + 6);
    for (const x of [cx - 6, cx - 3]) c.set(x, cy + 1, hair, 1);
    // 耳
    c.rect(cx + 2, cy + 2, cx + 3, cy + 3, RAMPS.skin, { flatTone: 1 });
    c.set(cx + 3, cy + 3, RAMPS.skin, 2);
  } else {
    c.ellipse(cx, cy + 2, 6.5, 5.6, RAMPS.skin, undefined, true);
    // 前髪（ぎざぎざの毛先）
    c.ellipse(cx, cy - 3.5, 8, 4.5, hair);
    for (const x of [cx - 5, cx - 1, cx + 3]) c.set(x, cy + 1, hair, 1);
    if (look.style === 'short' || look.style === 'cap') {
      c.rect(cx - 8, cy + 2, cx - 8, cy + 3, RAMPS.skin, { flatTone: 1 });
      c.rect(cx + 7, cy + 2, cx + 7, cy + 3, RAMPS.skin, { flatTone: 2 });
    }
  }
  hairShine(c, cx, cy, hair, facing);
  hat(c, look, cx, cy, side);
  face(c, look, rig, facing, cx, cy);
}

/** 髪のつや（ハイライトの弧） */
function hairShine(c: Canvas, cx: number, cy: number, hair: Ramp, facing: Facing): void {
  const off = facing === 'left' ? -1 : facing === 'right' ? 1 : 0;
  const pts =
    facing === 'up'
      ? [
          [-4, -5],
          [-3, -6],
          [-2, -6],
          [-1, -6],
          [-5, -4],
        ]
      : [
          [-5, -5],
          [-4, -6],
          [-3, -6],
          [-2, -6],
        ];
  for (const [x, y] of pts) c.set(cx + x + off, cy + y, hair, 0);
}

function hat(c: Canvas, look: Look, cx: number, cy: number, side: boolean): void {
  if (look.style === 'chef') {
    c.ellipse(cx + (side ? 1 : 0), cy - 9, 5.5, 3.5, RAMPS.white);
    c.rect(cx - 5, cy - 7, cx + 4, cy - 5, RAMPS.white);
  }
  if (look.style === 'cap') {
    // 駅長さんの制帽：紺の帽子に黒いつば、金のしるし
    c.ellipse(cx, cy - 5, 8.6, 4.2, CLOTH.capNavy);
    if (side) c.rect(cx - 10, cy - 2, cx - 4, cy - 2, CLOTH.capNavy, { flatTone: 3 });
    else c.rect(cx - 7, cy - 2, cx + 6, cy - 2, CLOTH.capNavy, { flatTone: 3 });
    c.dot(side ? cx - 4 : cx - 1, cy - 5, '#f6d55c');
    c.dot(side ? cx - 3 : cx, cy - 5, '#f6d55c');
  }
  if (look.clip && !side) {
    c.dot(cx + 4, cy - 5, look.clip);
    c.dot(cx + 5, cy - 5, look.clip);
    c.dot(cx + 5, cy - 6, look.clip);
  }
}

function face(c: Canvas, look: Look, rig: Rig, facing: Facing, cx: number, cy: number): void {
  // 目は 2×3 のたて長。左上に白いハイライト
  const ey = cy + 3;
  const front = facing === 'down';
  const eyes = front ? [cx - 5, cx + 3] : [cx - 6];
  for (const ex of eyes) {
    switch (rig.face) {
      case 'blink':
        c.dot(ex, ey + 1, EYE);
        c.dot(ex + 1, ey + 1, EYE);
        break;
      case 'happy':
        // ^ ^
        c.dot(ex, ey, EYE);
        c.dot(ex + 1, ey - 1, EYE);
        if (front) c.dot(ex + 2, ey, EYE);
        else c.dot(ex - 1, ey, EYE);
        break;
      case 'o':
        for (let y = ey - 2; y <= ey + 1; y++) {
          c.dot(ex, y, EYE);
          c.dot(ex + 1, y, EYE);
        }
        c.dot(ex, ey - 1, EYE_SHINE);
        break;
      default:
        for (let y = ey - 1; y <= ey + 1; y++) {
          c.dot(ex, y, EYE);
          c.dot(ex + 1, y, EYE);
        }
        c.dot(ex, ey - 1, EYE_SHINE);
    }
  }
  if (look.glasses) {
    for (const ex of eyes) {
      for (let x = ex - 1; x <= ex + 2; x++) {
        c.dot(x, ey - 2, '#8a6a9a');
        c.dot(x, ey + 2, '#8a6a9a');
      }
      for (let y = ey - 1; y <= ey + 1; y++) {
        c.dot(ex - 1, y, '#8a6a9a');
        c.dot(ex + 2, y, '#8a6a9a');
      }
    }
  }
  // ほっぺ
  const blush = front ? [cx - 7, cx + 5] : [cx - 3];
  for (const bx of blush) {
    c.dot(bx, ey + 2, BLUSH);
    c.dot(bx + 1, ey + 2, BLUSH);
  }
  // 口
  const mx = front ? cx - 1 : cx - 7;
  const my = ey + 2;
  switch (rig.face) {
    case 'open':
    case 'happy':
      c.dot(mx, my, MOUTH_IN);
      c.dot(mx + 1, my, MOUTH_IN);
      c.dot(mx, my + 1, MOUTH);
      c.dot(mx + 1, my + 1, MOUTH);
      break;
    case 'o':
      c.dot(mx, my, MOUTH_IN);
      c.dot(mx + 1, my, MOUTH_IN);
      c.dot(mx, my + 1, MOUTH_IN);
      c.dot(mx + 1, my + 1, MOUTH_IN);
      break;
    default:
      if (front) {
        // にっこり（ω を小さくした形）
        c.dot(mx, my + 1, MOUTH);
        c.dot(mx + 1, my + 1, MOUTH);
        c.dot(mx - 1, my, MOUTH);
        c.dot(mx + 2, my, MOUTH);
      } else {
        c.dot(mx, my, MOUTH);
        c.dot(mx + 1, my + 1, MOUTH);
      }
  }
}

// ---- 掃除ポーズ（左向き。右向きは鏡像） ----

function drawCleaning(c: Canvas, look: Look, rig: Rig, tool: HeldTool, frame: number): { x: number; y: number } {
  const f = frame % FRAMES;
  if (tool === 'hand' || tool === 'rag') {
    // しゃがんで手でふく：肩から前下へ腕をのばす
    const reach = [0, -2, -3, -1][f];
    const hx = 8 + reach;
    const hy = 27;
    c.line(14, 23, hx + 2, hy - 1, look.top, 2);
    if (tool === 'rag') c.rect(hx - 2, hy + 1, hx + 2, hy + 2, TOOL_RAMPS.broom.head, { bottomShade: true });
    c.rect(hx, hy - 1, hx + 1, hy, RAMPS.skin);
    return { x: hx, y: 30 };
  }
  const push = [0, -1, -2, -1][f];
  const hx = 8 + push;
  const hy = 22 + rig.bob;
  const tip = { x: 2 + push * 2, y: 30 };
  const ramps = TOOL_RAMPS[tool as StickTool];
  // 柄（手の少し上から床まで）
  c.line(hx + 3, hy - 4, tip.x + 1, tip.y - 2, ramps.stick);
  // 先
  if (tool === 'broom') {
    c.skirt(tip.x - 1, tip.x + 1, tip.y - 3, tip.y, 1, ramps.head);
  } else if (tool === 'mop') {
    c.rect(tip.x - 2, tip.y - 1, tip.x + 3, tip.y, ramps.head);
  } else {
    c.rect(tip.x - 2, tip.y - 1, tip.x + 3, tip.y, ramps.head, { bottomShade: true });
    c.set(tip.x + 1, tip.y - 2, ramps.head, 1);
  }
  // 腕（肩から柄をにぎる手まで）
  c.line(14, 19 + rig.bob, hx + 3, hy - 1, look.top, 2);
  c.rect(hx + 1, hy - 2, hx + 2, hy - 1, RAMPS.skin);
  return tip;
}

// ---- エフェクト ----

function marks(c: Canvas, pose: Pose, frame: number): void {
  if (pose === 'surprise') {
    const x = 27;
    for (let y = 1; y <= 4; y++) c.dot(x, y, MARK, true);
    for (let y = 1; y <= 3; y++) c.dot(x + 1, y, MARK, true);
    c.dot(x, 6, MARK, true);
    c.dot(x + 1, 6, MARK, true);
  }
  if (pose === 'joy') {
    const big = frame % 2 === 0;
    const sx = 27;
    const sy = 4;
    c.dot(sx, sy, SPARKLE_IN, true);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      c.dot(sx + dx, sy + dy, SPARKLE, true);
    if (big) for (const [dx, dy] of [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ])
      c.dot(sx + dx, sy + dy, SPARKLE, true);
  }
}

// ---- 公開API ----

export type CharacterSpec = {
  id: CharacterId;
  facing: Facing;
  pose: Pose;
  frame: number;
  /** clean ポーズで持つ道具（省略時はほうき）。wipe ポーズは素手 */
  tool?: HeldTool;
};

/** 1コマを生成する */
export function drawCharacter(spec: CharacterSpec): CharacterFrame {
  const look = LOOKS[spec.id];
  // 掃除は横向き（左）で描く。正面などを指定されても横向きにする
  let facing = spec.facing;
  const cleaning = spec.pose === 'clean' || spec.pose === 'wipe';
  if (cleaning && (facing === 'down' || facing === 'up')) facing = 'left';
  const mirror = facing === 'right';
  const drawFacing: Facing = mirror ? 'left' : facing;
  const side = drawFacing === 'left';
  const tool: HeldTool | null = spec.pose === 'clean' ? (spec.tool ?? 'broom') : spec.pose === 'wipe' ? (spec.tool ?? 'hand') : null;
  const crouching = tool === 'hand' || tool === 'rag';
  const rig = rigFor(crouching ? 'wipe' : spec.pose, spec.frame, side);
  const c = new Canvas(CHAR_W, CHAR_H);

  const torsoY = 17 + rig.bob + rig.crouch;
  const headY = rig.bob + rig.crouch;
  // 奥から順に描く：脚 → 胴 → 腕 → 頭
  const legTop = drawBody(new Canvas(CHAR_W, CHAR_H), look, rig, drawFacing, torsoY); // 脚の付け根を知るため
  drawLegs(c, look, rig, drawFacing, Math.min(legTop, 29));
  drawBody(c, look, rig, drawFacing, torsoY);
  let tip: { x: number; y: number } | null = null;
  if (tool) tip = drawCleaning(c, look, rig, tool, spec.frame);
  else drawArms(c, look, rig, drawFacing, torsoY, null, spec.frame);
  drawHead(c, look, rig, drawFacing, headY);
  c.outline();
  marks(c, spec.pose, spec.frame);

  let data = c.toRGBA();
  if (mirror) {
    data = mirrorRGBA(data, CHAR_W, CHAR_H);
    if (tip) tip = { x: CHAR_W - 1 - tip.x, y: tip.y };
    // 目印（！やきらきら）は左右反転しても右上に置き直す必要はない
  }
  return { width: CHAR_W, height: CHAR_H, data, tip };
}

export function mirrorRGBA(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (y * w + (w - 1 - x)) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return out;
}

/** 移動ベクトル（画面上の向き。y は下が正）から向きを決める */
export function facingFromScreen(dx: number, dy: number, current: Facing): Facing {
  if (Math.hypot(dx, dy) < 1e-4) return current;
  if (Math.abs(dx) > Math.abs(dy) * 0.9) return dx < 0 ? 'left' : 'right';
  return dy > 0 ? 'down' : 'up';
}

export const CHARACTER_IDS = Object.keys(LOOKS) as CharacterId[];
