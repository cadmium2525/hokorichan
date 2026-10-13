// 飼育シーン：最初は勉強机の上、ケースを買うとケースの中。ほこりちゃんを主役に表示し、
// 餌やり・住まいの変化・乾燥・なでる・着せ替えの演出を行う。

import * as THREE from 'three';
import { HABITATS, type AccessoryId, type Habitat, type PetShape } from '../game/catalog.ts';
import { petDisplaySize } from '../game/state.ts';
import { createRandom } from '../game/rng.ts';
import { HokorichanModel, type Expression } from '../render/hokorichan.ts';
import { Particles } from '../render/particles.ts';
import { dropTexture, heartTexture, PALETTE, sleepTexture, sparkleTexture, woodTexture } from '../render/proceduralArt.ts';
import type { DayPhase } from '../game/clock.ts';
import { buildPetRoom, studyDesk } from '../render/roomBuilder.ts';
import { buildGalaxyDisc, buildMoon, buildSun, starfieldTexture } from '../render/spaceArt.ts';
import { bubbleTexture } from './BubbleScene.ts';
import { clamp01, createIsoCamera, disposeHierarchy, easeOutBack, fitOrthoToBox, ISO_VIEW_DIR } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

export type PetView = {
  xp: number;
  /** 毛並みの色（食べたホコリで決まる） */
  tint: string;
  habitat: Habitat;
  damp: boolean;
  accessory: AccessoryId | null;
  shape: PetShape;
};

export type PetOptions = {
  /** なでる操作を受け取る要素（canvas） */
  element: HTMLElement;
  onPet?: () => void;
  /** 時間帯（空の色と光） */
  phase?: DayPhase;
  /** 夜おそく：ねむっている。タップで起き、しばらくほうっておくとまたねむる */
  sleepy?: boolean;
  onWake?: () => void;
};

/** 夜、起こしてからまたねむるまでの秒数 */
const DOZE_SECONDS = 15;

type ActionKind = 'none' | 'eat' | 'happy' | 'dry' | 'pet' | 'wake';
type Action = { kind: ActionKind; t: number; duration: number };

const CASE_CENTER = new THREE.Vector3(0.3, 0, 0.3);
const CASE_FLOOR_Y = 0.26;
/** 勉強机は部屋の奥寄りに置き、ほこりちゃんは天板の手前寄りに座る */
const DESK_CENTER = new THREE.Vector3(0.1, 0, -0.9);

function glassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(220,240,255,0.16)';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) ctx.fillRect(4 + i, 20 - i * 2, 1, 2);
    for (let i = 0; i < 3; i++) ctx.fillRect(9 + i, 24 - i * 2, 1, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

const CONTAINER_HEIGHT = 3.2;
const WAREHOUSE_HEIGHT = 5.4;

/** 空き地のすみか（4=コンテナ、5=倉庫）の壁の高さ */
function yardHeight(habitat: Habitat): number {
  if (habitat >= 9) return UNIVERSE_TOP;
  if (habitat >= 8) return GALAXY_TOP;
  if (habitat >= 7) return SPACE_TOP;
  if (habitat >= 6) return HILL_TOP;
  return habitat === 5 ? WAREHOUSE_HEIGHT : CONTAINER_HEIGHT;
}

/** 丘（4章）では、ほこりちゃんの頭のてっぺんまで映す */
const HILL_TOP = 15;

/** 5章（月のとなり）では、いっぱいのときの頭のてっぺんまで映す */
const SPACE_TOP = 25;
const GALAXY_TOP = 38;
const UNIVERSE_TOP = 58;

/** 5章：月のとなり。宇宙にうかぶほこりちゃんのそばに、月と、小さく見える地球を置く */
function buildSpaceYard(): THREE.Group {
  const g = new THREE.Group();
  const right = new THREE.Vector3(1, 0, -1).normalize();
  const down = new THREE.Vector3(1, 0, 1).normalize();
  const moon = buildMoon(2.2);
  moon.position.copy(CASE_CENTER).addScaledVector(right, 15).addScaledVector(down, -7).setY(15);
  // 地球（雲のかかった青い球）。ほこりちゃんは地球よりずっと大きい
  const earth = new THREE.Group();
  const sea = new THREE.Mesh(new THREE.IcosahedronGeometry(4, 2), new THREE.MeshLambertMaterial({ color: '#7fb3e0', flatShading: true }));
  const land = new THREE.Mesh(new THREE.IcosahedronGeometry(4.05, 1), new THREE.MeshLambertMaterial({ color: '#9cc97e', flatShading: true, transparent: true, opacity: 0.8 }));
  land.scale.set(0.9, 1, 0.55);
  const cloud = new THREE.Mesh(new THREE.IcosahedronGeometry(4.15, 1), new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  cloud.scale.set(1, 0.4, 1);
  earth.add(sea, land, cloud);
  earth.position.copy(CASE_CENTER).addScaledVector(right, -15).addScaledVector(down, 9).setY(2);
  g.add(moon, earth);
  // 小さな星くずのきらめき
  const rng = createRandom(23);
  const star = new THREE.MeshBasicMaterial({ color: '#fff6c8' });
  const geo = new THREE.OctahedronGeometry(0.25, 0);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(geo, star);
    const a = rng() * Math.PI * 2;
    const d = 16 + rng() * 6;
    m.position.set(CASE_CENTER.x + Math.cos(a) * d, rng() * 22, CASE_CENTER.z + Math.sin(a) * d);
    g.add(m);
  }
  return g;
}

/** 終章：宇宙のまんなか。まわりに、しゃぼん玉になったよその宇宙がいくつも浮かぶ */
function buildUniverseYard(): THREE.Group {
  const g = new THREE.Group();
  const rng = createRandom(37);
  const tints = ['#bfe8ff', '#ffd6f0', '#fff2b8', '#d4ffe0', '#c7b4f0', '#f4a7d0'];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(100 + i, tints[i % tints.length]), transparent: true, depthWrite: false }));
    const a = (i / 14) * Math.PI * 2 + rng() * 0.3;
    const d = 30 + rng() * 10;
    s.position.set(CASE_CENTER.x + Math.cos(a) * d, 4 + rng() * 48, CASE_CENTER.z + Math.sin(a) * d);
    s.scale.setScalar(4 + rng() * 6);
    g.add(s);
  }
  return g;
}

/** 6章：天の川のほとり。うしろに大きなうずまき銀河、そばに小さな太陽 */
function buildGalaxyYard(): THREE.Group {
  const g = new THREE.Group();
  const right = new THREE.Vector3(1, 0, -1).normalize();
  const down = new THREE.Vector3(1, 0, 1).normalize();
  const disc = buildGalaxyDisc(30, 41);
  // 奥にななめに立てて、銀河を見せる
  disc.position.copy(CASE_CENTER).addScaledVector(down, -30).setY(16);
  disc.rotation.set(-0.5, 0.78, 0.2);
  const sun = buildSun(1.2);
  sun.position.copy(CASE_CENTER).addScaledVector(right, -22).addScaledVector(down, 6).setY(4);
  g.add(disc, sun);
  return g;
}

/** 4章：町はずれの丘。まわりに小さな家や木を置いて、山のような大きさを見せる */
function buildHillYard(): THREE.Group {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 60), new THREE.MeshLambertMaterial({ color: '#a9d68f' }));
  grass.position.y = -0.2;
  const mound = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#98c97c', flatShading: true }));
  mound.scale.y = 0.12;
  mound.position.copy(CASE_CENTER);
  g.add(grass, mound);
  // 比べるための小さな町（家・木・倉庫）
  const rng = createRandom(7);
  const roofs = ['#f4a7b9', '#a58fd0', '#6fb7a0', '#e8a868', '#5f6f86'];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.3;
    const d = 11.5 + rng() * 6;
    const x = CASE_CENTER.x + Math.cos(a) * d;
    const z = CASE_CENTER.z + Math.sin(a) * d;
    if (i % 3 === 0) {
      const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: '#7fb77e', flatShading: true }));
      tree.position.set(x, 0.7, z);
      const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), new THREE.MeshLambertMaterial({ color: '#9c6438' }));
      trunk.position.set(x, 0.25, z);
      g.add(tree, trunk);
      continue;
    }
    const house = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.8), new THREE.MeshLambertMaterial({ color: '#fff4e2' }));
    wall.position.y = 0.35;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.5, 4), new THREE.MeshLambertMaterial({ color: roofs[i % roofs.length], flatShading: true }));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.95;
    house.add(wall, roof);
    house.position.set(x, 0, z);
    house.rotation.y = rng() * Math.PI;
    g.add(house);
  }
  return g;
}


