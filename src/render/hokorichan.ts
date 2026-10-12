// ほこりちゃんの手続き生成モデル。丸い本体＋外周の小房＋顔（目・口・頬）＋アクセサリー。

import * as THREE from 'three';
import { DUST_TYPES, DUSTS, type AccessoryId, type PetShape } from '../game/catalog.ts';
import { createRandom, randRange } from '../game/rng.ts';
import { blobShadowTexture, PALETTE } from './proceduralArt.ts';
import { ISO_VIEW_DIR } from './threeUtils.ts';

export type Expression = 'idle' | 'happy' | 'eating' | 'damp' | 'sleep';

const DRY_COLOR = new THREE.Color('#fff8ef');
const DAMP_COLOR = new THREE.Color('#b9b6dc');
const FACE_SIZE = 32;
/** 食べたホコリの割合（綿ぼこり以外）に合わせて、毛並みの色を少しずつ染める */
export function petTint(ratios: Record<string, number>): string {
  const c = DRY_COLOR.clone();
  for (const t of DUST_TYPES) {
    if (t === 'cotton') continue;
    const r = ratios[t] ?? 0;
    if (r > 0) c.lerp(new THREE.Color(DUSTS[t].tint), Math.min(0.8, r * 2));
  }
  return `#${c.getHexString()}`;
}

/** 顔の板の+Zをカメラ方向へ向ける回転 */
const FACE_ROTATION = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(ISO_VIEW_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)),
);

/** 顔は32pxのキャンバスにドット絵で描く。パーツは小さく保つ */
function drawFace(
  ctx: CanvasRenderingContext2D,
  expression: Expression,
  blink: boolean,
  mouthOpen: boolean,
  glasses: boolean,
): void {
  ctx.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
  const ink = '#3b2a2a';
  const px = (x: number, y: number, w = 1, h = 1) => ctx.fillRect(x, y, w, h);

  // 頬
  ctx.fillStyle = expression === 'damp' ? 'rgba(200,170,210,0.8)' : 'rgba(246,160,182,0.85)';
  px(6, 17, 4, 2);
  px(22, 17, 4, 2);

  ctx.fillStyle = ink;
  const closed = blink || expression === 'eating' || expression === 'sleep';
  if (expression === 'happy') {
    // にっこり ^ ^
    px(9, 13); px(10, 12); px(11, 13);
    px(20, 13); px(21, 12); px(22, 13);
  } else if (expression === 'damp') {
    // しょんぼり（下がり眉＋小さな目）
    px(8, 11, 2, 1); px(10, 12);
    px(22, 11, 2, 1); px(21, 12);
    px(9, 14, 2, 2); px(21, 14, 2, 2);
  } else if (closed) {
    px(9, 14, 3, 1);
    px(20, 14, 3, 1);
  } else {
    px(9, 13, 2, 3);
    px(21, 13, 2, 3);
    ctx.fillStyle = '#ffffff';
    px(9, 13);
    px(21, 13);
    ctx.fillStyle = ink;
  }

  // 口
  if (expression === 'eating') {
    if (mouthOpen) {
      px(15, 17, 2, 1); px(14, 18); px(17, 18); px(15, 19, 2, 1);
      ctx.fillStyle = '#e98aa6';
      px(15, 18, 2, 1);
    } else {
      px(14, 18, 4, 1);
    }
  } else if (expression === 'happy') {
    px(14, 17); px(17, 17); px(15, 18, 2, 1);
    ctx.fillStyle = '#e98aa6';
    px(15, 17, 2, 1);
  } else if (expression === 'damp') {
    px(14, 19); px(15, 18); px(16, 19); px(17, 18);
  } else if (expression === 'sleep') {
    px(15, 18, 2, 1);
  } else {
    // ω っぽい短い口
    px(14, 17); px(15, 18); px(16, 17); px(17, 18); px(18, 17);
  }

  if (glasses) {
    ctx.fillStyle = '#7a5a8c';
    // 丸メガネ（目のまわりの四角い輪）
    for (const cx of [8, 19]) {
      px(cx, 11, 5, 1); px(cx, 16, 5, 1);
      px(cx - 1, 12, 1, 4); px(cx + 5, 12, 1, 4);
    }
    px(14, 12, 4, 1);
  }
}

