// テクスチャと小物をすべてコードで生成する。外部画像は使わない。

import * as THREE from 'three';
import { createRandom, randRange, type Random } from '../game/rng.ts';

// 部屋・家具は「ピクセルアート設定資料 Ver.1」の背景・家具パレット（#a0644a #d9a06a #b8754f #e8b48a #f2cbb0 #f8e3cc）を基準にした暖色系
export const PALETTE = {
  cream: '#fff4e6',
  wall: '#f8e3cc',
  wallStripe: '#f2d4bc',
  panel: '#e8b48a',
  pink: '#f4b6c6',
  pinkDeep: '#e98aa6',
  lavender: '#cbb8ea',
  lavenderDeep: '#a58fd0',
  woodLight: '#dca46c',
  wood: '#b8754f',
  woodDark: '#a0644a',
  leaf: '#7fb77e',
  leafDark: '#5a9460',
  sky: '#bfe3f6',
  ink: '#3b2a2a',
} as const;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas is not available');
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

export function toTexture(canvas: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  return tex;
}

function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amount);
  return `#${c.getHexString()}`;
}

// ---- 面テクスチャ ----

export function floorTexture(seed: number, repeat: number): THREE.CanvasTexture {
  const rng = createRandom(seed);
  const [canvas, ctx] = makeCanvas(32, 32);
  const rows = 4;
  const rowH = 32 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * 16 + Math.floor(rng() * 6);
    for (let x = -32; x < 64; x += 32) {
      const base = shade(PALETTE.woodLight, randRange(rng, -0.04, 0.03));
      ctx.fillStyle = base;
      ctx.fillRect(x + offset, r * rowH, 32, rowH);
      ctx.fillStyle = shade(base, -0.05);
      for (let i = 0; i < 3; i++) ctx.fillRect(x + offset + Math.floor(rng() * 30), r * rowH + 2 + Math.floor(rng() * 4), 3 + Math.floor(rng() * 5), 1);
      ctx.fillStyle = shade(PALETTE.wood, -0.06);
      ctx.fillRect(x + offset, r * rowH, 1, rowH);
    }
    ctx.fillStyle = shade(PALETTE.wood, -0.04);
    ctx.fillRect(0, r * rowH + rowH - 1, 32, 1);
  }
  return toTexture(canvas, [repeat, repeat]);
}

export type WallColors = { base: string; stripe: string };

export function wallTexture(width: number, colors: WallColors = { base: PALETTE.wall, stripe: PALETTE.wallStripe }): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 32);
  ctx.fillStyle = colors.base;
  ctx.fillRect(0, 0, 16, 32);
  ctx.fillStyle = colors.stripe;
  ctx.fillRect(6, 0, 3, 22);
  ctx.fillStyle = shade(colors.base, 0.04);
  ctx.fillRect(13, 6, 1, 1);
  ctx.fillRect(2, 15, 1, 1);
  // 腰板（木の羽目板）と巾木
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, 22, 16, 10);
  ctx.fillStyle = shade(PALETTE.panel, 0.05);
  ctx.fillRect(1, 23, 6, 1);
  ctx.fillRect(9, 23, 6, 1);
  ctx.fillStyle = shade(PALETTE.panel, -0.08);
  ctx.fillRect(7, 23, 1, 7);
  ctx.fillRect(15, 23, 1, 7);
  ctx.fillStyle = PALETTE.wood;
  ctx.fillRect(0, 21, 16, 1);
  ctx.fillRect(0, 30, 16, 2);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(0, 31, 16, 1);
  return toTexture(canvas, [width, 1]);
}

export function woodTexture(seed: number, base: string = PALETTE.wood, drawers = 0): THREE.CanvasTexture {
  const rng = createRandom(seed);
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = shade(base, -0.05);
  for (let i = 0; i < 10; i++) ctx.fillRect(Math.floor(rng() * 32), Math.floor(rng() * 32), 4 + Math.floor(rng() * 8), 1);
  // ふちを1ドット暗くして、ドット絵の輪郭のように見せる
  ctx.fillStyle = shade(base, -0.14);
  ctx.fillRect(0, 0, 32, 1);
  ctx.fillRect(0, 31, 32, 1);
  ctx.fillRect(0, 0, 1, 32);
  ctx.fillRect(31, 0, 1, 32);
  ctx.fillStyle = shade(base, 0.06);
  ctx.fillRect(1, 1, 30, 1);
  if (drawers > 0) {
    const h = 32 / drawers;
    for (let i = 0; i < drawers; i++) {
      ctx.fillStyle = shade(base, -0.12);
      ctx.fillRect(1, Math.floor(i * h), 30, 1);
      ctx.fillStyle = '#f6e3b5';
      ctx.fillRect(14, Math.floor(i * h + h / 2), 4, 2);
    }
  }
  return toTexture(canvas);
}

