// 部屋と家具の手続き生成。BoxGeometry中心で、配置はシードで再現できる。

import * as THREE from 'three';
import { createRandom, pick, randRange, type Random } from '../game/rng.ts';
import {
  booksTexture,
  floorTexture,
  frameTexture,
  PALETTE,
  quiltTexture,
  rugTexture,
  wallTexture,
  type WallColors,
  windowTexture,
  woodTexture,
} from './proceduralArt.ts';

/** 床上の占有範囲（XZ平面）と高さ */
export type Blocker = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

export type Room = { group: THREE.Group; blockers: Blocker[]; half: number };

const WALL_HEIGHT = 2.8;

export function lambert(params: THREE.MeshLambertMaterialParameters): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial(params);
}

export function box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  return mesh;
}

/** 正面(+Z)だけ別マテリアルの箱 */
export function frontBox(w: number, h: number, d: number, side: THREE.Material, front: THREE.Material): THREE.Mesh {
  return box(w, h, d, [side, side, side, side, front, side]);
}

// ---- 床と壁 ----

export function buildShell(group: THREE.Group, half: number, seed: number, wall?: WallColors): void {
  const floorTop = lambert({ map: floorTexture(seed, half) });
  const floorSide = lambert({ color: PALETTE.woodDark });
  const floor = box(half * 2, 0.3, half * 2, [floorSide, floorSide, floorTop, floorSide, floorSide, floorSide]);
  floor.position.y = -0.15;
  group.add(floor);

  const wallFace = lambert({ map: wallTexture(half * 2, wall) });
  const wallTop = lambert({ color: '#f3dcc6' });
  const wallSide = lambert({ color: '#ead1bd' });
  const back = box(half * 2 + 0.2, WALL_HEIGHT, 0.2, [wallSide, wallSide, wallTop, wallSide, wallFace, wallSide]);
  back.position.set(-0.1, WALL_HEIGHT / 2, -half - 0.1);
  group.add(back);

  const left = box(0.2, WALL_HEIGHT, half * 2, [wallFace, wallSide, wallTop, wallSide, wallSide, wallSide]);
  left.position.set(-half - 0.1, WALL_HEIGHT / 2, 0);
  group.add(left);
}

/** 壁に貼る板（窓・額）。wall='back'なら+Z向き、'left'なら+X向き */
export function wallDecal(
  group: THREE.Group,
  half: number,
  wall: 'back' | 'left',
  along: number,
  y: number,
  w: number,
  h: number,
  map: THREE.Texture,
): void {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map }));
  if (wall === 'back') {
    mesh.position.set(along, y, -half + 0.01);
  } else {
    mesh.position.set(-half + 0.01, y, along);
    mesh.rotation.y = Math.PI / 2;
  }
  group.add(mesh);
}

// ---- 家具（正面が+Z、原点は背面の中央・床） ----

export type Furniture = { object: THREE.Object3D; width: number; depth: number };

function bed(): Furniture {
  const g = new THREE.Group();
  const wood = lambert({ map: woodTexture(11) });
  const white = lambert({ color: '#fffaf3' });
  const frame = box(1.6, 0.35, 2.4, wood);
  frame.position.set(0, 0.175, 1.2);
  const mattress = box(1.5, 0.18, 2.3, white);
  mattress.position.set(0, 0.44, 1.2);
  const quilt = box(1.54, 0.1, 1.5, lambert({ map: quiltTexture() }));
  quilt.position.set(0, 0.55, 1.55);
  const pillow = box(1.0, 0.14, 0.45, white);
  pillow.position.set(0, 0.6, 0.4);
  const head = box(1.6, 1.0, 0.14, wood);
  head.position.set(0, 0.5, 0.07);
  g.add(frame, mattress, quilt, pillow, head);
  return { object: g, width: 1.6, depth: 2.4 };
}

