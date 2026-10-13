// シーン共通の背景・ライト（時間帯で空の色と光が変わる）

import * as THREE from 'three';
import type { DayPhase } from '../game/clock.ts';

type StageLook = { sky: [string, string]; hemi: [number, number, number]; sun: [number, number]; fill: [number, number] };

const LOOKS: Record<DayPhase, StageLook> = {
  morning: { sky: ['#fde6d8', '#e6eaf8'], hemi: [0xfff0e6, 0xd9c0b0, 1.9], sun: [0xffe6cc, 1.5], fill: [0xe6dcff, 0.5] },
  day: { sky: ['#fbe9ef', '#e9e0f6'], hemi: [0xfff4e6, 0xd9b8a0, 2.0], sun: [0xfff0dc, 1.6], fill: [0xe6dcff, 0.5] },
  evening: { sky: ['#f7b98e', '#b993c4'], hemi: [0xffd9b8, 0xb08aa0, 1.6], sun: [0xffb070, 1.5], fill: [0xc8a8ff, 0.5] },
  night: { sky: ['#2c3060', '#5a4a86'], hemi: [0x9aa8e8, 0x5a4a70, 1.25], sun: [0xc8d4ff, 0.75], fill: [0xffd9a0, 0.35] },
};

export function setupStage(scene: THREE.Scene, phase: DayPhase = 'day'): THREE.Texture {
  const look = LOOKS[phase];
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, look.sky[0]);
    g.addColorStop(1, look.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 64);
  }
  const bg = new THREE.CanvasTexture(canvas);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;

  scene.add(new THREE.HemisphereLight(look.hemi[0], look.hemi[1], look.hemi[2]));
  const sun = new THREE.DirectionalLight(look.sun[0], look.sun[1]);
  sun.position.set(4, 10, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(look.fill[0], look.fill[1]);
  fill.position.set(-6, 4, 2);
  scene.add(fill);
  return bg;
}
