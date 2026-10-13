// 宇宙のおそうじ（5章）：ほこりちゃんは木星（太陽級からは太陽）のまわりを自動で回る。
// 指をおいた所の軌道へ移り、通り道の星くずの群れを吸い込む。内側の軌道ほど速く回り、
// 小惑星帯は星くずが多いけれど、岩にぶつかると少しのあいだゆっくりになる。

import * as THREE from 'three';
import { DUSTS, type AccessoryId, type DustType, type PetShape } from '../game/catalog.ts';
import { ORBIT_MAX, ORBIT_MIN, orbitOmega } from '../game/orbit.ts';
import { createRandom, randRange } from '../game/rng.ts';
import { HokorichanModel } from '../render/hokorichan.ts';
import { Particles } from '../render/particles.ts';
import { sparkleTexture } from '../render/proceduralArt.ts';
import { buildJupiter, buildRock, buildSun, orbitLine, starfieldTexture } from '../render/spaceArt.ts';
import { createIsoCamera, disposeHierarchy, fitOrthoToBox } from '../render/threeUtils.ts';
import { setupStage } from './sceneKit.ts';
import type { GameScene } from './types.ts';

/** まんなかの星の半径 */
const CENTER_R = 2.0;
/** 小惑星帯（この範囲に岩が回っている） */
const BELT: [number, number] = [5.2, 6.2];
/** 軌道を移る速さ（ワールド単位/秒） */
const RADIAL_SPEED = 3.2;
const PET_SIZE = 1.3;
const PICK_R = 0.95;
const ROCK_HIT_R = 0.6;

export type SpaceOptions = {
  element: HTMLElement;
  seed: number;
  /** 星くずの群れの種類（この数だけ置く） */
  clusters: DustType[];
  pet: { accessory: AccessoryId | null; shape: PetShape; tint: string };
  center: 'jupiter' | 'sun';
  /** 軌道を移る速さの倍率 */
  turnMul: number;
  /** 岩にぶつかったときにゆっくりになる秒数 */
  bumpSeconds: number;
  onCluster: (type: DustType) => void;
  onBump: () => void;
};

type Cluster = {
  type: DustType;
  group: THREE.Group;
  radius: number;
  angle: number;
  state: 'idle' | 'sucking' | 'gone';
  t: number;
  from: THREE.Vector3;
};

type Rock = { mesh: THREE.Mesh; radius: number; angle: number; speed: number; cooldown: number };

export class SpaceScene implements GameScene {
  readonly scene = new THREE.Scene();
  readonly camera = createIsoCamera();

  private readonly opts: SpaceOptions;
  private readonly background: THREE.Texture;
  private readonly stars: THREE.Texture;
  private readonly sparkle = sparkleTexture();
  private readonly center: THREE.Object3D;
  private readonly pet: HokorichanModel;
  private readonly particles = new Particles();
  private readonly orbit: THREE.LineLoop;
  private readonly targetLine: THREE.LineLoop;
  private readonly clusters: Cluster[] = [];
  private readonly rocks: Rock[] = [];
  private readonly planets: Array<{ mesh: THREE.Mesh; radius: number; angle: number; speed: number }> = [];
  private radius = ORBIT_MIN + 1.2;
  private target = ORBIT_MIN + 1.2;
  private angle = Math.PI * 0.25;
  private slow = 0;
  private munch = 0;
  private pointer: number | null = null;
  private inputEnabled = true;
  private readonly listeners: Array<[string, EventListener]> = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(opts: SpaceOptions) {
    this.opts = opts;
    this.background = setupStage(this.scene);
    this.stars = starfieldTexture(opts.seed);
    this.scene.background = this.stars;

    this.center = opts.center === 'sun' ? buildSun(CENTER_R) : buildJupiter(CENTER_R);
    this.scene.add(this.center);
    if (opts.center === 'sun') {
      // 太陽級：外側を小さな惑星がゆっくり回る（比べるための大きさ）
      const colors = ['#7fb3e0', '#e8907a', '#f0cf8a'];
      colors.forEach((c, i) => {
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + i * 0.08, 1), new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
        this.planets.push({ mesh, radius: ORBIT_MAX + 0.9 + i * 0.7, angle: i * 2.1, speed: 0.12 - i * 0.03 });
        this.scene.add(mesh);
      });
    }