function dresser(seed: number): Furniture {
  const side = lambert({ map: woodTexture(seed, PALETTE.woodLight) });
  const front = lambert({ map: woodTexture(seed + 1, PALETTE.woodLight, 3) });
  const body = frontBox(1.3, 1.0, 0.55, side, front);
  body.position.set(0, 0.5, 0.275);
  const g = new THREE.Group();
  g.add(body);
  // 上に小さな置物
  const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6), lambert({ color: PALETTE.lavender }));
  vase.position.set(-0.35, 1.11, 0.28);
  const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), lambert({ color: PALETTE.pink, flatShading: true }));
  flower.position.set(-0.35, 1.28, 0.28);
  g.add(vase, flower);
  return { object: g, width: 1.3, depth: 0.55 };
}

export function bookshelf(seed: number): Furniture {
  const side = lambert({ map: woodTexture(seed, PALETTE.wood) });
  const front = lambert({ map: booksTexture(seed) });
  const body = frontBox(1.2, 2.0, 0.45, side, front);
  body.position.set(0, 1.0, 0.225);
  const g = new THREE.Group();
  g.add(body);
  return { object: g, width: 1.2, depth: 0.45 };
}

function toyBox(): Furniture {
  const g = new THREE.Group();
  const body = box(0.9, 0.5, 0.6, lambert({ color: PALETTE.pink }));
  body.position.set(0, 0.25, 0.3);
  const lid = box(0.96, 0.08, 0.66, lambert({ color: '#fbd6df' }));
  lid.position.set(0, 0.54, 0.3);
  const bear = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), lambert({ color: '#e7c08f', flatShading: true }));
  bear.position.set(0.2, 0.72, 0.3);
  g.add(body, lid, bear);
  return { object: g, width: 0.9, depth: 0.6 };
}

export function plant(seed: number): Furniture {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.4, 8), lambert({ color: '#e08f6a' }));
  pot.position.set(0, 0.2, 0.3);
  g.add(pot);
  const leafMats = [lambert({ color: PALETTE.leaf, flatShading: true }), lambert({ color: PALETTE.leafDark, flatShading: true })];
  const leafGeo = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(leafGeo, leafMats[i % 2]);
    leaf.scale.setScalar(randRange(rng, 0.14, 0.22));
    leaf.position.set(randRange(rng, -0.18, 0.18), randRange(rng, 0.5, 0.85), 0.3 + randRange(rng, -0.18, 0.18));
    g.add(leaf);
  }
  return { object: g, width: 0.6, depth: 0.6 };
}

function table(): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert({ map: woodTexture(31, PALETTE.woodLight) });
  const top = box(1.2, 0.08, 0.9, wood);
  top.position.y = 0.72;
  g.add(top);
  for (const [x, z] of [[-0.52, -0.37], [0.52, -0.37], [-0.52, 0.37], [0.52, 0.37]]) {
    const leg = box(0.08, 0.7, 0.08, wood);
    leg.position.set(x, 0.35, z);
    g.add(leg);
  }
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 6), lambert({ color: '#ffffff' }));
  cup.position.set(0.25, 0.82, 0.1);
  g.add(cup);
  return g;
}

function chair(): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert({ map: woodTexture(41, PALETTE.wood) });
  const seat = box(0.5, 0.06, 0.5, wood);
  seat.position.y = 0.45;
  const back = box(0.5, 0.5, 0.06, wood);
  back.position.set(0, 0.72, -0.22);
  const cushion = box(0.42, 0.05, 0.42, lambert({ color: PALETTE.lavender }));
  cushion.position.y = 0.5;
  g.add(seat, back, cushion);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
    const leg = box(0.06, 0.44, 0.06, wood);
    leg.position.set(x, 0.22, z);
    g.add(leg);
  }
  return g;
}

function sofa(): Furniture {
  const g = new THREE.Group();
  const fabric = lambert({ color: '#b9a6dc' });
  const light = lambert({ color: '#cdbdea' });
  const base = box(2.4, 0.42, 0.95, fabric);
  base.position.set(0, 0.21, 0.475);
  const back = box(2.4, 0.55, 0.25, fabric);
  back.position.set(0, 0.7, 0.125);
  const armL = box(0.22, 0.32, 0.95, light);
  armL.position.set(-1.09, 0.58, 0.475);
  const armR = armL.clone();
  armR.position.x = 1.09;
  const cushion = box(0.5, 0.36, 0.14, lambert({ color: PALETTE.pink }));
  cushion.position.set(-0.6, 0.62, 0.35);
  cushion.rotation.z = 0.15;
  g.add(base, back, armL, armR, cushion);
  return { object: g, width: 2.4, depth: 0.95 };
}

