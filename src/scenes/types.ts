import type * as THREE from 'three';

/** Gameが切り替えて使うシーンの共通インターフェース */
export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.OrthographicCamera;
  resize(aspect: number): void;
  update(dt: number, time: number): void;
  /** メッシュ・テクスチャ・イベントを解放する */
  dispose(): void;
}
