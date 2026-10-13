// 一軒家の掃除場所ごとのレイアウト。部屋（床）と、窓のさん・洗濯機・本棚の上の近景がある。

import * as THREE from 'three';
import type { SpotId } from '../game/catalog.ts';
import { createRandom } from '../game/rng.ts';
import { makeCanvas, PALETTE, toTexture, wallTexture, woodTexture, booksTexture, frameTexture } from './proceduralArt.ts';
import {
  blockerOf,
  box,
  buildCleaningRoom,
  buildFriendRoom,
  buildLivingRoom,
  frontBox,
  lambert,
  buildShell,
  plant,
  wallDecal,
  type Blocker,
  type Room,
} from './roomBuilder.ts';

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
  /** 見物席（大会の審査員席など）。ほこりちゃんが座る */
  seat?: THREE.Vector3;
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

function roomLayout(room: Room): SpotLayout {
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

// ---- 友だちの家の玄関 ----

function stoneTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = '#d6d0c8';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#c4bdb3';
  ctx.fillRect(0, 7, 16, 1);
  ctx.fillRect(7, 0, 1, 7);
  ctx.fillRect(15, 8, 1, 8);
  ctx.fillStyle = '#e2ddd6';
  ctx.fillRect(3, 3, 1, 1);
  ctx.fillRect(11, 12, 1, 1);
  return toTexture(canvas, [3, 2]);
}

function entranceLayout(): SpotLayout {
  const g = new THREE.Group();
  const wallFace = lambert({ map: wallTexture(4, { base: '#e6f4ee', stripe: '#cfe9df' }) });
  const wallSide = lambert({ color: '#d7e8e0' });
  // 一段低い土間（ここにホコリがたまる）
  const stone = lambert({ map: stoneTexture() });
  const genkan = box(3.4, 0.3, 1.8, stone);
  genkan.position.set(0, -0.15, 0.7);
  // 上がり框と廊下
  const wood = lambert({ map: woodTexture(14, PALETTE.woodLight) });
  const step = box(3.4, 0.38, 2.2, wood);
  step.position.set(0, 0.19, -1.3);
  const backWall = box(3.6, 2.6, 0.2, [wallSide, wallSide, wallSide, wallSide, wallFace, wallSide]);
  backWall.position.set(0, 1.3, -2.5);
  const leftWall = box(0.2, 2.6, 4.4, [wallFace, wallSide, wallSide, wallSide, wallSide, wallSide]);
  leftWall.position.set(-1.8, 1.3, -0.4);
  g.add(genkan, step, backWall, leftWall);
  // 玄関ドア（左の壁）
  const door = box(0.06, 1.9, 1.0, lambert({ color: '#9cc9e6' }));
  door.position.set(-1.68, 0.95, 0.75);
  const knob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), lambert({ color: '#f2c94c' }));
  knob.position.set(-1.63, 0.95, 1.12);
  g.add(door, knob);
  // げた箱（右手前、土間の外）
  const cabinet = frontBox(1.2, 1.0, 0.5, lambert({ map: woodTexture(15, PALETTE.wood) }), lambert({ map: woodTexture(16, PALETTE.wood, 2) }));
  cabinet.position.set(1.0, 0.88, -1.0);
  g.add(cabinet);

  // 土間に脱いだくつと傘立て（障害物）
  const blockers: Blocker[] = [];
  const shoes: Array<[number, number, string]> = [[-0.6, 0.35, PALETTE.pinkDeep], [0.5, 0.15, '#8ec1ea'], [0.1, 1.0, '#f3d27a']];
  for (const [x, z, color] of shoes) {
    const pair = new THREE.Group();
    for (const dx of [-0.09, 0.09]) {
      const shoe = box(0.14, 0.1, 0.32, lambert({ color }));
      shoe.position.set(dx, 0.05, 0);
      pair.add(shoe);
    }
    pair.position.set(x, 0, z);
    pair.rotation.y = x * 0.6;
    g.add(pair);
    blockers.push(blockerOf(pair));
  }
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.5, 8), lambert({ color: PALETTE.lavenderDeep }));
  stand.position.set(-1.35, 0.25, 1.35);
  const umbrella = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), lambert({ color: PALETTE.pink }));
  umbrella.position.set(-1.35, 0.6, 1.35);
  umbrella.rotation.z = 0.15;
  g.add(stand, umbrella);
  blockers.push(blockerOf(stand));

  return {
    group: g,
    surface: { minX: -1.45, maxX: 1.45, minZ: 0.0, maxZ: 1.5, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-1.8, 0, -1.2), new THREE.Vector3(1.8, 1.2, 1.6)),
    scale: 0.6,
    lint: false,
  };
}

// ---- 商店街：花屋・パン屋・おばあちゃんの家 ----

function tileFloor(colors: [string, string], repeat: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = colors[1];
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  return toTexture(canvas, [repeat, repeat]);
}

function tatamiTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = '#cfd59a';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#c2c98b';
  for (let y = 1; y < 32; y += 3) ctx.fillRect(0, y, 32, 1);
  // へり
  ctx.fillStyle = '#5a6b4a';
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 16, 32, 2);
  ctx.fillRect(15, 0, 2, 16);
  return toTexture(canvas, [3, 3]);
}

function breadTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = PALETTE.woodLight;
  ctx.fillRect(0, 0, 32, 32);
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = shelf * 11 + 1;
    ctx.fillStyle = PALETTE.wood;
    ctx.fillRect(0, y + 9, 32, 2);
    for (let x = 1; x < 30; x += 7) {
      ctx.fillStyle = shelf === 1 ? '#c98a4b' : '#e2a663';
      ctx.fillRect(x, y + 3, 6, 6);
      ctx.fillStyle = '#f3cf8f';
      ctx.fillRect(x + 1, y + 4, 4, 2);
    }
  }
  return toTexture(canvas);
}

/** 色とりどりの花のバケツ */
function flowerBucket(seed: number): THREE.Group {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.4, 10), lambert({ color: '#c8ced8' }));
  bucket.position.y = 0.2;
  g.add(bucket);
  const colors = [PALETTE.pink, '#f6dd6a', PALETTE.lavender, '#ffffff', '#f0a37a'];
  const stem = lambert({ color: PALETTE.leafDark });
  for (let i = 0; i < 6; i++) {
    const x = (rng() - 0.5) * 0.3;
    const z = (rng() - 0.5) * 0.3;
    const h = 0.5 + rng() * 0.3;
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, h, 4), stem);
    st.position.set(x, 0.4 + h / 2, z);
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), lambert({ color: colors[Math.floor(rng() * colors.length)], flatShading: true }));
    bloom.position.set(x, 0.4 + h, z);
    g.add(st, bloom);
  }
  return g;
}

/** 座ったり寝たりしている猫 */
function cat(color: string, seed: number): THREE.Group {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const fur = lambert({ color });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), fur);
  body.scale.set(0.22, 0.16, 0.3);
  body.position.y = 0.16;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), fur);
  head.position.set(0, 0.32, 0.22);
  for (const x of [-0.07, 0.07]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), fur);
    ear.position.set(x, 0.46, 0.22);
    g.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.32, 5), fur);
  tail.rotation.x = Math.PI / 2.4;
  tail.position.set(0.08, 0.14, -0.32);
  const eye = lambert({ color: '#3b2a2a' });
  for (const x of [-0.05, 0.05]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.01), eye);
    e.position.set(x, 0.34, 0.355);
    g.add(e);
  }
  g.add(body, head, tail);
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

