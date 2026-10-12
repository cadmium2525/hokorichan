// 空のおそうじ（3章）：主人公がほこりちゃんに乗って空を飛び、黄砂や花粉の雲を吸い込む。
// 指でさした方へ飛んでいき、雲にふれると吸い込む。雲は風でゆっくり流れる。

import * as THREE from 'three';
import { DUSTS, type AccessoryId, type DustType, type Hero, type PetShape } from '../game/catalog.ts';
import { createRandom, randRange } from '../game/rng.ts';
import { CharacterSprite } from '../render/characterSprite.ts';
import { HokorichanModel } from '../render/hokorichan.ts';
import { Particles } from '../render/particles.ts';
import { makeCanvas, sparkleTexture, toTexture } from '../render/proceduralArt.ts';
import { createIsoCamera, disposeHierarchy } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

/** 飛べる範囲（ワールド単位、中心から） */
const FIELD = 7;
const VIEW_WIDTH = 11;
const PET_SIZE = 2.2;
const FLY_SPEED = 4.2;
const TOUCH_OFFSET_Y = 28;

export type SkyOptions = {
  element: HTMLElement;
  seed: number;
  hero: Hero;
  /** 雲ごとの種類（この数だけ浮かべる） */
  clouds: DustType[];
  pet: { accessory: AccessoryId | null; shape: PetShape; tint: string };
  /** 吸い込む範囲の倍率（黄砂の毛並み） */
  radiusMul: number;
  /** 飛ぶ速さの倍率（チョークの粉の毛並み） */
  speedMul?: number;
  onCloud: (type: DustType) => void;
};

type Cloud = { group: THREE.Group; type: DustType; pos: THREE.Vector3; state: 'idle' | 'sucking' | 'gone'; t: number; phase: number };

/** 下に見える雲海（白い雲のかたまりを散らした水色の地面） */
function seaTexture(seed: number): THREE.CanvasTexture {
  const rng = createRandom(seed);
  const [canvas, ctx] = makeCanvas(64, 64);
  ctx.fillStyle = '#b9e0f4';
  ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rng() * 64);
    const y = Math.floor(rng() * 64);
    const w = 6 + Math.floor(rng() * 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, 3);
    ctx.fillRect(x + 2, y - 2, w - 4, 2);
    ctx.fillStyle = '#e3f3fb';
    ctx.fillRect(x + 1, y + 3, w - 2, 1);
  }
  return toTexture(canvas, [6, 6]);
}

/** 雲のかたまり（種類の色の小さな玉をいくつも集める） */
function cloudPuff(type: DustType, seed: number): THREE.Group {
  const rng = createRandom(seed);
  const g = new THREE.Group();
  const colors = DUSTS[type].colors;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const n = 7 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colors[i % colors.length], flatShading: true }));
    const r = randRange(rng, 0.22, 0.38);
    m.scale.setScalar(r);
    const a = rng() * Math.PI * 2;
    const d = i === 0 ? 0 : randRange(rng, 0.2, 0.55);
    m.position.set(Math.cos(a) * d, randRange(rng, -0.1, 0.25), Math.sin(a) * d);
    g.add(m);
  }
  return g;
}