function tvStand(seed: number): Furniture {
  const g = new THREE.Group();
  const side = lambert({ map: woodTexture(seed, PALETTE.woodLight) });
  const front = lambert({ map: woodTexture(seed + 1, PALETTE.woodLight, 1) });
  const stand = frontBox(2.0, 0.5, 0.5, side, front);
  stand.position.set(0, 0.25, 0.25);
  const tv = box(1.5, 0.85, 0.08, lambert({ color: '#4a4552' }));
  tv.position.set(0, 0.98, 0.2);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 0.74), new THREE.MeshBasicMaterial({ color: '#5d6a86' }));
  screen.position.set(0, 0.98, 0.241);
  const leg = box(0.3, 0.05, 0.2, lambert({ color: '#4a4552' }));
  leg.position.set(0, 0.53, 0.2);
  g.add(stand, tv, screen, leg);
  return { object: g, width: 2.0, depth: 0.5 };
}

function lowTable(): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert({ map: woodTexture(61, PALETTE.woodLight) });
  const top = box(1.5, 0.08, 0.95, wood);
  top.position.y = 0.42;
  g.add(top);
  for (const [x, z] of [[-0.65, -0.4], [0.65, -0.4], [-0.65, 0.4], [0.65, 0.4]]) {
    const leg = box(0.09, 0.4, 0.09, wood);
    leg.position.set(x, 0.2, z);
    g.add(leg);
  }
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.1, 8), lambert({ color: '#f3d27a' }));
  bowl.position.set(-0.3, 0.51, 0);
  g.add(bowl);
  return g;
}

/** 勉強机（飼育の最初の舞台）。原点は机の中央・床、天板の高さを返す */
export function studyDesk(seed: number): { object: THREE.Group; topY: number; width: number; depth: number } {
  const g = new THREE.Group();
  const wood = lambert({ map: woodTexture(seed, PALETTE.woodLight) });
  const dark = lambert({ map: woodTexture(seed + 1, PALETTE.wood, 3) });
  const width = 2.8;
  const depth = 1.4;
  const topY = 1.2;
  const top = box(width, 0.1, depth, wood);
  top.position.y = topY - 0.05;
  const drawers = frontBox(0.8, topY - 0.1, depth - 0.1, wood, dark);
  drawers.position.set(width / 2 - 0.45, (topY - 0.1) / 2, 0);
  const legL = box(0.1, topY - 0.1, depth - 0.1, wood);
  legL.position.set(-width / 2 + 0.08, (topY - 0.1) / 2, 0);
  const shelf = box(width, 0.55, 0.3, wood);
  shelf.position.set(0, topY + 0.275, -depth / 2 + 0.15);
  g.add(top, drawers, legL, shelf);

  // 机の上の小物：スタンドライト・ペン立て・ノート
  const lampMat = lambert({ color: PALETTE.lavender });
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 10), lampMat);
  lampBase.position.set(-width / 2 + 0.35, topY + 0.03, -depth / 2 + 0.5);
  const arm = box(0.05, 0.7, 0.05, lampMat);
  arm.position.set(-width / 2 + 0.35, topY + 0.38, -depth / 2 + 0.5);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.24, 10, 1, true), lambert({ color: PALETTE.pink, side: THREE.DoubleSide }));
  shade.position.set(-width / 2 + 0.5, topY + 0.72, -depth / 2 + 0.55);
  shade.rotation.z = -0.5;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.24, 8), lambert({ color: '#9cc9e6' }));
  cup.position.set(width / 2 - 0.35, topY + 0.12, -depth / 2 + 0.45);
  g.add(lampBase, arm, shade, cup);
  const pencilColors = ['#f3d27a', PALETTE.pinkDeep, '#7fb77e'];
  pencilColors.forEach((c, i) => {
    const pencil = box(0.035, 0.34, 0.035, lambert({ color: c }));
    pencil.position.set(width / 2 - 0.39 + i * 0.04, topY + 0.3, -depth / 2 + 0.45 + (i - 1) * 0.03);
    pencil.rotation.z = (i - 1) * 0.15;
    g.add(pencil);
  });
  const note = box(0.6, 0.04, 0.45, lambert({ color: '#fff7e8' }));
  note.position.set(width / 2 - 0.55, topY + 0.02, depth / 2 - 0.35);
  note.rotation.y = 0.25;
  const noteCover = box(0.6, 0.02, 0.45, lambert({ color: PALETTE.pink }));
  noteCover.position.set(width / 2 - 0.55, topY + 0.005, depth / 2 - 0.35);
  noteCover.rotation.y = 0.25;
  g.add(note, noteCover);
  return { object: g, topY, width, depth };
}

