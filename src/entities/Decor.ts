import * as THREE from 'three';
import { getMaterial } from '../utils/Constants';

// ── Instanced low-poly trees ─────────────────────────────────────────────────
// Returns [trunkMesh, foliageMesh] — caller adds both to the scene once.
// Each entry in `trees` is {x, z, s?} where s is a uniform scale (default 1).
// Foliage colour varies per tree via instanceColor so all instances share
// a single draw call each; the material base is white so colours pass through.

const TREE_GREENS = [0x2a6520, 0x1e5218, 0x357a28, 0x2d7a24, 0x3a8830, 0x245a1c];

export function buildTreeInstances(
  trees: Array<{x: number; z: number; s?: number; y?: number}>,
): [THREE.InstancedMesh, THREE.InstancedMesh] {
  const n = trees.length;

  const trunkGeo   = new THREE.BoxGeometry(0.32, 1.8, 0.32);
  const trunkMat   = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const trunks     = new THREE.InstancedMesh(trunkGeo, trunkMat, n);
  trunks.castShadow = true;

  // 3 foliage puffs per tree stacked vertically
  const puffGeo  = new THREE.SphereGeometry(1, 7, 5);
  const puffMat  = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const foliage  = new THREE.InstancedMesh(puffGeo, puffMat, n * 3);
  foliage.castShadow = true;

  const dummy = new THREE.Object3D();
  const col   = new THREE.Color();

  const TRUNK_BROWNS = [0x6b3a1f, 0x5a3017, 0x7a4228, 0x614030];

  trees.forEach(({ x, z, s = 1, y = 0 }, i) => {
    // trunk
    const trunkH = 0.9 * s;
    dummy.position.set(x, y + trunkH, z);
    dummy.scale.set(s, s, s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    col.setHex(TRUNK_BROWNS[i % TRUNK_BROWNS.length]);
    trunks.setColorAt(i, col);

    // foliage puffs: low-wide / mid / top-small
    const gc = TREE_GREENS[i % TREE_GREENS.length];
    col.setHex(gc);
    const puffs: [number, number][] = [
      [1.5 * s, 0.95 * s],   // bottom: wide
      [2.15 * s, 0.72 * s],  // mid
      [2.65 * s, 0.50 * s],  // top
    ];
    puffs.forEach(([yo, rs], pi) => {
      dummy.position.set(x, y + yo, z);
      dummy.scale.setScalar(rs);
      dummy.updateMatrix();
      foliage.setMatrixAt(i * 3 + pi, dummy.matrix);
      foliage.setColorAt(i * 3 + pi, col);
    });
  });

  trunks.instanceMatrix.needsUpdate = true;
  trunks.instanceColor!.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  foliage.instanceColor!.needsUpdate = true;

  return [trunks, foliage];
}

// Reusable voxel garden props — box-built to match OldCouple / the cottage
// scenery. Each builder returns a Group positioned at its own origin (y=0 on the
// ground) so callers just set group.position. Materials come from the shared
// getMaterial() cache, so spamming these along a long hedge stays cheap.

function box(w: number, h: number, d: number, color: number, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMaterial(color));
  m.castShadow = cast;
  return m;
}

// ── Hero props (a few hand-placed per level) ────────────────────────────────

export function makeGnome(): THREE.Group {
  const g = new THREE.Group();
  const body = box(0.32, 0.4, 0.32, 0xc0392b);     // red coat
  body.position.y = 0.2;
  g.add(body);
  const head = box(0.26, 0.24, 0.26, 0xf0d8c0);    // face
  head.position.y = 0.52;
  g.add(head);
  const beard = box(0.24, 0.16, 0.16, 0xf5f5f5);   // white beard
  beard.position.set(0, 0.44, 0.1);
  g.add(beard);
  const hat = box(0.22, 0.34, 0.22, 0xe74c3c);     // pointed-ish hat
  hat.position.y = 0.78;
  hat.rotation.z = 0.06;
  g.add(hat);
  return g;
}

export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  const seat = box(1.6, 0.1, 0.45, 0x8b5e3c);
  seat.position.y = 0.5;
  g.add(seat);
  const back = box(1.6, 0.5, 0.1, 0x8b5e3c);
  back.position.set(0, 0.78, -0.18);
  g.add(back);
  for (const sx of [-0.7, 0.7]) {
    const leg = box(0.12, 0.5, 0.4, 0x6b4423);
    leg.position.set(sx, 0.25, 0);
    g.add(leg);
  }
  return g;
}

