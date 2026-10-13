// 銀河のおそうじ（6章）：まんなかに大きなほこりちゃん。まわりに星雲のもや（たくさんのつぶ）が
// うかび、銀河はゆっくりうずをまいている。指でなでるように動かすと、指の通り道のつぶが
// その向きに流れる。ほこりちゃんの口のまわりまでかき集めると吸い込む。

import * as THREE from 'three';
import { DUSTS, type AccessoryId, type DustType, type PetShape } from '../game/catalog.ts';
import { createRandom, randRange } from '../game/rng.ts';
import { HokorichanModel } from '../render/hokorichan.ts';
import { Particles } from '../render/particles.ts';
import { ringTexture, sparkleTexture } from '../render/proceduralArt.ts';
import { buildGalaxyDisc, starfieldTexture } from '../render/spaceArt.ts';
import { createIsoCamera, disposeHierarchy, fitOrthoToBox } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

/** つぶが動ける範囲 */
const FIELD_R = 7.5;
/** ほこりちゃんが吸い込む範囲 */
const EAT_R = 1.5;
const PET_SIZE = 2.6;
/** 指の通り道からこの距離のつぶを動かす */
const SWEEP_R = 1.1;
/** 銀河のうず（つぶが中心のまわりを回る速さ）と、外へ流れる速さ */
const SWIRL = 0.32;
const DRIFT = 0.14;
const FRICTION = 2.4;
const MAX_FINGER_SPEED = 7;

export type GalaxyOptions = {
  element: HTMLElement;
  seed: number;
  /** 星雲ごとの種類（この数だけ星雲を置く） */
  nebulae: DustType[];
  motesPerNebula: number;
  pet: { accessory: AccessoryId | null; shape: PetShape; tint: string };
  /** かき集める指の幅の倍率 */
  sweepMul: number;
  onMote: (type: DustType) => void;
};

type Mote = { x: number; z: number; vx: number; vz: number; type: DustType; state: 'free' | 'sucking' | 'gone'; t: number; fx: number; fz: number };

