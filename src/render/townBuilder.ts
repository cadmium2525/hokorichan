// まち（オーバーワールド）の手続き生成。自宅・ショップ・友だちの家・空き地と、道・木・花。

import * as THREE from 'three';
import { createRandom, randRange } from '../game/rng.ts';
import { makeCanvas, PALETTE, toTexture } from './proceduralArt.ts';
import { blockerOf, box, lambert, type Blocker } from './roomBuilder.ts';

export type BuildingId = 'home' | 'shop' | 'friend' | 'lot' | 'flower' | 'bakery' | 'grandma' | 'board';

export type Building = {
  id: BuildingId;
  /** ラベルを出す位置（屋根の上） */
  labelAt: THREE.Vector3;
  /** 入口の前の地面。ここに着くと中に入る */
  door: THREE.Vector3;
  /** タップ判定用のメッシュ */
  hit: THREE.Object3D;
};

export type Town = {
  group: THREE.Group;
  buildings: Record<BuildingId, Building>;
  blockers: Blocker[];
  /** 歩ける範囲（XZ） */
  half: number;
};

function grassTexture(): THREE.CanvasTexture {
  const rng = createRandom(4);
  const [canvas, ctx] = makeCanvas(32, 32);
  ctx.fillStyle = '#a9d68f';
  ctx.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rng() < 0.5 ? '#9bcb82' : '#b8e09e';
    ctx.fillRect(Math.floor(rng() * 32), Math.floor(rng() * 32), 2, 1);
  }
  return toTexture(canvas, [9, 9]);
}

function pathTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 16);
  ctx.fillStyle = '#efd9b4';
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = '#e4c99e';
  ctx.fillRect(2, 3, 3, 2);
  ctx.fillRect(10, 9, 4, 2);
  ctx.fillRect(6, 13, 2, 1);
  return toTexture(canvas, [1, 1]);
}

function windowTile(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(8, 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#9fd2f0';
  ctx.fillRect(1, 1, 6, 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(3, 1, 1, 6);
  ctx.fillRect(1, 3, 6, 1);
  return toTexture(canvas);
}

function awningTexture(color: string = PALETTE.lavenderDeep): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 4);
  for (let x = 0; x < 16; x += 4) {
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, 2, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 2, 0, 2, 4);
  }
  return toTexture(canvas, [3, 1]);
}

/** 家：箱の壁＋四角すいの屋根。入口は +Z 側（カメラに見える面） */
function house(opts: { w: number; d: number; h: number; wall: string; roof: string; door: string }): THREE.Group {
  const g = new THREE.Group();
  const wall = box(opts.w, opts.h, opts.d, lambert({ color: opts.wall }));
  wall.position.y = opts.h / 2;
  const roofH = Math.min(opts.w, opts.d) * 0.55;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(opts.w, opts.d) / 2 + 0.25, roofH, 4, 1), lambert({ color: opts.roof, flatShading: true }));
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(opts.w / Math.max(opts.w, opts.d), 1, opts.d / Math.max(opts.w, opts.d));
  roof.position.y = opts.h + roofH / 2;
  const door = box(0.6, 1.0, 0.06, lambert({ color: opts.door }));
  door.position.set(0, 0.5, opts.d / 2 + 0.03);
  const win = new THREE.MeshBasicMaterial({ map: windowTile() });
  for (const x of [-opts.w * 0.3, opts.w * 0.3]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), win);
    w.position.set(x, opts.h * 0.6, opts.d / 2 + 0.01);
    g.add(w);
  }
  const side = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), win);
  side.rotation.y = Math.PI / 2;
  side.position.set(opts.w / 2 + 0.01, opts.h * 0.6, 0);
  g.add(wall, roof, door, side);
  return g;
}

function tree(seed: number): THREE.Group {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.6, 6), lambert({ color: PALETTE.woodDark }));
  trunk.position.y = 0.3;
  g.add(trunk);
  const leafMats = [lambert({ color: PALETTE.leaf, flatShading: true }), lambert({ color: PALETTE.leafDark, flatShading: true })];
  for (let i = 0; i < 3; i++) {
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(randRange(rng, 0.38, 0.5), 0), leafMats[i % 2]);
    leaves.position.set(randRange(rng, -0.15, 0.15), 0.8 + i * 0.22, randRange(rng, -0.15, 0.15));
    g.add(leaves);
  }
  return g;
}

