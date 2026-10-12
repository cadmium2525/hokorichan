// まち（オーバーワールド）の手続き生成。自宅・ショップ・友だちの家・空き地と、道・木・花。

import * as THREE from 'three';
import { createRandom, randRange } from '../game/rng.ts';
import { makeCanvas, PALETTE, toTexture } from './proceduralArt.ts';
import { blockerOf, box, lambert, type Blocker } from './roomBuilder.ts';

export type BuildingId = 'home' | 'shop' | 'friend' | 'lot';

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

function awningTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(16, 4);
  for (let x = 0; x < 16; x += 4) {
    ctx.fillStyle = PALETTE.lavenderDeep;
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

export function buildTown(): Town {
  const half = 8;
  const group = new THREE.Group();
  const blockers: Blocker[] = [];

  const ground = box(half * 2 + 2, 0.4, half * 2 + 2, lambert({ map: grassTexture() }));
  ground.position.y = -0.2;
  group.add(ground);

  const path = lambert({ map: pathTexture() });
  // 横の大通りと、ショップ・友だちの家への小道
  // （カメラは +X+Z 側から見るので、建物は手前の建物が入口を隠さない並びにしてある）
  for (const [x, z, w, d] of [[0, 1.8, 15, 1.2], [-0.8, -0.5, 1.0, 3.4], [3.6, 0.95, 1.0, 0.7], [2.0, 2.85, 1.0, 0.9]]) {
    const p = box(w, 0.02, d, path);
    p.position.set(x, 0.01, z);
    group.add(p);
  }

  const place = (object: THREE.Object3D, x: number, z: number, block = true) => {
    object.position.set(x, 0, z);
    group.add(object);
    if (block) blockers.push(blockerOf(object));
  };
  /** 家は屋根のひさしではなく壁だけを当たり判定にする（入口に近づけるように） */
  const placeHouse = (object: THREE.Object3D, x: number, z: number, w: number, d: number) => {
    object.position.set(x, 0, z);
    group.add(object);
    blockers.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: 3 });
  };

  const homeObj = house({ w: 3.0, d: 2.4, h: 1.9, wall: '#fff4e2', roof: '#e98aa6', door: PALETTE.wood });
  placeHouse(homeObj, -4.5, -0.5, 3.0, 2.4);
  const shopObj = house({ w: 3.0, d: 2.2, h: 1.7, wall: '#f4effa', roof: '#a58fd0', door: '#8ec1ea' });
  placeHouse(shopObj, -0.8, -3.8, 3.0, 2.2);
  const awning = box(3.1, 0.08, 0.6, lambert({ map: awningTexture() }));
  awning.position.set(-0.8, 1.25, -3.8 + 1.1 + 0.3);
  awning.rotation.x = 0.3;
  group.add(awning);
  const friendObj = house({ w: 2.8, d: 2.4, h: 1.9, wall: '#e6f4ee', roof: '#6fb7a0', door: '#f3d27a' });
  placeHouse(friendObj, 3.6, -1.2, 2.8, 2.4);
  const lotObj = vacantLot();
  place(lotObj, 2.0, 4.6);

  // 木と花（端と建物のすき間）
  const trees: Array<[number, number]> = [[-6.5, -6.5], [-6.8, 3.6], [6.6, -6.2], [6.6, 4.0], [-3.6, -6.6], [6.8, 6.8], [-6.4, 6.4], [-1.6, 6.6], [3.2, -6.4]];
  trees.forEach(([x, z], i) => place(tree(i + 3), x, z));
  const flowers: Array<[number, number]> = [[-2.4, 3.4], [1.6, -4.6], [-5.6, 3.9], [5.6, 3.9], [-3.0, 5.5], [-2.6, -1.4]];
  flowers.forEach(([x, z], i) => place(flowerPatch(i + 20), x, z, false));

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
      lot: building('lot', lotObj, 1.4, 1.6, -1),
    },
  };
}