export class GalaxyScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: GalaxyOptions;
  private readonly background: THREE.Texture;
  private readonly stars: THREE.Texture;
  private readonly sparkle = sparkleTexture();
  private readonly disc: THREE.Mesh;
  private readonly pet: HokorichanModel;
  private readonly particles = new Particles();
  private readonly motes: Mote[] = [];
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly brush: THREE.Mesh;
  private pointer: { id: number; x: number; z: number; t: number } | null = null;
  private inputEnabled = true;
  private munch = 0;
  private eaten = 0;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.2);

  constructor(opts: GalaxyOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.stars = starfieldTexture(opts.seed);
    this.scene.background = this.stars;

    this.disc = buildGalaxyDisc(FIELD_R + 2.5, opts.seed);
    this.disc.position.y = -0.6;
    this.scene.add(this.disc);

    // 星雲：中心から少しはなれた所に、つぶのかたまり
    const random = createRandom(opts.seed ^ 0x9a1a);
    const centers: Array<[number, number]> = [];
    opts.nebulae.forEach((type, i) => {
      let cx = 0;
      let cz = 0;
      for (let k = 0; k < 40; k++) {
        const a = random() * Math.PI * 2;
        const r = randRange(random, 3.4, FIELD_R - 1);
        cx = Math.cos(a) * r;
        cz = Math.sin(a) * r;
        if (centers.every(([x, z]) => Math.hypot(x - cx, z - cz) > 2.2)) break;
      }
      centers.push([cx, cz]);
      for (let m = 0; m < opts.motesPerNebula; m++) {
        // かたまりの中心ほど多い（2つの乱数の和で山なりに）
        const a = random() * Math.PI * 2;
        const d = (random() + random()) * 0.55;
        this.motes.push({ x: cx + Math.cos(a) * d, z: cz + Math.sin(a) * d, vx: 0, vz: 0, type, state: 'free', t: 0, fx: 0, fz: 0 });
      }
      void i;
    });

    this.positions = new Float32Array(this.motes.length * 3);
    const colors = new Float32Array(this.motes.length * 3);
    const color = new THREE.Color();
    this.motes.forEach((m, i) => {
      const list = DUSTS[m.type].colors;
      color.set(list[i % list.length]);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true }));
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.writePositions();

    this.pet = new HokorichanModel(23);
    this.pet.setAccessory(opts.pet.accessory);
    this.pet.setCustomShape(opts.pet.shape);
    this.pet.setBaseColor(opts.pet.tint);
    this.pet.setSize(PET_SIZE, 1);
    this.pet.group.position.set(0, -0.5, 0);

    this.brush = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false, depthTest: false, opacity: 0.8 }),
    );
    this.brush.rotation.x = -Math.PI / 2;
    this.brush.visible = false;
    this.brush.renderOrder = 10;
    this.scene.add(this.pet.group, this.brush, this.particles.group);
    this.bindInput();
  }

  // ---- 入力：なでるように動かす ----

  private groundAt(x: number, y: number): THREE.Vector3 | null {
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, hit) ? hit : null;
  }

  private bindInput(): void {
    const el = this.opts.element;
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const listener = fn as EventListener;
      el.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };
    on('pointerdown', (e) => {
      // 新しい1本目の指が来たら、前の指（離したお知らせが届かなかったもの）は終わりにする
      if (!this.inputEnabled || !e.isPrimary) return;
      const p = this.groundAt(e.clientX, e.clientY);
      if (!p) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // そのまま続ける
      }
      this.pointer = { id: e.pointerId, x: p.x, z: p.z, t: performance.now() };
    });
    on('pointermove', (e) => {
      const ptr = this.pointer;
      if (!ptr || e.pointerId !== ptr.id) return;
      const p = this.groundAt(e.clientX, e.clientY);
      if (!p) return;
      const now = performance.now();
      const dt = Math.max(0.008, (now - ptr.t) / 1000);
      this.sweep(ptr.x, ptr.z, p.x, p.z, dt);
      ptr.x = p.x;
      ptr.z = p.z;
      ptr.t = now;
    });
    const end = (e: PointerEvent) => {
      if (this.pointer && e.pointerId === this.pointer.id) this.pointer = null;
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('lostpointercapture', end);
  }

  /** 指の通り道（a→b）の近くのつぶを、指の向きに流す */
  private sweep(ax: number, az: number, bx: number, bz: number, dt: number): void {
    let vx = (bx - ax) / dt;
    let vz = (bz - az) / dt;
    const speed = Math.hypot(vx, vz);
    if (speed < 1e-3) return;
    if (speed > MAX_FINGER_SPEED) {
      vx *= MAX_FINGER_SPEED / speed;
      vz *= MAX_FINGER_SPEED / speed;
    }
    const r = SWEEP_R * this.opts.sweepMul;
    const lx = bx - ax;
    const lz = bz - az;
    const len2 = lx * lx + lz * lz;
    for (const m of this.motes) {
      if (m.state !== 'free') continue;
      // 線分への最短距離
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((m.x - ax) * lx + (m.z - az) * lz) / len2)) : 0;
      const d = Math.hypot(m.x - (ax + lx * t), m.z - (az + lz * t));
      if (d > r) continue;
      // 指のまんなかほど強く押す。少しばらけるので、何度かなでて集める
      const k = 0.45 * (1 - d / r) + 0.15;
      const jitter = (Math.random() - 0.5) * 0.7;
      const jx = vx * Math.cos(jitter) - vz * Math.sin(jitter);
      const jz = vx * Math.sin(jitter) + vz * Math.cos(jitter);
      m.vx += (jx - m.vx) * k;
      m.vz += (jz - m.vz) * k;
    }
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.pointer = null;
  }

  // ---- カメラ ----

  resize(aspect: number): void {
    const pts: THREE.Vector3[] = [new THREE.Vector3(0, PET_SIZE, 0)];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * (FIELD_R + 0.3), 0, Math.sin(a) * (FIELD_R + 0.3)));
    }
    this.camera.updateMatrixWorld();
    fitOrthoToBox(this.camera, pts, aspect, 1.03);
  }

  // ---- 進行 ----

  /** まだ残っているつぶの数 */
  get remainingMotes(): number {
    return this.motes.filter((m) => m.state === 'free').length;
  }

  /** 吸いこんでいるとちゅう（まだ数えていない）のつぶの数 */
  get inFlight(): number {
    return this.motes.filter((m) => m.state === 'sucking').length;
  }

  get eatenMotes(): number {
    return this.eaten;
  }

  get totalMotes(): number {
    return this.motes.length;
  }

  private writePositions(): void {
    const mouth = this.pet ? this.pet.mouthWorld(new THREE.Vector3()) : new THREE.Vector3();
    this.motes.forEach((m, i) => {
      const o = i * 3;
      if (m.state === 'gone') {
        this.positions[o] = 0;
        this.positions[o + 1] = -1000;
        this.positions[o + 2] = 0;
      }
      else if (m.state === 'sucking') {
        const k = Math.min(1, m.t);
        this.positions[o] = m.fx + (mouth.x - m.fx) * k * k;
        this.positions[o + 1] = 0.2 + (mouth.y - 0.2) * k * k;
        this.positions[o + 2] = m.fz + (mouth.z - m.fz) * k * k;
      } else {
        this.positions[o] = m.x;
        this.positions[o + 1] = 0.2;
        this.positions[o + 2] = m.z;
      }
    });
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number, time: number): void {
    this.pet.tick(dt);
    this.disc.rotation.z += dt * 0.05;

    const friction = Math.exp(-FRICTION * dt);
    for (const m of this.motes) {
      if (m.state === 'gone') continue;
      if (m.state === 'sucking') {
        m.t += dt / 0.35;
        if (m.t >= 1) {
          m.state = 'gone';
          this.eaten++;
          this.munch = 0.4;
          if (this.eaten % 8 === 0) this.particles.burst(this.sparkle, this.pet.mouthWorld(new THREE.Vector3()), 4, 1.6, 0.25);
          this.opts.onMote(m.type);
        }
        continue;
      }
      const r = Math.hypot(m.x, m.z) || 1e-3;
      // 銀河のうず（反時計回り）と、外へのゆるい流れ
      const ux = m.x / r;
      const uz = m.z / r;
      const flowX = -uz * SWIRL + ux * DRIFT;
      const flowZ = ux * SWIRL + uz * DRIFT;
      m.vx *= friction;
      m.vz *= friction;
      m.x += (m.vx + flowX) * dt;
      m.z += (m.vz + flowZ) * dt;
      // 外のふちで止まる（はね返して内へ）
      const r2 = Math.hypot(m.x, m.z);
      if (r2 > FIELD_R) {
        m.x *= FIELD_R / r2;
        m.z *= FIELD_R / r2;
        const out = m.vx * (m.x / FIELD_R) + m.vz * (m.z / FIELD_R);
        if (out > 0) {
          m.vx -= (m.x / FIELD_R) * out * 1.5;
          m.vz -= (m.z / FIELD_R) * out * 1.5;
        }
      }
      if (r2 < EAT_R) {
        m.state = 'sucking';
        m.t = 0;
        m.fx = m.x;
        m.fz = m.z;
      }
    }
    this.writePositions();

    if (this.pointer) {
      this.brush.visible = true;
      this.brush.position.set(this.pointer.x, 0.25, this.pointer.z);
      this.brush.scale.setScalar(SWEEP_R * this.opts.sweepMul * 2);
    } else this.brush.visible = false;

    this.munch = Math.max(0, this.munch - dt);
    const squash = this.munch > 0 ? 1 - Math.abs(Math.sin(time * 16)) * 0.08 : 1 + Math.sin(time * 2) * 0.03;
    this.pet.setSize(PET_SIZE, squash);
    this.pet.setExpression(this.munch > 0 ? 'eating' : 'happy', false, this.munch > 0 && Math.floor(time * 8) % 2 === 0);
    this.particles.update(dt);
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    this.particles.dispose();
    this.sparkle.dispose();
    this.stars.dispose();
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
