// 低解像度のRenderTargetに描いてからNearestFilterで拡大し、擬似ピクセルアートにする。

import * as THREE from 'three';

/** CSS px あたりの低解像度ピクセル数の逆数。1.5なら360px幅→240px相当で描く */
const PIXEL_SIZE = 1.5;
const MAX_PIXEL_RATIO = 1.5;

export class PixelRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly blitScene = new THREE.Scene();
  private readonly blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  lowWidth = 1;
  lowHeight = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setClearColor(0xfbeee0);

    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false, depthWrite: false }),
    );
    this.blitScene.add(quad);
  }

  /** 表示サイズ（CSS px）に合わせて内部解像度を決め直す */
  resize(cssWidth: number, cssHeight: number): void {
    const w = Math.max(1, Math.round(cssWidth));
    const h = Math.max(1, Math.round(cssHeight));
    this.renderer.setSize(w, h, false);
    this.lowWidth = Math.max(1, Math.round(w / PIXEL_SIZE));
    this.lowHeight = Math.max(1, Math.round(h / PIXEL_SIZE));
    this.target.setSize(this.lowWidth, this.lowHeight);
  }

  get aspect(): number {
    return this.lowWidth / this.lowHeight;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.blitScene, this.blitCamera);
  }
}
