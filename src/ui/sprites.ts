// HUD用のドット絵。人物はジェネレーターの4コマアニメ、場所/道具/アクセサリーのアイコンはSVGで生成する。

import type { AccessoryId, Hero, SpotId, ToolId } from '../game/catalog.ts';
import { CHAR_H, CHAR_W, FRAMES, drawCharacter, type CharacterId, type Facing, type Pose } from '../render/pixelCharacters.ts';

/** 文字の並びをドット絵SVGにする。'.' は透明 */
export function pixelArt(rows: readonly string[], colors: Record<string, string>, className = 'px-icon'): string {
  const h = rows.length;
  const w = rows[0].length;
  let rects = '';
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = colors[row[x]];
      if (c) rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${c}"/>`;
    }
  });
  return `<svg class="${className}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

// ---- 人物（設定資料準拠のドット絵ジェネレーターで描き、4コマを CSS で再生する） ----

export type SpriteOptions = { pose?: Pose; facing?: Facing; flip?: boolean };

const stripCache = new Map<string, string>();

/** 4コマを横に並べた PNG（data URL）。DOM が必要なのでブラウザでだけ呼ぶ */
function stripUrl(id: CharacterId, pose: Pose, facing: Facing): string {
  const key = `${id}/${pose}/${facing}`;
  let url = stripCache.get(key);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = CHAR_W * FRAMES;
    canvas.height = CHAR_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    for (let f = 0; f < FRAMES; f++) {
      const fr = drawCharacter({ id, facing, pose, frame: f });
      ctx.putImageData(new ImageData(new Uint8ClampedArray(fr.data), fr.width, fr.height), f * CHAR_W, 0);
    }
    url = canvas.toDataURL('image/png');
    stripCache.set(key, url);
  }
  return url;
}

export function characterSprite(id: CharacterId, className = 'sprite', opts: SpriteOptions = {}): string {
  const pose = opts.pose ?? 'idle';
  const url = stripUrl(id, pose, opts.facing ?? 'down');
  const cls = `${className} px-char px-char--${pose}${opts.flip ? ' px-char--flip' : ''}`;
  return `<span class="${cls}" style="background-image:url(${url})" aria-hidden="true"></span>`;
}

export function heroSprite(hero: Hero, className = 'sprite', opts: SpriteOptions = {}): string {
  return characterSprite(hero, className, opts);
}

// ---- アイコン（9×9） ----

const SPOT_ICONS: Record<SpotId, [string[], Record<string, string>]> = {
  station: [
    ['.........', 'kkkkkkkkk', 'kwwkwwkwk', 'kwwkwwkwk', 'kkkkkkkkk', 'yyyyyyyyy', 'sssssssss', 'sssssssss', 'rrrrrrrrr'],
    { k: '#5d74a8', w: '#cfe6f8', y: '#f6d55c', s: '#c9c3bd', r: '#8a7a70' },
  ],
  classroom: [
    ['kkkkkkkkk', 'kgggggggk', 'kgwgggwgk', 'kggwgwggk', 'kgggggggk', 'kkkkkkkkk', '.........', '.ddd.ddd.', '.d.d.d.d.'],
    { k: '#a0644a', g: '#3f6b55', w: '#ffffff', d: '#d9a06a' },
  ],
  window: [
    ['kkkkkkkkk', 'kbbbkbbbk', 'kbwbkbbbk', 'kbbbkbwbk', 'kkkkkkkkk', 'kbbbkbbbk', 'kbbbkbbbk', 'kkkkkkkkk', 'sssssssss'],
    { k: '#9aa3b5', b: '#bfe3f6', w: '#ffffff', s: '#c98b55' },
  ],
  washer: [
    ['kkkkkkkkk', 'kwwwwwppk', 'kkkkkkkkk', 'kwwkkkwwk', 'kwkbbbkwk', 'kwkbbbkwk', 'kwwkkkwwk', 'kwwwwwwwk', 'kkkkkkkkk'],
    { k: '#b6bcc7', w: '#f6f5f8', b: '#8aa3c2', p: '#a58fd0' },
  ],
  myroom: [
    ['.........', 'k........', 'kww......', 'kwwpppppp', 'kpppppppp', 'kpppppppp', 'kkkkkkkkk', 'k.......k', '.........'],
    { k: '#c98b55', w: '#fffaf3', p: '#f4b6c6' },
  ],
  shelf: [
    ['kkkkkkkkk', 'kabcakbak', 'kabcakbak', 'kkkkkkkkk', 'kcabkacbk', 'kcabkacbk', 'kkkkkkkkk', 'k.......k', '.........'],
    { k: '#9c6438', a: '#f4b6c6', b: '#cbb8ea', c: '#9cc9e6' },
  ],
  living: [
    ['.........', '.........', '.aaaaaaa.', '.aaaaaaa.', 'babbbbbab', 'bbbbbbbbb', 'bbbbbbbbb', 'k.......k', '.........'],
    { a: '#cdbdea', b: '#b9a6dc', k: '#7d6aa8' },
  ],
  friendEntrance: [
  ['.........', '.........', '.........', '.aaa.bbb.', 'aaaa.bbbb', 'aaaa.bbbb', '.........', 'sssssssss', 'kkkkkkkkk'],
  { a: '#e98aa6', b: '#8ec1ea', s: '#d6d0c8', k: '#b0a89e' },
],
  flowerShop: [
    ['.a...b...', 'aaa.bbb.c', '.a...b.cc', '.g...g..c', '.g...g.g.', 'kkkkkkkkk', 'kwwkkkwwk', 'kwwkkkwwk', 'kkkkkkkkk'],
    { a: '#f4b6c6', b: '#f6dd6a', c: '#cbb8ea', g: '#7fb77e', k: '#b6bcc7', w: '#e6e9ef' },
  ],
  bakery: [
    ['.........', '..bbbbb..', '.bccccccb', 'bccbcbccb', 'bcccccccb', '.bbbbbbb.', '.........', 'kkkkkkkkk', '.........'],
    { b: '#c98a4b', c: '#e2a663', k: '#9c6438' },
  ],
  grandmaRoom: [
    ['.a.....a.', '.aa...aa.', '.aaaaaaa.', 'aakaaakaa', 'aaaapaaaa', '.aaaaaaa.', '..aaaaa..', 'ggggggggg', 'gkgkgkgkg'],
    { a: '#f2c38f', k: '#3b2a2a', p: '#e98aa6', g: '#cfd59a' },
  ],
  friendRoom: [
  ['.........', 'k........', 'kww......', 'kwwbbbbbb', 'kbbbbbbbb', 'kbbbbbbbb', 'kkkkkkkkk', 'k.......k', '.........'],
  { k: '#c98b55', w: '#fffaf3', b: '#9fd8c4' },
],
};

const TOOL_ICONS: Record<ToolId, [string[], Record<string, string>]> = {
  hand: [
    ['..s.s.s..', '..s.s.s..', '.ss.s.s..', '.sssssss.', '.sssssss.', '..sssss..', '..sssss..', '...aaa...', '...aaa...'],
    { s: '#f8d9c0', a: '#8ec1ea' },
  ],
  rag: [
    ['.........', '.yyyyyyy.', '.ywwwwwy.', '.yyyyyyy.', '.ywwwwwy.', '.yyyyyyy.', '.........', '.........', '.........'],
    { y: '#f3d27a', w: '#fff6dc' },
  ],
  mop: [
    ['wpwpw....', 'pwpwp....', 'wpwpw....', '...k.....', '....k....', '.....k...', '......l..', '.......l.', '........l'],
    { w: '#ffffff', p: '#fbe3ea', k: '#b8b0c8', l: '#8f78c4' },
  ],
  vacuum: [
    ['........l', '.......k.', '......k..', '.....k...', '....k....', '...k.....', '..k......', 'aaaaa....', 'ppppp....'],
    { a: '#a58fd0', p: '#f4b6c6', k: '#b8b0c8', l: '#e98aa6' },
  ],
};

const ACCESSORY_ICONS: Record<AccessoryId, [string[], Record<string, string>]> = {
  aurora: [
    ['.........', '.........', 'ab.....ga', 'abc.c.cga', 'abcccccga', 'abc.c.cga', 'ab.....ga', '.........', '.........'],
    { a: '#7fd0d0', b: '#b3d67a', c: '#c7b4e6', g: '#f4a7b9' },
  ],
  globecap: [
    ['...bgb...', '..bggbb..', '..bbgbb..', '...bbb...', '...kkk...', '.kkkkkkk.', '.........', '.........', '.........'],
    { b: '#7fb3e0', g: '#9cc97e', k: '#a0644a' },
  ],
  rainhat: [
    ['.........', '...yyy...', '..yyyyy..', '..ywyyy..', '..yyyyy..', 'ooooooooo', '.o.....o.', '.........', '.........'],
    { y: '#f6d55c', w: '#fff3a8', o: '#d9a83a' },
  ],
  bandana: [
    ['.........', '.........', '..aaaaa..', '.aawaaaa.', 'aaaaawaaa', '.aaaaaaa.', '...a.a...', '..a...a..', '.........'],
    { a: '#f6f0ea', w: '#f4a7b9' },
  ],
  bell: [
    ['.........', 'rr.....rr', '.rrrrrrr.', '...yyy...', '..yyyyy..', '..ywyyy..', '..yyyyy..', '...yky...', '.........'],
    { r: '#f2635a', y: '#f6d55c', w: '#fff7c8', k: '#8a6420' },
  ],
  cap: [
    ['.........', '.........', '...bbb...', '..bbwbb..', '.bbbbbbb.', '.bbbbbbb.', 'nnnnnn...', '.........', '.........'],
    { b: '#5d7aa8', w: '#f6d55c', n: '#435a82' },
  ],
  goggles: [
    ['.........', '.........', 'bbbbbbbbb', '.ggg.ggg.', 'gcwgbgcwg', 'gcccbgccg', '.ggg.ggg.', '.........', '.........'],
    { b: '#a0644a', g: '#6b4a3a', c: '#7fd0d0', w: '#ffffff' },
  ],
  propeller: [
    ['.rrr.yyy.', '....k....', '...pkp...', '..pppbp..', '.ppbpppp.', '.ppppppp.', '.........', '.........', '.........'],
    { r: '#f2635a', y: '#f6d55c', k: '#6b4a3a', p: '#7fb77e', b: '#a9b8f0' },
  ],
  cloudpin: [
    ['.........', '...ww....', '..wwwww..', '.wwwwwww.', 'wwssswwww', '.wwwwww..', '.........', '...k.....', '.........'],
    { w: '#ffffff', s: '#e6f4fb', k: '#9a86c6' },
  ],
  ribbon: [
    ['.........', '.........', 'aa.....aa', 'aaa.c.aaa', 'aaaacaaaa', 'aaa.c.aaa', 'aa.....aa', '.........', '.........'],
    { a: '#e98aa6', c: '#f4b6c6' },
  ],
  leaf: [
    ['.........', '.....gg..', '...gggg..', '..ggggg..', '..gggg...', '..ggg....', '.d.......', 'd........', '.........'],
    { g: '#7fb77e', d: '#5a9460' },
  ],
  flower: [
    ['.........', '...ww....', '..wwww...', '.wwyyww..', '.wwyyww..', '..wwww...', '...ww....', '...g.....', '...g.....'],
    { w: '#f4b6c6', y: '#f3d27a', g: '#7fb77e' },
  ],
  glasses: [
    ['.........', '.........', '.........', 'kkkk.kkkk', 'k..kkk..k', 'k..k.k..k', 'kkkk.kkkk', '.........', '.........'],
    { k: '#7a5a8c' },
  ],
  hat: [
    ['.........', '...aaa...', '..aaaaa..', '..aaaaa..', '..ppppp..', 'aaaaaaaaa', '.........', '.........', '.........'],
    { a: '#8f78c4', p: '#f4b6c6' },
  ],
  crown: [
    ['.........', '.y..y..y.', '.yy.y.yy.', '.yyyyyyy.', '.yyypyyy.', '.yyyyyyy.', '.........', '.........', '.........'],
    { y: '#f2c94c', p: '#e98aa6' },
  ],
};

export function spotIcon(id: SpotId): string {
  const [rows, colors] = SPOT_ICONS[id];
  return pixelArt(rows, colors, 'px-icon px-icon--lg');
}

export function toolIcon(id: ToolId): string {
  const [rows, colors] = TOOL_ICONS[id];
  return pixelArt(rows, colors, 'px-icon px-icon--lg');
}

export function accessoryIcon(id: AccessoryId): string {
  const [rows, colors] = ACCESSORY_ICONS[id];
  return pixelArt(rows, colors, 'px-icon px-icon--lg');
}

/** 行の長さがそろっているか（テスト用） */
export const SPRITE_ROWS = { SPOT_ICONS, TOOL_ICONS, ACCESSORY_ICONS };
