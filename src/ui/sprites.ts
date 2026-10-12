// HUD用のドット絵（主人公・お母さん・場所/道具/アクセサリーのアイコン）。すべてSVGで生成する。

import type { AccessoryId, Hero, SpotId, ToolId } from '../game/catalog.ts';

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

const FACE = {
  s: '#f8d9c0',
  e: '#3b2a2a',
  c: '#f4a3b6',
  m: '#d0607e',
  w: '#ffffff',
  l: '#f8d9c0',
};

const BOY = [
  '......kkkk......',
  '....kkhhhhkk....',
  '...khhhhhhhhk...',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khhsssssshhk..',
  '..khsssssssshk..',
  '..ksseesseessk..',
  '..kcssssssssck..',
  '..kssssmmssssk..',
  '...kssssssssk...',
  '....kwwwwwwk....',
  '..kaaaaaaaaaak..',
  '.kaaaaaaaaaaaak.',
  '.ksaaaaaaaaaask.',
  '..kaaaaaaaaaak..',
  '..kbbbbbbbbbbk..',
  '..kbbbbbbbbbbk..',
  '...kbbbkkbbbk...',
  '...kssk..kssk...',
  '...kssk..kssk...',
  '...kffk..kffk...',
  '..kfffk..kfffk..',
  '................',
];

const GIRL = [
  '......kkkk......',
  '....kkhhhhkk....',
  '...khhhhhhhhpp..',
  '..khhhhhhhhhpp..',
  '..khhhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..khsssssssshk..',
  '.khsseesseesshk.',
  '.khcssssssssshk.',
  '.khssssmmsssshk.',
  '.khhssssssssshk.',
  '..kkkwwwwwwkkk..',
  '..kaaaaaaaaaak..',
  '.kaaaaaaaaaaaak.',
  '.ksaaaaaaaaaask.',
  '.kaaaaaaaaaaaak.',
  'kaaaaaaaaaaaaaak',
  'kbbbbbbbbbbbbbbk',
  '...kssk..kssk...',
  '...kssk..kssk...',
  '...kssk..kssk...',
  '...kffk..kffk...',
  '..kfffk..kfffk..',
  '................',
];

const MOTHER = [
  '......kkkk......',
  '.....khhhhk.....',
  '....kkhhhhkk....',
  '...khhhhhhhhk...',
  '..khhhhhhhhhhk..',
  '..khhhsssshhhk..',
  '..khsssssssshk..',
  '..kseesssseesk..',
  '..kcssssssssck..',
  '..kssssmmssssk..',
  '...kssssssssk...',
  '....kssssssk....',
  '..kaaaaaaaaaak..',
  '.kaawwwwwwwwaak.',
  '.ksawwwwwwwwask.',
  '.kaawwwppwwwaak.',
  '..kawwwwwwwwak..',
  '..kawwwwwwwwak..',
  '..kaaaaaaaaaak..',
  '..kaaaaaaaaaak..',
  '...kssk..kssk...',
  '...kssk..kssk...',
  '..kfffk..kfffk..',
  '................',
];

export function heroSprite(hero: Hero, className = 'sprite'): string {
  return hero === 'boy'
    ? pixelArt(BOY, { ...FACE, k: '#3b2a2a', h: '#4a3328', a: '#8ec1ea', b: '#5d7fa8', f: '#e98aa6' }, className)
    : pixelArt(GIRL, { ...FACE, k: '#3b2a2a', h: '#5a3a2a', p: '#f4b6c6', a: '#f4b6c6', b: '#e98aa6', f: '#a58fd0' }, className);
}

export function motherSprite(className = 'sprite'): string {
  return pixelArt(MOTHER, { ...FACE, k: '#4a3328', h: '#8a5a3c', a: '#b9a6dc', p: '#f4b6c6', f: '#8a5a3c' }, className);
}

/** 友だち（ミント色の服の男の子） */
export function friendSprite(className = 'sprite'): string {
  return pixelArt(BOY, { ...FACE, k: '#4a3328', h: '#b5652d', a: '#9fd8c4', b: '#6fb7a0', f: '#f3d27a' }, className);
}

export function friendMomSprite(className = 'sprite'): string {
  return pixelArt(MOTHER, { ...FACE, k: '#3b2a2a', h: '#3b2a2a', a: '#9fd8c4', p: '#f3d27a', f: '#3b2a2a' }, className);
}

export function shopkeeperSprite(className = 'sprite'): string {
  return pixelArt(MOTHER, { ...FACE, k: '#4a3328', h: '#7a5a8c', a: '#f3d27a', p: '#e98aa6', f: '#7a5a8c' }, className);
}

// ---- アイコン（9×9） ----

const SPOT_ICONS: Record<SpotId, [string[], Record<string, string>]> = {
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
export const SPRITE_ROWS = { BOY, GIRL, MOTHER, SPOT_ICONS, TOOL_ICONS, ACCESSORY_ICONS };