function shopLayout(kind: 'flower' | 'bakery' | 'grandma', seed: number): SpotLayout {
  const g = new THREE.Group();
  const half = kind === 'grandma' ? 3.4 : 3.2;
  const random = createRandom(seed);
  const blockers: Blocker[] = [];
  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y += ry;
    g.add(obj);
    blockers.push(blockerOf(obj));
  };

  if (kind === 'flower') {
    buildShell(g, half, seed, { base: '#f3f8ec', stripe: '#e3efd6' }, tileFloor(['#f4efe6', '#e8e0d2'], 4));
    // 奥の壁ぞいに花のバケツ、左の壁に鉢の棚、手前にレジ台
    for (let i = 0; i < 5; i++) place(flowerBucket(seed + i), -2.4 + i * 1.05, -half + 0.35);
    for (let i = 0; i < 3; i++) place(flowerBucket(seed + 10 + i), -half + 0.35, -1.0 + i * 1.1);
    const counter = frontBox(1.6, 0.9, 0.6, lambert({ map: woodTexture(seed, PALETTE.woodLight) }), lambert({ map: woodTexture(seed + 1, PALETTE.woodLight, 2) }));
    counter.position.y = 0.45;
    const c = new THREE.Group();
    c.add(counter);
    place(c, 1.6, -1.2 + random() * 0.4);
    const big = plant(seed + 20);
    big.object.scale.setScalar(1.6);
    place(big.object, half - 0.6, -half + 0.6);
  } else if (kind === 'bakery') {
    buildShell(g, half, seed, { base: '#fff3df', stripe: '#f7e3c4' }, tileFloor(['#f1e7d8', '#e6d6bf'], 4));
    const shelfSide = lambert({ map: woodTexture(seed, PALETTE.wood) });
    const breadShelf = frontBox(2.4, 1.6, 0.5, shelfSide, lambert({ map: breadTexture() }));
    breadShelf.position.y = 0.8;
    const bs = new THREE.Group();
    bs.add(breadShelf);
    place(bs, -0.8, -half + 0.3);
    const bs2 = bs.clone();
    place(bs2, -half + 0.3, 0.2, Math.PI / 2);
    // ショーケースとレジ
    const caseBase = box(1.8, 0.7, 0.7, lambert({ map: woodTexture(seed + 2, PALETTE.woodLight) }));
    caseBase.position.y = 0.35;
    const glass = box(1.8, 0.4, 0.7, new THREE.MeshLambertMaterial({ color: '#dff3ff', transparent: true, opacity: 0.4 }));
    glass.position.y = 0.9;
    const sc = new THREE.Group();
    sc.add(caseBase, glass);
    for (let i = 0; i < 4; i++) {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), lambert({ color: i % 2 ? '#e2a663' : '#c98a4b' }));
      bun.scale.y = 0.7;
      bun.position.set(-0.6 + i * 0.4, 0.78, 0);
      sc.add(bun);
    }
    place(sc, 1.4, 0.6);
    // 小麦粉の袋
    for (let i = 0; i < 2; i++) {
      const sack = box(0.5, 0.6, 0.4, lambert({ color: '#f6f1e6' }));
      sack.position.y = 0.3;
      const s = new THREE.Group();
      s.add(sack);
      place(s, half - 0.5 - i * 0.6, -half + 0.4);
    }
  } else {
    buildShell(g, half, seed, { base: '#f6efe0', stripe: '#eee2cb' }, tatamiTexture());
    // ちゃぶ台、座布団、たんす、猫たち
    const table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), lambert({ map: woodTexture(seed, PALETTE.wood) }));
    top.position.y = 0.4;
    table.add(top);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
      const leg = box(0.07, 0.38, 0.07, lambert({ color: PALETTE.woodDark }));
      leg.position.set(x, 0.19, z);
      table.add(leg);
    }
    const teapot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), lambert({ color: '#7fb2a0' }));
    teapot.position.y = 0.52;
    table.add(teapot);
    place(table, 0.3, 0.2);
    for (const [x, z] of [[0.3, 1.4], [-1.0, 0.2]]) {
      const cushion = box(0.6, 0.08, 0.6, lambert({ color: '#b56a7a' }));
      cushion.position.set(x, 0.04, z);
      g.add(cushion);
    }
    const tansu = frontBox(1.6, 1.2, 0.5, lambert({ map: woodTexture(seed + 1, PALETTE.woodDark) }), lambert({ map: woodTexture(seed + 2, PALETTE.woodDark, 4) }));
    tansu.position.y = 0.6;
    const t = new THREE.Group();
    t.add(tansu);
    place(t, -1.2, -half + 0.3);
    const cats: Array<[string, number, number]> = [['#f2c38f', 1.8, -1.6], ['#ffffff', -2.4, 1.6], ['#9a9a9a', 2.2, 1.8], ['#e8a868', -0.8, -1.6], ['#3b3b3b', 1.4, 2.6]];
    cats.forEach(([color, x, z], i) => place(cat(color, seed + i), x, z));
  }

  return {
    group: g,
    surface: { minX: -half + 0.35, maxX: half - 0.35, minZ: -half + 0.35, maxZ: half - 0.35, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-half - 0.2, 0, -half - 0.2), new THREE.Vector3(half, 2.8, half)),
    scale: 1,
    lint: false,
  };
}

// ---- 2章の山場：大掃除大会の会場（商店街通り） ----

function bannerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(96, 16);
  ctx.fillStyle = '#fff6e8';
  ctx.fillRect(0, 0, 96, 16);
  ctx.fillStyle = '#f08a9a';
  ctx.fillRect(0, 0, 96, 2);
  ctx.fillRect(0, 14, 96, 2);
  ctx.fillStyle = '#6b4a3a';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('町内会 大掃除大会', 48, 8.5);
  return toTexture(canvas);
}

function shopFrontTexture(color: string): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = '#f8e3cc';
  ctx.fillRect(0, 0, 32, 32);
  // ひさし
  for (let x = 0; x < 32; x += 4) {
    ctx.fillStyle = (x / 4) % 2 === 0 ? color : '#fffaf2';
    ctx.fillRect(x, 6, 4, 5);
  }
  // 窓と入口
  ctx.fillStyle = '#bfe3f6';
  ctx.fillRect(3, 14, 12, 9);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(4, 15, 3, 1);
  ctx.fillStyle = '#b8754f';
  ctx.fillRect(19, 13, 9, 19);
  ctx.fillStyle = '#a0644a';
  ctx.fillRect(19, 13, 9, 1);
  ctx.fillStyle = '#f6d55c';
  ctx.fillRect(26, 22, 1, 2);
  return toTexture(canvas);
}

