import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  vel:  THREE.Vector3;
  life: number;
  max:  number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
}

const FLASH_DUR = 0.09;
const RING_DUR  = 0.55;

export class LaserParticles {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;

  // Flash: bright vertical cylinder that fires at snip point
  private readonly _flash:    THREE.Mesh;
  private readonly _flashMat: THREE.MeshBasicMaterial;
  private _flashLife = 0;

  // Sight: thin scanner beam always pointing at the aimed segment
  private readonly _sight:    THREE.Mesh;
  private readonly _sightMat: THREE.MeshBasicMaterial;

  private _parts: Particle[] = [];
  private _rings: Ring[]     = [];
  private _ringFlip = 0;

  // Shared geometry across all bursts — CPU-only, no context needed
  private static readonly _octGeo   = new THREE.OctahedronGeometry(0.068, 0);
  private static readonly _tetraGeo = new THREE.TetrahedronGeometry(0.060, 0);
  private static readonly _ringGeo  = new THREE.TorusGeometry(1, 0.058, 4, 20);

  private static readonly _COLORS = [0x00ffff, 0xff00ff, 0xffffff, 0x40ffff, 0xff40ff] as const;

  constructor() {
    // Flash cylinder: bright vertical pulse at the snip column
    this._flashMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0, depthWrite: false,
    });
    this._flash = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), this._flashMat);
    this._flash.visible = false;
    this.group.add(this._flash);

    // Sight beam: ultra-thin scanner column
    this._sightMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0, depthWrite: false,
    });
    this._sight = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 4), this._sightMat);
    this._sight.visible = false;
    this.group.add(this._sight);

    // Point light: washes nearby surfaces in cyan when active
    this.light = new THREE.PointLight(0x00ccff, 0, 5.5);
    this.light.visible = false;
    this.group.add(this.light);
  }

  // Plasma burst at world position. Call on every snip when tier 4.
  burst(x: number, y: number, z: number): void {
    const count = 10;
    for (let i = 0; i < count; i++) {
      const color = LaserParticles._COLORS[i % LaserParticles._COLORS.length];
      const mat   = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false });
      const geo   = (i & 1) ? LaserParticles._tetraGeo : LaserParticles._octGeo;
      const mesh  = new THREE.Mesh(geo, mat);
      mesh.position.set(
        x + (Math.random() - 0.5) * 0.12,
        y,
        z + (Math.random() - 0.5) * 0.12,
      );
      mesh.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);

      const spd = 2.0 + Math.random() * 3.8;
      const ang = Math.random() * Math.PI * 2;
      this.group.add(mesh);
      this._parts.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * spd, (0.4 + Math.random() * 0.9) * spd, Math.sin(ang) * spd * 0.14),
        life: 0,
        max:  0.28 + Math.random() * 0.38,
      });
    }

    // Alternating cyan / magenta expanding ring
    const rColor = (this._ringFlip ^= 1) ? 0x00ffff : 0xff00ff;
    const rMat   = new THREE.MeshBasicMaterial({
      color: rColor, transparent: true, opacity: 0.88,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const ring = new THREE.Mesh(LaserParticles._ringGeo, rMat);
    ring.position.set(x, y, z);
    ring.rotation.x = Math.PI / 2;
    ring.scale.setScalar(0.04);
    this.group.add(ring);
    this._rings.push({ mesh: ring, life: 0 });

    // Flash column (unit cylinder scaled to hedge height y)
    this._flash.position.set(x, y * 0.5, z);
    this._flash.scale.y  = y;
    this._flash.visible  = true;
    this._flashMat.opacity = 0.88;
    this._flashLife = FLASH_DUR;
  }

  // Update targeting beam. Call every render frame.
  setSight(x: number, topY: number, active: boolean, t: number): void {
    this._sight.visible = active;
    this.light.visible  = active;
    if (!active) {
      this._sightMat.opacity = 0;
      this.light.intensity   = 0;
      return;
    }
    this._sight.position.set(x, topY * 0.5, 0.14);
    this._sight.scale.y = topY;
    this.light.position.set(x, topY * 0.5, 0.7);

    // 4 Hz pulse for that scanner-lock feel
    const pulse = 0.18 + Math.abs(Math.sin(t * Math.PI * 4)) * 0.58;
    this._sightMat.opacity = pulse;
    this.light.intensity   = pulse * 2.0;
  }

  // Fixed-step particle/ring/flash update
  update(dt: number): void {
    for (let i = this._parts.length - 1; i >= 0; i--) {
      const p = this._parts[i];
      p.life += dt;
      const t = p.life / p.max;
      if (t >= 1) {
        this.group.remove(p.mesh);
        (p.mesh.material as THREE.MeshBasicMaterial).dispose();
        this._parts.splice(i, 1);
        continue;
      }
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.y -= 6.5 * dt;
      p.mesh.rotation.x += dt * 5.5;
      p.mesh.rotation.z += dt * 4.0;
      p.mesh.scale.setScalar(1.15 - t * 0.55);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - t, 1.6);
    }

    for (let i = this._rings.length - 1; i >= 0; i--) {
      const r = this._rings[i];
      r.life += dt;
      const t = r.life / RING_DUR;
      if (t >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.MeshBasicMaterial).dispose();
        this._rings.splice(i, 1);
        continue;
      }
      r.mesh.scale.setScalar(0.04 + t * 3.2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.88;
    }

    if (this._flashLife > 0) {
      this._flashLife -= dt;
      this._flashMat.opacity = Math.max(0, this._flashLife / FLASH_DUR) * 0.88;
      if (this._flashLife <= 0) this._flash.visible = false;
    }
  }

  dispose(): void {
    this._flashMat.dispose();
    this._flash.geometry.dispose();
    this._sightMat.dispose();
    this._sight.geometry.dispose();
    for (const p of this._parts) (p.mesh.material as THREE.MeshBasicMaterial).dispose();
    for (const r of this._rings) (r.mesh.material as THREE.MeshBasicMaterial).dispose();
    this._parts = [];
    this._rings = [];
  }
}
