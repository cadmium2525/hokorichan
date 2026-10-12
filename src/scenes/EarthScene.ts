// 世界のおそうじ（4章）：地球儀を指で回し、砂嵐や火山灰の地域を長押しすると、
// となりにいる大きなほこりちゃんが吸い込む。

import * as THREE from 'three';
import { DUSTS, type AccessoryId, type DustType, type Hero, type PetShape } from '../game/catalog.ts';
import { createRandom, randRange } from '../game/rng.ts';
import { CharacterSprite } from '../render/characterSprite.ts';
import { HokorichanModel } from '../render/hokorichan.ts';
import { Particles } from '../render/particles.ts';
import { makeCanvas, ringTexture, sparkleTexture, toTexture } from '../render/proceduralArt.ts';
import { createIsoCamera, disposeHierarchy, ISO_VIEW_DIR } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

const R = 3;
const VIEW_WIDTH = 11.5;
const PET_SIZE = 2.6;
/** これ以上指が動いたら長押しではなく回す操作 */
const DRAG_PX = 12;

export type EarthOptions = {
  element: HTMLElement;
  seed: number;
  hero: Hero;
  /** 地域ごとのホコリの種類（この数だけ置く） */
  patches: DustType[];
  pet: { accessory: AccessoryId | null; shape: PetShape; tint: string };
  /** 長押しで吸い込むまでの秒数 */
  holdSeconds: number;
  onPatch: (type: DustType) => void;
};

type Patch = {
  group: THREE.Group;
  type: DustType;
  /** 地球儀の上での向き（ローカル、単位ベクトル） */
  normal: THREE.Vector3;
  state: 'idle' | 'sucking' | 'gone';
  progress: number;
  t: number;
  from: THREE.Vector3;
};

/** 3次元の格子ノイズ（球の上でつなぎ目が出ないように、球面上の点で調べる） */
function valueNoise3(seed: number): (x: number, y: number, z: number) => number {
  const hash = (x: number, y: number, z: number) => {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const fz = smooth(z - zi);
    let v = 0;
    for (let dz = 0; dz <= 1; dz++)
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
          v += w * hash(xi + dx, yi + dy, zi + dz);
        }
    return v;
  };
}

/** 地球の模様（正距円筒図法の小さなドット絵）。海・陸・砂漠・氷を手続きで描く */
function earthTexture(seed: number): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [canvas, ctx] = makeCanvas(W, H);
  const noise = valueNoise3(seed);
  for (let y = 0; y < H; y++) {
    const lat = (0.5 - (y + 0.5) / H) * Math.PI;
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      const px = Math.cos(lat) * Math.cos(lon);
      const py = Math.sin(lat);
      const pz = Math.cos(lat) * Math.sin(lon);
      // 3段のノイズを重ねて、大陸と島をつくる
      const v = noise(px * 1.6 + 5, py * 1.6 + 5, pz * 1.6 + 5) * 0.6 + noise(px * 3.5, py * 3.5, pz * 3.5) * 0.3 + noise(px * 8, py * 8, pz * 8) * 0.1;
      const a = Math.abs(lat);
      let color: string;
      if (a > 1.32) color = '#ffffff';
      else if (v > 0.53) {
        // 赤道近くの乾いた所は砂漠
        const dry = noise(px * 2.5 + 11, py * 2.5, pz * 2.5) > 0.55 && a < 0.7;
        color = dry ? ((x + y) % 5 === 0 ? '#d9ad5c' : '#e8c27a') : v > 0.66 ? '#74a35a' : (x * 7 + y * 3) % 9 === 0 ? '#86b86a' : '#9cc97e';
      } else color = v > 0.49 ? '#9fcbec' : (x * 5 + y) % 13 === 0 ? '#8fc0e8' : '#7fb3e0';
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return toTexture(canvas);
}

/** 地域のホコリ（平たい雲のかたまり） */
function patchPuff(type: DustType, seed: number): THREE.Group {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const colors = DUSTS[type].colors;
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[i % colors.length], flatShading: true }));
    m.scale.setScalar(randRange(rng, 0.2, 0.32));
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.15, 0.4);
    m.position.set(Math.cos(a) * d, randRange(rng, 0.05, 0.18), Math.sin(a) * d);
    g.add(m);
  }
  return g;
}