function contestLayout(seed: number): SpotLayout {
  const g = new THREE.Group();
  const half = 4.2;
  const blockers: Blocker[] = [];
  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y += ry;
    g.add(obj);
    blockers.push(blockerOf(obj));
  };
  // 石だたみの通り
  const ground = box(half * 2, 0.3, half * 2, [
    lambert({ color: '#b8a48e' }),
    lambert({ color: '#b8a48e' }),
    lambert({ map: tileFloor(['#e8d6c0', '#dcc6ac'], 8) }),
    lambert({ color: '#b8a48e' }),
    lambert({ color: '#b8a48e' }),
    lambert({ color: '#b8a48e' }),
  ]);
  ground.position.y = -0.15;
  g.add(ground);
  // 奥と左に商店の並び（低めの壁にして中が見えるように）
  const colors = ['#f08a9a', '#7fb77e', '#e8a868', '#a9b8f0'];
  for (let i = 0; i < 4; i++) {
    const front = frontBox(2.1, 2.2, 0.4, lambert({ color: '#f2cbb0' }), lambert({ map: shopFrontTexture(colors[i]) }));
    front.position.set(-half + 1.05 + i * 2.1, 1.1, -half - 0.2);
    g.add(front);
  }
  for (let i = 0; i < 4; i++) {
    const front = frontBox(2.1, 2.2, 0.4, lambert({ color: '#f2cbb0' }), lambert({ map: shopFrontTexture(colors[(i + 2) % 4]) }));
    front.rotation.y = Math.PI / 2;
    front.position.set(-half - 0.2, 1.1, -half + 1.05 + i * 2.1);
    g.add(front);
  }
  // 横断幕のアーチ
  const poleMat = lambert({ color: PALETTE.woodDark });
  for (const x of [-2.6, 2.6]) {
    const pole = box(0.12, 2.4, 0.12, poleMat);
    pole.position.set(x, 1.2, -half + 0.9);
    const p = new THREE.Group();
    p.add(pole);
    place(p, 0, 0);
  }
  const banner = box(5.0, 0.6, 0.06, [poleMat, poleMat, poleMat, poleMat, lambert({ map: bannerTexture() }), poleMat]);
  banner.position.set(0, 2.1, -half + 0.9);
  g.add(banner);
  // ベンチ・プランター・審査員のテント
  const bench = () => {
    const b = new THREE.Group();
    const seat = box(1.4, 0.08, 0.45, lambert({ map: woodTexture(seed, PALETTE.wood) }));
    seat.position.y = 0.42;
    b.add(seat);
    for (const x of [-0.55, 0.55]) {
      const leg = box(0.08, 0.42, 0.4, lambert({ color: '#7d6a5a' }));
      leg.position.set(x, 0.21, 0);
      b.add(leg);
    }
    return b;
  };
  place(bench(), 1.2, -2.6);
  place(bench(), -2.9, 1.0, Math.PI / 2);
  for (const [x, z, i] of [[-3.4, -3.4, 0], [3.4, -3.3, 1], [3.3, 3.2, 2]] as const) place(plant(seed + 30 + i).object, x, z);
  const tent = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.6, 4), lambert({ color: '#f6d55c', flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.9;
  tent.add(roof);
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    const leg = box(0.06, 1.6, 0.06, lambert({ color: '#ffffff' }));
    leg.position.set(x, 0.8, z);
    tent.add(leg);
  }
  // 審査員席の札（ほこりちゃんが座る）
  const sign = box(0.7, 0.3, 0.04, lambert({ color: '#fff6e8' }));
  sign.position.set(0, 0.15, 0.85);
  tent.add(sign);
  place(tent, 2.6, 1.0);
  // コーン
  for (const [x, z] of [[-1.2, 3.4], [0.4, 3.5]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), lambert({ color: '#f2635a' }));
    cone.position.y = 0.2;
    const c = new THREE.Group();
    c.add(cone);
    place(c, x, z);
  }
  return {
    group: g,
    surface: { minX: -half + 0.35, maxX: half - 0.35, minZ: -half + 0.35, maxZ: half - 0.35, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-half - 0.4, 0, -half - 0.4), new THREE.Vector3(half, 2.6, half)),
    scale: 1,
    lint: false,
    seat: new THREE.Vector3(2.6, 0, 1.0),
  };
}

/** 大会の会場 */
export function buildContest(seed: number): SpotLayout {
  return contestLayout(seed);
}

// ---- 3章：駅のホームと学校の教室 ----

/** ホームの床：コンクリートのタイルと、手前の黄色い点字ブロック */
function platformTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = '#d8d2cc';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#c9c3bd';
  for (let i = 0; i < 32; i += 8) {
    ctx.fillRect(i, 0, 1, 32);
    ctx.fillRect(0, i, 32, 1);
  }
  return toTexture(canvas, [4, 4]);
}

function timetableTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 24);
  ctx.fillStyle = '#3e5076';
  ctx.fillRect(0, 0, 32, 24);
  ctx.fillStyle = '#f6d55c';
  for (let y = 4; y < 22; y += 4) {
    ctx.fillRect(3, y, 6, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(12, y, 16, 2);
    ctx.fillStyle = '#f6d55c';
  }
  return toTexture(canvas);
}

function blackboardTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(48, 24);
  ctx.fillStyle = '#3f6b55';
  ctx.fillRect(0, 0, 48, 24);
  ctx.fillStyle = '#ffffff';
  // 先生の落書き（ほこりちゃんの絵と線）
  ctx.fillRect(6, 6, 10, 1);
  ctx.fillRect(6, 10, 14, 1);
  ctx.fillRect(6, 14, 8, 1);
  ctx.fillStyle = '#f6cfd8';
  ctx.fillRect(30, 7, 8, 6);
  ctx.fillRect(29, 9, 10, 3);
  ctx.fillStyle = '#3b2622';
  ctx.fillRect(32, 9, 1, 1);
  ctx.fillRect(35, 9, 1, 1);
  ctx.fillStyle = '#a0644a';
  ctx.fillRect(0, 22, 48, 2);
  return toTexture(canvas);
}

function stationLayout(seed: number): SpotLayout {
  const g = new THREE.Group();
  const half = 3.6;
  buildShell(g, half, seed, { base: '#e8eef6', stripe: '#d6e0ee' }, platformTexture());
  const blockers: Blocker[] = [];
  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y += ry;
    g.add(obj);
    blockers.push(blockerOf(obj));
  };
  // 手前の線路側のふちに点字ブロック
  const tactile = box(half * 2, 0.02, 0.35, lambert({ color: '#f6d55c' }));
  tactile.position.set(0, 0.01, half - 0.3);
  g.add(tactile);
  wallDecal(g, half, 'back', -1.2, 1.5, 1.6, 1.2, timetableTexture());
  // ベンチ・柱・自動販売機
  const bench = () => {
    const b = new THREE.Group();
    const seat = box(1.3, 0.08, 0.42, lambert({ color: '#5d74a8' }));
    seat.position.y = 0.42;
    const back = box(1.3, 0.4, 0.06, lambert({ color: '#5d74a8' }));
    back.position.set(0, 0.66, -0.18);
    b.add(seat, back);
    for (const x of [-0.5, 0.5]) {
      const leg = box(0.06, 0.42, 0.36, lambert({ color: '#8a8696' }));
      leg.position.set(x, 0.21, 0);
      b.add(leg);
    }
    return b;
  };
  place(bench(), 1.3, -half + 0.45);
  place(bench(), -half + 0.45, 1.0, Math.PI / 2);
  for (const [x, z] of [[-1.0, 0.6], [1.6, 1.2]]) {
    const p = new THREE.Group();
    const pillar = box(0.3, 2.6, 0.3, lambert({ color: '#c9c3bd' }));
    pillar.position.y = 1.3;
    p.add(pillar);
    place(p, x, z);
  }
  const vending = frontBox(0.8, 1.7, 0.6, lambert({ color: '#f2635a' }), lambert({ map: shopFrontTexture('#f2635a') }));
  vending.position.y = 0.85;
  const v = new THREE.Group();
  v.add(vending);
  place(v, half - 0.5, -half + 0.4);
  return {
    group: g,
    surface: { minX: -half + 0.35, maxX: half - 0.35, minZ: -half + 0.35, maxZ: half - 0.35, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-half - 0.2, 0, -half - 0.2), new THREE.Vector3(half, 2.8, half)),
    scale: 1,
    lint: false,
  };
}

function classroomLayout(seed: number): SpotLayout {
  const g = new THREE.Group();
  const half = 3.7;
  buildShell(g, half, seed, { base: '#f8ecd8', stripe: '#f2dcc0' });
  const blockers: Blocker[] = [];
  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y += ry;
    g.add(obj);
    blockers.push(blockerOf(obj));
  };
  wallDecal(g, half, 'back', 0.2, 1.5, 2.6, 1.2, blackboardTexture());
  // 教卓と、生徒の机（2列×2）
  const lectern = frontBox(1.2, 0.9, 0.55, lambert({ map: woodTexture(seed, PALETTE.wood) }), lambert({ map: woodTexture(seed + 1, PALETTE.wood, 1) }));
  lectern.position.y = 0.45;
  const lg = new THREE.Group();
  lg.add(lectern);
  place(lg, 0.2, -half + 1.0);
  const desk = (i: number) => {
    const d = new THREE.Group();
    const top = box(0.8, 0.06, 0.55, lambert({ map: woodTexture(seed + 10 + i, PALETTE.woodLight) }));
    top.position.y = 0.62;
    d.add(top);
    for (const [x, z] of [[-0.34, -0.22], [0.34, -0.22], [-0.34, 0.22], [0.34, 0.22]]) {
      const leg = box(0.05, 0.6, 0.05, lambert({ color: '#8a8696' }));
      leg.position.set(x, 0.3, z);
      d.add(leg);
    }
    const chair = box(0.45, 0.06, 0.42, lambert({ color: PALETTE.woodLight }));
    chair.position.set(0, 0.38, 0.5);
    d.add(chair);
    return d;
  };
  let i = 0;
  for (const x of [-1.3, 1.3]) for (const z of [0.3, 2.0]) place(desk(i++), x, z);
  // 窓ぎわのロッカー
  const locker = frontBox(0.5, 1.2, 2.2, lambert({ color: '#cfd8e6' }), lambert({ color: '#b8c4d6' }));
  locker.position.y = 0.6;
  const lk = new THREE.Group();
  lk.add(locker);
  place(lk, -half + 0.35, -0.6);
  return {
    group: g,
    surface: { minX: -half + 0.35, maxX: half - 0.35, minZ: -half + 0.35, maxZ: half - 0.35, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-half - 0.2, 0, -half - 0.2), new THREE.Vector3(half, 2.8, half)),
    scale: 1,
    lint: false,
  };
}

