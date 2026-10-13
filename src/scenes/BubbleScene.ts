// しゃぼん玉の宇宙（終章）：画面の下に、とても大きなほこりちゃん（頭のてっぺんだけ見える）。
// よその宇宙がしゃぼん玉になって、下から浮かんでくる。タップしてはじくと、中のちりが
// ほこりちゃんにふりそそぐ。上まで行ってしまったしゃぼん玉は、また今度。

import * as THREE from 'three';
import { DUSTS, type AccessoryId, type DustType, type PetShape } from '../game/catalog.ts';
import { createRandom, randRange } from '../game/rng.ts';
import { HokorichanModel } from '../render/hokorichan.ts';
import { makeCanvas, sparkleTexture, toTexture } from '../render/proceduralArt.ts';
import { Particles } from '../render/particles.ts';
import { galaxyTexture, starfieldTexture } from '../render/spaceArt.ts';
import { createIsoCamera, disposeHierarchy } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

/** 画面の横幅（ワールド単位） */
const VIEW_W = 10;
const PET_SIZE = 9;
/** しゃぼん玉が浮かぶ速さ（ワールド単位/秒） */
const RISE = 1.25;
/** カメラから見た奥行き（ほこりちゃんより手前） */
const DEPTH = -9;

export type BubbleOptions = {
  element: HTMLElement;
  seed: number;
  /** しゃぼん玉ごとの中身（この数だけ浮かんでくる） */
  bubbles: DustType[];
  /** 浮かんでくる時間（この秒数のあいだに順に出る） */
  spawnSeconds: number;
  pet: { accessory: AccessoryId | null; shape: PetShape; tint: string };
  riseMul: number;
  onPop: (type: DustType) => void;
};

type Bubble = {
  type: DustType;
  sprite: THREE.Sprite;
  x: number;
  y: number;
  r: number;
  phase: number;
  at: number;
  state: 'wait' | 'float' | 'pop' | 'gone' | 'missed';
  t: number;
};

/** しゃぼん玉の宇宙の絵：にじ色のふちと、中に小さなうずまき銀河 */
export function bubbleTexture(seed: number, tint: string): THREE.CanvasTexture {
  const S = 48;
  const [canvas, ctx] = makeCanvas(S, S);
  const c = S / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(30,30,70,0.55)';
  ctx.fillRect(0, 0, S, S);
  const galaxy = galaxyTexture(seed);
  ctx.drawImage(galaxy.image as HTMLCanvasElement, 6, 6, S - 12, S - 12);
  galaxy.dispose();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = tint;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
  // にじ色のふち
  const rim = ['#9fd0f0', '#f4a7d0', '#fff2a8', '#b3e6c4'];
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = rim[i];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, c - 2, (i / 4) * Math.PI * 2, ((i + 1) / 4) * Math.PI * 2);
    ctx.stroke();
  }
  // てかり
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(13, 11, 6, 2);
  ctx.fillRect(11, 13, 2, 5);
  return toTexture(canvas);
}

