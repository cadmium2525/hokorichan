// 一軒家の掃除場所ごとのレイアウト。部屋（床）と、窓のさん・洗濯機・本棚の上の近景がある。

import * as THREE from 'three';
import type { SpotId } from '../game/catalog.ts';
import { makeCanvas, PALETTE, toTexture, wallTexture, woodTexture, booksTexture, frameTexture } from './proceduralArt.ts';
import { blockerOf, box, buildCleaningRoom, buildLivingRoom, frontBox, lambert, plant, type Blocker } from './roomBuilder.ts';

/** ホコリが積もる水平な面（この中に置き、指の位置もこの面に投影する） */
export type Surface = { minX: number; maxX: number; minZ: number; maxZ: number; y: number };

export type SpotLayout = {
  group: THREE.Group;
  surface: Surface;
  /** 面の上の障害物（高さは面からの高さ） */
  blockers: Blocker[];
  /** カメラに収める範囲 */
  view: THREE.Box3;
  /** 近景ほど小さい。ホコリと道具の大きさに掛ける */
  scale: number;
  /** 洗濯機の糸くずのように明るい色のホコリにする */
  lint: boolean;
};

// ---- テクスチャ ----

function skyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  const g = ctx.createLinearGradient(0, 0, 0, 32);
  g.addColorStop(0, '#9fd2f0');
  g.addColorStop(1, '#e3f3fb');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(5, 8, 9, 3); ctx.fillRect(7, 6, 5, 2);
  ctx.fillRect(19, 17, 8, 2); ctx.fillRect(21, 15, 4, 2);
  ctx.fillStyle = '#9ccf8c';
  ctx.fillRect(0, 27, 32, 5);
  ctx.fillStyle = '#7fb77e';
  for (let x = 0; x < 32; x += 5) ctx.fillRect(x, 25, 3, 3);
  return toTexture(canvas);
}

function tileTexture(repeat: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = '#f3f6fa';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#d9e6f2';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  ctx.fillStyle = '#c3d3e2';
  ctx.fillRect(0, 15, 16, 1);
  ctx.fillRect(15, 0, 1, 16);
  return toTexture(canvas, [repeat, repeat]);
}

function netTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = '#e6e9ef';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#c4cad6';
  for (let i = 0; i < 32; i += 3) {
    ctx.fillRect(i, 0, 1, 32);
    ctx.fillRect(0, i, 32, 1);
  }
  return toTexture(canvas, [2, 1.3]);
}

// ---- 共通 ----

function floorAndWall(group: THREE.Group, opts: { width: number; depth: number; wallZ: number; floor: THREE.Material }): void {
  const floor = box(opts.width, 0.3, opts.depth, [opts.floor, opts.floor, opts.floor, opts.floor, opts.floor, opts.floor]);
  floor.position.set(0, -0.15, opts.wallZ + opts.depth / 2);
  const face = lambert({ map: wallTexture(opts.width) });
  const side = lambert({ color: '#ead1bd' });
  const wall = box(opts.width, 3.4, 0.2, [side, side, side, side, face, side]);
  wall.position.set(0, 1.7, opts.wallZ - 0.1);
  group.add(floor, wall);
}

/** 面の上の物を、面からの高さで障害物にする */
function blockerOnSurface(object: THREE.Object3D, surfaceY: number): Blocker {
  const b = blockerOf(object);
  return { ...b, height: Math.max(0, b.height - surfaceY) };
}

// ---- 部屋（床） ----

function roomLayout(seed: number, living: boolean): SpotLayout {
  const room = living ? buildLivingRoom(seed) : buildCleaningRoom(seed);
  const h = room.half;
  return {
    group: room.group,
    surface: { minX: -h + 0.35, maxX: h - 0.35, minZ: -h + 0.35, maxZ: h - 0.35, y: 0 },
    blockers: room.blockers,
    view: new THREE.Box3(new THREE.Vector3(-h - 0.2, 0, -h - 0.2), new THREE.Vector3(h, 2.8, h)),
    scale: 1,
    lint: false,
  };
}

// ---- 窓のさん ----

function windowLayout(): SpotLayout {
  const g = new THREE.Group();
  floorAndWall(g, { width: 6.4, depth: 3, wallZ: -0.6, floor: lambert({ map: woodTexture(3, PALETTE.woodLight) }) });

  const alu = lambert({ color: '#d5d9e0' });
  const aluDark = lambert({ color: '#b6bcc7' });
  const sky = new THREE.MeshBasicMaterial({ map: skyTexture() });
  // ガラス2枚（引き違い窓）
  for (const [x, z] of [[-1.07, -0.56], [1.07, -0.5]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.75), sky);
    pane.position.set(x, 2.0, z);
    g.add(pane);
    const frameTop = box(2.16, 0.08, 0.06, alu);
    frameTop.position.set(x, 2.9, z + 0.02);
    const frameSideA = box(0.08, 1.8, 0.06, alu);
    frameSideA.position.set(x - 1.06, 2.0, z + 0.02);
    const frameSideB = frameSideA.clone();
    frameSideB.position.x = x + 1.06;
    g.add(frameTop, frameSideA, frameSideB);
  }
  // さん（レール）。溝にホコリがたまる
  const trackY = 1.08;
  const base = box(4.5, 0.12, 0.62, aluDark);
  base.position.set(0, trackY - 0.06, -0.32);
  g.add(base);
  for (const z of [-0.6, -0.36, -0.1]) {
    const rail = box(4.5, 0.05, 0.035, alu);
    rail.position.set(0, trackY + 0.025, z);
    g.add(rail);
  }
  // 手前の木の窓台と小さな鉢
  const sill = box(4.9, 0.1, 0.4, lambert({ map: woodTexture(7, PALETTE.woodLight) }));
  sill.position.set(0, trackY - 0.07, 0.18);
  const p = plant(12);
  p.object.scale.setScalar(0.55);
  p.object.position.set(1.85, trackY - 0.02, 0.05);
  // カーテン
  const curtain = lambert({ color: PALETTE.pink });
  const cl = box(0.35, 2.3, 0.14, curtain);
  cl.position.set(-2.55, 1.95, -0.4);
  const cr = cl.clone();
  cr.position.x = 2.55;
  g.add(sill, p.object, cl, cr);

  return {
    group: g,
    surface: { minX: -2.05, maxX: 2.05, minZ: -0.56, maxZ: -0.08, y: trackY },
    blockers: [],
    view: new THREE.Box3(new THREE.Vector3(-2.4, 0.95, -0.6), new THREE.Vector3(2.4, 2.3, 0.4)),
    scale: 0.55,
    lint: false,
  };
}

