// 掃除道具の3Dモデル（素手・ぞうきん・ハンディモップ・掃除機）。原点が床に触れる位置。

import * as THREE from 'three';
import type { Hero, ToolId } from '../game/catalog.ts';
import { PALETTE } from './proceduralArt.ts';

const SKIN = '#f8d9c0';
/** 柄や腕はカメラ側（+X+Z、上）へ伸ばして、手前から握っているように見せる */
const HANDLE_DIR = new THREE.Vector3(0.45, 1, 0.45).normalize();
const UP = new THREE.Vector3(0, 1, 0);

function mat(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

/** 原点からカメラ側へ伸びる棒（腕・柄） */
function rod(radius: number, length: number, material: THREE.Material, start = 0.1): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  m.position.copy(HANDLE_DIR.clone().multiplyScalar(start + length / 2));
  m.quaternion.setFromUnitVectors(UP, HANDLE_DIR);
  return m;
}

function hand(sleeveColor: string): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(SKIN);
  const palm = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), skin);
  palm.scale.set(0.17, 0.09, 0.2);
  palm.position.y = 0.09;
  const thumb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), skin);
  thumb.position.set(0.15, 0.08, -0.06);
  const wrist = rod(0.08, 0.25, skin, 0.08);
  const sleeve = rod(0.12, 0.7, mat(sleeveColor), 0.3);
  g.add(palm, thumb, wrist, sleeve);
  return g;
}

function rag(sleeveColor: string): THREE.Group {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.36), mat('#f3d27a'));
  cloth.position.y = 0.03;
  cloth.rotation.y = Math.PI / 4;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.052, 0.06), mat('#fff6dc'));
  stripe.position.y = 0.03;
  stripe.rotation.y = Math.PI / 4;
  const h = hand(sleeveColor);
  h.position.y = 0.05;
  g.add(cloth, stripe, h);
  return g;
}

function mop(): THREE.Group {
  const g = new THREE.Group();
  const fluffMats = [mat('#ffffff'), mat('#fbe3ea')];
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 7; i++) {
    const f = new THREE.Mesh(geo, fluffMats[i % 2]);
    f.scale.setScalar(0.1 + (i % 3) * 0.015);
    const t = (i - 3) * 0.08;
    f.position.set(t, 0.1 + (i % 2) * 0.04, -t);
    g.add(f);
  }
  g.add(rod(0.03, 1.3, mat('#e8e2f2'), 0.15));
  const grip = rod(0.05, 0.3, mat(PALETTE.lavenderDeep), 1.45);
  g.add(grip);
  return g;
}

function vacuum(): THREE.Group {
  const g = new THREE.Group();
  const body = mat(PALETTE.lavenderDeep);
  const accent = mat(PALETTE.pink);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.28), body);
  head.position.y = 0.08;
  head.rotation.y = Math.PI / 4;
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.08), accent);
  bumper.position.set(0.1, 0.05, 0.1);
  bumper.rotation.y = Math.PI / 4;
  g.add(head, bumper, rod(0.035, 1.6, mat('#e8e2f2')), rod(0.06, 0.25, accent, 1.6));
  return g;
}

export function createToolModel(id: ToolId, hero: Hero): THREE.Group {
  const sleeve = hero === 'girl' ? PALETTE.pink : '#8ec1ea';
  switch (id) {
    case 'hand': {
      const h = hand(sleeve);
      h.scale.setScalar(1.35);
      return h;
    }
    case 'rag':
      return rag(sleeve);
    case 'mop':
      return mop();
    case 'vacuum':
      return vacuum();
  }
}
