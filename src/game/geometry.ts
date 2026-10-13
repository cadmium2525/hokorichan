// 床の上の当たり判定（DOMやThree.jsに依存しない）。

/** 床の上の四角い範囲（家具の足もと） */
export type Box2 = { minX: number; maxX: number; minZ: number; maxZ: number };

/** 家具（AABB）の中に入った点を、いちばん近いふちの外へ押し出す。r は点の半径 */
export function pushOutOfBlockers(x: number, z: number, r: number, blockers: readonly Box2[]): { x: number; z: number } {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const b of blockers) {
      const minX = b.minX - r;
      const maxX = b.maxX + r;
      const minZ = b.minZ - r;
      const maxZ = b.maxZ + r;
      if (x <= minX || x >= maxX || z <= minZ || z >= maxZ) continue;
      // 4辺のうち、いちばん近い辺の外へ
      const dl = x - minX;
      const dr = maxX - x;
      const db = z - minZ;
      const df = maxZ - z;
      const m = Math.min(dl, dr, db, df);
      if (m === dl) x = minX;
      else if (m === dr) x = maxX;
      else if (m === db) z = minZ;
      else z = maxZ;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}