export class BubbleScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: BubbleOptions;
  private readonly background: THREE.Texture;
  private readonly stars: THREE.Texture;
  private readonly sparkle = sparkleTexture();
  private readonly pet: HokorichanModel;
  private readonly particles = new Particles();
  private readonly bubbles: Bubble[] = [];
  private readonly textures: THREE.Texture[] = [];
  private halfH = 8;
  private time = 0;
  private munch = 0;
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly tmp = new THREE.Vector3();

  constructor(opts: BubbleOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.stars = starfieldTexture(opts.seed);
    this.scene.background = this.stars;

    this.pet = new HokorichanModel(29);
    this.pet.setAccessory(opts.pet.accessory);
    this.pet.setCustomShape(opts.pet.shape);
    this.pet.setBaseColor(opts.pet.tint);
    this.pet.setSize(PET_SIZE, 1);
    this.scene.add(this.pet.group);

    const random = createRandom(opts.seed ^ 0xb0bb);
    const n = opts.bubbles.length;
    opts.bubbles.forEach((type, i) => {
      const tint = DUSTS[type].colors[i % DUSTS[type].colors.length];
      const tex = bubbleTexture(opts.seed + i * 13, tint);
      this.textures.push(tex);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      const r = randRange(random, 0.75, 1.1);
      sprite.scale.setScalar(r * 2);
      sprite.visible = false;
      sprite.renderOrder = 5;
      this.scene.add(sprite);
      this.bubbles.push({
        type,
        sprite,
        x: randRange(random, -VIEW_W / 2 + 1.2, VIEW_W / 2 - 1.2),
        y: 0,
        r,
        phase: random() * Math.PI * 2,
        // 出てくる時刻（はじめの1つはすぐ）
        at: n <= 1 ? 0 : (i / (n - 1)) * opts.spawnSeconds,
        state: 'wait',
        t: 0,
      });
    });
    this.scene.add(this.particles.group);
    this.bindInput();
  }

  /** 画面の座標（カメラから見た x,y）をワールドの位置へ */
  private toWorld(x: number, y: number, depth = DEPTH): THREE.Vector3 {
    return this.tmp.set(x, y, depth).applyMatrix4(this.camera.matrixWorld);
  }

  // ---- 入力：タップではじく ----

  private bindInput(): void {
    const el = this.opts.element;
    const listener = ((e: PointerEvent) => {
      if (!this.inputEnabled || !e.isPrimary) return;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      // タップした所を、カメラから見た座標へ
      const vx = this.camera.left + ((e.clientX - rect.left) / rect.width) * (this.camera.right - this.camera.left);
      const vy = this.camera.top - ((e.clientY - rect.top) / rect.height) * (this.camera.top - this.camera.bottom);
      let best: Bubble | null = null;
      let bestD = Infinity;
      for (const b of this.bubbles) {
        if (b.state !== 'float') continue;
        const d = Math.hypot(b.x - vx, b.y - vy);
        // 指は太いので、見た目より少し大きめに当たる
        if (d < b.r * 1.25 && d < bestD) {
          best = b;
          bestD = d;
        }
      }
      if (best) {
        e.preventDefault();
        this.pop(best);
      }
    }) as EventListener;
    el.addEventListener('pointerdown', listener);
    this.listeners.push(['pointerdown', listener]);
  }

  private pop(b: Bubble): void {
    b.state = 'pop';
    b.t = 0;
    const at = this.toWorld(b.x, b.y).clone();
    this.particles.burst(this.sparkle, at, 10, 2.4, 0.35);
    // 中のちりが、ほこりちゃんへふりそそぐ
    const top = this.toWorld(b.x * 0.3, this.camera.bottom + this.halfH * 0.35, DEPTH + 2).clone();
    for (let i = 0; i < 6; i++) {
      const v = top.clone().sub(at).multiplyScalar(1.4 + Math.random() * 0.4);
      this.particles.spawn(this.sparkle, at, v.add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5)), { life: 0.7, scale: 0.3 });
    }
    this.munch = 0.8;
    this.opts.onPop(b.type);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
  }

  // ---- カメラ ----

  resize(aspect: number): void {
    this.camera.updateMatrixWorld();
    const halfW = VIEW_W / 2;
    this.halfH = halfW / aspect;
    // ほこりちゃんの頭のてっぺんが、画面の下から3割くらいのところに来るように
    const top = this.pet.group.position.clone().setY(PET_SIZE * 0.98).applyMatrix4(this.camera.matrixWorldInverse);
    const bottom = top.y - this.halfH * 2 * 0.3;
    this.camera.left = top.x - halfW;
    this.camera.right = top.x + halfW;
    this.camera.bottom = bottom;
    this.camera.top = bottom + this.halfH * 2;
    this.camera.updateProjectionMatrix();
  }

  // ---- 進行 ----

  /** まだはじいていない（これから出る・上へ行ってしまった）しゃぼん玉 */
  get remaining(): number {
    return this.bubbles.filter((b) => b.state === 'wait' || b.state === 'float' || b.state === 'missed').length;
  }

  /** もう浮かんでくるものも、浮かんでいるものもない */
  get finished(): boolean {
    return this.bubbles.every((b) => b.state === 'gone' || b.state === 'missed');
  }

  update(dt: number, time: number): void {
    this.time += dt;
    this.pet.tick(dt);
    const rise = RISE * this.opts.riseMul;
    for (const b of this.bubbles) {
      if (b.state === 'wait' && this.time >= b.at) {
        b.state = 'float';
        b.y = this.camera.bottom - b.r;
        b.sprite.visible = true;
      }
      if (b.state === 'float') {
        b.y += rise * dt;
        const wobble = Math.sin(time * 1.3 + b.phase) * 0.6;
        b.sprite.position.copy(this.toWorld(b.x + wobble * 0.5, b.y));
        b.sprite.material.rotation = Math.sin(time + b.phase) * 0.1;
        if (b.y - b.r > this.camera.top) {
          b.state = 'missed';
          b.sprite.visible = false;
        }
      } else if (b.state === 'pop') {
        b.t += dt / 0.2;
        b.sprite.scale.setScalar(b.r * 2 * (1 + b.t * 0.6));
        b.sprite.material.opacity = Math.max(0, 1 - b.t);
        if (b.t >= 1) {
          b.state = 'gone';
          b.sprite.visible = false;
        }
      }
    }
    this.munch = Math.max(0, this.munch - dt);
    const squash = this.munch > 0 ? 1 - Math.abs(Math.sin(time * 12)) * 0.04 : 1 + Math.sin(time * 1.6) * 0.015;
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
    for (const t of this.textures) t.dispose();
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