// ---- 配置 ----

export function blockerOf(object: THREE.Object3D): Blocker {
  object.updateMatrixWorld(true);
  // precise: 回転した屋根などでも頂点から正確に求める（ゆるい外接箱だと大きくなりすぎる）
  const b = new THREE.Box3().setFromObject(object, true);
  return { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z, height: b.max.y };
}

function overlaps(a: Blocker, b: Blocker, margin: number): boolean {
  return a.minX - margin < b.maxX && a.maxX + margin > b.minX && a.minZ - margin < b.maxZ && a.maxZ + margin > b.minZ;
}

/** 壁沿いに家具を並べる。間隔はランダム、収まらない家具は置かない */
function placeAlongWall(
  random: Random,
  room: Room,
  wall: 'back' | 'left',
  items: Furniture[],
  from: number,
  to: number,
): number[] {
  const length = to - from;
  const fitted: Furniture[] = [];
  let used = 0;
  for (const it of items) {
    if (used + it.width <= length) {
      fitted.push(it);
      used += it.width;
    }
  }
  const weights = Array.from({ length: fitted.length + 1 }, () => 0.3 + random());
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const free = length - used;
  let cursor = from;
  const openings: number[] = [];
  fitted.forEach((it, i) => {
    const gap = (free * weights[i]) / weightSum;
    if (gap > 0.9) openings.push(cursor + gap / 2);
    cursor += gap;
    const center = cursor + it.width / 2;
    const obj = it.object;
    if (wall === 'back') {
      obj.position.set(center, 0, -room.half);
    } else {
      obj.position.set(-room.half, 0, center);
      obj.rotation.y = Math.PI / 2;
    }
    room.group.add(obj);
    room.blockers.push(blockerOf(obj));
    cursor += it.width;
  });
  return openings;
}

export function buildCleaningRoom(seed: number): Room {
  const random = createRandom(seed);
  const half = 4;
  return furnishRoom(seed, random, half, 'bedroom');
}

/** リビング：ソファ・テレビ台・ローテーブルのある広い部屋 */
export function buildLivingRoom(seed: number): Room {
  return furnishRoom(seed, createRandom(seed), 4.5, 'living');
}

/** 友だちの部屋：ミント色の壁の寝室 */
export function buildFriendRoom(seed: number): Room {
  return furnishRoom(seed, createRandom(seed), 3.8, 'bedroom', { base: '#e6f4ee', stripe: '#cfe9df' });
}