function flowerPatch(seed: number): THREE.Group {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const colors = [PALETTE.pink, '#ffffff', '#f3d27a', PALETTE.lavender];
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), lambert({ color: colors[i % colors.length] }));
    f.position.set(randRange(rng, -0.4, 0.4), 0.08, randRange(rng, -0.4, 0.4));
    g.add(f);
  }
  return g;
}

/** 空き地：柵で囲った土と「準備中」の看板（将来ほこりちゃんの倉庫を建てる場所） */
function vacantLot(): THREE.Group {
  const g = new THREE.Group();
  const dirt = box(3.4, 0.04, 2.8, lambert({ color: '#d9b98c' }));
  dirt.position.y = 0.02;
  g.add(dirt);
  const wood = lambert({ color: PALETTE.woodLight });
  for (const [x, z, w, d] of [[0, -1.4, 3.4, 0.06], [-1.7, 0, 0.06, 2.8], [1.7, 0, 0.06, 2.8], [-1.0, 1.4, 1.4, 0.06], [1.0, 1.4, 1.4, 0.06]]) {
    const rail = box(w, 0.08, d, wood);
    rail.position.set(x, 0.35, z);
    g.add(rail);
  }
  for (const [x, z] of [[-1.7, -1.4], [1.7, -1.4], [-1.7, 1.4], [1.7, 1.4], [-0.3, 1.4], [0.3, 1.4]]) {
    const post = box(0.1, 0.5, 0.1, wood);
    post.position.set(x, 0.25, z);
    g.add(post);
  }
  const sign = box(0.8, 0.5, 0.06, lambert({ color: '#fff6dc' }));
  sign.position.set(0, 0.9, 1.45);
  const signPost = box(0.08, 0.7, 0.08, wood);
  signPost.position.set(0, 0.35, 1.45);
  const tape = box(0.82, 0.08, 0.07, lambert({ color: '#f3d27a' }));
  tape.position.set(0, 1.0, 1.46);
  g.add(sign, signPost, tape);
  return g;
}

/** 依頼の掲示板 */
function board(): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert({ color: PALETTE.wood });
  for (const x of [-0.45, 0.45]) {
    const post = box(0.1, 1.2, 0.1, wood);
    post.position.set(x, 0.6, 0);
    g.add(post);
  }
  const panel = box(1.1, 0.7, 0.08, lambert({ color: PALETTE.woodLight }));
  panel.position.set(0, 1.05, 0);
  const roof = box(1.3, 0.08, 0.3, lambert({ color: '#a58fd0' }));
  roof.position.set(0, 1.45, 0);
  g.add(panel, roof);
  const papers = ['#ffffff', '#fff3c4', '#ffe4ec'];
  papers.forEach((c, i) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32), new THREE.MeshBasicMaterial({ color: c }));
    p.position.set(-0.32 + i * 0.32, 1.05, 0.05);
    p.rotation.z = (i - 1) * 0.08;
    g.add(p);
  });
  return g;
}

/** 空き地に置いたほこりちゃんのコンテナ（2章） */
function containerOnLot(): THREE.Group {
  const g = new THREE.Group();
  const dirt = box(3.4, 0.04, 2.8, lambert({ color: '#d9b98c' }));
  dirt.position.y = 0.02;
  const body = box(2.6, 1.6, 1.6, lambert({ color: '#86bcd1' }));
  body.position.set(0, 0.84, -0.2);
  const stripes = lambert({ color: '#6fa6bd' });
  for (let i = -1.1; i <= 1.11; i += 0.37) {
    const rib = box(0.06, 1.5, 1.62, stripes);
    rib.position.set(i, 0.84, -0.2);
    g.add(rib);
  }
  const door = box(1.0, 1.3, 0.04, lambert({ color: '#5f93aa' }));
  door.position.set(0, 0.7, 0.62);
  const heart = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), new THREE.MeshBasicMaterial({ color: PALETTE.pink }));
  heart.position.set(0, 1.15, 0.65);
  g.add(dirt, body, door, heart);
  return g;
}