    const random = createRandom(opts.seed ^ 0x57a2);
    // 星くずの群れ：4割くらいは小惑星帯の中（多いけれど岩がある）
    opts.clusters.forEach((type, i) => {
      let radius = 0;
      let angle = 0;
      for (let k = 0; k < 40; k++) {
        radius = i % 5 < 2 ? randRange(random, BELT[0], BELT[1]) : randRange(random, ORBIT_MIN + 0.1, ORBIT_MAX - 0.1);
        angle = random() * Math.PI * 2;
        const p = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
        if (this.clusters.every((c) => c.group.position.distanceTo(p) > 1.5)) break;
      }
      const group = this.clusterSprites(type, opts.seed + i * 31);
      group.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      this.scene.add(group);
      this.clusters.push({ type, group, radius, angle, state: 'idle', t: 0, from: new THREE.Vector3() });
    });

    // 小惑星帯の岩（それぞれの速さで回る）
    for (let i = 0; i < 12; i++) {
      const radius = randRange(random, BELT[0], BELT[1]);
      const mesh = buildRock(opts.seed + i * 7, randRange(random, 0.18, 0.32));
      const rock = { mesh, radius, angle: (i / 12) * Math.PI * 2 + random() * 0.3, speed: orbitOmega(radius) * randRange(random, 0.25, 0.45), cooldown: 0 };
      this.rocks.push(rock);
      this.scene.add(mesh);
    }

    this.orbit = orbitLine('#ffffff', 0.35);
    this.targetLine = orbitLine('#f4a7b9', 0.9, true);
    this.targetLine.visible = false;
    this.scene.add(this.orbit, this.targetLine);

