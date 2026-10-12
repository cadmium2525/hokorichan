// 清掃シーン：掃除場所のレイアウトにホコリを散らし、なぞって道具で集める。

import * as THREE from 'three';
import { DUSTS, type AccessoryId, type DustType, type Hero, type PetShape, type ToolDef } from '../game/catalog.ts';
import { HokorichanModel } from '../render/hokorichan.ts';
import { createRandom, randRange, type Random } from '../game/rng.ts';
import { Particles } from '../render/particles.ts';
import { createDustPuff, ringTexture, sparkleTexture, blobShadowTexture } from '../render/proceduralArt.ts';
import type { Blocker } from '../render/roomBuilder.ts';
import type { SpotLayout, Surface } from '../render/spotBuilder.ts';
import { createToolModel } from '../render/toolModels.ts';
import { createIsoCamera, disposeHierarchy, projectedExtents, type Extents } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

/** 指で隠れないよう、タッチ時は吸引点を少し上にずらす（CSS px） */
const TOUCH_OFFSET_Y = 28;
/** 画面の左右この割合に指が入ると、その方向へ部屋がスクロールする */
const EDGE_ZONE = 0.16;
/** 縦長画面でも部屋が小さくなりすぎないよう、横は最大この割合まで切り取る */
const MIN_VISIBLE_WIDTH = 0.62;

type Dust = {
  id: number;
  object: THREE.Group;
  home: THREE.Vector3;
  state: 'idle' | 'sucking' | 'gone';
  /** 道具とほこりちゃん、どちらに吸い込まれているか */
  sink: 'tool' | 'helper';
  t: number;
  phase: number;
};

/** 一緒に掃除するほこりちゃん（おうち級から） */
export type HelperOptions = {
  accessory: AccessoryId | null;
  shape: PetShape;
  tint: string;
  /** 転がる速さ・吸い寄せる範囲の倍率（毛並みで変わる） */
  speedMul: number;
  radiusMul: number;
};

export type CleaningOptions = {
  seed: number;
  dustCount: number;
  layout: SpotLayout;
  tool: ToolDef;
  hero: Hero;
  /** ホコリ1個ずつの種類（dustCount 個） */
  dustTypes: DustType[];
  helper?: HelperOptions;
  /** 落とし物を1つ混ぜる（依頼）。拾うと onTreasure */
  treasure?: { color: string };
  onTreasure?: () => void;
  /** ポインター入力を受け取る要素（canvas） */
  element: HTMLElement;
  onCollect: (dustId: number) => void;
  onSuctionChange?: (active: boolean) => void;
};

