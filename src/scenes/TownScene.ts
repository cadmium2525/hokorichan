// まち（オーバーワールド）。タップした場所や建物へ主人公が歩き、入口に着いたら中に入る。

import * as THREE from 'three';
import type { Hero } from '../game/catalog.ts';
import { HeroModel } from '../render/heroModel.ts';
import { ringTexture } from '../render/proceduralArt.ts';
import { createIsoCamera, disposeHierarchy, projectedExtents } from '../render/threeUtils.ts';
import { buildTown, type BuildingId, type Town } from '../render/townBuilder.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

const SPEED = 3.2;
const HERO_RADIUS = 0.28;
/** 画面に映す横幅（ワールド単位）。縦長画面では高さは比率で決まる */
const VIEW_WIDTH = 10;

/** off が 'left'/'right'/'up'/'down' のときは画面外。x,y は画面の端に寄せてある */
export type TownLabel = { id: BuildingId; x: number; y: number; off: 'left' | 'right' | 'up' | 'down' | null };

export type TownOptions = {
  element: HTMLElement;
  hero: Hero;
  /** この建物の入口の前から始める */
  startAt: BuildingId;
  onArrive: (id: BuildingId) => void;
};

export class TownScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: TownOptions;
  private readonly town: Town;
  private readonly hero: HeroModel;
  private readonly background: THREE.Texture;
  private readonly marker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly pos = new THREE.Vector3();
  private target: THREE.Vector3 | null = null;
  private goingTo: BuildingId | null = null;
  private heading = 0;
  private aspect = 0.6;
  private readonly camCenter = new THREE.Vector2();
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly tmp = new THREE.Vector3();

  constructor(opts: TownOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.town = buildTown();
    this.scene.add(this.town.group);
    this.hero = new HeroModel(opts.hero);
    // 入口の少し手前（道側）に立ち、こちらを向いている
    const start = this.town.buildings[opts.startAt];
    const away = start.door.clone().sub(start.hit.position).setY(0).normalize().multiplyScalar(0.5);
    this.pos.copy(start.door).add(away);
    this.heading = 0;
    this.hero.group.position.copy(this.pos);
    this.scene.add(this.hero.group);

    this.marker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.8),
      new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);

    this.camCenter.copy(this.heroScreenCenter());
    this.bindInput();
  }

  // ---- 入力 ----

  private bindInput(): void {
    const el = this.opts.element;
    const listener = ((e: PointerEvent) => this.onTap(e)) as EventListener;
    el.addEventListener('pointerdown', listener);
    this.listeners.push(['pointerdown', listener]);
  }

  private onTap(e: PointerEvent): void {
    if (!this.inputEnabled || !e.isPrimary) return;
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);

    // 建物をタップしたらその入口へ
    for (const b of Object.values(this.town.buildings)) {
      if (this.raycaster.intersectObject(b.hit, true).length > 0) {
        this.walkTo(b.door, b.id);
        return;
      }
    }
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return;
    const h = this.town.half - 0.3;
    hit.set(THREE.MathUtils.clamp(hit.x, -h, h), 0, THREE.MathUtils.clamp(hit.z, -h, h));
    this.walkTo(hit, null);
  }

  /** 建物の入口へ歩かせる（「家に帰る」ボタンなどから） */
  walkTo(point: THREE.Vector3, building: BuildingId | null): void {
    this.target = point.clone();
    this.goingTo = building;
    this.marker.position.set(point.x, 0.03, point.z);
    this.marker.visible = true;
  }

  goToBuilding(id: BuildingId): void {
    this.walkTo(this.town.buildings[id].door, id);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
  }

  /** 止まる（モーダル表示中など） */
  stop(): void {
    this.target = null;
    this.goingTo = null;
    this.marker.visible = false;
  }

  // ---- 移動 ----

  private blocked(x: number, z: number): boolean {
    const r = HERO_RADIUS;
    const h = this.town.half;
    if (Math.abs(x) > h || Math.abs(z) > h) return true;
    return this.town.blockers.some((b) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);
  }

  private move(dt: number): boolean {
    if (!this.target) return false;
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.08) {
      this.arrive();
      return false;
    }
    const step = Math.min(dist, SPEED * dt);
    const nx = this.pos.x + (dx / dist) * step;
    const nz = this.pos.z + (dz / dist) * step;
    this.heading = Math.atan2(dx, dz);
    // 建物に当たったら、壁ぞいに滑らせる
    if (!this.blocked(nx, nz)) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else if (!this.blocked(nx, this.pos.z) && Math.abs(dx) > 1e-3) {
      this.pos.x = this.pos.x + Math.sign(dx) * step;
    } else if (!this.blocked(this.pos.x, nz) && Math.abs(dz) > 1e-3) {
      this.pos.z = this.pos.z + Math.sign(dz) * step;
    } else {
      // 進めないので、そこで止まる（建物に向かっていて入口のそばなら入る）
      if (this.goingTo && Math.hypot(dx, dz) < 0.9) this.arrive();
      else this.stop();
      return false;
    }
    return true;
  }

  private arrive(): void {
    const id = this.goingTo;
    this.stop();
    if (id) {
      // 建物のほうを向く
      const c = this.town.buildings[id].hit.position;
      this.heading = Math.atan2(c.x - this.pos.x, c.z - this.pos.z);
      this.opts.onArrive(id);
    }
  }

  // ---- カメラと表示 ----

  private heroScreenCenter(): THREE.Vector2 {
    this.camera.updateMatrixWorld();
    const p = this.tmp.copy(this.pos).setY(0.6).applyMatrix4(this.camera.matrixWorldInverse);
    return new THREE.Vector2(p.x, p.y);
  }

  resize(aspect: number): void {
    this.aspect = aspect;
    this.applyCamera();
  }

  private applyCamera(): void {
    const halfW = VIEW_WIDTH / 2;
    const halfH = halfW / this.aspect;
    // まちの外が見えすぎないよう、カメラの中心をまちの範囲に収める
    const h = this.town.half;
    const e = projectedExtents(this.camera, new THREE.Box3(new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, 1, h)));
    const cx = THREE.MathUtils.clamp(this.camCenter.x, e.minX + halfW, Math.max(e.minX + halfW, e.maxX - halfW));
    const cy = THREE.MathUtils.clamp(this.camCenter.y, e.minY + halfH * 0.6, Math.max(e.minY + halfH * 0.6, e.maxY - halfH * 0.6));
    this.camera.left = cx - halfW;
    this.camera.right = cx + halfW;
    this.camera.top = cy + halfH;
    this.camera.bottom = cy - halfH;
    this.camera.updateProjectionMatrix();
  }

  /** 建物の名札を出す画面上の位置（0〜1）。画面外の建物は端に寄せて向きを付ける */
  labels(): TownLabel[] {
    const out: TownLabel[] = [];
    for (const b of Object.values(this.town.buildings)) {
      // 屋根の上ではなく建物の中心で画面内外を判定する
      const c = this.tmp.copy(b.labelAt).setY(1).project(this.camera);
      const inside = c.x > -1 && c.x < 1 && c.y > -1 && c.y < 1;
      if (inside) {
        const p = this.tmp.copy(b.labelAt).project(this.camera);
        out.push({ id: b.id, x: (p.x + 1) / 2, y: Math.max(0.06, (1 - p.y) / 2), off: null });
        continue;
      }
      const off = Math.abs(c.x) >= Math.abs(c.y) ? (c.x < 0 ? 'left' : 'right') : c.y < 0 ? 'down' : 'up';
      const x = THREE.MathUtils.clamp((c.x + 1) / 2, 0.14, 0.86);
      const y = THREE.MathUtils.clamp((1 - c.y) / 2, 0.1, 0.92);
      out.push({ id: b.id, x, y, off });
    }
    return out;
  }

  update(dt: number, time: number): void {
    const walking = this.move(dt);
    this.hero.group.position.copy(this.pos);
    this.hero.update(dt, this.heading, walking);
    if (this.marker.visible) this.marker.scale.setScalar(1 + Math.sin(time * 8) * 0.08);
    const want = this.heroScreenCenter();
    this.camCenter.lerp(want, Math.min(1, dt * 4));
    this.applyCamera();
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    this.background.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