// ---- 4章：思い出の倉庫（丘へ引っこしたあとの倉庫） ----

/** 壁に飾るほこりちゃんの写真（ドット絵）。seed で背景・大きさ・リボンが変わる */
function photoTexture(seed: number): THREE.CanvasTexture {
  const rng = createRandom(seed);
  const [canvas, ctx] = makeCanvas(20, 16);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 20, 16);
  const bgs = ['#cfe6f8', '#f6cfd8', '#e6e0f2', '#fbe9a0', '#d4f0e4'];
  ctx.fillStyle = bgs[Math.floor(rng() * bgs.length)];
  ctx.fillRect(1, 1, 18, 14);
  // ほこりちゃん（だんだん大きくなる記念写真）
  const r = 3 + Math.floor(rng() * 3);
  const cx = 10;
  const cy = 15 - r;
  for (let y = -r; y <= r; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = (x * x) / ((r + 1) * (r + 1)) + (y * y) / (r * r);
      if (d > 1) continue;
      ctx.fillStyle = d > 0.75 ? '#c3b4cf' : y > r * 0.4 ? '#e6e0f2' : '#fffaf2';
      ctx.fillRect(cx + x, cy + y, 1, 1);
    }
  }
  ctx.fillStyle = '#3b2622';
  ctx.fillRect(cx - 2, cy, 1, 1);
  ctx.fillRect(cx + 1, cy, 1, 1);
  ctx.fillStyle = '#f4a7b9';
  ctx.fillRect(cx - 3, cy + 1, 1, 1);
  ctx.fillRect(cx + 2, cy + 1, 1, 1);
  if (rng() < 0.5) {
    ctx.fillStyle = '#f08a9a';
    ctx.fillRect(cx + r - 2, cy - r, 2, 1);
  }
  return toTexture(canvas);
}

function oldWarehouseLayout(seed: number): SpotLayout {
  const g = new THREE.Group();
  const half = 3.8;
  buildShell(g, half, seed, { base: '#f2e2c6', stripe: '#e8d2b0' });
  const blockers: Blocker[] = [];
  const place = (obj: THREE.Object3D, x: number, z: number, ry = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y += ry;
    g.add(obj);
    blockers.push(blockerOf(obj));
  };
  // 壁いっぱいの写真
  for (let i = 0; i < 5; i++) wallDecal(g, half, 'back', -2.8 + i * 1.3, 1.3 + (i % 2) * 0.55, 0.9, 0.72, photoTexture(seed + i));
  for (let i = 0; i < 4; i++) wallDecal(g, half, 'left', -2.6 + i * 1.4, 1.4 + ((i + 1) % 2) * 0.5, 0.9, 0.72, photoTexture(seed + 10 + i));
  // 歴代の掃除道具の棚（素手の手ぶくろ・ぞうきん・モップ・掃除機）
  const rack = new THREE.Group();
  const shelf = box(2.6, 0.08, 0.5, lambert({ map: woodTexture(seed, PALETTE.wood) }));
  shelf.position.y = 0.5;
  rack.add(shelf);
  for (const x of [-1.25, 1.25]) {
    const leg = box(0.08, 0.5, 0.45, lambert({ color: PALETTE.woodDark }));
    leg.position.set(x, 0.25, 0);
    rack.add(leg);
  }
  const rag = box(0.4, 0.05, 0.3, lambert({ color: '#f3d27a' }));
  rag.position.set(-0.9, 0.57, 0);
  const mopStick = box(0.05, 1.3, 0.05, lambert({ color: '#9a86c6' }));
  mopStick.position.set(-0.2, 1.15, -0.1);
  mopStick.rotation.z = 0.15;
  const mopHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), lambert({ color: '#ffffff' }));
  mopHead.position.set(-0.3, 0.68, -0.1);
  const vac = box(0.4, 0.35, 0.3, lambert({ color: '#f4a7b9' }));
  vac.position.set(0.6, 0.72, 0);
  const vacStick = box(0.05, 1.1, 0.05, lambert({ color: '#c8d8f0' }));
  vacStick.position.set(0.95, 1.1, -0.12);
  rack.add(rag, mopStick, mopHead, vac, vacStick);
  place(rack, 1.2, -half + 0.35);
  // むかしのケース（ガラス）と、大きなクッション
  const caseGroup = new THREE.Group();
  const base = box(1.1, 0.12, 1.1, lambert({ map: woodTexture(seed + 3, PALETTE.wood) }));
  base.position.y = 0.06;
  const glass = box(1.1, 0.8, 1.1, new THREE.MeshLambertMaterial({ color: '#dff3ff', transparent: true, opacity: 0.35 }));
  glass.position.y = 0.52;
  caseGroup.add(base, glass);
  place(caseGroup, -half + 0.8, -0.8);
  const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.25, 16), lambert({ color: '#f6cfd8' }));
  cushion.position.y = 0.125;
  const cg = new THREE.Group();
  cg.add(cushion);
  place(cg, 1.3, 1.2);
  return {
    group: g,
    surface: { minX: -half + 0.35, maxX: half - 0.35, minZ: -half + 0.35, maxZ: half - 0.35, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-half - 0.2, 0, -half - 0.2), new THREE.Vector3(half, 2.8, half)),
    scale: 1,
    lint: false,
  };
}