export class EarthScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: EarthOptions;
  private readonly background: THREE.Texture;
  private readonly globe = new THREE.Group();
  private readonly pet: HokorichanModel;
  private readonly rider: CharacterSprite;
  private readonly particles = new Particles();
  private readonly sparkle = sparkleTexture();
  private readonly ring: THREE.Mesh;
  private readonly patches: Patch[] = [];
  private lowWidth = 260;
  private readonly spin = new THREE.Vector2(0.15, 0);
  private pointer: { id: number; x: number; y: number; startX: number; startY: number; patch: Patch | null; drag: boolean } | null = null;
  private inputEnabled = true;
  private munch = 0;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly raycaster = new THREE.Raycaster();

  constructor(opts: EarthOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.scene.background = this.spaceGradient();

    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshLambertMaterial({ map: earthTexture(opts.seed) }));
    this.globe.add(earth);
    this.globe.rotation.x = 0.12;
    this.scene.add(this.globe);

    const random = createRandom(opts.seed ^ 0xea27);
    opts.patches.forEach((type, i) => {
      let normal = new THREE.Vector3();
      for (let k = 0; k < 30; k++) {
        const lat = randRange(random, -1.0, 1.0);
        const lon = random() * Math.PI * 2;
        normal = new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
        if (this.patches.every((p) => p.normal.distanceTo(normal) > 0.55)) break;
      }
      const group = patchPuff(type, opts.seed + i * 17);
      group.position.copy(normal).multiplyScalar(R * 1.01);
      group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      this.globe.add(group);
      this.patches.push({ group, type, normal, state: 'idle', progress: 0, t: 0, from: new THREE.Vector3() });
    });

    // 地球儀のとなりに座る、大きなほこりちゃん（主人公はその頭の上）
    this.pet = new HokorichanModel(11);
    this.pet.setAccessory(opts.pet.accessory);
    this.pet.setCustomShape(opts.pet.shape);
    this.pet.setBaseColor(opts.pet.tint);
    this.pet.setSize(PET_SIZE, 1);
    const right = new THREE.Vector3(1, 0, -1).normalize();
    this.pet.group.position.copy(right.multiplyScalar(R + 1.9)).setY(-R * 0.75);
    this.rider = new CharacterSprite(opts.hero, { shadow: false });
    this.rider.set('idle', 'down');
    this.rider.group.position.copy(this.pet.group.position).setY(this.pet.group.position.y + PET_SIZE * 0.92);

    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthTest: false }),
    );
    this.ring.visible = false;
    this.ring.renderOrder = 5;
    this.scene.add(this.pet.group, this.rider.group, this.ring, this.particles.group);
    this.bindInput();
  }

  private spaceGradient(): THREE.Texture {
    const [canvas, ctx] = makeCanvas(2, 64);
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#3e4a7a');
    g.addColorStop(1, '#9a86c6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- 入力：回す・長押し ----

  private ndc(x: number, y: number): THREE.Vector2 | null {
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
  }

  /** 指の下にある、こちら向きの地域 */
  private patchAt(x: number, y: number): Patch | null {
    const ndc = this.ndc(x, y);
    if (!ndc) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: Patch | null = null;
    let bestD = Infinity;
    const world = new THREE.Vector3();
    const facing = new THREE.Vector3();
    for (const p of this.patches) {
      if (p.state !== 'idle') continue;
      p.group.getWorldPosition(world);
      facing.copy(p.normal).applyQuaternion(this.globe.quaternion);
      if (facing.dot(ISO_VIEW_DIR) < 0.15) continue;
      const d = this.raycaster.ray.distanceToPoint(world);
      if (d < 0.75 && d < bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }

  private bindInput(): void {
    const el = this.opts.element;
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const listener = fn as EventListener;
      el.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };
    on('pointerdown', (e) => {
      if (!this.inputEnabled || this.pointer || !e.isPrimary) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // そのまま続ける
      }
      this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, patch: this.patchAt(e.clientX, e.clientY), drag: false };
      this.spin.set(0, 0);
    });
    on('pointermove', (e) => {
      const p = this.pointer;
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!p.drag && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > DRAG_PX) {
        p.drag = true;
        if (p.patch && p.patch.state === 'idle') p.patch.progress = 0;
        p.patch = null;
      }
      if (p.drag) {
        this.globe.rotation.y += dx * 0.012;
        this.globe.rotation.x = THREE.MathUtils.clamp(this.globe.rotation.x + dy * 0.008, -0.9, 0.9);
        this.spin.set(dx * 0.6, dy * 0.4);
      }
    });
    const end = (e: PointerEvent) => {
      const p = this.pointer;
      if (!p || e.pointerId !== p.id) return;
      if (p.patch && p.patch.state === 'idle') p.patch.progress = 0;
      this.pointer = null;
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('lostpointercapture', end);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.pointer = null;
  }

  // ---- カメラ ----

  resize(aspect: number, lowWidth: number): void {
    this.lowWidth = lowWidth;
    this.camera.updateMatrixWorld();
    // 地球儀とほこりちゃんがおさまる範囲
    const halfW = VIEW_WIDTH / 2;
    const halfH = Math.max(halfW / aspect, 5.6);
    const w = halfH * aspect;
    // 地球儀とほこりちゃんのまんなか
    const c = this.pet.group.position.clone().multiplyScalar(0.45).setY(0.9).applyMatrix4(this.camera.matrixWorldInverse);
    this.camera.left = c.x - w;
    this.camera.right = c.x + w;
    this.camera.top = c.y + halfH;
    this.camera.bottom = c.y - halfH;
    this.camera.updateProjectionMatrix();
  }

  // ---- 進行 ----

  get remaining(): number {
    return this.patches.filter((p) => p.state === 'idle').length;
  }

  update(dt: number, time: number): void {
    this.pet.tick(dt);
    // 指をはなすと、ゆっくり回り続けて止まる
    if (!this.pointer?.drag) {
      this.globe.rotation.y += (0.05 + this.spin.x * 0.01) * dt;
      this.globe.rotation.x = THREE.MathUtils.clamp(this.globe.rotation.x + this.spin.y * 0.004 * dt, -0.9, 0.9);
      this.spin.multiplyScalar(Math.max(0, 1 - dt * 2));
    }

    const mouth = this.pet.mouthWorld(new THREE.Vector3());
    const holding = this.pointer && !this.pointer.drag ? this.pointer.patch : null;
    this.ring.visible = false;
    for (const p of this.patches) {
      if (p.state === 'gone') continue;
      if (p.state === 'idle') {
        if (p === holding) {
          p.progress += dt / this.opts.holdSeconds;
          const s = 1 - 0.4 * Math.min(1, p.progress);
          p.group.scale.setScalar(s);
          p.group.rotation.y += dt * 6;
          p.group.getWorldPosition(this.ring.position);
          this.ring.quaternion.copy(this.camera.quaternion);
          this.ring.scale.setScalar(0.8 + (1 - Math.min(1, p.progress)) * 0.6);
          this.ring.visible = true;
          if (p.progress >= 1) {
            // 地球儀から外して、ほこりちゃんの口へ
            p.group.getWorldPosition(p.from);
            this.globe.remove(p.group);
            this.scene.add(p.group);
            p.group.position.copy(p.from);
            p.state = 'sucking';
            p.t = 0;
            if (this.pointer) this.pointer.patch = null;
          }
        } else {
          p.group.scale.setScalar(1 + Math.sin(time * 3 + p.normal.x * 5) * 0.06);
        }
        continue;
      }
      p.t += dt / 0.7;
      const k = Math.min(1, p.t);
      p.group.position.lerpVectors(p.from, mouth, k * k);
      p.group.scale.setScalar(Math.max(0.05, 0.6 * (1 - k)));
      if (k >= 1) {
        p.state = 'gone';
        this.scene.remove(p.group);
        this.particles.burst(this.sparkle, mouth.clone(), 10, 2.4, 0.35);
        this.munch = 0.7;
        this.opts.onPatch(p.type);
      }
    }
    this.munch = Math.max(0, this.munch - dt);
    const squash = this.munch > 0 ? 1 - Math.abs(Math.sin(time * 16)) * 0.08 : 1 + Math.sin(time * 2) * 0.03;
    this.pet.setSize(PET_SIZE, squash);
    this.pet.setExpression(this.munch > 0 ? 'eating' : holding ? 'happy' : 'idle', false, Math.floor(time * 8) % 2 === 0);
    this.rider.group.position.copy(this.pet.group.position).setY(this.pet.group.position.y + PET_SIZE * 0.92 * squash);
    this.rider.set(this.munch > 0 ? 'joy' : 'idle', 'down');
    this.rider.update(dt);
    this.particles.update(dt);
    this.rider.fitToPixels(this.camera, this.lowWidth);
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    for (const p of this.patches) if (p.state === 'gone') this.scene.add(p.group);
    this.rider.dispose();
    this.particles.dispose();
    this.sparkle.dispose();
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
