// 清掃シーン：手続き生成の部屋にホコリを散らし、ドラッグで吸い込む。

import * as THREE from 'three';
import { createRandom, randRange, type Random } from '../game/rng.ts';
import { Particles } from '../render/particles.ts';
import { createDustPuff, ringTexture, sparkleTexture, blobShadowTexture, PALETTE } from '../render/proceduralArt.ts';
import { buildCleaningRoom, type Blocker } from '../render/roomBuilder.ts';
import { createIsoCamera, disposeHierarchy, projectedExtents, type Extents } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

const SUCTION_RADIUS = 0.75;
const SUCK_TIME = 0.28;
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
  t: number;
  phase: number;
};

export type CleaningOptions = {
  seed: number;
  dustCount: number;
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
  private readonly half: number;
  private readonly dusts: Dust[] = [];
  private readonly particles = new Particles();
  private readonly sparkle = sparkleTexture();
  private readonly ring: THREE.Mesh;
  private readonly nozzle: THREE.Group;
  private readonly roomBox: THREE.Box3;
  private readonly background: THREE.Texture;

  private readonly point = new THREE.Vector3(1.2, 0, 1.2);
  private readonly smoothPoint = new THREE.Vector3(1.2, 0, 1.2);
  private readonly raycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointerId: number | null = null;
  private lastPointer: { x: number; y: number; touch: boolean } | null = null;
  private extents: Extents = { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  private view = { halfW: 1, halfH: 1, cy: 0, panX: 0, panMin: 0, panMax: 0 };
  private readonly viewPos = new THREE.Vector3();
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];

  constructor(opts: CleaningOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    const room = buildCleaningRoom(opts.seed);
    this.half = room.half;
    this.scene.add(room.group);
    this.roomBox = new THREE.Box3(new THREE.Vector3(-room.half - 0.2, 0, -room.half - 0.2), new THREE.Vector3(room.half, 2.8, room.half));

    const random = createRandom(opts.seed ^ 0x9e3779b9);
    this.placeDust(random, opts.dustCount, room.blockers);
    this.dustTotal = this.dusts.length;

    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(SUCTION_RADIUS * 2, SUCTION_RADIUS * 2),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;
    this.nozzle = this.buildNozzle();
    this.scene.add(this.ring, this.nozzle, this.particles.group);

    this.bindInput();
  }

  // ---- 生成 ----

  private placeDust(random: Random, count: number, blockers: Blocker[]): void {
    const geometry = new THREE.IcosahedronGeometry(1, 0);
    const materials = ['#c3bbd3', '#b3abc6', '#d4cddf', '#bfb3b8'].map(
      (color) => new THREE.MeshLambertMaterial({ color, flatShading: true }),
    );
    const shadowMat = new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
    const shadowGeo = new THREE.PlaneGeometry(0.5, 0.5);
    // カメラから見て家具の奥（-X,-Z側）は隠れるので、高さに応じて除外範囲を伸ばす
    const hidden = blockers.map((b) => ({
      minX: b.minX - 0.25 - b.height * 0.8,
      maxX: b.maxX + 0.25,
      minZ: b.minZ - 0.25 - b.height * 0.8,
      maxZ: b.maxZ + 0.25,
    }));
    const limit = this.half - 0.35;
    const homes: THREE.Vector3[] = [];
    for (let attempt = 0; attempt < 4000 && homes.length < count; attempt++) {
      const x = randRange(random, -limit, limit);
      const z = randRange(random, -limit, limit);
      if (hidden.some((h) => x > h.minX && x < h.maxX && z > h.minZ && z < h.maxZ)) continue;
      // 家具が多くて置き場が足りないときは間隔を詰めて個数を確保する
      const spacing = attempt < 2000 ? 0.5 : 0.32;
      if (homes.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing)) continue;
      homes.push(new THREE.Vector3(x, 0, z));
    }
    homes.forEach((home, id) => {
      const object = createDustPuff(random, geometry, materials);
      const shadow = new THREE.Mesh(shadowGeo, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.025;
      object.add(shadow);
      object.position.copy(home);
      object.rotation.y = random() * Math.PI * 2;
      this.scene.add(object);
      this.dusts.push({ id, object, home, state: 'idle', t: 0, phase: random() * Math.PI * 2 });
    });
  }

  /** 吸引ノズル：小さなヘッドと、カメラ側へ伸びる柄 */
  private buildNozzle(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: PALETTE.lavenderDeep });
    const accent = new THREE.MeshLambertMaterial({ color: PALETTE.pink });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.28), body);
    head.position.y = 0.08;
    head.rotation.y = Math.PI / 4;
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.08), accent);
    bumper.position.set(0.1, 0.05, 0.1);
    bumper.rotation.y = Math.PI / 4;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), new THREE.MeshLambertMaterial({ color: '#e8e2f2' }));
    // 柄はカメラ側（+X+Z、上）へ傾ける
    const dir = new THREE.Vector3(0.45, 1, 0.45).normalize();
    stick.position.copy(dir.clone().multiplyScalar(0.8)).add(new THREE.Vector3(0, 0.1, 0));
    stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), accent);
    grip.position.copy(dir.clone().multiplyScalar(1.6)).add(new THREE.Vector3(0, 0.1, 0));
    grip.quaternion.copy(stick.quaternion);
    g.add(head, bumper, stick, grip);
    return g;
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
    const limit = this.half - 0.15;
    this.point.set(THREE.MathUtils.clamp(hit.x, -limit, limit), 0, THREE.MathUtils.clamp(hit.z, -limit, limit));
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
    const center = (e.minX + e.maxX) / 2;
    const slack = Math.max(0, roomHalfW - halfW);
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
    this.ring.position.set(this.smoothPoint.x, 0.03, this.smoothPoint.z);
    const pulse = active ? 1 + Math.sin(time * 14) * 0.06 : 1;
    this.ring.scale.setScalar(pulse);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = active ? 1 : 0.45;
    this.nozzle.position.set(this.smoothPoint.x, active ? 0 : 0.06, this.smoothPoint.z);

    const suction = new THREE.Vector3(this.smoothPoint.x, 0.12, this.smoothPoint.z);
    for (const d of this.dusts) {
      if (d.state === 'gone') continue;
      if (d.state === 'idle') {
        // ふわふわ揺れて見つけやすく
        d.object.position.y = Math.max(0, Math.sin(time * 2 + d.phase)) * 0.04;
        const dx = d.home.x - this.smoothPoint.x;
        const dz = d.home.z - this.smoothPoint.z;
        const dist = Math.hypot(dx, dz);
        if (active && dist < SUCTION_RADIUS) {
          d.state = 'sucking';
          d.t = 0;
        } else if (active && dist < SUCTION_RADIUS * 1.7) {
          d.object.rotation.y += dt * 4;
        }
        continue;
      }
      // 吸い込まれ中は止めずに最後まで進める（離しても重複・取りこぼしなし）
      d.t += dt / SUCK_TIME;
      const k = Math.min(1, d.t);
      d.object.position.lerpVectors(d.home, suction, k * k);
      d.object.scale.setScalar(Math.max(0.05, 1 - k * 0.9));
      d.object.rotation.y += dt * 18;
      if (k >= 1) {
        d.state = 'gone';
        this.scene.remove(d.object);
        this.particles.burst(this.sparkle, suction.clone().setY(0.35), 5, 1.4, 0.2);
        this.opts.onCollect(d.id);
      }
    }
    this.particles.update(dt);
  }

  dispose(): void {
    this.cancelInput();
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    // 回収済みでシーンから外したホコリもまとめて解放する
    for (const d of this.dusts) if (d.state === 'gone') this.scene.add(d.object);
    this.particles.dispose();
    this.sparkle.dispose();
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