/** 3章：空き地に建てた倉庫 */
function warehouseOnLot(): THREE.Group {
  const g = new THREE.Group();
  const dirt = box(3.4, 0.04, 2.8, lambert({ color: '#d9b98c' }));
  dirt.position.y = 0.02;
  const body = box(3.0, 2.0, 2.2, lambert({ color: '#f2e2c6' }));
  body.position.set(0, 1.0, -0.2);
  // 切妻屋根（2枚の板）
  const roofMat = lambert({ color: '#a0644a' });
  for (const side of [-1, 1]) {
    const r = box(3.2, 0.1, 1.35, roofMat);
    r.position.set(0, 2.3, -0.2 + side * 0.55);
    r.rotation.x = side * 0.5;
    g.add(r);
  }
  const door = box(1.3, 1.5, 0.04, lambert({ color: '#b8754f' }));
  door.position.set(0, 0.76, 0.92);
  const heart = new THREE.Mesh(new THREE.CircleGeometry(0.18, 12), new THREE.MeshBasicMaterial({ color: PALETTE.pink }));
  heart.position.set(0, 1.75, 0.92);
  g.add(dirt, body, door, heart);
  return g;
}

export type TownOptions = { lotOwned: boolean; warehouse?: boolean };

/** 建物どうしの間隔の倍率（建物の大きさは変えない） */
const SPACING = 1.3;