/** 倉庫の板壁（クリームの羽目板に木の枠） */
function warehouseTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f2e2c6';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#e2cca8';
    for (let y = 3; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
    ctx.fillStyle = '#b8754f';
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  return tex;
}

function corrugatedTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#86bcd1';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#6fa6bd';
    for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 16);
    ctx.fillStyle = '#a5d0e0';
    for (let x = 1; x < 16; x += 4) ctx.fillRect(x, 0, 1, 16);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

/** 空き地に置いたコンテナ（4）・倉庫（5）。正面（ローカル+Z）を開けて中が見えるようにする */
function buildContainerYard(habitat: 4 | 5): THREE.Group {
  const g = new THREE.Group();
  const k = habitat === 5 ? 1.9 : 1;
  const grass = new THREE.Mesh(new THREE.BoxGeometry(18 * k, 0.3, 18 * k), new THREE.MeshLambertMaterial({ color: '#a9d68f' }));
  grass.position.set(0, -0.16, 0);
  const dirt = new THREE.Mesh(new THREE.BoxGeometry(9 * k, 0.04, 9 * k), new THREE.MeshLambertMaterial({ color: '#d9b98c' }));
  dirt.position.set(CASE_CENTER.x, 0.0, CASE_CENTER.z);
  g.add(grass, dirt);

  const w = HABITATS[habitat].inner;
  const h = yardHeight(habitat);
  const box = new THREE.Group();
  const wall = new THREE.MeshLambertMaterial({ map: habitat === 5 ? warehouseTexture() : corrugatedTexture() });
  const edge = new THREE.MeshLambertMaterial({ color: habitat === 5 ? '#a0644a' : '#5f93aa' });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.2, w + 0.3), edge);
  floor.position.y = 0.1;
  const mat = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, w), new THREE.MeshLambertMaterial({ color: '#fbdbe4' }));
  mat.position.y = 0.23;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h, 0.15), wall);
  back.position.set(0, h / 2 + 0.2, -w / 2 - 0.08);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, h, w + 0.3), wall);
  left.position.set(-w / 2 - 0.08, h / 2 + 0.2, 0);
  const right = left.clone();
  right.position.x = w / 2 + 0.08;
  // 上から中が見えるよう屋根は付けず、ふちだけ
  const rimGeo = new THREE.BoxGeometry(w + 0.4, 0.15, 0.2);
  const rimBack = new THREE.Mesh(rimGeo, edge);
  rimBack.position.set(0, h + 0.28, -w / 2 - 0.08);
  const rimSideGeo = new THREE.BoxGeometry(0.2, 0.15, w + 0.4);
  const rimL = new THREE.Mesh(rimSideGeo, edge);
  rimL.position.set(-w / 2 - 0.08, h + 0.28, 0);
  const rimR = rimL.clone();
  rimR.position.x = w / 2 + 0.08;
  // 開いた扉（左右に開く）
  const doorGeo = new THREE.BoxGeometry(0.1, h, w / 2);
  const doorL = new THREE.Mesh(doorGeo, wall);
  doorL.position.set(-w / 2 - 0.2, h / 2 + 0.2, w / 2 + w / 4);
  const doorR = doorL.clone();
  doorR.position.x = w / 2 + 0.2;
  box.add(floor, mat, back, left, right, rimBack, rimL, rimR, doorL, doorR);
  box.position.copy(CASE_CENTER);
  box.rotation.y = Math.PI / 4;
  g.add(box);

  // まわりの柵と木
  const wood = new THREE.MeshLambertMaterial({ color: '#e0a86c' });
  for (let i = -4 * k; i <= 4 * k; i += 1.6) {
    for (const [x, z] of [[i, -4.6 * k], [-4.6 * k, i]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), wood);
      post.position.set(CASE_CENTER.x + x, 0.3, CASE_CENTER.z + z);
      g.add(post);
    }
  }
  const leaves = new THREE.MeshLambertMaterial({ color: '#7fb77e', flatShading: true });
  for (const [x, z] of [[-4.2 * k, 2.2 * k], [2.6 * k, -4.4 * k]]) {
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), leaves);
    t.position.set(CASE_CENTER.x + x, 1.4, CASE_CENTER.z + z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.0, 6), new THREE.MeshLambertMaterial({ color: '#9c6438' }));
    trunk.position.set(CASE_CENTER.x + x, 0.5, CASE_CENTER.z + z);
    g.add(t, trunk);
  }
  return g;
}

