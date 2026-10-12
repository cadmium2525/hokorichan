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

export function buildSpot(id: SpotId, seed: number): SpotLayout {
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
  }
}