export class CleaningScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();
  readonly dustTotal: number;

  private readonly opts: CleaningOptions;
  private readonly surface: Surface;
  private readonly scale: number;
  private readonly radius: number;
  private readonly dusts: Dust[] = [];
  private readonly particles = new Particles();
  private readonly sparkle = sparkleTexture();
  private readonly ring: THREE.Mesh;
  private readonly nozzle: THREE.Object3D;
  private readonly roomBox: THREE.Box3;
  private readonly background: THREE.Texture;

  private readonly point = new THREE.Vector3();
  private readonly smoothPoint = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane: THREE.Plane;
  private pointerId: number | null = null;
  private lastPointer: { x: number; y: number; touch: boolean } | null = null;
  private extents: Extents = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  private view = { halfW: 1, halfH: 1, cy: 0, panX: 0, panMin: 0, panMax: 0 };
  private readonly viewPos = new THREE.Vector3();
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];
  private helper: { model: HokorichanModel; pos: THREE.Vector3; size: number; speed: number; radius: number; munch: number } | null = null;
  private treasure: { object: THREE.Object3D; pos: THREE.Vector3; state: 'idle' | 'taken' } | null = null;

  constructor(opts: CleaningOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    const layout = opts.layout;
    this.surface = layout.surface;
    this.scale = layout.scale;
    this.radius = opts.tool.radius * layout.scale;
    this.scene.add(layout.group);
    this.roomBox = layout.view;
    this.floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.surface.y);
    const s = this.surface;
    // 最初は面の手前寄りに道具を置いておく
    this.point.set(s.minX + (s.maxX - s.minX) * 0.7, s.y, s.minZ + (s.maxZ - s.minZ) * 0.7);
    this.smoothPoint.copy(this.point);

    const random = createRandom(opts.seed ^ 0x9e3779b9);
    const homes = this.findHomes(random, opts.dustCount + (opts.treasure ? 1 : 0), layout.blockers);
    // 落とし物は最後の置き場所に置き、ホコリの数には数えない
    const treasureHome = opts.treasure ? homes.pop() : undefined;
    this.placeDust(random, homes, opts.dustTypes);
    this.dustTotal = this.dusts.length;
    if (opts.treasure && treasureHome) this.placeTreasure(treasureHome, opts.treasure.color);
    if (opts.helper) this.addHelper(opts.helper);

    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(this.radius * 2, this.radius * 2),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.nozzle = createToolModel(opts.tool.id, opts.hero);
    this.nozzle.scale.multiplyScalar(this.scale);
    this.scene.add(this.ring, this.nozzle, this.particles.group);

    this.bindInput();
  }

  // ---- 生成 ----

  /** ホコリを置ける場所を探す（家具の下や陰を避け、間隔をあける） */
  private findHomes(random: Random, count: number, blockers: Blocker[]): THREE.Vector3[] {
    // カメラから見て家具の奥（-X,-Z側）は隠れるので、高さに応じて除外範囲を伸ばす
    const k = this.scale;
    const hidden = blockers.map((b) => ({
      minX: b.minX - 0.25 * k - b.height * 0.8,
      maxX: b.maxX + 0.25 * k,
      minZ: b.minZ - 0.25 * k - b.height * 0.8,
      maxZ: b.maxZ + 0.25 * k,
    }));
    const s = this.surface;
    const homes: THREE.Vector3[] = [];
    for (let attempt = 0; attempt < 4000 && homes.length < count; attempt++) {
      const x = randRange(random, s.minX, s.maxX);
      const z = randRange(random, s.minZ, s.maxZ);
      if (hidden.some((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ)) continue;
      // 置き場が足りないときは間隔を詰めて個数を確保する
      const spacing = (attempt < 2000 ? 0.5 : 0.3) * k;
      if (homes.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing)) continue;
      homes.push(new THREE.Vector3(x, s.y, z));
    }
    return homes;
  }

  private placeDust(random: Random, homes: THREE.Vector3[], types: DustType[]): void {
    const k = this.scale;
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    // 種類ごとの色（綿ぼこりは灰色、花粉は黄色、猫の毛は茶白…）
    const materials = new Map<DustType, THREE.Material[]>();
    const matsFor = (t: DustType) => {
      let m = materials.get(t);
      if (!m) {
        m = DUSTS[t].colors.map((color) => new THREE.MeshLambertMaterial({ color, flatShading: true }));
        materials.set(t, m);
      }
      return m;
    };
    const shadowMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(0.5, 0.5);
    homes.forEach((home, id) => {
      const object = createDustPuff(random, geometry, matsFor(types[id] ?? 'cotton'));
      object.scale.setScalar(k);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.025;
      object.add(shadow);
      object.position.copy(home);
      object.rotation.y = random() * Math.PI * 2;
      this.scene.add(object);
      this.dusts.push({ id, object, home, state: 'idle', sink: 'tool', t: 0, phase: random() * Math.PI * 2 });
    });
  }

  /** 落とし物：小さく光る宝物（ホコリの中にまぎれている） */
  private placeTreasure(home: THREE.Vector3, color: string): void {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(0.4) }));
    gem.position.y = 0.14;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, transparent: true, depthTest: false }));
    glow.scale.setScalar(0.35);
    glow.position.y = 0.32;
    g.add(gem, glow);
    g.scale.setScalar(this.scale);
    g.position.copy(home);
    this.scene.add(g);
    this.treasure = { object: g, pos: home.clone(), state: 'idle' };
  }

  private addHelper(h: HelperOptions): void {
    const model = new HokorichanModel(11);
    model.setAccessory(h.accessory);
    model.setCustomShape(h.shape);
    model.setBaseColor(h.tint);
    const size = 0.75 * this.scale;
    model.setSize(size, 1);
    const s = this.surface;
    const pos = new THREE.Vector3(s.minX + (s.maxX - s.minX) * 0.4, s.y, s.minZ + (s.maxZ - s.minZ) * 0.5);
    model.group.position.copy(pos);
    this.scene.add(model.group);
    this.helper = {
      model,
      pos,
      size,
      speed: 1.6 * this.scale * h.speedMul,
      radius: (size * 0.5 + 0.3 * this.scale) * h.radiusMul,
      munch: 0,
    };
  }

  /** くしゃみ：ほこりちゃんのまわりのホコリを一気に吸い込む。吸い込んだ数を返す */
  sneeze(): number {
    const h = this.helper;
    if (!h) return 0;
    const radius = 2.6 * this.scale;
    let n = 0;
    for (const d of this.dusts) {
      if (d.state !== 'idle') continue;
      if (Math.hypot(d.home.x - h.pos.x, d.home.z - h.pos.z) < radius) {
        d.state = 'sucking';
        d.sink = 'helper';
        d.t = 0;
        n++;
      }
    }
    h.munch = 1.2;
    this.particles.burst(this.sparkle, h.pos.clone().setY(this.surface.y + h.size), 14, 2.4 * this.scale, 0.3 * this.scale);
    return n;
  }

  get hasHelper(): boolean {
    return this.helper !== null;
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
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // キャプチャできなくても入力自体は続ける
      }
      this.updatePoint(e);
      this.smoothPoint.copy(this.point);
      this.opts.onSuctionChange?.(true);
    });
    on('pointermove', (e) => {
      if (e.pointerId === this.pointerId) this.updatePoint(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointerId) this.cancelInput();
    };
    on('pointerup', end);
    on('pointercancel', end);
    on('lostpointercapture', end);
  }

  private updatePoint(e: PointerEvent): void {
    this.lastPointer = { x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse' };
    this.projectPointer();
  }

  /** 最後の指の位置を床上の吸引点に変換する（スクロール中も毎フレーム呼ぶ） */
  private projectPointer(): void {
    const p = this.lastPointer;
    if (!p) return;
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const offset = p.touch ? TOUCH_OFFSET_Y : 0;
    const ndc = new THREE.Vector2(
      ((p.x - rect.left) / rect.width) * 2 - 1,
      -((p.y - offset - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.floorPlane, hit)) return;
    const s = this.surface;
    this.point.set(THREE.MathUtils.clamp(hit.x, s.minX, s.maxX), s.y, THREE.MathUtils.clamp(hit.z, s.minZ, s.maxZ));
  }

  /** 指が離れた・画面外・タブ切替などで吸引を安全に止める */
  cancelInput(): void {
    if (this.pointerId === null) return;
    const id = this.pointerId;
    this.pointerId = null;
    this.lastPointer = null;
    try {
      if (this.opts.element.hasPointerCapture(id)) this.opts.element.releasePointerCapture(id);
    } catch {
      // 既に解放済み
    }
    this.opts.onSuctionChange?.(false);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) this.cancelInput();
  }

  get isSucking(): boolean {
    return this.pointerId !== null;
  }

  // ---- 更新 ----

  /**
   * 縦長画面では部屋の高さに合わせて拡大し、はみ出した左右は端スクロールで見せる。
   */
  resize(aspect: number): void {
    this.extents = projectedExtents(this.camera, this.roomBox);
    const e = this.extents;
    const roomHalfW = ((e.maxX - e.minX) / 2) * 1.02;
    let halfH = ((e.maxY - e.minY) / 2) * 1.04;
    let halfW = halfH * aspect;
    if (halfW < roomHalfW * MIN_VISIBLE_WIDTH) {
      halfW = roomHalfW * MIN_VISIBLE_WIDTH;
      halfH = halfW / aspect;
    }
    let center = (e.minX + e.maxX) / 2;
    let slack = Math.max(0, roomHalfW - halfW);
    if (this.scale < 1) {
      // 近景はホコリの積もる面が横に収まるまで引き、面の中央に合わせる（スクロールさせない）
      const s = this.surface;
      const se = projectedExtents(this.camera, new THREE.Box3(new THREE.Vector3(s.minX, s.y, s.minZ), new THREE.Vector3(s.maxX, s.y + 0.3 * this.scale, s.maxZ)));
      const need = ((se.maxX - se.minX) / 2) * 1.12;
      if (halfW < need) {
        halfW = need;
        halfH = halfW / aspect;
      }
      center = (se.minX + se.maxX) / 2;
      slack = 0;
    }
    this.view = {
      halfW,
      halfH,
      cy: (e.minY + e.maxY) / 2,
      panX: THREE.MathUtils.clamp(this.view.panX, center - slack, center + slack),
      panMin: center - slack,
      panMax: center + slack,
    };
    this.applyView();
  }

  private applyView(): void {
    const v = this.view;
    this.camera.left = v.panX - v.halfW;
    this.camera.right = v.panX + v.halfW;
    this.camera.top = v.cy + v.halfH;
    this.camera.bottom = v.cy - v.halfH;
    this.camera.updateProjectionMatrix();
  }

  /** 指が画面の左右端にあれば、その方向へスクロールする */
  private edgeScroll(dt: number): void {
    const p = this.lastPointer;
    const v = this.view;
    if (!p || v.panMax - v.panMin < 1e-3) return;
    const rect = this.opts.element.getBoundingClientRect();
    const nx = (p.x - rect.left) / rect.width;
    let dir = 0;
    if (nx < EDGE_ZONE) dir = -(EDGE_ZONE - nx) / EDGE_ZONE;
    else if (nx > 1 - EDGE_ZONE) dir = (nx - (1 - EDGE_ZONE)) / EDGE_ZONE;
    if (dir === 0) return;
    const next = THREE.MathUtils.clamp(v.panX + dir * v.halfW * 1.8 * dt, v.panMin, v.panMax);
    if (next === v.panX) return;
    v.panX = next;
    this.applyView();
    this.projectPointer();
  }

  /** 画面の左右外に残っているホコリの数（矢印表示用） */
  offscreenDust(): { left: number; right: number } {
    let left = 0;
    let right = 0;
    const inv = this.camera.matrixWorldInverse;
    for (const d of this.dusts) {
      if (d.state !== 'idle') continue;
      const x = this.viewPos.copy(d.home).applyMatrix4(inv).x;
      if (x < this.camera.left + 0.1) left++;
      else if (x > this.camera.right - 0.1) right++;
    }
    return { left, right };
  }

  update(dt: number, time: number): void {
    const active = this.isSucking;
    if (active) this.edgeScroll(dt);
    this.smoothPoint.lerp(this.point, Math.min(1, dt * 18));
    const y = this.surface.y;
    this.ring.position.set(this.smoothPoint.x, y + 0.03 * this.scale, this.smoothPoint.z);
    const pulse = active ? 1 + Math.sin(time * 14) * 0.06 : 1;
    this.ring.scale.setScalar(pulse);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = active ? 1 : 0.45;
    this.nozzle.position.set(this.smoothPoint.x, y + (active ? 0 : 0.08 * this.scale), this.smoothPoint.z);

    const tool = this.opts.tool;
    const suction = new THREE.Vector3(this.smoothPoint.x, y + 0.12 * this.scale, this.smoothPoint.z);
    const helperMouth = this.updateHelper(dt, time, active);
    for (const d of this.dusts) {
      if (d.state === 'gone') continue;
      if (d.state === 'idle') {
        // ふわふわ揺れて見つけやすく
        const dx = d.home.x - this.smoothPoint.x;
        const dz = d.home.z - this.smoothPoint.z;
        const dist = Math.hypot(dx, dz);
        if (active && dist < this.radius) {
          d.state = 'sucking';
          d.sink = 'tool';
          d.t = 0;
        } else if (this.helper && Math.hypot(d.home.x - this.helper.pos.x, d.home.z - this.helper.pos.z) < this.helper.radius) {
          // ほこりちゃんが転がりながら吸い込む
          d.state = 'sucking';
          d.sink = 'helper';
          d.t = 0;
        } else if (active && tool.pull > 0 && dist < this.radius * tool.pull) {
          // 掃除機は周りのホコリを少しずつ吸い寄せる
          d.home.x -= dx * Math.min(1, dt * 2.5);
          d.home.z -= dz * Math.min(1, dt * 2.5);
          d.object.rotation.y += dt * 6;
        } else if (active && dist < this.radius * 1.7) {
          d.object.rotation.y += dt * 4;
        }
        d.object.position.set(d.home.x, y + Math.max(0, Math.sin(time * 2 + d.phase)) * 0.04 * this.scale, d.home.z);
        continue;
      }
      // 吸い込まれ中は止めずに最後まで進める（離しても重複・取りこぼしなし）
      const toHelper = d.sink === 'helper' && helperMouth;
      d.t += dt / (toHelper ? 0.35 : tool.pickTime);
      const k = Math.min(1, d.t);
      d.object.position.lerpVectors(d.home, toHelper ? helperMouth : suction, k * k);
      d.object.scale.setScalar(this.scale * Math.max(0.05, 1 - k * 0.9));
      d.object.rotation.y += dt * 18;
      if (k >= 1) {
        d.state = 'gone';
        this.scene.remove(d.object);
        const at = toHelper ? helperMouth : suction;
        this.particles.burst(this.sparkle, at.clone().setY(y + 0.35 * this.scale), 5, 1.4 * this.scale, 0.2 * this.scale);
        if (toHelper && this.helper) this.helper.munch = 0.5;
        this.opts.onCollect(d.id);
      }
    }
    this.updateTreasure(time, active);
    this.particles.update(dt);
  }

  /** ほこりちゃん：指で触れている間は指のほうへ、離すといちばん近いホコリへ転がる */
  private updateHelper(dt: number, time: number, active: boolean): THREE.Vector3 | null {
    const h = this.helper;
    if (!h) return null;
    let target: THREE.Vector3 | null = null;
    if (active) {
      target = this.smoothPoint;
    } else {
      let best = Infinity;
      for (const d of this.dusts) {
        if (d.state !== 'idle') continue;
        const dd = (d.home.x - h.pos.x) ** 2 + (d.home.z - h.pos.z) ** 2;
        if (dd < best) {
          best = dd;
          target = d.home;
        }
      }
    }
    let moving = false;
    if (target) {
      const dx = target.x - h.pos.x;
      const dz = target.z - h.pos.z;
      const dist = Math.hypot(dx, dz);
      // 指についていくときは少し手前で止まる（道具と重ならないように）
      const stop = active ? 0.45 * this.scale : 0.05;
      if (dist > stop) {
        const step = Math.min(dist - stop, h.speed * (active ? 1.4 : 1) * dt);
        h.pos.x += (dx / dist) * step;
        h.pos.z += (dz / dist) * step;
        moving = true;
      }
    }
    const s = this.surface;
    h.pos.x = THREE.MathUtils.clamp(h.pos.x, s.minX, s.maxX);
    h.pos.z = THREE.MathUtils.clamp(h.pos.z, s.minZ, s.maxZ);
    h.munch = Math.max(0, h.munch - dt);
    const bounce = moving ? Math.abs(Math.sin(time * 12)) * 0.08 * h.size : 0;
    h.model.group.position.set(h.pos.x, s.y + bounce, h.pos.z);
    const squash = h.munch > 0 ? 1 - Math.abs(Math.sin(time * 16)) * 0.08 : 1 + Math.sin(time * 3) * 0.03;
    h.model.setSize(h.size, squash);
    h.model.setExpression(h.munch > 0 ? 'eating' : 'happy', false, Math.floor(time * 8) % 2 === 0);
    return h.model.mouthWorld(new THREE.Vector3());
  }

  private updateTreasure(time: number, active: boolean): void {
    const t = this.treasure;
    if (!t || t.state !== 'idle') return;
    t.object.position.y = t.pos.y + Math.abs(Math.sin(time * 3)) * 0.05 * this.scale;
    t.object.rotation.y = time * 2;
    const near = (p: THREE.Vector3, r: number) => Math.hypot(t.pos.x - p.x, t.pos.z - p.z) < r;
    // 落とし物はプレイヤーが自分で見つける（ほこりちゃんは拾わない）
    if (active && near(this.smoothPoint, this.radius)) {
      t.state = 'taken';
      this.particles.burst(this.sparkle, t.pos.clone().setY(t.pos.y + 0.4 * this.scale), 12, 2 * this.scale, 0.3 * this.scale);
      this.scene.remove(t.object);
      this.opts.onTreasure?.();
    }
  }

  dispose(): void {
    this.cancelInput();
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    // 回収済みでシーンから外したホコリもまとめて解放する
    for (const d of this.dusts) if (d.state === 'gone') this.scene.add(d.object);
    if (this.treasure?.state === 'taken') this.scene.add(this.treasure.object);
    this.particles.dispose();
    this.sparkle.dispose();
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