export function buildTown(opts: TownOptions = { lotOwned: false }): Town {
  const K = SPACING;
  const half = 10 * K;
  const group = new THREE.Group();
  const blockers: Blocker[] = [];

  const ground = box(half * 2 + 2, 0.4, half * 2 + 2, lambert({ map: grassTexture() }));
  ground.position.y = -0.2;
  group.add(ground);

  const path = lambert({ map: pathTexture() });
  const road = (x: number, z: number, w: number, d: number) => {
    const p = box(w, 0.02, d, path);
    p.position.set(x, 0.01, z);
    group.add(p);
  };
  // 横の大通り（北）と商店街通り（南）。建物は手前の建物が入口を隠さない並びにしてある
  const ROAD_W = 1.2;
  const mainZ = 1.8 * K;
  const southZ = 8.6 * K;
  road(0, mainZ, half * 2 - 1, ROAD_W);
  road(0, southZ, half * 2 - 1, ROAD_W);
  // 2本の通りをつなぐ縦の道
  for (const x of [-4.2 * K, 4.4 * K]) {
    const z0 = mainZ + ROAD_W / 2;
    const z1 = southZ - ROAD_W / 2;
    road(x, (z0 + z1) / 2, 0.9, z1 - z0);
  }
  /** 入口（南向き）から通りまでの小道 */
  const lane = (x: number, frontZ: number, roadZ: number) => {
    const z1 = roadZ - ROAD_W / 2;
    if (z1 - frontZ > 0.05) road(x, (frontZ + z1) / 2, 1.0, z1 - frontZ);
  };

  const place = (object: THREE.Object3D, x: number, z: number, block = true) => {
    object.position.set(x, 0, z);
    group.add(object);
    if (block) blockers.push(blockerOf(object));
  };
  /** 家は屋根のひさしではなく壁だけを当たり判定にする（入口に近づけるように） */
  const placeHouse = (object: THREE.Object3D, x: number, z: number, w: number, d: number, roadZ: number) => {
    object.position.set(x, 0, z);
    group.add(object);
    blockers.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: 3 });
    lane(x, z + d / 2, roadZ);
  };

  const homeObj = house({ w: 3.0, d: 2.4, h: 1.9, wall: '#fff4e2', roof: '#e98aa6', door: PALETTE.wood });
  placeHouse(homeObj, -4.5 * K, -0.5 * K, 3.0, 2.4, mainZ);
  const shopObj = house({ w: 3.0, d: 2.2, h: 1.7, wall: '#f4effa', roof: '#a58fd0', door: '#8ec1ea' });
  placeHouse(shopObj, -0.8 * K, -3.8 * K, 3.0, 2.2, mainZ);
  const awning = box(3.1, 0.08, 0.6, lambert({ map: awningTexture() }));
  awning.position.set(shopObj.position.x, 1.25, shopObj.position.z + 1.1 + 0.3);
  awning.rotation.x = 0.3;
  group.add(awning);
  const friendObj = house({ w: 2.8, d: 2.4, h: 1.9, wall: '#e6f4ee', roof: '#6fb7a0', door: '#f3d27a' });
  placeHouse(friendObj, 3.6 * K, -1.2 * K, 2.8, 2.4, mainZ);
  const lotObj = opts.warehouse ? warehouseOnLot() : opts.lotOwned ? containerOnLot() : vacantLot();
  // 空き地は柵ごと当たり判定（入口は南の通り側）
  const lotX = 2.0 * K;
  const lotZ = 4.6 * K;
  lotObj.position.set(lotX, 0, lotZ);
  group.add(lotObj);
  blockers.push({ minX: lotX - 1.7, maxX: lotX + 1.7, minZ: lotZ - 1.4, maxZ: lotZ + 1.4, height: 2 });
  lane(lotX, lotZ + 1.4, southZ);

  // 商店街（南の通りに面している）
  const flowerObj = house({ w: 2.6, d: 2.0, h: 1.7, wall: '#fbfbf4', roof: '#7fb77e', door: PALETTE.pink });
  placeHouse(flowerObj, -6.0 * K, southZ - 2.1, 2.6, 2.0, southZ);
  const bakeryObj = house({ w: 2.6, d: 2.0, h: 1.7, wall: '#fff1dc', roof: '#c98a4b', door: '#9c6438' });
  placeHouse(bakeryObj, -2.4 * K, southZ - 2.1, 2.6, 2.0, southZ);
  const grandmaObj = house({ w: 2.8, d: 2.4, h: 1.8, wall: '#efe4cf', roof: '#5f6f86', door: '#9c6438' });
  placeHouse(grandmaObj, 6.4 * K, southZ - 2.3, 2.8, 2.4, southZ);
  for (const [obj, color] of [[flowerObj, PALETTE.pink], [bakeryObj, '#f3d27a']] as const) {
    const a = box(2.7, 0.08, 0.55, lambert({ map: awningTexture(color) }));
    a.position.set(obj.position.x, 1.2, obj.position.z + 1.0 + 0.28);
    a.rotation.x = 0.3;
    group.add(a);
  }
  const boardObj = board();
  place(boardObj, -2.2 * K, mainZ + 1.3);

  // 木と花（端と建物のすき間）
  const trees: Array<[number, number]> = [
    [-6.5, -6.5], [-6.8, 3.6], [6.6, -6.2], [6.6, 4.0], [-3.6, -6.6], [8.8, 4.4], [-8.6, 5.0], [-0.2, 9.6], [3.2, -6.4],
    [-8.8, -8.8], [8.8, -8.6], [-8.8, -2.5], [8.9, 0.5], [4.5, -8.6], [-4.5, -8.8], [8.6, 9.4], [-8.6, 9.4],
    [0.6, -1.2], [-8.4, 7.4],
  ];
  trees.forEach(([x, z], i) => place(tree(i + 3), x * K, z * K));
  const flowers: Array<[number, number]> = [[1.6, -4.6], [-5.6, 3.9], [5.6, 3.9], [-3.0, 5.5], [-2.6, -1.4], [1.0, 9.6], [-7.6, 9.6], [6.4, -3.6]];
  flowers.forEach(([x, z], i) => place(flowerPatch(i + 20), x * K, z * K, false));

  /** 入口は +Z 側。front=-1 なら -Z 側（空き地は道に面した奥側から入る） */
  const building = (id: BuildingId, obj: THREE.Object3D, depthHalf: number, labelY: number, front = 1): Building => ({
    id,
    hit: obj,
    labelAt: new THREE.Vector3(obj.position.x, labelY, obj.position.z),
    door: new THREE.Vector3(obj.position.x, 0, obj.position.z + front * (depthHalf + 0.45)),
  });
  return {
    group,
    blockers,
    half,
    buildings: {
      home: building('home', homeObj, 1.2, 3.4),
      shop: building('shop', shopObj, 1.1, 3.2),
      friend: building('friend', friendObj, 1.2, 3.4),
      lot: building('lot', lotObj, 1.4, opts.warehouse ? 3.2 : opts.lotOwned ? 2.6 : 1.6),
      flower: building('flower', flowerObj, 1.0, 3.0),
      bakery: building('bakery', bakeryObj, 1.0, 3.0),
      grandma: building('grandma', grandmaObj, 1.2, 3.2),
      board: building('board', boardObj, 0.1, 1.9),
    },
  };
}
