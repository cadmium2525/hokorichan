// ドット絵キャラクターを3D空間に立たせる。
// カメラの方位に向けた縦の板に描き、テクスチャの1ドットが低解像度画面の1ピクセルになるよう大きさと位置をそろえる。

import * as THREE from 'three';
import { CHAR_H, CHAR_W, FRAMES, drawCharacter, type CharacterId, type Facing, type HeldTool, type Pose } from './pixelCharacters.ts';
import { blobShadowTexture, makeCanvas, toTexture } from './proceduralArt.ts';
import { ISO_VIEW_DIR } from './threeUtils.ts';

const FPS: Record<Pose, number> = {
  idle: 3,
  walk: 8,
  run: 12,
  clean: 8,
  wipe: 8,
  surprise: 8,
  joy: 8,
  talk: 5,
  give: 4,
};

type Frame = { image: ImageData; tip: { x: number; y: number } | null };

/** 同じ絵は使い回す（NPCが複数いても生成は1回） */
const cache = new Map<string, Frame>();

function frameOf(id: CharacterId, facing: Facing, pose: Pose, frame: number, tool: HeldTool | undefined): Frame {
  const key = `${id}/${facing}/${pose}/${frame}/${tool ?? ''}`;
  let f = cache.get(key);
  if (!f) {
    const c = drawCharacter({ id, facing, pose, frame, tool });
    f = { image: new ImageData(new Uint8ClampedArray(c.data), c.width, c.height), tip: c.tip };
    cache.set(key, f);
  }
  return f;
}

export class CharacterSprite {
  readonly group = new THREE.Group();
  facing: Facing = 'down';
  pose: Pose = 'idle';
  tool: HeldTool | undefined;
  /** false の間はコマを進めない */
  playing = true;

  private readonly id: CharacterId;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly board: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private time = 0;
  private drawn = '';
  private current: Frame | null = null;
  /** 1ドットのワールドサイズ（横） */
  private unit = 0.035;
  private readonly tmp = new THREE.Vector3();

  constructor(id: CharacterId, opts: { shadow?: boolean } = {}) {
    this.id = id;
    const [canvas, ctx] = makeCanvas(CHAR_W, CHAR_H);
    this.ctx = ctx;
    this.texture = toTexture(canvas);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    this.board = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.texture, alphaTest: 0.5, side: THREE.DoubleSide }));
    // 板の正面をカメラの方位（+X+Z）へ向ける
    this.board.rotation.y = Math.atan2(ISO_VIEW_DIR.x, ISO_VIEW_DIR.z);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.shadow.visible = opts.shadow ?? true;
    this.group.add(this.shadow, this.board);
    this.redraw();
  }

  set(pose: Pose, facing: Facing = this.facing, tool: HeldTool | undefined = this.tool): void {
    if (pose !== this.pose) this.time = 0;
    this.pose = pose;
    this.facing = facing;
    this.tool = tool;
  }

  get frame(): number {
    return Math.floor(this.time * FPS[this.pose]) % FRAMES;
  }

  /** 道具の先（床に当たる点）の、足元からのずれ（ドット単位。右が+） */
  get tipOffset(): number | null {
    const tip = this.current?.tip;
    return tip ? tip.x + 0.5 - CHAR_W / 2 : null;
  }

  get dotSize(): number {
    return this.unit;
  }

  update(dt: number): void {
    if (this.playing) this.time += dt;
    this.redraw();
  }

  private redraw(): void {
    const frame = this.frame;
    const key = `${this.facing}/${this.pose}/${frame}/${this.tool ?? ''}`;
    if (key === this.drawn) return;
    this.drawn = key;
    this.current = frameOf(this.id, this.facing, this.pose, frame, this.tool);
    this.ctx.putImageData(this.current.image, 0, 0);
    this.texture.needsUpdate = true;
  }

  /**
   * 低解像度画面の1ピクセルに1ドットが重なるよう、大きさを決めて位置をピクセルの格子にそろえる。
   * 毎フレーム、カメラを動かしたあとに呼ぶ。
   */
  fitToPixels(camera: THREE.OrthographicCamera, lowWidth: number): void {
    const unit = (camera.right - camera.left) / Math.max(1, lowWidth);
    this.unit = unit;
    // 縦の板は斜め上から見ると縮んで見えるので、その分だけ縦にのばす
    const dir = camera.getWorldDirection(this.tmp);
    const cosElev = Math.hypot(dir.x, dir.z);
    this.board.scale.set(CHAR_W * unit, (CHAR_H * unit) / Math.max(0.2, cosElev), 1);
    this.shadow.scale.set(CHAR_W * unit * 0.7, CHAR_W * unit * 0.7, 1);

    // 足元（板の下辺中央）の画面位置をピクセル格子にそろえる
    this.board.position.set(0, 0, 0);
    camera.updateMatrixWorld();
    this.group.updateMatrixWorld();
    const v = this.tmp.setFromMatrixPosition(this.group.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
    const half = (CHAR_W / 2) * unit;
    const sx = camera.left + Math.round((v.x - half - camera.left) / unit) * unit + half - v.x;
    const sy = camera.bottom + Math.round((v.y - camera.bottom) / unit) * unit - v.y;
    // ビュー空間のずれをワールドのずれに直す（カメラの右・上方向）
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    this.board.position.addScaledVector(right, sx).addScaledVector(up, sy);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.texture.dispose();
    this.board.geometry.dispose();
    (this.board.material as THREE.Material).dispose();
    this.shadow.geometry.dispose();
    const sm = this.shadow.material as THREE.MeshBasicMaterial;
    sm.map?.dispose();
    sm.dispose();
  }
}

/** ワールドの移動量（x,z）を画面上の向き（右・下が+）に直す */
export function screenDelta(dx: number, dz: number): { sx: number; sy: number } {
  // カメラは +X+Z 側から見下ろしているので、画面の右は (1,0,-1)、画面の下は (1,0,1)
  return { sx: dx - dz, sy: dx + dz };
}