export function makeBirdbath(): THREE.Group {
  const g = new THREE.Group();
  const base = box(0.4, 0.12, 0.4, 0x9aa0a6);
  base.position.y = 0.06;
  g.add(base);
  const stem = box(0.18, 0.7, 0.18, 0xb0b6bc);
  stem.position.y = 0.45;
  g.add(stem);
  const bowl = box(0.6, 0.14, 0.6, 0xc2c8ce);
  bowl.position.y = 0.85;
  g.add(bowl);
  const water = box(0.46, 0.04, 0.46, 0x4aa3d8, false);
  water.position.y = 0.93;
  g.add(water);
  return g;
}

export function makeWheelbarrow(): THREE.Group {
  const g = new THREE.Group();
  const tray = box(0.9, 0.32, 0.55, 0x4a6fa5);
  tray.position.y = 0.5;
  tray.rotation.z = 0.08;
  g.add(tray);
  const dirt = box(0.78, 0.12, 0.45, 0x5a3a22, false);
  dirt.position.y = 0.66;
  g.add(dirt);
  const wheel = box(0.12, 0.34, 0.34, 0x2c2c2c);
  wheel.position.set(0.5, 0.22, 0);
  g.add(wheel);
  for (const sz of [-0.2, 0.2]) {
    const leg = box(0.08, 0.3, 0.08, 0x7a7a7a);
    leg.position.set(-0.35, 0.15, sz);
    g.add(leg);
  }
  return g;
}

// ── Scatter pieces (cheap, sprinkled to fill width) ─────────────────────────

const SHRUB_GREENS = [0x2a6520, 0x1e5218, 0x357a28];

export function makeShrub(): THREE.Group {
  const g = new THREE.Group();
  const color = SHRUB_GREENS[Math.floor(Math.random() * SHRUB_GREENS.length)];
  const blobs = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < blobs; i++) {
    const r = 0.3 + Math.random() * 0.3;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), getMaterial(color));
    blob.castShadow = true;
    blob.position.set((Math.random() - 0.5) * 0.4, r * 0.8, (Math.random() - 0.5) * 0.3);
    g.add(blob);
  }
  return g;
}

const FLOWER_COLORS = [0xe74c3c, 0x9b59b6, 0xf39c12, 0xec407a, 0xf5f5dc, 0x3498db, 0xff6b35, 0xd4a0e0];
const FLOWER_CENTERS = [0xf5c300, 0xffe066, 0xffd700, 0xffaa00];
const LEAF_GREENS = [0x2d6e22, 0x3a8830, 0x256020];

export function makeScatterFlower(color: number): THREE.Group {
  const f = new THREE.Group();
  const stemH = 0.26 + Math.random() * 0.2;

  // stem — 5-sided cylinder reads as round at this scale
  const stemMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.032, stemH, 5),
    getMaterial(LEAF_GREENS[Math.floor(Math.random() * LEAF_GREENS.length)]),
  );
  stemMesh.position.y = stemH / 2;
  f.add(stemMesh);

  // small leaf partway up
  const leafMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.048, 0.038),
    getMaterial(0x3a8830),
  );
  leafMesh.position.set(0.07, stemH * 0.52, 0.01);
  leafMesh.rotation.z = -0.38;
  f.add(leafMesh);

  const headY = stemH;
  const petalCount = 5 + Math.floor(Math.random() * 2); // 5 or 6 petals
  const petalMat = getMaterial(color);
  const petalGeo = new THREE.BoxGeometry(0.15, 0.062, 0.032);

  for (let p = 0; p < petalCount; p++) {
    const angle = (p / petalCount) * Math.PI * 2;
    const r = 0.13;
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.set(Math.cos(angle) * r, headY, Math.sin(angle) * r);
    petal.rotation.y = -angle;
    f.add(petal);
  }

  // disc centre — flat hexagonal cylinder
  const cIdx = Math.floor(Math.random() * FLOWER_CENTERS.length);
  const centre = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.052, 6),
    getMaterial(FLOWER_CENTERS[cIdx]),
  );
  centre.position.y = headY + 0.014;
  f.add(centre);

  return f;
}

export function makeFlowerbed(): THREE.Group {
  const g = new THREE.Group();
  const n = 3 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const fc = FLOWER_COLORS[Math.floor(Math.random() * FLOWER_COLORS.length)];
    const x  = (i - (n - 1) / 2) * 0.3 + (Math.random() - 0.5) * 0.12;
    const flower = makeScatterFlower(fc);
    flower.position.set(x, 0, 0);
    g.add(flower);
  }
  return g;
}