function furnishRoom(seed: number, random: Random, half: number, theme: 'bedroom' | 'living', wall?: WallColors): Room {
  const room: Room = { group: new THREE.Group(), blockers: [], half };
  buildShell(room.group, half, seed, wall);

  // 角に観葉植物
  const corner = plant(seed + 5);
  corner.object.position.set(-half + 0.2, 0, -half + 0.2);
  corner.object.rotation.y = Math.PI / 4;
  room.group.add(corner.object);
  room.blockers.push(blockerOf(corner.object));

  const extras = (): Furniture[] => {
    const pool =
      theme === 'bedroom'
        ? [() => dresser(seed + 21), () => bookshelf(seed + 22), () => toyBox(), () => plant(seed + 23)]
        : [() => bookshelf(seed + 24), () => plant(seed + 25), () => dresser(seed + 26)];
    const a = pick(random, pool);
    const rest = pool.filter((p) => p !== a);
    return [a(), pick(random, rest)()];
  };
  const bigOnBack = random() < 0.5;
  const backItems = extras();
  const leftItems = extras();
  if (theme === 'bedroom') {
    (bigOnBack ? backItems : leftItems).unshift(bed());
  } else {
    // テレビとソファは向かい合わせの壁に
    backItems.unshift(bigOnBack ? tvStand(seed + 27) : sofa());
    leftItems.unshift(bigOnBack ? sofa() : tvStand(seed + 27));
  }
  if (random() < 0.5) backItems.reverse();
  if (random() < 0.5) leftItems.reverse();

  const backOpen = placeAlongWall(random, room, 'back', backItems, -half + 1.0, half - 0.2);
  const leftOpen = placeAlongWall(random, room, 'left', leftItems, -half + 1.0, half - 0.2);

  // 窓と額縁は壁の空いている辺りに
  wallDecal(room.group, half, 'back', backOpen[0] ?? randRange(random, -1, 2), 1.85, 1.3, 1.1, windowTexture());
  wallDecal(room.group, half, 'left', leftOpen[0] ?? randRange(random, -1, 2), 1.9, 0.6, 0.6, frameTexture(seed));

  // ラグ（ホコリが乗ってもよい）
  const rugSize = theme === 'living' ? 3.4 : 2.6;
  const rug = new THREE.Mesh(new THREE.BoxGeometry(rugSize, 0.02, rugSize * 0.77), lambert({ map: rugTexture() }));
  rug.position.set(randRange(random, 0, 1.2), 0.01, randRange(random, 0, 1.2));
  rug.rotation.y = random() < 0.5 ? 0 : Math.PI / 2;
  room.group.add(rug);

  // 中央付近にテーブル（寝室は椅子つき）。既存の家具と重ならない場所を探す
  for (let attempt = 0; attempt < 40; attempt++) {
    const t = theme === 'bedroom' ? table() : lowTable();
    t.position.set(randRange(random, -1.6, 2.0), 0, randRange(random, -1.6, 2.0));
    t.rotation.y = random() < 0.5 ? 0 : Math.PI / 2;
    const tb = blockerOf(t);
    if (tb.maxX > half - 0.8 || tb.maxZ > half - 0.8) continue;
    if (room.blockers.some((b) => overlaps(b, tb, 0.7))) continue;
    room.group.add(t);
    room.blockers.push(tb);
    if (theme === 'living') break;
    const c = chair();
    c.position.copy(t.position).add(new THREE.Vector3(0, 0, 0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), t.rotation.y));
    c.rotation.y = t.rotation.y + Math.PI;
    const cb = blockerOf(c);
    if (!room.blockers.some((b) => overlaps(b, cb, 0.05))) {
      room.group.add(c);
      room.blockers.push(cb);
    }
    break;
  }
  return room;
}

/** 飼育部屋。ケースが主役なので家具は背景程度 */
export function buildPetRoom(seed: number): Room {
  const half = 3.2;
  const room: Room = { group: new THREE.Group(), blockers: [], half };
  buildShell(room.group, half, seed);
  wallDecal(room.group, half, 'back', 0.6, 1.8, 1.4, 1.15, windowTexture());
  wallDecal(room.group, half, 'left', 1.4, 1.9, 0.6, 0.6, frameTexture(seed + 2));
  const shelf = bookshelf(seed + 3);
  shelf.object.position.set(-half, 0, -1.0);
  shelf.object.rotation.y = Math.PI / 2;
  const p = plant(seed + 4);
  p.object.position.set(-half + 0.2, 0, -half + 0.2);
  room.group.add(shelf.object, p.object);
  const rug = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 4.6), lambert({ map: rugTexture() }));
  rug.position.set(0.4, 0.01, 0.4);
  room.group.add(rug);
  return room;
}