export function rugTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = PALETTE.lavender;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(2, 2, 28, 1); ctx.fillRect(2, 29, 28, 1);
  ctx.fillRect(2, 2, 1, 28); ctx.fillRect(29, 2, 1, 28);
  ctx.fillStyle = '#ddd0f2';
  for (let y = 6; y < 28; y += 6) for (let x = 6; x < 28; x += 6) {
    ctx.fillRect(x, y - 1, 1, 3);
    ctx.fillRect(x - 1, y, 3, 1);
  }
  return toTexture(canvas);
}

export function quiltTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#fbd6df';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  return toTexture(canvas, [3, 3]);
}

export function booksTexture(seed: number): THREE.CanvasTexture {
  const rng = createRandom(seed);
  const colors = [PALETTE.pink, PALETTE.lavender, '#9cc9e6', '#f3d27a', PALETTE.leaf, '#f0a37a', PALETTE.cream];
  const [canvas, ctx] = makeCanvas(32, 48);
  ctx.fillStyle = PALETTE.woodDark;
  ctx.fillRect(0, 0, 32, 48);
  for (let shelf = 0; shelf < 3; shelf++) {
    const y0 = shelf * 16 + 2;
    ctx.fillStyle = shade(PALETTE.woodDark, -0.08);
    ctx.fillRect(1, y0, 30, 13);
    let x = 2;
    while (x < 28) {
      const w = 2 + Math.floor(rng() * 3);
      const h = 8 + Math.floor(rng() * 5);
      if (rng() < 0.15) { x += w; continue; }
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
      ctx.fillRect(x, y0 + 13 - h, w, h);
      x += w + (rng() < 0.3 ? 1 : 0);
    }
  }
  return toTexture(canvas);
}

export function windowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#a9d8f2');
  g.addColorStop(1, '#e6f4fb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(6, 9, 7, 2); ctx.fillRect(8, 8, 4, 1);
  ctx.fillRect(20, 16, 6, 2);
  ctx.fillStyle = PALETTE.cream;
  ctx.fillRect(0, 0, 32, 2); ctx.fillRect(0, 30, 32, 2);
  ctx.fillRect(0, 0, 2, 32); ctx.fillRect(30, 0, 2, 32);
  ctx.fillRect(15, 0, 2, 32); ctx.fillRect(0, 15, 32, 2);
  // カーテン
  ctx.fillStyle = PALETTE.pink;
  ctx.fillRect(0, 0, 5, 32); ctx.fillRect(27, 0, 5, 32);
  ctx.fillStyle = '#fbd6df';
  ctx.fillRect(2, 0, 1, 32); ctx.fillRect(29, 0, 1, 32);
  return toTexture(canvas);
}

export function frameTexture(seed: number): THREE.CanvasTexture {
  const rng = createRandom(seed);
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = PALETTE.woodLight;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#eaf3ee';
  ctx.fillRect(2, 2, 12, 12);
  ctx.fillStyle = rng() < 0.5 ? PALETTE.pink : PALETTE.lavender;
  ctx.fillRect(5, 6, 6, 5);
  ctx.fillStyle = PALETTE.leaf;
  ctx.fillRect(2, 11, 12, 3);
  return toTexture(canvas);
}

// ---- スプライト用 ----

export function blobShadowTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
  g.addColorStop(0, 'rgba(90,60,50,0.45)');
  g.addColorStop(1, 'rgba(90,60,50,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return toTexture(canvas);
}

export function ringTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.stroke();
  const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 14);
  g.addColorStop(0, 'rgba(255,214,228,0.0)');
  g.addColorStop(1, 'rgba(255,214,228,0.45)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas);
}

function pixelShape(rows: string[], colors: Record<string, string>): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(rows[0].length, rows.length);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = colors[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return toTexture(canvas);
}

export function heartTexture(): THREE.CanvasTexture {
  return pixelShape(
    [
      '.........',
      '.aa...aa.',
      'abba.aaaa',
      'abaaaaaaa',
      'aaaaaaaaa',
      '.aaaaaaa.',
      '..aaaaa..',
      '...aaa...',
      '....a....',
    ],
    { a: PALETTE.pinkDeep, b: '#ffe4ec' },
  );
}

export function sparkleTexture(): THREE.CanvasTexture {
  return pixelShape(
    [
      '...a...',
      '...a...',
      '..aba..',
      'aabbbaa',
      '..aba..',
      '...a...',
      '...a...',
    ],
    { a: '#fff6c8', b: '#ffffff' },
  );
}