// ---- 洗濯機（ドラム式）の乾燥フィルター ----

function washerLayout(): SpotLayout {
  const g = new THREE.Group();
  floorAndWall(g, { width: 5, depth: 4, wallZ: -1.3, floor: lambert({ map: tileTexture(5) }) });

  const white = lambert({ color: '#f6f5f8' });
  const grey = lambert({ color: '#c9ccd6' });
  const body = box(1.9, 1.8, 1.5, white);
  body.position.set(0, 0.9, -0.45);
  // 前面の扉（丸窓）と操作パネル
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.08, 6, 20), grey);
  ring.position.set(0, 0.8, 0.31);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), lambert({ color: '#8aa3c2' }));
  glass.position.set(0, 0.8, 0.305);
  const panel = box(1.9, 0.26, 0.04, lambert({ color: '#e7e3f1' }));
  panel.position.set(0, 1.62, 0.31);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), lambert({ color: PALETTE.lavenderDeep }));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.6, 1.62, 0.34);
  g.add(body, ring, glass, panel, dial);

  // 引き出した乾燥フィルター（網）
  const topY = 1.8;
  const frame = box(1.6, 0.06, 1.06, lambert({ color: '#9fa6b4' }));
  frame.position.set(0, topY + 0.03, -0.45);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.94), lambert({ map: netTexture() }));
  net.rotation.x = -Math.PI / 2;
  net.position.set(0, topY + 0.061, -0.45);
  const handle = box(0.5, 0.08, 0.1, lambert({ color: PALETTE.lavender }));
  handle.position.set(0, topY + 0.06, 0.13);
  g.add(frame, net, handle);

  // そばの洗濯かご
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.5, 10), lambert({ color: '#e9c9a2' }));
  basket.position.set(1.55, 0.25, 0.3);
  const towel = box(0.6, 0.12, 0.5, lambert({ color: PALETTE.pink }));
  towel.position.set(1.55, 0.52, 0.3);
  g.add(basket, towel);

  return {
    group: g,
    surface: { minX: -0.66, maxX: 0.66, minZ: -0.86, maxZ: -0.04, y: topY + 0.065 },
    blockers: [],
    view: new THREE.Box3(new THREE.Vector3(-1.05, 1.35, -1.2), new THREE.Vector3(1.05, 2.0, 0.35)),
    scale: 0.42,
    lint: true,
  };
}

// ---- 本棚の上 ----

function shelfLayout(seed: number): SpotLayout {
  const g = new THREE.Group();
  floorAndWall(g, { width: 5, depth: 3, wallZ: -0.6, floor: lambert({ map: woodTexture(5, PALETTE.woodLight) }) });
  const side = lambert({ map: woodTexture(seed, PALETTE.wood) });
  const front = lambert({ map: booksTexture(seed) });
  const topY = 2.2;
  const shelf = frontBox(3.0, topY, 0.8, side, front);
  shelf.position.set(0, topY / 2, -0.2);
  g.add(shelf);

  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: frameTexture(seed) }));
  art.position.set(0.4, 2.85, -0.59);
  g.add(art);

  // 上に置かれた箱と地球儀
  const boxTop = box(0.62, 0.42, 0.5, lambert({ color: '#f0d7a8' }));
  boxTop.position.set(-1.05, topY + 0.21, -0.32);
  const globeStand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, 0.12, 8), lambert({ color: PALETTE.woodDark }));
  globeStand.position.set(1.1, topY + 0.06, -0.3);
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), lambert({ color: '#8fc3e8', flatShading: true }));
  globe.position.set(1.1, topY + 0.34, -0.3);
  g.add(boxTop, globeStand, globe);

  return {
    group: g,
    surface: { minX: -1.4, maxX: 1.4, minZ: -0.54, maxZ: 0.14, y: topY },
    blockers: [blockerOnSurface(boxTop, topY), blockerOnSurface(globe, topY)],
    view: new THREE.Box3(new THREE.Vector3(-1.6, 1.75, -0.6), new THREE.Vector3(1.6, 2.75, 0.3)),
    scale: 0.55,
    lint: false,
  };
}

export function buildSpot(id: SpotId, seed: number): SpotLayout {
  switch (id) {
    case 'window':
      return windowLayout();
    case 'washer':
      return washerLayout();
    case 'shelf':
      return shelfLayout(seed);
    case 'living':
      return roomLayout(seed, true);
    case 'myroom':
      return roomLayout(seed, false);
  }
}
