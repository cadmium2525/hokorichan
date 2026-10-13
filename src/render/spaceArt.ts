// 宇宙（5章）の手続き生成の絵：星空の背景・木星・太陽・月・小惑星。

import * as THREE from 'three';
import { createRandom, randRange } from '../game/rng.ts';
import { makeCanvas, toTexture } from './proceduralArt.ts';

/** 星空の背景（紺〜すみれのグラデーションに、ドットの星） */
export function starfieldTexture(seed: number): THREE.CanvasTexture {
  const W = 96;
  const H = 160;
  const [canvas, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1e2246');
  g.addColorStop(0.6, '#2e2a5a');
  g.addColorStop(1, '#4a3a72');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rng = createRandom(seed);
  const colors = ['#ffffff', '#fff6c8', '#cfe6ff', '#f4b6c6'];
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = randRange(rng, 0.35, 1);
    ctx.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 1, 1);
  }
  // ところどころ十字に光る星
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff6c8';
  for (let i = 0; i < 6; i++) {
    const x = 2 + Math.floor(rng() * (W - 4));
    const y = 2 + Math.floor(rng() * (H - 4));
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }
  return toTexture(canvas);
}

/** 木星のしま模様と大赤斑 */
export function jupiterTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 32;
  const [canvas, ctx] = makeCanvas(W, H);
  const bands = ['#f2e2c6', '#e8c49a', '#d9a878', '#f2e2c6', '#c88a62', '#f6ead6', '#d9a878', '#e8c49a', '#f2e2c6'];
  for (let y = 0; y < H; y++) {
    const b = bands[Math.min(bands.length - 1, Math.floor((y / H) * bands.length))];
    ctx.fillStyle = b;
    ctx.fillRect(0, y, W, 1);
  }
  const rng = createRandom(5);
  ctx.fillStyle = '#f6ead6';
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.floor(rng() * W), Math.floor(rng() * H), 2 + Math.floor(rng() * 3), 1);
  // 大赤斑
  ctx.fillStyle = '#c8644a';
  ctx.fillRect(40, 19, 6, 3);
  ctx.fillRect(41, 18, 4, 5);
  ctx.fillStyle = '#e8907a';
  ctx.fillRect(42, 19, 2, 2);
  return toTexture(canvas);
}

/** 月の表面（灰色にクレーター） */
export function moonTexture(): THREE.CanvasTexture {
  const W = 48;
  const H = 24;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#d9d4cc';
  ctx.fillRect(0, 0, W, H);
  const rng = createRandom(11);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng() * W);
    const y = Math.floor(rng() * H);
    const r = 1 + Math.floor(rng() * 2);
    ctx.fillStyle = '#b3aca2';
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.fillStyle = '#c9c3ba';
    ctx.fillRect(x - r + 1, y - r + 1, r * 2 - 1, r * 2 - 1);
  }
  return toTexture(canvas);
}

/** 光の輪（太陽のまわりのぼんやりした光） */
export function glowTexture(color: string): THREE.CanvasTexture {
  const S = 32;
  const [canvas, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(canvas);
}

/** 木星（しま模様の球） */
export function buildJupiter(radius: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 28, 16), new THREE.MeshLambertMaterial({ map: jupiterTexture() }));
}

/** 太陽（明るい球と光の輪） */
export function buildSun(radius: number): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), new THREE.MeshBasicMaterial({ color: '#ffd76a' }));
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.97, 1), new THREE.MeshBasicMaterial({ color: '#fff0a8' }));
  core.position.set(0.15 * radius, 0.25 * radius, 0.15 * radius);
  // ふちのぼんやりした光（ドットの段々が目立たないよう、輪を2重に）
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,200,110,0.55)'), transparent: true, depthWrite: false }));
  glow.scale.setScalar(radius * 2.9);
  const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.12, 2), new THREE.MeshBasicMaterial({ color: '#ffb85a', transparent: true, opacity: 0.35, depthWrite: false }));
  g.add(halo);
  g.add(glow, ball, core);
  return g;
}

/** 月（クレーターの球） */
export function buildMoon(radius: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 14), new THREE.MeshLambertMaterial({ map: moonTexture() }));
}

/** 小惑星（ごつごつした岩）。形と色は seed で変える */
export function buildRock(seed: number, size: number): THREE.Mesh {
  const rng = createRandom(seed);
  const geo = new THREE.IcosahedronGeometry(size, 0);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const k = randRange(rng, 0.75, 1.15);
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const colors = ['#a39aa8', '#8a8292', '#b8a08a', '#9c8a7a'];
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[Math.floor(rng() * colors.length)], flatShading: true }));
  m.rotation.set(rng() * 3, rng() * 3, rng() * 3);
  return m;
}

/** 円の線（軌道の表示）。半径1で作り、scale で大きさを変える */
export function orbitLine(color: string, opacity: number, dashed = false): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = dashed
    ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 0.06, gapSize: 0.05, depthWrite: false })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const line = new THREE.LineLoop(geo, mat);
  if (dashed) line.computeLineDistances();
  return line;
}