export function dropTexture(): THREE.CanvasTexture {
  return pixelShape(
    ['..a..', '..a..', '.aba.', 'abbba', 'abbba', '.aaa.'],
    { a: '#7fb2e0', b: '#cfe7fb' },
  );
}

// ---- ホコリ（掃除対象） ----

/** 綿のような小さな塊。リアルな汚れではなく、ふわっとした灰色の玉にする */
/** ホコリの見た目の種類（catalog の DustType と同じ名前） */
export type DustShape = 'cotton' | 'lint' | 'sand' | 'fur' | 'pollen' | 'flour' | 'kosa' | 'soot' | 'chalk' | 'ash';

let threadGeometry: THREE.BufferGeometry | null = null;

/**
 * ホコリのかたまり。種類ごとにシルエットを変える。
 * 綿ぼこり＝ふわふわの玉、糸くず＝玉に糸がからむ、砂＝つぶの小山、猫の毛＝細長い毛束、花粉＝つぶつぶの黄色い玉、粉＝平たい山。
 */
export function createDustPuff(
  random: Random,
  geometry: THREE.BufferGeometry,
  materials: THREE.Material[],
  shape: DustShape = 'cotton',
): THREE.Group {
  const group = new THREE.Group();
  const pick = () => materials[Math.floor(random() * materials.length)];
  const blob = (r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geometry, pick());
    m.scale.set(r * sx, r * sy, r * sz);
    m.position.set(x, y, z);
    m.rotation.set(random() * 3, random() * 3, random() * 3);
    group.add(m);
    return m;
  };
  switch (shape) {
    case 'sand':
    case 'kosa':
    case 'ash': {
      const n = 9 + Math.floor(random() * 5);
      for (let i = 0; i < n; i++) {
        const a = random() * Math.PI * 2;
        const d = Math.sqrt(random()) * 0.2;
        const r = randRange(random, 0.035, 0.06);
        blob(r, Math.cos(a) * d, r * 0.7 + (0.2 - d) * 0.25, Math.sin(a) * d);
      }
      break;
    }
    case 'fur': {
      // 同じ向きにそろった細長い毛束
      const yaw = random() * Math.PI;
      for (let i = 0; i < 5; i++) {
        const m = blob(randRange(random, 0.07, 0.1), randRange(random, -0.05, 0.05), 0.07 + i * 0.012, randRange(random, -0.08, 0.08), 2.6, 0.7, 0.9);
        m.rotation.set(0, yaw + randRange(random, -0.35, 0.35), randRange(random, -0.2, 0.2));
      }
      break;
    }
    case 'pollen': {
      blob(0.11, 0, 0.13, 0);
      for (let i = 0; i < 9; i++) {
        const a = random() * Math.PI * 2;
        const e = randRange(random, -0.2, 1.1);
        blob(0.05, Math.cos(a) * Math.cos(e) * 0.12, 0.13 + Math.sin(e) * 0.12, Math.sin(a) * Math.cos(e) * 0.12);
      }
      break;
    }
    case 'flour':
    case 'chalk': {
      blob(0.2, 0, 0.03, 0, 1, 0.3, 1);
      for (let i = 0; i < 4; i++) {
        const a = random() * Math.PI * 2;
        blob(0.05, Math.cos(a) * 0.2, 0.03, Math.sin(a) * 0.2, 1, 0.5, 1);
      }
      break;
    }
    default: {
      const count = 3 + Math.floor(random() * 3);
      for (let i = 0; i < count; i++) {
        const r = randRange(random, 0.08, 0.14);
        const a = random() * Math.PI * 2;
        const d = i === 0 ? 0 : randRange(random, 0.06, 0.14);
        blob(r, Math.cos(a) * d, r * 0.8 + (i === 0 ? 0.03 : 0), Math.sin(a) * d);
      }
      if (shape === 'lint') {
        // からまった色糸
        threadGeometry ??= new THREE.CylinderGeometry(0.012, 0.012, 1, 4);
        for (let i = 0; i < 3; i++) {
          const t = new THREE.Mesh(threadGeometry, pick());
          t.scale.y = randRange(random, 0.25, 0.4);
          t.position.set(randRange(random, -0.08, 0.08), 0.05 + i * 0.04, randRange(random, -0.08, 0.08));
          t.rotation.set(Math.PI / 2 + randRange(random, -0.3, 0.3), 0, random() * Math.PI);
          group.add(t);
        }
      }
    }
  }
  return group;
}