/** 金のふちの額に入った写真 */
function framedPhoto(seed: number): THREE.CanvasTexture {
  const photo = photoTexture(seed);
  const [canvas, ctx] = makeCanvas(26, 22);
  ctx.fillStyle = '#c99a2e';
  ctx.fillRect(0, 0, 26, 22);
  ctx.fillStyle = '#f2c94c';
  ctx.fillRect(1, 1, 24, 20);
  ctx.fillStyle = '#fff2a8';
  ctx.fillRect(1, 1, 24, 1);
  ctx.drawImage(photo.image as HTMLCanvasElement, 3, 3);
  photo.dispose();
  return toTexture(canvas);
}

/** 大理石の市松もようの床 */
function marbleTexture(repeat: number): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = '#f6f0ea';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#e6dcd0';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillRect(8, 8, 8, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(2, 11, 3, 1);
  ctx.fillRect(10, 3, 4, 1);
  return toTexture(canvas, [repeat, repeat]);
}

/**
 * 思い出の倉庫を改築した「ほこりちゃん記念館」の中。
 * 大理石の床と赤いじゅうたん、金の額の写真、見つけた宝物のガラスケース、
 * まんなかに金のほこりちゃん像（ロープで囲む）、天井にシャンデリア、歴代の掃除道具のケース。
 */
