// まち（オーバーワールド）の手続き生成。自宅・ショップ・友だちの家・空き地と、道・木・花。

import * as THREE from 'three';
import { createRandom, randRange } from '../game/rng.ts';
import { makeCanvas, PALETTE, toTexture } from './proceduralArt.ts';
import { blockerOf, box, lambert, type Blocker } from './roomBuilder.ts';

export type BuildingId = 'home' | 'shop' | 'friend' | 'lot' | 'flower' | 'bakery' | 'grandma' | 'board' | 'station' | 'school';

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
  /** 線路と汽車（3章で駅が開いてから） */
  railway: Railway | null;
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
  // 寄棟屋根：四角すいを壁の向きにそろえてから、縦横をのばす（回してからのばすと、ひし形にずれる）
  const roofGeo = new THREE.ConeGeometry(Math.SQRT2, roofH, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofGeo, lambert({ color: opts.roof, flatShading: true }));
  roof.scale.set(opts.w / 2 + 0.25, 1, opts.d / 2 + 0.25);
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

/** 看板（文字はCanvasで描く） */
function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 48, 16);
    ctx.fillStyle = fg;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 24, 8.5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  return tex;
}

/** 平らな屋根の建物（駅・学校）。窓を段ごとに並べる */
function flatBuilding(opts: { w: number; d: number; h: number; wall: string; roof: string; door: string; floors: number }): THREE.Group {
  const g = new THREE.Group();
  const wall = box(opts.w, opts.h, opts.d, lambert({ color: opts.wall }));
  wall.position.y = opts.h / 2;
  // 平らな屋根（少しはみ出した板と、ふちの立ち上がり）
  const slab = box(opts.w + 0.3, 0.16, opts.d + 0.3, lambert({ color: opts.roof }));
  slab.position.y = opts.h + 0.08;
  const rim = box(opts.w + 0.3, 0.14, 0.12, lambert({ color: opts.roof }));
  rim.position.set(0, opts.h + 0.23, opts.d / 2 + 0.09);
  const door = box(0.8, 1.0, 0.06, lambert({ color: opts.door }));
  door.position.set(0, 0.5, opts.d / 2 + 0.03);
  g.add(wall, slab, rim, door);
  const win = new THREE.MeshBasicMaterial({ map: windowTile() });
  const floorH = opts.h / opts.floors;
  for (let f = 0; f < opts.floors; f++) {
    const y = floorH * (f + 0.6);
    for (const x of [-opts.w * 0.36, -opts.w * 0.18, opts.w * 0.18, opts.w * 0.36]) {
      if (f === 0 && Math.abs(x) < 0.6) continue;
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), win);
      w.position.set(x, y, opts.d / 2 + 0.01);
      g.add(w);
    }
    for (const z of [-opts.d * 0.25, opts.d * 0.25]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), win);
      w.rotation.y = Math.PI / 2;
      w.position.set(opts.w / 2 + 0.01, y, z);
      g.add(w);
    }
  }
  return g;
}

/** 3章：駅（平らな紺の屋根、入口のひさし、屋根の上の看板）。うしろはホームと線路 */
function stationBuilding(): THREE.Group {
  const g = flatBuilding({ w: 4.0, d: 2.4, h: 1.7, wall: '#e8eef6', roof: '#5d74a8', door: '#8a8696', floors: 1 });
  const canopy = box(2.2, 0.08, 0.7, lambert({ color: '#5d74a8' }));
  canopy.position.set(0, 1.25, 1.55);
  for (const x of [-0.95, 0.95]) {
    const post = box(0.08, 1.25, 0.08, lambert({ color: '#c9c3bd' }));
    post.position.set(x, 0.62, 1.8);
    g.add(post);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.55), new THREE.MeshBasicMaterial({ map: signTexture('えき', '#3e5076', '#ffffff') }));
  sign.position.set(0, 2.15, 1.05);
  const signBack = box(1.7, 0.6, 0.06, lambert({ color: '#3e5076' }));
  signBack.position.set(0, 2.15, 1.0);
  g.add(canopy, signBack, sign);
  return g;
}

