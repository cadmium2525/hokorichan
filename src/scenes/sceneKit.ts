// シーン共通の背景・ライト

import * as THREE from 'three';

export function setupStage(scene: THREE.Scene): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#fbe9ef');
    g.addColorStop(1, '#e9e0f6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
  }
  const bg = new THREE.CanvasTexture(canvas);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;

  scene.add(new THREE.HemisphereLight(0xfff4e6, 0xd9b8a0, 2.0));
  const sun = new THREE.DirectionalLight(0xfff0dc, 1.6);
  sun.position.set(4, 10, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xe6dcff, 0.5);
  fill.position.set(-6, 4, 2);
  scene.add(fill);
  return bg;
}
