// 軽量なスプライト演出（キラキラ・ハート・しずく）。寿命が来たら縮んで消える。

import * as THREE from 'three';

type Particle = {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  age: number;
  gravity: number;
  baseScale: number;
};

export class Particles {
  readonly group = new THREE.Group();
  private readonly items: Particle[] = [];
  private readonly materials = new Map<THREE.Texture, THREE.SpriteMaterial>();

  private material(texture: THREE.Texture): THREE.SpriteMaterial {
    let m = this.materials.get(texture);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      this.materials.set(texture, m);
    }
    return m;
  }

  spawn(
    texture: THREE.Texture,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    opts: { life?: number; gravity?: number; scale?: number } = {},
  ): void {
    const sprite = new THREE.Sprite(this.material(texture));
    sprite.renderOrder = 20;
    sprite.position.copy(position);
    const baseScale = opts.scale ?? 0.25;
    sprite.scale.setScalar(baseScale);
    this.group.add(sprite);
    this.items.push({ sprite, velocity: velocity.clone(), life: opts.life ?? 0.8, age: 0, gravity: opts.gravity ?? 0, baseScale });
  }

  burst(texture: THREE.Texture, center: THREE.Vector3, count: number, speed: number, scale = 0.22): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const v = new THREE.Vector3(Math.cos(a) * speed, speed * (0.8 + Math.random() * 0.6), Math.sin(a) * speed);
      this.spawn(texture, center, v, { life: 0.55 + Math.random() * 0.25, gravity: 4, scale });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.group.remove(p.sprite);
        this.items.splice(i, 1);
        continue;
      }
      p.velocity.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      const k = p.age / p.life;
      p.sprite.scale.setScalar(p.baseScale * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3));
    }
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.items.length = 0;
    this.group.clear();
  }
}