/** 3章：学校（2階建て、平らな屋根、真ん中に時計台） */
function schoolBuilding(): THREE.Group {
  const g = flatBuilding({ w: 4.6, d: 2.4, h: 2.4, wall: '#f8ecd8', roof: '#b8754f', door: '#b8754f', floors: 2 });
  const tower = box(1.0, 0.9, 1.0, lambert({ color: '#f8ecd8' }));
  tower.position.set(0, 2.4 + 0.45, 0.4);
  const towerRoofGeo = new THREE.ConeGeometry(Math.SQRT2, 0.6, 4, 1);
  towerRoofGeo.rotateY(Math.PI / 4);
  const towerRoof = new THREE.Mesh(towerRoofGeo, lambert({ color: '#c0703a', flatShading: true }));
  towerRoof.scale.set(0.62, 1, 0.62);
  towerRoof.position.set(0, 2.4 + 0.9 + 0.3, 0.4);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  clock.position.set(0, 2.88, 0.91);
  const hand = box(0.04, 0.22, 0.01, lambert({ color: '#3b2622' }));
  hand.position.set(0.0, 2.95, 0.92);
  const hand2 = box(0.16, 0.04, 0.01, lambert({ color: '#3b2622' }));
  hand2.position.set(0.07, 2.88, 0.92);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.45), new THREE.MeshBasicMaterial({ map: signTexture('がっこう', '#3f6b55', '#ffffff') }));
  sign.position.set(0, 1.3, 1.21);
  g.add(tower, towerRoof, clock, hand, hand2, sign);
  return g;
}

// ---- 3章：線路と、すすを出して走る汽車 ----

export type Railway = { update(dt: number): void };