function buildCase(level: 1 | 2 | 3): THREE.Group {
  const w = HABITATS[level].inner;
  const h = w * 0.78;
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: woodTexture(50 + level, PALETTE.wood) });
  const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.2, w + 0.3), wood);
  base.position.y = 0.1;
  const bedding = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, w), new THREE.MeshLambertMaterial({ color: '#fbdbe4' }));
  bedding.position.y = 0.23;
  g.add(base, bedding);

  const glass = new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const panel = new THREE.PlaneGeometry(w, h);
  const half = w / 2;
  const panels: Array<[number, number, number]> = [
    [0, 0, -half], [0, 0, half], [-half, Math.PI / 2, 0], [half, Math.PI / 2, 0],
  ];
  for (const [x, ry, z] of panels) {
    const p = new THREE.Mesh(panel, glass);
    p.position.set(x, 0.2 + h / 2, z);
    p.rotation.y = ry;
    g.add(p);
  }
  const frame = new THREE.MeshLambertMaterial({ color: PALETTE.woodLight });
  const postGeo = new THREE.BoxGeometry(0.08, h, 0.08);
  for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
    const post = new THREE.Mesh(postGeo, frame);
    post.position.set(x, 0.2 + h / 2, z);
    g.add(post);
  }
  const railX = new THREE.BoxGeometry(w + 0.08, 0.08, 0.08);
  const railZ = new THREE.BoxGeometry(0.08, 0.08, w + 0.08);
  // 上枠は手前（ローカル+Z、45°回転後にカメラ正面）の1本を省き、顔の前を横切らないようにする
  const backRail = new THREE.Mesh(railX, frame);
  backRail.position.set(0, 0.2 + h, -half);
  g.add(backRail);
  for (const x of [-half, half]) {
    const side = new THREE.Mesh(railZ, frame);
    side.position.set(x, 0.2 + h, 0);
    g.add(side);
  }
  g.position.copy(CASE_CENTER);
  // 正面のガラス面をカメラに向ける（角の柱で顔が隠れないように）
  g.rotation.y = Math.PI / 4;
  return g;
}

