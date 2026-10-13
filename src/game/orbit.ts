// 宇宙のおそうじ（5章）の軌道の計算。描画に依存しない。

/** ほこりちゃんが回れる軌道の範囲 */
export const ORBIT_MIN = 3.2;
export const ORBIT_MAX = 8.0;
/** いちばん内側の軌道での角速度（rad/秒） */
const OMEGA_AT_MIN = 1.25;

/** 軌道の半径での角速度。外側ほどゆっくり（ケプラーの法則ふう） */
export function orbitOmega(radius: number): number {
  return OMEGA_AT_MIN * Math.pow(ORBIT_MIN / Math.max(ORBIT_MIN, radius), 1.5);
}