/** 駅のうしろのホームと線路、ときどき走る汽車（煙＝すすの出どころ） */
function buildRailway(group: THREE.Group, blockers: Blocker[], half: number, stationX: number, trackZ: number, platformZ: [number, number]): Railway {
  // ホーム
  const platform = box(4.0, 0.25, platformZ[1] - platformZ[0], lambert({ color: '#c9c3bd' }));
  platform.position.set(stationX, 0.125, (platformZ[0] + platformZ[1]) / 2);
  const edge = box(4.0, 0.02, 0.12, lambert({ color: '#f6d55c' }));
  edge.position.set(stationX, 0.26, platformZ[0] + 0.12);
  group.add(platform, edge);
  // 線路（砂利・枕木・レール）
  const len = half * 2 + 2;
  const bed = box(len, 0.04, 1.2, lambert({ color: '#b8aca0' }));
  bed.position.set(0, 0.02, trackZ);
  group.add(bed);
  const sleeperGeo = new THREE.BoxGeometry(0.16, 0.04, 1.0);
  const count = Math.floor(len / 0.5);
  const sleepers = new THREE.InstancedMesh(sleeperGeo, lambert({ color: '#7a4632' }), count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    m.makeTranslation(-len / 2 + 0.25 + i * 0.5, 0.06, trackZ);
    sleepers.setMatrixAt(i, m);
  }
  group.add(sleepers);
  for (const dz of [-0.28, 0.28]) {
    const rail = box(len, 0.05, 0.06, lambert({ color: '#8a8696' }));
    rail.position.set(0, 0.1, trackZ + dz);
    group.add(rail);
  }
  blockers.push({ minX: -half, maxX: half, minZ: trackZ - 0.7, maxZ: trackZ + 0.7, height: 0.2 });
  blockers.push({ minX: stationX - 2, maxX: stationX + 2, minZ: platformZ[0], maxZ: platformZ[1], height: 0.3 });

  // 汽車：機関車（煙突つき）と客車2両
  const train = new THREE.Group();
  const loco = new THREE.Group();
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 10), lambert({ color: '#3e5076' }));
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.25, 0.55, 0);
  const cab = box(0.6, 0.75, 0.7, lambert({ color: '#f2635a' }));
  cab.position.set(-0.45, 0.62, 0);
  const cabRoof = box(0.75, 0.08, 0.8, lambert({ color: '#3b2622' }));
  cabRoof.position.set(-0.45, 1.03, 0);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.35, 8), lambert({ color: '#3b2622' }));
  chimney.position.set(0.6, 1.0, 0);
  loco.add(boiler, cab, cabRoof, chimney);
  loco.position.x = 1.6;
  train.add(loco);
  const winTex = windowTile();
  for (const x of [0.2, -1.3]) {
    const car = new THREE.Group();
    const body = box(1.3, 0.6, 0.7, lambert({ color: '#fff4e2' }));
    body.position.y = 0.55;
    const roof = box(1.4, 0.08, 0.78, lambert({ color: '#7fb77e' }));
    roof.position.y = 0.9;
    car.add(body, roof);
    for (const wx of [-0.35, 0.35]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.24), new THREE.MeshBasicMaterial({ map: winTex }));
      w.position.set(wx, 0.62, 0.36);
      car.add(w);
    }
    car.position.x = x;
    train.add(car);
  }
  const wheelGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.76, 8);
  const wheelMat = lambert({ color: '#22202a' });
  for (const x of [2.05, 1.4, 0.6, -0.2, -0.9, -1.7]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.18, 0);
    train.add(w);
  }
  train.position.set(-half - 4, 0, trackZ);
  train.visible = false;
  group.add(train);

  // 煙（使い回すかたまり）
  const smoke: Array<{ mesh: THREE.Mesh; life: number; vel: THREE.Vector3 }> = [];
  const smokeGeo = new THREE.IcosahedronGeometry(0.22, 0);
  for (let i = 0; i < 14; i++) {
    const mat = new THREE.MeshLambertMaterial({ color: i % 2 ? '#5a5664' : '#6e6a78', transparent: true, opacity: 0, flatShading: true, depthWrite: false });
    const mesh = new THREE.Mesh(smokeGeo, mat);
    mesh.visible = false;
    group.add(mesh);
    smoke.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let next = 0;
  const chimneyWorld = new THREE.Vector3();

  // 時刻表：入ってきて駅に3秒止まり、出ていく。28秒ごと
  const PERIOD = 28;
  let t = 0;
  const ease = (k: number) => k * k * (3 - 2 * k);
  const startX = -half - 4;
  const endX = half + 4;
  return {
    update(dt: number) {
      t = (t + dt) % PERIOD;
      let x = startX;
      let moving = false;
      if (t < 7) {
        x = startX + (stationX - startX) * ease(t / 7);
        moving = t < 6.7;
      } else if (t < 10) {
        x = stationX;
      } else if (t < 16) {
        x = stationX + (endX - stationX) * ease((t - 10) / 6);
        moving = true;
      } else x = endX;
      train.position.x = x;
      train.visible = Math.abs(x) < half + 3;
      // 走っているあいだ、煙突からすすの煙
      next -= dt;
      if (train.visible && next <= 0) {
        next = moving ? 0.18 : 0.6;
        const p = smoke.find((s) => s.life <= 0);
        if (p) {
          chimney.getWorldPosition(chimneyWorld);
          p.mesh.position.copy(chimneyWorld).setY(chimneyWorld.y + 0.15);
          p.vel.set(-0.3 + Math.random() * 0.2, 0.7, (Math.random() - 0.5) * 0.2);
          p.life = 1.6;
          p.mesh.visible = true;
        }
      }
      for (const p of smoke) {
        if (p.life <= 0) continue;
        p.life -= dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        const k = Math.max(0, p.life / 1.6);
        p.mesh.scale.setScalar(0.6 + (1 - k) * 1.4);
        (p.mesh.material as THREE.MeshLambertMaterial).opacity = 0.75 * k;
        if (p.life <= 0) p.mesh.visible = false;
      }
    },
  };
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

export type TownOptions = { lotOwned: boolean; warehouse?: boolean; railway?: boolean };

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
  // 3章のまち：北の駅と学校（大通りから小道でつながる）
  const stationObj = stationBuilding();
  placeHouse(stationObj, 7.2 * K, -5.0 * K, 4.0, 2.4, mainZ);
  const schoolObj = schoolBuilding();
  placeHouse(schoolObj, -6.9 * K, -5.4 * K, 4.6, 2.4, mainZ);
  // 駅のうしろ（北）にホームと線路。汽車は駅が開いてから走る
  const stationBack = stationObj.position.z - 1.2;
  const trackZ = stationBack - 2.6;
  const railway = buildRailway(group, blockers, half, stationObj.position.x, trackZ, [stationBack - 1.9, stationBack]);

  const boardObj = board();
  place(boardObj, -2.2 * K, mainZ + 1.3);

  // 木と花（端と建物のすき間）
  const trees: Array<[number, number]> = [
    [-6.8, 3.6], [6.6, 4.0], [-3.6, -6.6], [8.8, 4.4], [-8.6, 5.0], [-0.2, 9.6], [3.2, -6.4],
    [-8.8, -8.8], [8.8, -8.6], [-9.3, -2.2], [8.9, 0.5], [4.5, -8.6], [-4.5, -8.8], [8.6, 9.4], [-8.6, 9.4],
    [0.6, -1.2], [-8.4, 7.4],
  ];
  trees.forEach(([x, z], i) => place(tree(i + 3), x * K, z * K));
  const flowers: Array<[number, number]> = [[1.6, -4.6], [-5.6, 3.9], [5.6, 3.9], [-3.0, 5.5], [-2.6, -1.4], [1.0, 9.6], [-7.6, 9.6], [5.6, -3.0]];
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
    railway: opts.railway ? railway : null,
    buildings: {
      home: building('home', homeObj, 1.2, 3.4),
      shop: building('shop', shopObj, 1.1, 3.2),
      friend: building('friend', friendObj, 1.2, 3.4),
      lot: building('lot', lotObj, 1.4, opts.warehouse ? 3.2 : opts.lotOwned ? 2.6 : 1.6),
      flower: building('flower', flowerObj, 1.0, 3.0),
      bakery: building('bakery', bakeryObj, 1.0, 3.0),
      grandma: building('grandma', grandmaObj, 1.2, 3.2),
      board: building('board', boardObj, 0.1, 1.9),
      station: building('station', stationObj, 1.2, 3.4),
      school: building('school', schoolObj, 1.3, 3.8),
    },
  };
}
