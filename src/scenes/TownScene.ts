// まち（オーバーワールド）。タップした場所や建物へ主人公が歩き、入口に着いたら中に入る。

import * as THREE from 'three';
import type { Hero } from '../game/catalog.ts';
import { CharacterSprite, screenDelta } from '../render/characterSprite.ts';
import { facingFromScreen, type CharacterId } from '../render/pixelCharacters.ts';
import { ringTexture } from '../render/proceduralArt.ts';
import { createIsoCamera, disposeHierarchy, projectedExtents } from '../render/threeUtils.ts';
import { buildTown, type BuildingId, type Town } from '../render/townBuilder.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

const SPEED = 3.2;
const HERO_RADIUS = 0.28;
/** 道さがしの格子の大きさ（ワールド単位） */
const GRID = 0.25;
/** この道のりより遠いと走る */
const RUN_DISTANCE = 5;
const RUN_MUL = 1.8;
/** 画面に映す横幅（ワールド単位）。縦長画面では高さは比率で決まる */
const VIEW_WIDTH = 10;

/** off が 'left'/'right'/'up'/'down' のときは画面外。x,y は画面の端に寄せてある */
export type TownLabel = { id: BuildingId; x: number; y: number; off: 'left' | 'right' | 'up' | 'down' | null };

export type TownOptions = {
  element: HTMLElement;
  hero: Hero;
  /** この建物の入口の前から始める */
  startAt: BuildingId;
  /** 空き地を買ってコンテナを置いたか */
  lotOwned: boolean;
  /** 建物の前に立っている町の人 */
  npcs?: Array<{ id: CharacterId; at: BuildingId }>;
  onArrive: (id: BuildingId) => void;
};