export class PetScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: PetOptions;
  private readonly pet = new HokorichanModel();
  private readonly particles = new Particles();
  private readonly textures = { heart: heartTexture(), sparkle: sparkleTexture(), drop: dropTexture(), z: sleepTexture() };
  private readonly background: THREE.Texture;
  private habitatGroup: THREE.Group | null = null;
  private readonly room: THREE.Group;
  private view: PetView;
  private aspect = 0.6;
  /** ほこりちゃんが座る位置（足元） */
  private readonly seat = new THREE.Vector3();

  private size: number;
  private dampTint: number;
  private sleeping = false;
  /** 夜のおやすみモード（起こしても、しばらくするとまたねむる） */
  private dozing = false;
  private awake = 0;
  private zTimer = 0;
  private action: Action = { kind: 'none', t: 0, duration: 0 };
  private blinkTimer = 2;
  private dripTimer = 1;
  private foodQueue = 0;
  private foodTimer = 0;
  private readonly food: Array<{ mesh: THREE.Mesh; from: THREE.Vector3; t: number }> = [];
  private readonly foodGeo = new THREE.IcosahedronGeometry(0.07, 0);
  private readonly foodMat = new THREE.MeshLambertMaterial({ color: '#bdb5cc', flatShading: true });

  // なでる
  private readonly raycaster = new THREE.Raycaster();
  private readonly sphere = new THREE.Sphere();
  private strokePointer: number | null = null;
  private strokeDistance = 0;
  private lastStroke: { x: number; y: number } | null = null;
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];

  /** カメラ範囲（left,right,top,bottom）をなめらかに補間する */
  private readonly camTarget = new THREE.Vector4();
  private readonly camCurrent = new THREE.Vector4();
  private camReady = false;
  /** 画面下をパネルが覆う割合（0〜1）。覆われていない上側にほこりちゃんを映す */
  private bottomInset = 0;

  constructor(view: PetView, opts: PetOptions) {
    this.view = { ...view, shape: { ...view.shape } };
    this.opts = opts;
    // 丘や宇宙ではほこりちゃんがとても大きいので、カメラを遠ざけて手前が切れないようにする（正投影なので見え方は同じ）
    this.camera.position.copy(ISO_VIEW_DIR).multiplyScalar(80);
    this.camera.far = 200;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.background = setupStage(this.scene, opts.phase);
    this.dozing = opts.sleepy ?? false;
    this.sleeping = this.dozing;
    this.room = buildPetRoom(3).group;
    this.scene.add(this.room);
    this.buildHabitat(view.habitat);
    this.scene.add(this.pet.group, this.particles.group);
    this.size = petDisplaySize(view.xp, view.habitat, view.damp, view.shape);
    this.dampTint = view.damp ? 1 : 0;
    this.pet.setAccessory(view.accessory);
    this.pet.setCustomShape(view.shape);
    this.pet.setBaseColor(view.tint);
    this.bindInput();
  }

  // ---- 住まい ----

  private buildHabitat(habitat: Habitat): void {
    if (this.habitatGroup) {
      this.scene.remove(this.habitatGroup);
      disposeHierarchy(this.habitatGroup);
    }
    // コンテナは空き地（屋外）。部屋は隠す
    this.room.visible = habitat < 4;
    this.scene.background = habitat >= 7 ? this.spaceSky() : this.background;
    if (habitat >= 9) {
      this.habitatGroup = buildUniverseYard();
      this.seat.set(CASE_CENTER.x, 0.2, CASE_CENTER.z);
    } else if (habitat >= 8) {
      this.habitatGroup = buildGalaxyYard();
      this.seat.set(CASE_CENTER.x, 0.2, CASE_CENTER.z);
    } else if (habitat >= 7) {
      this.habitatGroup = buildSpaceYard();
      this.seat.set(CASE_CENTER.x, 0.2, CASE_CENTER.z);
    } else if (habitat >= 6) {
      this.habitatGroup = buildHillYard();
      this.seat.set(CASE_CENTER.x, 0.6, CASE_CENTER.z);
    } else if (habitat >= 4) {
      this.habitatGroup = buildContainerYard(habitat as 4 | 5);
      this.seat.set(CASE_CENTER.x, CASE_FLOOR_Y, CASE_CENTER.z);
    } else if (habitat === 0) {
      const desk = studyDesk(9);
      desk.object.position.copy(DESK_CENTER);
      this.habitatGroup = desk.object;
      this.seat.set(DESK_CENTER.x - 0.2, desk.topY, DESK_CENTER.z + 0.25);
    } else {
      this.habitatGroup = buildCase(habitat as 1 | 2 | 3);
      this.seat.set(CASE_CENTER.x, CASE_FLOOR_Y, CASE_CENTER.z);
    }
    this.scene.add(this.habitatGroup);
    this.pet.group.position.copy(this.seat);
    this.computeCameraTarget();
  }

  private spaceBg: THREE.Texture | null = null;

  private spaceSky(): THREE.Texture {
    this.spaceBg ??= starfieldTexture(31);
    return this.spaceBg;
  }

  private computeCameraTarget(): void {
    const points: THREE.Vector3[] = [];
    if (this.view.habitat === 0) {
      // 机の天板の上を大きく映す
      const s = this.seat;
      for (const [dx, dz] of [[1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]]) {
        points.push(new THREE.Vector3(s.x + dx, s.y - 0.15, s.z + dz));
        points.push(new THREE.Vector3(s.x + dx, s.y + 1.1, s.z + dz));
      }
    } else {
      // ケース・コンテナの実際の角（45°回転済み）とその上の余白を画面に収める
      const w = HABITATS[this.view.habitat].inner;
      const r = (w / 2 + 0.2) * Math.SQRT2;
      const top = this.view.habitat >= 4 ? yardHeight(this.view.habitat) + 0.4 : 0.2 + w * 0.78 + 0.5;
      for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
        points.push(new THREE.Vector3(CASE_CENTER.x + dx, 0, CASE_CENTER.z + dz));
        points.push(new THREE.Vector3(CASE_CENTER.x + dx, top, CASE_CENTER.z + dz));
      }
    }
    fitOrthoToBox(this.camera, points, this.aspect, this.view.habitat >= 4 ? 1.4 : 1.22);
    let { left, right, top, bottom } = this.camera;
    if (this.bottomInset > 0) {
      // 少し引いて、見えている上側の中央に来るよう下へずらす
      const zoom = 1 + this.bottomInset * 0.6;
      const cx = (left + right) / 2;
      const cy = (top + bottom) / 2;
      const hw = ((right - left) / 2) * zoom;
      const hh = ((top - bottom) / 2) * zoom;
      const shift = hh * this.bottomInset;
      left = cx - hw;
      right = cx + hw;
      top = cy + hh - shift;
      bottom = cy - hh - shift;
    }
    this.camTarget.set(left, right, top, bottom);
    if (!this.camReady) {
      this.camCurrent.copy(this.camTarget);
      this.camReady = true;
    }
  }

  // ---- なでる ----

  private bindInput(): void {
    const el = this.opts.element;
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const listener = fn as EventListener;
      el.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };
    on('pointerdown', (e) => {
      if (!this.inputEnabled || this.strokePointer !== null || !e.isPrimary) return;
      if (!this.hitsPet(e)) return;
      if (this.sleeping) {
        // 夜はタップで起きる（出会いの演出中は起きない）
        if (this.dozing) {
          this.playWake();
          this.opts.onWake?.();
        }
        return;
      }
      this.strokePointer = e.pointerId;
      this.strokeDistance = 0;
      this.lastStroke = { x: e.clientX, y: e.clientY };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // キャプチャできなくてもなでる操作は続ける
      }
      this.petReaction();
    });
    on('pointermove', (e) => {
      if (e.pointerId !== this.strokePointer || !this.lastStroke) return;
      this.strokeDistance += Math.hypot(e.clientX - this.lastStroke.x, e.clientY - this.lastStroke.y);
      this.lastStroke = { x: e.clientX, y: e.clientY };
      // ある程度なでるたびに反応する
      if (this.strokeDistance > 90) {
        this.strokeDistance = 0;
        this.petReaction();
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.strokePointer) this.cancelInput();
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('lostpointercapture', end);
  }

  private hitsPet(e: PointerEvent): boolean {
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.intersectsSphere(this.pet.boundingSphere(this.sphere));
  }

  private petReaction(): void {
    if (this.action.kind === 'eat' || this.action.kind === 'wake') return;
    this.action = { kind: 'pet', t: 0, duration: 0.9 };
    this.spawnHeart();
    this.opts.onPet?.();
  }

  cancelInput(): void {
    if (this.strokePointer === null) return;
    const id = this.strokePointer;
    this.strokePointer = null;
    this.lastStroke = null;
    try {
      if (this.opts.element.hasPointerCapture(id)) this.opts.element.releasePointerCapture(id);
    } catch {
      // 既に解放済み
    }
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.cancelInput();
  }

  // ---- 外部からの操作 ----

  setView(view: PetView): void {
    const habitatChanged = view.habitat !== this.view.habitat;
    this.view = { ...view, shape: { ...view.shape } };
    if (habitatChanged) this.buildHabitat(view.habitat);
    this.pet.setAccessory(view.accessory);
    this.pet.setCustomShape(view.shape);
    this.pet.setBaseColor(view.tint);
  }

  /** 下のパネルで隠れる割合を伝え、カメラをなめらかに寄せ直す */
  /** 写真用：ほこりちゃんの画面上の位置と大きさ（0〜1の割合。y は上から） */
  focus(): { x: number; y: number; r: number } {
    this.camera.updateMatrixWorld();
    const sphere = this.pet.boundingSphere(new THREE.Sphere());
    const c = sphere.center.clone().project(this.camera);
    const h = this.camera.top - this.camera.bottom;
    return { x: (c.x + 1) / 2, y: (1 - c.y) / 2, r: sphere.radius / h };
  }

  setBottomInset(fraction: number): void {
    this.bottomInset = Math.min(0.7, Math.max(0, fraction));
    this.computeCameraTarget();
  }

  /** 出会いの演出用：眠っている小さなホコリ */
  setSleeping(sleeping: boolean): void {
    this.sleeping = sleeping;
  }

  /** 目を覚ましてぴょんと跳ねる */
  playWake(): void {
    this.sleeping = false;
    this.awake = 0;
    this.action = { kind: 'wake', t: 0, duration: 1.6 };
    this.particles.burst(this.textures.sparkle, this.pet.group.position.clone().setY(this.seat.y + this.size), 8, 1.2, 0.18);
  }

  playFeed(amount: number): void {
    this.sleeping = false;
    this.awake = 0;
    this.action = { kind: 'eat', t: 0, duration: 1.6 };
    this.foodQueue = Math.min(12, Math.max(1, amount));
    this.foodTimer = 0;
  }

  playHappy(): void {
    // 大きくなっても、頭の上で、見える大きさで
    const s = Math.max(1, this.size);
    const top = this.seat.clone().setY(this.seat.y + s);
    this.particles.burst(this.textures.sparkle, top, 14, 2.2 * Math.sqrt(s), 0.3 * Math.sqrt(s));
    this.action = { kind: 'happy', t: 0, duration: 1.4 };
  }

  playDry(): void {
    this.action = { kind: 'dry', t: 0, duration: 1.0 };
    const c = this.pet.group.position.clone().setY(this.seat.y + this.size * 0.6);
    this.particles.burst(this.textures.sparkle, c, 10, 1.8, 0.26);
  }

  // ---- 更新 ----

  resize(aspect: number): void {
    this.aspect = aspect;
    this.camReady = false;
    this.computeCameraTarget();
    this.applyCamera();
  }

  private applyCamera(): void {
    this.camera.left = this.camCurrent.x;
    this.camera.right = this.camCurrent.y;
    this.camera.top = this.camCurrent.z;
    this.camera.bottom = this.camCurrent.w;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number, time: number): void {
    this.pet.tick(dt);
    this.camCurrent.lerp(this.camTarget, Math.min(1, dt * 3));
    this.applyCamera();

    // 夜：ほうっておくと、またうとうと
    if (this.dozing && !this.sleeping) {
      this.awake = this.action.kind === 'none' && this.strokePointer === null ? this.awake + dt : 0;
      if (this.awake > DOZE_SECONDS) this.sleeping = true;
    }
    if (this.sleeping && this.dozing) {
      this.zTimer -= dt;
      if (this.zTimer <= 0) {
        this.zTimer = 1.1;
        const s = Math.max(0.5, this.size);
        const p = this.pet.group.position.clone().add(new THREE.Vector3(s * 0.35, s * 0.95, 0));
        this.particles.spawn(this.textures.z, p, new THREE.Vector3(0.15 * s, 0.35 * s, 0), { life: 1.6, scale: 0.16 + 0.08 * s });
      }
    }

    const a = this.action;
    if (a.kind !== 'none') {
      a.t += dt;
      if (a.t >= a.duration) {
        // 食べ終わったら喜ぶ
        if (a.kind === 'eat') {
          this.action = { kind: 'happy', t: 0, duration: 1.6 };
          this.particles.burst(this.textures.heart, this.pet.group.position.clone().setY(this.seat.y + this.size), 4, 0.8, 0.3);
        } else {
          this.action = { kind: 'none', t: 0, duration: 0 };
        }
      }
    }

    // サイズと色は目標値へなめらかに近づける（連続成長）
    const targetSize = petDisplaySize(this.view.xp, this.view.habitat, this.view.damp, this.view.shape);
    const growRate = this.action.kind === 'eat' ? 2.2 : 4;
    this.size += (targetSize - this.size) * Math.min(1, dt * growRate);
    const targetTint = this.view.damp ? 1 : 0;
    this.dampTint += (targetTint - this.dampTint) * Math.min(1, dt * 4);
    this.pet.setDampTint(this.dampTint);

    let squash = 1 + Math.sin(time * 2.2) * 0.03;
    let hop = 0;
    let expression: Expression = this.view.damp ? 'damp' : 'idle';
    let blink = false;
    let mouthOpen = false;
    const kind = this.action.kind;
    const progress = this.action.duration > 0 ? this.action.t / this.action.duration : 0;
    if (this.sleeping) {
      expression = 'sleep';
      squash = 0.95 + Math.sin(time * 1.4) * 0.04;
    } else if (kind === 'eat') {
      expression = 'eating';
      mouthOpen = Math.floor(time * 8) % 2 === 0;
      squash = 1 - Math.abs(Math.sin(time * 14)) * 0.07;
    } else if (kind === 'happy' || kind === 'wake') {
      expression = 'happy';
      hop = Math.abs(Math.sin(this.action.t * 9)) * 0.12 * Math.max(0.6, this.size) * (1 - progress);
      if (Math.random() < dt * 3) this.spawnHeart();
    } else if (kind === 'pet') {
      // なでられてぷるぷる
      expression = 'happy';
      squash = 1 - Math.sin(this.action.t * 18) * 0.08 * (1 - progress);
    } else if (kind === 'dry') {
      // ぷくっと膨らんで復活
      expression = 'happy';
      const k = clamp01(this.action.t / 0.6);
      squash = 0.85 + 0.15 * easeOutBack(k);
    } else if (this.view.damp) {
      squash = 0.82 + Math.sin(time * 1.5) * 0.015;
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 1.2 + Math.random();
        const p = this.pet.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * this.size * 0.6, this.size * 0.5, (Math.random() - 0.5) * this.size * 0.6));
        this.particles.spawn(this.textures.drop, p, new THREE.Vector3(0, -0.3, 0), { life: 0.8, gravity: 1.5, scale: 0.16 * Math.max(1, Math.sqrt(this.size)) });
      }
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer < 0) {
        blink = true;
        if (this.blinkTimer < -0.13) this.blinkTimer = 2 + Math.random() * 3;
      }
    }
    this.pet.setExpression(expression, blink, mouthOpen);
    this.pet.setSize(this.size, squash);
    this.pet.group.position.set(this.seat.x, this.seat.y + hop, this.seat.z);

    this.updateFood(dt);
    this.particles.update(dt);
  }

  private spawnHeart(): void {
    const s = Math.max(0.5, this.size);
    const p = this.pet.group.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * s * 0.8, s * 0.9, (Math.random() - 0.5) * s * 0.5));
    this.particles.spawn(this.textures.heart, p, new THREE.Vector3(0, 0.8, 0), { life: 1.0, scale: 0.18 + 0.06 * s });
  }

  /** 上からホコリがぽとぽと落ちて口に入る */
  private updateFood(dt: number): void {
    if (this.foodQueue > 0) {
      this.foodTimer -= dt;
      if (this.foodTimer <= 0) {
        this.foodQueue--;
        this.foodTimer = 0.1;
        const mesh = new THREE.Mesh(this.foodGeo, this.foodMat);
        mesh.scale.setScalar(Math.max(1, this.size * 0.4));
        const spread = Math.max(0.6, this.size);
        const from = this.seat.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, this.size + 0.8, (Math.random() - 0.5) * spread));
        mesh.position.copy(from);
        this.scene.add(mesh);
        this.food.push({ mesh, from, t: 0 });
      }
    }
    const mouth = this.pet.mouthWorld(new THREE.Vector3());
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];
      f.t += dt / 0.45;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, mouth, k * k);
      f.mesh.rotation.x += dt * 10;
      if (k >= 1) {
        this.scene.remove(f.mesh);
        this.food.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.cancelInput();
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    for (const f of this.food) this.scene.remove(f.mesh);
    this.food.length = 0;
    this.foodGeo.dispose();
    this.foodMat.dispose();
    this.particles.dispose();
    Object.values(this.textures).forEach((t) => t.dispose());
    this.background.dispose();
    this.spaceBg?.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
