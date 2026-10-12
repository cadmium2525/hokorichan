// まちを歩く主人公（ちびキャラ）。男の子は青いシャツと半ズボン、女の子はピンクのワンピース。

import * as THREE from 'three';
import type { Hero } from '../game/catalog.ts';
import { blobShadowTexture } from './proceduralArt.ts';

const SKIN = '#f8d9c0';

function mat(color: string): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color });
}

export class HeroModel {
  readonly group = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly legs: THREE.Mesh[] = [];
  private readonly arms: THREE.Mesh[] = [];
  private walkPhase = 0;

  constructor(hero: Hero) {
    const girl = hero === 'girl';
    const shirt = mat(girl ? '#f4b6c6' : '#8ec1ea');
    const bottom = mat(girl ? '#e98aa6' : '#5d7fa8');
    const skin = mat(SKIN);
    const hair = mat(girl ? '#5a3a2a' : '#4a3328');
    const shoe = mat(girl ? '#a58fd0' : '#e98aa6');

    // 足
    for (const x of [-0.09, 0.09]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), skin);
      leg.geometry.translate(0, -0.14, 0);
      leg.position.set(x, 0.32, 0);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.16), shoe);
      foot.position.set(0, -0.27, 0.02);
      leg.add(foot);
      this.body.add(leg);
      this.legs.push(leg);
    }
    // 胴体（女の子はスカートつき）
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.22), shirt);
    torso.position.y = 0.5;
    this.body.add(torso);
    if (girl) {
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.2, 10), bottom);
      skirt.position.y = 0.33;
      this.body.add(skirt);
    } else {
      const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.22), bottom);
      shorts.position.y = 0.33;
      this.body.add(shorts);
    }
    // 腕
    for (const x of [-0.22, 0.22]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.26, 0.08), skin);
      arm.geometry.translate(0, -0.12, 0);
      arm.position.set(x, 0.62, 0);
      this.body.add(arm);
      this.arms.push(arm);
    }
    // 頭（大きめでかわいく）
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 2), skin);
    head.position.y = 0.88;
    const hairCap = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 2), hair);
    hairCap.scale.set(1, 0.8, 1);
    hairCap.position.set(0, 0.96, -0.04);
    this.body.add(head, hairCap);
    if (girl) {
      // おかっぱの横髪とピンクの髪どめ
      for (const x of [-0.2, 0.2]) {
        const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.2), hair);
        side.position.set(x, 0.8, -0.02);
        this.body.add(side);
      }
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.06), mat('#f4b6c6'));
      clip.position.set(0.14, 1.12, 0.12);
      this.body.add(clip);
    }
    // 目とほっぺ（顔は +Z 向き）
    const eye = mat('#3b2a2a');
    for (const x of [-0.08, 0.08]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.02), eye);
      e.position.set(x, 0.87, 0.24);
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), mat('#f4a3b6'));
      cheek.position.set(x * 1.6, 0.81, 0.22);
      this.body.add(e, cheek);
    }

    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    this.group.add(this.body, shadow);
  }

  /** 進む向き（ラジアン）と歩いているかで、向きと手足をアニメーションする */
  update(dt: number, heading: number, walking: boolean): void {
    const current = this.body.rotation.y;
    let diff = heading - current;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.body.rotation.y = current + diff * Math.min(1, dt * 12);
    if (walking) this.walkPhase += dt * 11;
    else this.walkPhase *= Math.max(0, 1 - dt * 10);
    const swing = Math.sin(this.walkPhase) * (walking ? 0.6 : 0);
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.x = -swing * 0.8;
    this.arms[1].rotation.x = swing * 0.8;
    this.body.position.y = walking ? Math.abs(Math.sin(this.walkPhase)) * 0.04 : 0;
  }
}