export class TownScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: TownOptions;
  private readonly town: Town;
  private readonly hero: CharacterSprite;
  private readonly npcs: Array<{ sprite: CharacterSprite; pos: THREE.Vector3 }> = [];
  private lowWidth = 260;
  private readonly background: THREE.Texture;
  private readonly marker: THREE.Mesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly pos = new THREE.Vector3();
  private target: THREE.Vector3 | null = null;
  private goingTo: BuildingId | null = null;
  /** 目的地までの経由点（最後が目的地） */
  private path: THREE.Vector3[] = [];
  private running = false;
  private grid: Uint8Array | null = null;
  private aspect = 0.6;
  private readonly camCenter = new THREE.Vector2();
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly tmp = new THREE.Vector3();

  constructor(opts: TownOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.town = buildTown({ lotOwned: opts.lotOwned });
    this.scene.add(this.town.group);
    this.hero = new CharacterSprite(opts.hero);
    // 入口の少し手前（道側）に立ち、こちらを向いている
    const start = this.town.buildings[opts.startAt];
    const away = start.door.clone().sub(start.hit.position).setY(0).normalize().multiplyScalar(0.5);
    this.pos.copy(start.door).add(away);
    this.hero.group.position.copy(this.pos);
    this.scene.add(this.hero.group);
    for (const n of opts.npcs ?? []) this.addNpc(n.id, n.at);

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

  /** 入口の横（道側）に町の人を立たせる */
  private addNpc(id: CharacterId, at: BuildingId): void {
    const b = this.town.buildings[at];
    const out = b.door.clone().sub(b.hit.position).setY(0).normalize();
    const side = new THREE.Vector3(out.z, 0, -out.x);
    const pos = b.door.clone().addScaledVector(out, 0.45).addScaledVector(side, 0.95).setY(0);
    const sprite = new CharacterSprite(id);
    sprite.group.position.copy(pos);
    this.scene.add(sprite.group);
    this.npcs.push({ sprite, pos });
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
    this.path = this.findPath(this.pos, this.target);
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
    this.path = [];
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

  // ---- 道さがし（建物を回りこむ） ----

  private cellCount(): number {
    return Math.ceil((this.town.half * 2) / GRID);
  }

  private cellCenter(i: number): THREE.Vector3 {
    const n = this.cellCount();
    const h = this.town.half;
    return new THREE.Vector3(-h + ((i % n) + 0.5) * GRID, 0, -h + (Math.floor(i / n) + 0.5) * GRID);
  }

  private cellOf(p: THREE.Vector3): number {
    const n = this.cellCount();
    const h = this.town.half;
    const cx = THREE.MathUtils.clamp(Math.floor((p.x + h) / GRID), 0, n - 1);
    const cz = THREE.MathUtils.clamp(Math.floor((p.z + h) / GRID), 0, n - 1);
    return cz * n + cx;
  }

  private freeGrid(): Uint8Array {
    if (this.grid) return this.grid;
    const n = this.cellCount();
    const g = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) {
      const c = this.cellCenter(i);
      g[i] = this.blocked(c.x, c.z) ? 0 : 1;
    }
    this.grid = g;
    return g;
  }

  /** 近くの通れるマス */
  private nearestFree(i: number): number {
    const g = this.freeGrid();
    if (g[i]) return i;
    const n = this.cellCount();
    const x0 = i % n;
    const z0 = Math.floor(i / n);
    for (let r = 1; r < n; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let z = z0 - r; z <= z0 + r; z++) {
        for (let x = x0 - r; x <= x0 + r; x++) {
          if (x < 0 || z < 0 || x >= n || z >= n || !g[z * n + x]) continue;
          const d = (x - x0) ** 2 + (z - z0) ** 2;
          if (d < bestD) {
            bestD = d;
            best = z * n + x;
          }
        }
      }
      if (best >= 0) return best;
    }
    return i;
  }

  private clearLine(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(d / 0.1);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      if (this.blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** A* で経由点を求め、見通せる点は飛ばして短くする */
  private findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    if (this.clearLine(from, to)) return [to.clone()];
    const g = this.freeGrid();
    const n = this.cellCount();
    const start = this.nearestFree(this.cellOf(from));
    const goal = this.nearestFree(this.cellOf(to));
    const cost = new Float32Array(n * n).fill(Infinity);
    const prev = new Int32Array(n * n).fill(-1);
    const open: number[] = [start];
    const est = (i: number) => Math.hypot((i % n) - (goal % n), Math.floor(i / n) - Math.floor(goal / n));
    cost[start] = 0;
    const done = new Uint8Array(n * n);
    while (open.length) {
      // 小さな格子なので、いちばん良い候補を線形に探せば十分
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (cost[open[k]] + est(open[k]) < cost[open[bi]] + est(open[bi])) bi = k;
      const cur = open[bi];
      open.splice(bi, 1);
      if (cur === goal) break;
      if (done[cur]) continue;
      done[cur] = 1;
      const cx = cur % n;
      const cz = Math.floor(cur / n);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const x = cx + dx;
          const z = cz + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const j = z * n + x;
          if (!g[j] || done[j]) continue;
          // 角をななめにすり抜けない
          if (dx && dz && (!g[cz * n + x] || !g[z * n + cx])) continue;
          const c = cost[cur] + (dx && dz ? Math.SQRT2 : 1);
          if (c < cost[j]) {
            cost[j] = c;
            prev[j] = cur;
            open.push(j);
          }
        }
      }
    }
    if (prev[goal] < 0 && goal !== start) return [to.clone()];
    const cells: THREE.Vector3[] = [];
    for (let i = goal; i !== start && i >= 0; i = prev[i]) cells.unshift(this.cellCenter(i));
    cells.push(to.clone());
    // 見通せるところまで一気に進む
    const out: THREE.Vector3[] = [];
    let at = from.clone();
    let k = 0;
    while (k < cells.length) {
      let far = k;
      for (let m = cells.length - 1; m > k; m--) {
        if (this.clearLine(at, cells[m])) {
          far = m;
          break;
        }
      }
      out.push(cells[far]);
      at = cells[far];
      k = far + 1;
    }
    return out;
  }

  /** 目的地までの残りの道のり */
  private remaining(): number {
    let d = 0;
    let at = this.pos;
    for (const p of this.path.length ? this.path : this.target ? [this.target] : []) {
      d += Math.hypot(p.x - at.x, p.z - at.z);
      at = p;
    }
    return d;
  }

  private move(dt: number): boolean {
    if (!this.target) return false;
    // 経由点に着いたら次へ
    while (this.path.length > 1 && Math.hypot(this.path[0].x - this.pos.x, this.path[0].z - this.pos.z) < 0.12) this.path.shift();
    const way = this.path[0] ?? this.target;
    const last = this.path.length <= 1;
    const dx = way.x - this.pos.x;
    const dz = way.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (last && dist < 0.08) {
      this.arrive();
      return false;
    }
    // 遠い所へは走る（行き来に時間がかかりすぎないように）
    const left = this.remaining();
    this.running = left > RUN_DISTANCE || (this.running && left > 1.2);
    const step = Math.min(dist, SPEED * (this.running ? RUN_MUL : 1) * dt);
    const nx = this.pos.x + (dx / dist) * step;
    const nz = this.pos.z + (dz / dist) * step;
    const sd = screenDelta(dx, dz);
    this.hero.facing = facingFromScreen(sd.sx, sd.sy, this.hero.facing);
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
      if (last && this.goingTo && dist < 0.9) this.arrive();
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
      const sd = screenDelta(c.x - this.pos.x, c.z - this.pos.z);
      this.hero.facing = facingFromScreen(sd.sx, sd.sy, this.hero.facing);
      this.opts.onArrive(id);
    }
  }

  // ---- カメラと表示 ----

  private heroScreenCenter(): THREE.Vector2 {
    this.camera.updateMatrixWorld();
    const p = this.tmp.copy(this.pos).setY(0.6).applyMatrix4(this.camera.matrixWorldInverse);
    return new THREE.Vector2(p.x, p.y);
  }

  resize(aspect: number, lowWidth: number): void {
    this.aspect = aspect;
    this.lowWidth = lowWidth;
    this.applyCamera();
  }

  private applyCamera(): void {
    const halfW = VIEW_WIDTH / 2;
    const halfH = halfW / this.aspect;
    // まちの外が見えすぎないよう、カメラの中心をまちの範囲に収める
    const h = this.town.half;
    const e = projectedExtents(this.camera, new THREE.Box3(new THREE.Vector3(-h, 0, -h), new THREE.Vector3(h, 1, h)));
    // 中心を低解像度ピクセルの格子にそろえて、スクロール中のちらつきをおさえる
    const unit = VIEW_WIDTH / Math.max(1, this.lowWidth);
    const snap = (v: number) => Math.round(v / unit) * unit;
    const cx = snap(THREE.MathUtils.clamp(this.camCenter.x, e.minX + halfW, Math.max(e.minX + halfW, e.maxX - halfW)));
    const cy = snap(THREE.MathUtils.clamp(this.camCenter.y, e.minY + halfH * 0.6, Math.max(e.minY + halfH * 0.6, e.maxY - halfH * 0.6)));
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
    this.hero.set(walking ? (this.running ? 'run' : 'walk') : 'idle');
    this.hero.update(dt);
    if (this.marker.visible) this.marker.scale.setScalar(1 + Math.sin(time * 8) * 0.08);
    const want = this.heroScreenCenter();
    this.camCenter.lerp(want, Math.min(1, dt * 4));
    this.applyCamera();
    this.hero.fitToPixels(this.camera, this.lowWidth);
    for (const n of this.npcs) {
      // 主人公が近くに来たらそちらを向く
      const dx = this.pos.x - n.pos.x;
      const dz = this.pos.z - n.pos.z;
      const sd = screenDelta(dx, dz);
      n.sprite.facing = Math.hypot(dx, dz) < 2.2 ? facingFromScreen(sd.sx, sd.sy, 'down') : 'down';
      n.sprite.update(dt);
      n.sprite.fitToPixels(this.camera, this.lowWidth);
    }
  }

  dispose(): void {
    for (const [type, fn] of this.listeners) this.opts.element.removeEventListener(type, fn);
    this.listeners.length = 0;
    this.background.dispose();
    this.hero.dispose();
    for (const n of this.npcs) n.sprite.dispose();
    disposeHierarchy(this.scene);
    this.scene.clear();
  }
}