function museumLayout(seed: number, treasures: readonly string[]): SpotLayout {
  const g = new THREE.Group();
  const half = 3.8;
  buildShell(g, half, seed, { base: '#f8f0e2', stripe: '#efd9a8' }, marbleTexture(half));
  const blockers: Blocker[] = [];
  const place = (obj: THREE.Object3D, x: number, z: number, block = true) => {
    obj.position.set(x, 0, z);
    g.add(obj);
    if (block) blockers.push(blockerOf(obj));
  };
  const gold = lambert({ color: '#f2c94c' });
  const marble = lambert({ color: '#efe9e0' });
  const velvet = lambert({ color: '#d9506a' });
  // 赤いじゅうたん（奥から手前へ）
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(1.1, half * 2 - 0.4), new THREE.MeshLambertMaterial({ color: '#d9506a' }));
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0.6, 0.012, 0.2);
  g.add(carpet);
  // 金の額の写真（奥の壁は大きく、左の壁にも）
  for (let i = 0; i < 4; i++) wallDecal(g, half, 'back', -2.6 + i * 1.75, 1.55 + (i % 2) * 0.35, 1.25, 1.05, framedPhoto(seed + i));
  for (let i = 0; i < 3; i++) wallDecal(g, half, 'left', -2.5 + i * 1.9, 1.6 + ((i + 1) % 2) * 0.3, 1.2, 1.0, framedPhoto(seed + 20 + i));
  // 宝物のガラスケース（左の壁ぞいに3つ。見つけた宝物をかざる）
  for (let c = 0; c < 3; c++) {
    const cg = new THREE.Group();
    const stand = box(0.9, 0.7, 0.6, marble);
    stand.position.y = 0.35;
    const cloth = box(0.8, 0.04, 0.5, velvet);
    cloth.position.y = 0.72;
    const glass = box(0.9, 0.5, 0.6, new THREE.MeshLambertMaterial({ color: '#dff3ff', transparent: true, opacity: 0.3 }));
    glass.position.y = 0.97;
    const trim = box(0.94, 0.04, 0.64, gold);
    trim.position.y = 1.24;
    cg.add(stand, cloth, glass, trim);
    const items = treasures.slice(c * 4, c * 4 + 4);
    items.forEach((color, k) => {
      const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshLambertMaterial({ color, flatShading: true }));
      gem.position.set(-0.27 + k * 0.18, 0.82, (k % 2) * 0.12 - 0.06);
      cg.add(gem);
    });
    cg.rotation.y = Math.PI / 2;
    place(cg, -half + 0.45, -2.2 + c * 1.6);
  }
  // まんなかの金のほこりちゃん像と、ロープの囲い
  const statue = new THREE.Group();
  const pedestal = box(0.7, 0.55, 0.7, marble);
  pedestal.position.y = 0.275;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), lambert({ color: '#f2c94c', flatShading: true }));
  body.position.y = 0.88;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 6), lambert({ color: '#fff2a8' }));
  crown.position.y = 1.25;
  statue.add(pedestal, body, crown);
  for (const x of [-0.11, 0.11]) {
    const eye = box(0.05, 0.08, 0.02, lambert({ color: '#6b4a1a' }));
    eye.position.set(x, 0.92, 0.33);
    statue.add(eye);
  }
  for (const [x, z] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.6, 6), gold);
    post.position.set(x, 0.3, z);
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), gold);
    ball.position.set(x, 0.63, z);
    statue.add(post, ball);
  }
  for (const [x, z, w, d] of [[0, -0.75, 1.5, 0.04], [0, 0.75, 1.5, 0.04], [-0.75, 0, 0.04, 1.5], [0.75, 0, 0.04, 1.5]] as const) {
    const rope = box(w, 0.04, d, velvet);
    rope.position.set(x, 0.5, z);
    statue.add(rope);
  }
  place(statue, 0.6, 0.4);
  // 歴代の掃除道具（ガラスケースの中）
  const tools = new THREE.Group();
  const shelf = box(1.6, 0.6, 0.5, marble);
  shelf.position.y = 0.3;
  const toolGlass = box(1.6, 0.8, 0.5, new THREE.MeshLambertMaterial({ color: '#dff3ff', transparent: true, opacity: 0.3 }));
  toolGlass.position.y = 1.0;
  const rag = box(0.35, 0.05, 0.25, lambert({ color: '#f3d27a' }));
  rag.position.set(-0.5, 0.63, 0);
  const mop = box(0.05, 0.75, 0.05, lambert({ color: '#9a86c6' }));
  mop.position.set(-0.05, 1.0, 0);
  mop.rotation.z = 0.2;
  const vac = box(0.35, 0.3, 0.25, lambert({ color: '#f4a7b9' }));
  vac.position.set(0.45, 0.75, 0);
  tools.add(shelf, toolGlass, rag, mop, vac);
  place(tools, 2.3, -half + 0.35);
  // 天井のシャンデリア（当たり判定なし）
  const chandelier = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 4, 16), gold);
  ring.rotation.x = Math.PI / 2;
  chandelier.add(ring);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const light = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), new THREE.MeshBasicMaterial({ color: '#fff2c4' }));
    light.position.set(Math.cos(a) * 0.5, 0.08, Math.sin(a) * 0.5);
    chandelier.add(light);
  }
  chandelier.position.set(0.6, 2.6, 0.4);
  g.add(chandelier);
  // すみの鉢植え
  place(plant(seed + 9).object, 2.9, 2.9);
  return {
    group: g,
    surface: { minX: -half + 0.35, maxX: half - 0.35, minZ: -half + 0.35, maxZ: half - 0.35, y: 0 },
    blockers,
    view: new THREE.Box3(new THREE.Vector3(-half - 0.2, 0, -half - 0.2), new THREE.Vector3(half, 2.8, half)),
    scale: 1,
    lint: false,
  };
}

/** 掃除場所の見た目。思い出の倉庫は、記念館に改築していれば豪華に */
export function buildSpot(id: SpotId, seed: number, opts: { museum?: boolean; treasures?: readonly string[] } = {}): SpotLayout {
  if (id === 'oldWarehouse' && opts.museum) return museumLayout(seed, opts.treasures ?? []);
  switch (id) {
    case 'window':
      return windowLayout();
    case 'washer':
      return washerLayout();
    case 'shelf':
      return shelfLayout(seed);
    case 'living':
      return roomLayout(buildLivingRoom(seed));
    case 'myroom':
      return roomLayout(buildCleaningRoom(seed));
    case 'friendRoom':
      return roomLayout(buildFriendRoom(seed));
    case 'friendEntrance':
      return entranceLayout();
    case 'flowerShop':
      return shopLayout('flower', seed);
    case 'bakery':
      return shopLayout('bakery', seed);
    case 'grandmaRoom':
      return shopLayout('grandma', seed);
    case 'station':
      return stationLayout(seed);
    case 'classroom':
      return classroomLayout(seed);
    case 'oldWarehouse':
      return oldWarehouseLayout(seed);
  }
}