function lambert(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/**
 * 頭の上に付けるアクセサリー。本体直径1のときの大きさで作る。
 * offset の x,z は頭の上のどこに付けるか（本体直径1が基準）、y は表面からの浮かせ量。
 */
function createAccessory(id: AccessoryId): { object: THREE.Object3D; offset: THREE.Vector3 } | null {
  const g = new THREE.Group();
  switch (id) {
    case 'ribbon': {
      const pink = lambert(PALETTE.pinkDeep);
      for (const side of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 8), pink);
        loop.rotation.z = (side * Math.PI) / 2;
        loop.position.x = side * 0.1;
        g.add(loop);
      }
      g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), lambert(PALETTE.pink)));
      g.rotation.y = Math.PI / 4;
      return { object: g, offset: new THREE.Vector3(-0.2, 0.04, 0.12) };
    }
    case 'leaf': {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), lambert(PALETTE.leaf));
      leaf.scale.set(0.2, 0.04, 0.1);
      leaf.position.set(0.12, 0.12, 0);
      leaf.rotation.z = 0.5;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 5), lambert(PALETTE.leafDark));
      stem.position.y = 0.05;
      g.add(leaf, stem);
      return { object: g, offset: new THREE.Vector3(0.02, 0.02, 0.02) };
    }
    case 'flower': {
      const center = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), lambert('#f3d27a'));
      g.add(center);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const petal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 1), lambert(PALETTE.pink));
        petal.position.set(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
        g.add(petal);
      }
      // 花はカメラに向ける
      g.quaternion.copy(FACE_ROTATION);
      return { object: g, offset: new THREE.Vector3(0.2, 0.03, 0.2) };
    }
    case 'hat': {
      const felt = lambert(PALETTE.lavenderDeep);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 16), felt);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.22, 16), felt);
      top.position.y = 0.12;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.05, 16), lambert(PALETTE.pink));
      band.position.y = 0.04;
      g.add(brim, top, band);
      return { object: g, offset: new THREE.Vector3(0, 0.0, 0) };
    }
    case 'crown': {
      const gold = lambert('#f2c94c');
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, 12, 1, true), gold);
      ring.material.side = THREE.DoubleSide;
      g.add(ring);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 5), gold);
        spike.position.set(Math.cos(a) * 0.17, 0.1, Math.sin(a) * 0.17);
        g.add(spike);
      }
      const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), lambert(PALETTE.pinkDeep));
      gem.position.copy(ISO_VIEW_DIR.clone().setY(0).normalize().multiplyScalar(0.18));
      g.add(gem);
      return { object: g, offset: new THREE.Vector3(0, 0.02, 0) };
    }
    case 'glasses':
      return null; // 顔のテクスチャに描く
  }
}

