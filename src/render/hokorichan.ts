// ほこりちゃんの手続き生成モデル。丸い本体＋外周の小房＋顔（目・口・頬）。

import * as THREE from 'three';
import { createRandom, randRange } from '../game/rng.ts';
import { blobShadowTexture } from './proceduralArt.ts';
import { ISO_VIEW_DIR } from './threeUtils.ts';

export type Expression = 'idle' | 'happy' | 'eating' | 'damp';

const DRY_COLOR = new THREE.Color('#fff8ef');
const DAMP_COLOR = new THREE.Color('#b9b6dc');
const FACE_SIZE = 32;
/** 顔の板の+Zをカメラ方向へ向ける回転 */
const FACE_ROTATION = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().lookAt(ISO_VIEW_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)),
);

/** 顔は32pxのキャンバスにドット絵で描く。パーツは小さく保つ */
function drawFace(ctx: CanvasRenderingContext2D, expression: Expression, blink: boolean, mouthOpen: boolean): void {
  ctx.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
  const ink = '#3b2a2a';
  const px = (x: number, y: number, w = 1, h = 1) => ctx.fillRect(x, y, w, h);

  // 頬
  ctx.fillStyle = expression === 'damp' ? 'rgba(200,170,210,0.8)' : 'rgba(246,160,182,0.85)';
  px(6, 17, 4, 2);
  px(22, 17, 4, 2);

  ctx.fillStyle = ink;
  const closed = blink || expression === 'eating';
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
  } else {
    // ω っぽい短い口
    px(14, 17); px(15, 18); px(16, 17); px(17, 18); px(18, 17);
  }
}

export class HokorichanModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly material: THREE.MeshLambertMaterial;
  private readonly face: THREE.Mesh;
  private readonly faceCtx: CanvasRenderingContext2D;
  private readonly faceTexture: THREE.CanvasTexture;
  private readonly shadow: THREE.Mesh;
  private faceKey = '';
  private size = 1;
  private squashY = 1;

  constructor(seed = 7) {
    const random = createRandom(seed);
    // 自己発光を少し足して陰影をやわらげ、綿毛らしい明るさにする
    this.material = new THREE.MeshLambertMaterial({ color: DRY_COLOR.clone(), emissive: new THREE.Color('#857a70') });

    // 本体：半径0.5の球（直径1）。サイズはbodyのscaleで変える
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 2), this.material);
    core.position.y = 0.5;
    this.body.add(core);

    // 外周の小房：フィボナッチ球面上に小さな多面体を散らす
    const tuftGeo = new THREE.IcosahedronGeometry(1, 1);
    const positions: THREE.Vector3[] = [];
    const n = 160;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i / (n - 1)) * 2;
      if (y < -0.75) continue;
      const r = Math.sqrt(1 - y * y);
      const theta = i * 2.39996;
      positions.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
    }
    // 頭頂のくるっとした房
    positions.push(new THREE.Vector3(0.05, 1.05, 0.02), new THREE.Vector3(0.14, 1.2, 0.05), new THREE.Vector3(0.28, 1.3, 0.08));
    const tufts = new THREE.InstancedMesh(tuftGeo, this.material, positions.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    positions.forEach((p, i) => {
      const s = i >= positions.length - 3 ? 0.06 + (positions.length - 1 - i) * 0.015 : randRange(random, 0.05, 0.085);
      e.set(random() * 3, random() * 3, random() * 3);
      q.setFromEuler(e);
      const pos = i >= positions.length - 3 ? p.clone().multiplyScalar(0.5) : p.clone().multiplyScalar(0.47);
      pos.y += 0.5;
      m.compose(pos, q, new THREE.Vector3(s, s, s));
      tufts.setMatrixAt(i, m);
    });
    this.body.add(tufts);
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

    this.setExpression('idle');
    this.applyTransform();
  }

  setExpression(expression: Expression, blink = false, mouthOpen = false): void {
    const key = `${expression}:${blink}:${mouthOpen}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    drawFace(this.faceCtx, expression, blink, mouthOpen);
    this.faceTexture.needsUpdate = true;
  }

  /** 0=通常, 1=湿気。色をなめらかに切り替える */
  setDampTint(t: number): void {
    this.material.color.copy(DRY_COLOR).lerp(DAMP_COLOR, t);
  }

  /** size=直径、squashY=縦のつぶれ具合 */
  setShape(size: number, squashY: number): void {
    this.size = size;
    this.squashY = squashY;
    this.applyTransform();
  }

  get diameter(): number {
    return this.size;
  }

  /** 口の位置（ワールド座標）。餌が飛んでいく先 */
  mouthWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.face.getWorldPosition(target);
  }

  private applyTransform(): void {
    const s = this.size;
    const sy = this.squashY;
    const widen = 1 + (1 - sy) * 0.6;
    this.body.scale.set(s * widen, s * sy, s * widen);
    // 顔は本体より成長を緩やかにして、大きくなってもパーツを小さく保つ
    const faceScale = 0.8 * Math.pow(s, 0.6);
    this.face.scale.setScalar(faceScale);
    const r = 0.5 * s;
    const center = new THREE.Vector3(0, r * sy, 0);
    const out = ISO_VIEW_DIR.clone().multiplyScalar(r * 0.98);
    out.y *= sy;
    this.face.position.copy(center).add(out).add(new THREE.Vector3(0, -0.06 * s * sy, 0));
    this.face.quaternion.copy(FACE_ROTATION);
    this.shadow.scale.setScalar(s * widen * 1.25);
  }
}
