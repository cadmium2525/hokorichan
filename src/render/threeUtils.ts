import * as THREE from 'three';

/** 斜め見下ろしの共通カメラ。仕様どおり(8,10,8)から原点を見る */
export function createIsoCamera(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(8, 10, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

/** カメラ方向（原点→カメラ）の単位ベクトル */
export const ISO_VIEW_DIR = new THREE.Vector3(8, 10, 8).normalize();

const corner = new THREE.Vector3();

export type Extents = { minX: number; maxX: number; minY: number; maxY: number };

function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  return Array.from({ length: 8 }, (_, i) =>
    new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
  );
}

/** 点群（箱なら8頂点）をカメラ空間へ変換し、画面上の上下左右の広がりを返す */
export function projectedExtents(camera: THREE.Camera, shape: THREE.Box3 | THREE.Vector3[]): Extents {
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse;
  const points = Array.isArray(shape) ? shape : boxCorners(shape);
  const e: Extents = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) {
    corner.copy(p).applyMatrix4(inv);
    e.minX = Math.min(e.minX, corner.x); e.maxX = Math.max(e.maxX, corner.x);
    e.minY = Math.min(e.minY, corner.y); e.maxY = Math.max(e.maxY, corner.y);
  }
  return e;
}

/** 箱（または点群）が画面に収まるよう正射影の範囲を合わせる（余白付き） */
export function fitOrthoToBox(
  camera: THREE.OrthographicCamera,
  box: THREE.Box3 | THREE.Vector3[],
  aspect: number,
  margin = 1.05,
  verticalBias = 0,
): void {
  const { minX, maxX, minY, maxY } = projectedExtents(camera, box);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let halfW = ((maxX - minX) / 2) * margin;
  let halfH = ((maxY - minY) / 2) * margin;
  if (halfW / halfH > aspect) halfH = halfW / aspect;
  else halfW = halfH * aspect;
  const oy = cy + verticalBias * halfH;
  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = oy + halfH;
  camera.bottom = oy - halfH;
  camera.updateProjectionMatrix();
}

/** シーン以下のジオメトリ・マテリアル・テクスチャをすべて解放する */
export function disposeHierarchy(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    // InstancedMesh は並べ方のバッファも持っているので、それも手放す
    if ((obj as THREE.InstancedMesh).isInstancedMesh) (obj as THREE.InstancedMesh).dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => materials.add(m));
    else if (mat) materials.add(mat);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    m.dispose();
  }
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