export class SkyScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: SkyOptions;
  private readonly background: THREE.Texture;
  private readonly sea: THREE.Mesh;
  private readonly pet: HokorichanModel;
  private readonly rider: CharacterSprite;
  private readonly particles = new Particles();
  private readonly sparkle = sparkleTexture();
  private readonly clouds: Cloud[] = [];
  private readonly pos = new THREE.Vector3();
  private target: THREE.Vector3 | null = null;
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly camCenter = new THREE.Vector2();
  private aspect = 0.6;
  private lowWidth = 260;
  private pointerId: number | null = null;
  private lastPointer: { x: number; y: number; touch: boolean } | null = null;
  private inputEnabled = true;
  private munch = 0;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly tmp = new THREE.Vector3();
  private readonly wind: THREE.Vector2;

  constructor(opts: SkyOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.scene.background = this.skyGradient();

    const sea = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ map: seaTexture(opts.seed) }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -3;
    this.sea = sea;
    this.scene.add(sea);

    // 主人公を乗せたほこりちゃん
    this.pet = new HokorichanModel(11);
    this.pet.setAccessory(opts.pet.accessory);
    this.pet.setCustomShape(opts.pet.shape);
    this.pet.setBaseColor(opts.pet.tint);
    this.pet.setSize(PET_SIZE, 1);
    this.pet.setExpression('happy');
    this.rider = new CharacterSprite(opts.hero, { shadow: false });
    this.rider.set('idle', 'down');
    this.scene.add(this.pet.group, this.rider.group, this.particles.group);

    const random = createRandom(opts.seed ^ 0x5eed);
    const a = random() * Math.PI * 2;
    this.wind = new THREE.Vector2(Math.cos(a), Math.sin(a)).multiplyScalar(0.35);
    opts.clouds.forEach((type, i) => {
      // 出発点のまわりは空けておく
      let x = 0;
      let z = 0;
      for (let k = 0; k < 20; k++) {
        x = randRange(random, -FIELD + 1, FIELD - 1);
        z = randRange(random, -FIELD + 1, FIELD - 1);
        if (Math.hypot(x, z) > 2.5 && this.clouds.every((c) => Math.hypot(c.pos.x - x, c.pos.z - z) > 1.6)) break;
      }
      const group = cloudPuff(type, opts.seed + i * 31);
      const pos = new THREE.Vector3(x, 0.6, z);
      group.position.copy(pos);
      this.scene.add(group);
      this.clouds.push({ group, type, pos, state: 'idle', t: 0, phase: random() * Math.PI * 2 });
    });

    this.camCenter.copy(this.screenCenter(this.pos));
    this.bindInput();
  }

  private skyGradient(): THREE.Texture {
    const [canvas, ctx] = makeCanvas(2, 64);
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#8fcbef');
    g.addColorStop(1, '#e6f4fb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---- 入力 ----

  private bindInput(): void {
    const el = this.opts.element;
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const listener = fn as EventListener;
      el.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };
    on('pointerdown', (e) => {
      if (!this.inputEnabled || this.pointerId !== null || !e.isPrimary) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // キャプチャできなくても続ける
      }
      this.lastPointer = { x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    });
    on('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.lastPointer = { x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.lastPointer = null;
      this.target = null;
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('lostpointercapture', end);
  }

  /** 指の位置（カメラが動いても毎フレーム）を空の面に投影する */
  private projectPointer(): void {
    const p = this.lastPointer;
    if (!p) return;
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const off = p.touch ? TOUCH_OFFSET_Y : 0;
    const ndc = new THREE.Vector2(((p.x - rect.left) / rect.width) * 2 - 1, -((p.y - off - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.plane, hit)) {
      hit.x = THREE.MathUtils.clamp(hit.x, -FIELD, FIELD);
      hit.z = THREE.MathUtils.clamp(hit.z, -FIELD, FIELD);
      this.target = hit;
    }
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.pointerId = null;
      this.lastPointer = null;
      this.target = null;
    }
  }

  // ---- カメラ ----

  private screenCenter(p: THREE.Vector3): THREE.Vector2 {
    this.camera.updateMatrixWorld();
    const v = this.tmp.copy(p).setY(PET_SIZE * 0.5).applyMatrix4(this.camera.matrixWorldInverse);
    return new THREE.Vector2(v.x, v.y);
  }

  resize(aspect: number, lowWidth: number): void {
    this.aspect = aspect;
    this.lowWidth = lowWidth;
    this.applyCamera();
  }

  private applyCamera(): void {
    const halfW = VIEW_WIDTH / 2;
    const halfH = halfW / this.aspect;
    const unit = VIEW_WIDTH / Math.max(1, this.lowWidth);
    const cx = Math.round(this.camCenter.x / unit) * unit;
    const cy = Math.round(this.camCenter.y / unit) * unit;
    this.camera.left = cx - halfW;
    this.camera.right = cx + halfW;
    this.camera.top = cy + halfH;
    this.camera.bottom = cy - halfH;
    this.camera.updateProjectionMatrix();
  }

  // ---- 進行 ----

  /** 残っている雲の数 */
  get remaining(): number {
    return this.clouds.filter((c) => c.state === 'idle').length;
  }

  update(dt: number, time: number): void {
    this.pet.tick(dt, 4);
    this.projectPointer();
    if (this.target) {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1) {
        const step = Math.min(d, FLY_SPEED * (this.opts.speedMul ?? 1) * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
      }
    }
    // ふわふわ上下しながら、進む方向へ少し傾く
    const bob = Math.sin(time * 2.2) * 0.12;
    this.pet.group.position.set(this.pos.x, bob, this.pos.z);
    this.munch = Math.max(0, this.munch - dt);
    const squash = this.munch > 0 ? 1 - Math.abs(Math.sin(time * 16)) * 0.08 : 1 + Math.sin(time * 3) * 0.03;
    this.pet.setSize(PET_SIZE, squash);
    this.pet.setExpression(this.munch > 0 ? 'eating' : 'happy', false, Math.floor(time * 8) % 2 === 0);
    this.rider.group.position.set(this.pos.x, bob + PET_SIZE * 0.92 * squash, this.pos.z);
    this.rider.set(this.munch > 0 ? 'joy' : 'idle', 'down');
    this.rider.update(dt);

    // 雲：風で流れ、端まで行くと反対側から戻る。ほこりちゃんにふれると吸い込む
    const mouth = this.pet.mouthWorld(new THREE.Vector3());
    const reach = (PET_SIZE * 0.5 + 0.7) * this.opts.radiusMul;
    for (const c of this.clouds) {
      if (c.state === 'gone') continue;
      if (c.state === 'idle') {
        c.pos.x += this.wind.x * dt;
        c.pos.z += this.wind.y * dt;
        if (c.pos.x > FIELD) c.pos.x = -FIELD;
        if (c.pos.x < -FIELD) c.pos.x = FIELD;
        if (c.pos.z > FIELD) c.pos.z = -FIELD;
        if (c.pos.z < -FIELD) c.pos.z = FIELD;
        c.group.position.set(c.pos.x, c.pos.y + Math.sin(time * 1.5 + c.phase) * 0.12, c.pos.z);
        c.group.rotation.y += dt * 0.3;
        if (Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z) < reach) {
          c.state = 'sucking';
          c.t = 0;
        }
        continue;
      }
      c.t += dt / 0.5;
      const k = Math.min(1, c.t);
      c.group.position.lerpVectors(c.pos, mouth, k * k);
      c.group.scale.setScalar(Math.max(0.05, 1 - k * 0.9));
      c.group.rotation.y += dt * 12;
      if (k >= 1) {
        c.state = 'gone';
        this.scene.remove(c.group);
        this.particles.burst(this.sparkle, mouth.clone(), 8, 2, 0.3);
        this.munch = 0.6;
        this.opts.onCloud(c.type);
      }
    }
    this.particles.update(dt);

    // 下の雲海は少しずつ流して、飛んでいる感じを出す
    const map = (this.sea.material as THREE.MeshBasicMaterial).map;
    if (map) map.offset.set(map.offset.x + this.wind.x * dt * 0.01, map.offset.y - this.wind.y * dt * 0.01);

    this.camCenter.lerp(this.screenCenter(this.pos), Math.min(1, dt * 3));
    this.applyCamera();
    this.rider.fitToPixels(this.camera, this.lowWidth);
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    for (const c of this.clouds) if (c.state === 'gone') this.scene.add(c.group);
    this.rider.dispose();
    this.particles.dispose();
    this.sparkle.dispose();
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