export class HokorichanModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly tufts: THREE.InstancedMesh;
  private readonly tuftBase: Array<{ dir: THREE.Vector3; size: number; rot: THREE.Quaternion; top: boolean }> = [];
  private readonly face: THREE.Mesh;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly faceTexture: THREE.CanvasTexture;
  private readonly shadow: THREE.Mesh;
  private faceKey = '';
  private size = 1;
  private squashY = 1;
  private shape: PetShape = { width: 1, height: 1, fluff: 1 };
  private accessoryId: AccessoryId | null = null;
  private accessory: { object: THREE.Object3D; offset: THREE.Vector3 } | null = null;
  private expression: { e: Expression; blink: boolean; mouth: boolean } = { e: 'idle', blink: false, mouth: false };

  constructor(seed = 7) {
    const random = createRandom(seed);
    // 自己発光を少し足して陰影をやわらげ、綿毛らしい明るさにする
    this.material = new THREE.MeshLambertMaterial({ color: DRY_COLOR.clone(), emissive: new THREE.Color('#857a70') });

    // 本体：半径0.5の球（直径1）。サイズはbodyのscaleで変える
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 2), this.material);
    core.position.y = 0.5;
    this.body.add(core);

    // 外周の小房：フィボナッチ球面上に小さな多面体を散らす
    const n = 160;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      if (y < -0.75) continue;
      const r = Math.sqrt(1 - y * y);
      const theta = i * 2.39996;
      this.tuftBase.push({
        dir: new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r),
        size: randRange(random, 0.05, 0.085),
        rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(random() * 3, random() * 3, random() * 3)),
        top: false,
      });
    }
    // 頭頂のくるっとした房
    [[0.1, 2.1, 0.04, 0.09], [0.28, 2.4, 0.1, 0.075], [0.56, 2.6, 0.16, 0.06]].forEach(([x, y, z, s]) => {
      this.tuftBase.push({ dir: new THREE.Vector3(x, y, z).multiplyScalar(0.5), size: s, rot: new THREE.Quaternion(), top: true });
    });
    this.tufts = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.material, this.tuftBase.length);
    this.updateTufts();
    this.body.add(this.tufts);
    this.group.add(this.body);

    // 顔：カメラに正対する板。本体より上に描いて埋もれないようにする
    const canvas = document.createElement('canvas');
    canvas.width = FACE_SIZE;
    canvas.height = FACE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas is not available');
    this.faceCtx = ctx;
    this.faceTexture = new THREE.CanvasTexture(canvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.magFilter = THREE.NearestFilter;
    this.faceTexture.minFilter = THREE.LinearMipmapLinearFilter;
    this.face = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.faceTexture, transparent: true, depthTest: false }),
    );
    this.face.renderOrder = 10;
    this.group.add(this.face);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.group.add(this.shadow);

    this.redrawFace();
    this.applyTransform();
  }

  /** もふもふ度に合わせて小房の大きさと張り出しを変える */
  private updateTufts(): void {
    const f = this.shape.fluff;
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.tuftBase.forEach((t, i) => {
      const s = t.top ? t.size : t.size * (0.55 + 0.45 * f);
      pos.copy(t.dir).multiplyScalar(t.top ? 0.5 : 0.45 + 0.03 * f);
      pos.y += 0.5;
      m.compose(pos, t.rot, scale.setScalar(s));
      this.tufts.setMatrixAt(i, m);
    });
    this.tufts.instanceMatrix.needsUpdate = true;
  }

  private redrawFace(): void {
    const { e, blink, mouth } = this.expression;
    drawFace(this.faceCtx, e, blink, mouth, this.accessoryId === 'glasses');
    this.faceTexture.needsUpdate = true;
  }

  setExpression(expression: Expression, blink = false, mouthOpen = false): void {
    const key = `${expression}:${blink}:${mouthOpen}:${this.accessoryId}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    this.expression = { e: expression, blink, mouth: mouthOpen };
    this.redrawFace();
  }

  private baseColor = DRY_COLOR.clone();
  private dampT = 0;

  /** 0=通常, 1=湿気。色をなめらかに切り替える */
  setDampTint(t: number): void {
    this.dampT = t;
    this.material.color.copy(this.baseColor).lerp(DAMP_COLOR, t);
  }

  /** 食べたホコリで決まる毛並みの色（ふだんの色） */
  setBaseColor(color: string): void {
    this.baseColor.set(color);
    this.setDampTint(this.dampT);
  }

  /** size=直径、squashY=縦のつぶれ具合（アニメーション用） */
  setSize(size: number, squashY: number): void {
    this.size = size;
    this.squashY = squashY;
    this.applyTransform();
  }

  /** プレイヤーが決める形（幅・高さ・もふもふ度） */
  setCustomShape(shape: PetShape): void {
    const fluffChanged = shape.fluff !== this.shape.fluff;
    this.shape = { ...shape };
    if (fluffChanged) this.updateTufts();
    this.applyTransform();
  }

  setAccessory(id: AccessoryId | null): void {
    if (id === this.accessoryId) return;
    if (this.accessory) {
      this.group.remove(this.accessory.object);
      this.accessory.object.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        (mesh.material as THREE.Material | undefined)?.dispose();
      });
    }
    this.accessoryId = id;
    this.accessory = id ? createAccessory(id) : null;
    if (this.accessory) this.group.add(this.accessory.object);
    this.faceKey = '';
    this.redrawFace();
    this.applyTransform();
  }

  get diameter(): number {
    return this.size;
  }

  /** 当たり判定用の球（ワールド座標） */
  boundingSphere(target: THREE.Sphere): THREE.Sphere {
    const r = 0.5 * this.size;
    const center = this.group.position.clone().add(new THREE.Vector3(0, r * this.squashY * this.shape.height, 0));
    return target.set(center, r * Math.max(this.shape.width, this.shape.height) * 1.15);
  }

  /** 口の位置（ワールド座標）。餌が飛んでいく先 */
  mouthWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.face.getWorldPosition(target);
  }

  private applyTransform(): void {
    const s = this.size;
    const { width, height } = this.shape;
    const sy = this.squashY * height;
    const widen = (1 + (1 - this.squashY) * 0.6) * width;
    this.body.scale.set(s * widen, s * sy, s * widen);
    // 顔は本体より成長を緩やかにして、大きくなってもパーツを小さく保つ
    const faceScale = 0.8 * Math.pow(s, 0.6) * Math.pow(Math.min(widen, sy), 0.3);
    this.face.scale.setScalar(faceScale);
    const r = 0.5 * s;
    const center = new THREE.Vector3(0, r * sy, 0);
    const out = ISO_VIEW_DIR.clone().multiplyScalar(r * 0.98);
    out.x *= widen;
    out.z *= widen;
    out.y *= sy;
    this.face.position.copy(center).add(out).add(new THREE.Vector3(0, -0.06 * s * sy, 0));
    this.face.quaternion.copy(FACE_ROTATION);
    this.shadow.scale.setScalar(s * widen * 1.25);
    if (this.accessory) {
      // 付ける位置の球の表面の高さ＋外側の綿の房のぶんだけ持ち上げて、埋もれないようにする
      const o = this.accessory.offset;
      const surface = 0.5 + Math.sqrt(Math.max(0, 0.25 - o.x * o.x - o.z * o.z));
      const f = this.shape.fluff;
      const tuftOut = 0.45 + 0.03 * f + 0.085 * (0.55 + 0.45 * f) - 0.5;
      this.accessory.object.position.set(o.x * s * widen, (surface * sy + tuftOut + o.y) * s, o.z * s * widen);
      this.accessory.object.scale.setScalar(1.15 * Math.pow(s, 0.95));
    }
  }
}
