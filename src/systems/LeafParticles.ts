import * as THREE from 'three';

const POOL_SIZE   = 160;
const BURST_COUNT = 28;

const LEAF_COLORS = [0x2d7a1f, 0x3d9a2a, 0x5cb84a, 0x4a8f3f, 0x82b841, 0x1a5c14, 0x7ec850, 0x2e8b57];
const TWIG_COLORS = [0x1a4a12, 0x8b7355, 0x6b5a3a, 0x4a7c3f, 0xb5a045];

interface Particle {
  mesh:    THREE.Mesh;
  vel:     THREE.Vector3;
  spin:    THREE.Vector3;
  life:    number;
  maxLife: number;
  active:  boolean;
}

export class LeafParticles {
  group: THREE.Group;
  private _pool: Particle[];

  constructor() {
    this.group = new THREE.Group();
    this._pool = [];

    // Shared geometries — leaf quads and short twig boxes
    const leafGeo = new THREE.PlaneGeometry(0.19, 0.19);
    const twigGeo = new THREE.BoxGeometry(0.07, 0.28, 0.05);

    for (let i = 0; i < POOL_SIZE; i++) {
      const isTwig   = i >= Math.floor(POOL_SIZE * 0.62);
      const geo      = isTwig ? twigGeo : leafGeo;
      const palette  = isTwig ? TWIG_COLORS : LEAF_COLORS;
      const mat = new THREE.MeshLambertMaterial({
        color:       palette[i % palette.length],
        side:        THREE.DoubleSide,
        transparent: true,
        opacity:     1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this._pool.push({
        mesh,
        vel:     new THREE.Vector3(),
        spin:    new THREE.Vector3(),
        life:    0,
        maxLife: 1,
        active:  false,
      });
    }
  }

  burst(x: number, y: number, z: number, count: number = BURST_COUNT): void {
    let spawned = 0;
    for (const p of this._pool) {
      if (p.active || spawned >= count) continue;

      p.active       = true;
      p.mesh.visible = true;

      // Spawn inside the hedge volume
      p.mesh.position.set(
        x + (Math.random() - 0.5) * 1.3,
        y - 0.1 + Math.random() * 0.9,
        z + (Math.random() - 0.5) * 0.7,
      );

      // Fan upward and outward
      const angle = (Math.random() - 0.5) * Math.PI * 1.4;
      const speed = 2.2 + Math.random() * 3.8;
      p.vel.set(
        Math.sin(angle) * speed,
        2.8 + Math.random() * 4.0,
        (Math.random() - 0.5) * 1.2,
      );

      // Per-burst randomised tumble speed
      p.spin.set(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 9,
        (Math.random() - 0.5) * 18,
      );

      p.maxLife = 0.65 + Math.random() * 0.65;
      p.life    = p.maxLife;

      p.mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = 1;
      spawned++;
    }
  }

  update(dt: number): void {
    for (const p of this._pool) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active       = false;
        p.mesh.visible = false;
        continue;
      }

      // Gravity + slight air resistance on lateral velocity
      p.vel.y  -= 7.0 * dt;
      p.vel.x  *= 1 - 0.9 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      p.mesh.rotation.z += p.spin.z * dt;

      // Fade out in the last third of lifetime
      const t = p.life / p.maxLife;
      (p.mesh.material as THREE.MeshLambertMaterial).opacity = Math.min(1, t * 3);
    }
  }
}