    this.pet = new HokorichanModel(17);
    this.pet.setAccessory(opts.pet.accessory);
    this.pet.setCustomShape(opts.pet.shape);
    this.pet.setBaseColor(opts.pet.tint);
    this.pet.setSize(PET_SIZE, 1);
    this.scene.add(this.pet.group, this.particles.group);
    this.placePet();
    this.bindInput();
  }

  /** 星くずの群れ（キラキラの小さなスプライトのかたまり） */
  private clusterSprites(type: DustType, seed: number): THREE.Group {
    const rng = createRandom(seed);
    const g = new THREE.Group();
    const colors = DUSTS[type].colors;
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkle, color: colors[i % colors.length], transparent: true, depthWrite: false }));
      const a = rng() * Math.PI * 2;
      const d = i === 0 ? 0 : randRange(rng, 0.12, 0.38);
      s.position.set(Math.cos(a) * d, randRange(rng, 0.05, 0.35), Math.sin(a) * d);
      s.scale.setScalar(randRange(rng, 0.28, 0.45));
      g.add(s);
    }
    return g;
  }

  // ---- 入力：指をおいた所の軌道へ ----

  private radiusAt(x: number, y: number): number | null {
    const rect = this.opts.element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    return THREE.MathUtils.clamp(Math.hypot(hit.x, hit.z), ORBIT_MIN, ORBIT_MAX);
  }

  private bindInput(): void {
    const el = this.opts.element;
    const on = (type: string, fn: (e: PointerEvent) => void) => {
      const listener = fn as EventListener;
      el.addEventListener(type, listener);
      this.listeners.push([type, listener]);
    };
    const aim = (e: PointerEvent) => {
      const r = this.radiusAt(e.clientX, e.clientY);
      if (r !== null) this.target = r;
    };
    on('pointerdown', (e) => {
      if (!this.inputEnabled || this.pointer !== null || !e.isPrimary) return;
      e.preventDefault();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // そのまま続ける
      }
      this.pointer = e.pointerId;
      aim(e);
    });
    on('pointermove', (e) => {
      if (e.pointerId === this.pointer) aim(e);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointer) this.pointer = null;
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

  resize(aspect: number): void {
    const r = ORBIT_MAX + 0.6;
    const pts = [
      new THREE.Vector3(r, 0, 0),
      new THREE.Vector3(-r, 0, 0),
      new THREE.Vector3(0, 0, r),
      new THREE.Vector3(0, 0, -r),
      new THREE.Vector3(0, CENTER_R + 1, 0),
    ];
    this.camera.updateMatrixWorld();
    fitOrthoToBox(this.camera, pts, aspect, 1.04);
  }

  // ---- 進行 ----

  get remaining(): number {
    return this.clusters.filter((c) => c.state === 'idle').length;
  }

  private petPos(target: THREE.Vector3): THREE.Vector3 {
    return target.set(Math.cos(this.angle) * this.radius, 0, Math.sin(this.angle) * this.radius);
  }

  private placePet(): void {
    const p = this.petPos(new THREE.Vector3());
    this.pet.group.position.set(p.x, p.y - PET_SIZE * 0.45, p.z);
  }

  update(dt: number, time: number): void {
    this.pet.tick(dt);
    this.center.rotation.y += dt * 0.15;

    // 軌道を移る（外へも内へも同じ速さ）
    const diff = this.target - this.radius;
    const step = RADIAL_SPEED * this.opts.turnMul * dt;
    this.radius += Math.abs(diff) <= step ? diff : Math.sign(diff) * step;
    // 自動で回る。岩にぶつかったあとは少しゆっくり
    this.slow = Math.max(0, this.slow - dt);
    this.angle += orbitOmega(this.radius) * (this.slow > 0 ? 0.35 : 1) * dt;
    this.placePet();
    const pos = this.petPos(new THREE.Vector3());

    this.orbit.scale.setScalar(this.radius);
    this.targetLine.visible = this.pointer !== null || Math.abs(diff) > 0.05;
    this.targetLine.scale.setScalar(this.target);

    for (const rock of this.rocks) {
      rock.angle += rock.speed * dt;
      rock.mesh.position.set(Math.cos(rock.angle) * rock.radius, 0, Math.sin(rock.angle) * rock.radius);
      rock.mesh.rotation.x += dt * 0.6;
      rock.cooldown = Math.max(0, rock.cooldown - dt);
      if (rock.cooldown === 0 && rock.mesh.position.distanceTo(pos) < ROCK_HIT_R) {
        rock.cooldown = 1.5;
        this.slow = this.opts.bumpSeconds;
        this.particles.burst(this.sparkle, pos.clone().setY(0.4), 6, 1.6, 0.2);
        this.opts.onBump();
      }
    }
    for (const p of this.planets) {
      p.angle += p.speed * dt;
      p.mesh.position.set(Math.cos(p.angle) * p.radius, 0, Math.sin(p.angle) * p.radius);
    }

    const mouth = this.pet.mouthWorld(new THREE.Vector3());
    for (const c of this.clusters) {
      if (c.state === 'gone') continue;
      if (c.state === 'idle') {
        c.group.rotation.y += dt * 0.8;
        c.group.children.forEach((s, i) => s.scale.setScalar(0.3 + 0.1 * Math.sin(time * 4 + i * 1.7 + c.angle * 3)));
        if (c.group.position.distanceTo(pos) < PICK_R) {
          c.state = 'sucking';
          c.t = 0;
          c.from.copy(c.group.position);
        }
        continue;
      }
      c.t += dt / 0.4;
      const k = Math.min(1, c.t);
      c.group.position.lerpVectors(c.from, mouth, k * k);
      c.group.scale.setScalar(Math.max(0.05, 1 - k));
      if (k >= 1) {
        c.state = 'gone';
        c.group.visible = false;
        this.particles.burst(this.sparkle, mouth.clone(), 8, 2, 0.25);
        this.munch = 0.5;
        this.opts.onCluster(c.type);
      }
    }

    this.munch = Math.max(0, this.munch - dt);
    const squash = this.munch > 0 ? 1 - Math.abs(Math.sin(time * 16)) * 0.1 : 1 + Math.sin(time * 2.4) * 0.04;
    this.pet.setSize(PET_SIZE, squash);
    this.pet.setExpression(this.munch > 0 ? 'eating' : this.slow > 0 ? 'damp' : 'happy', false, Math.floor(time * 8) % 2 === 0);
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
