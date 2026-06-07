import * as THREE from 'three';
import { mulberry32 } from './SeededRNG';

const WALL_COLORS = [
  0xFFF8DC, 0xFFE4C4, 0xFAEBD7, 0xE6E6FA, 0xF0FFF0,
  0xFFF0F5, 0xF5F5DC, 0xFFDAB9, 0xB0E0E6, 0x98FB98,
];
const ROOF_COLORS = [
  0xB22222, 0x8B4513, 0x2F4F4F, 0x556B2F, 0x800000, 0x6B3837,
];
const DOOR_COLORS = [
  0x654321, 0x8B0000, 0x00008B, 0x006400, 0x2F4F4F, 0x4A2F1A,
];

function subRand(seed: number, salt: string): number {
  let h = seed | 0;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 2654435761) | 0;
  }
  h ^= h >>> 13;
  return ((h >>> 0) % 0x7fffffff) / 0x7fffffff;
}

interface HouseOpts {
  /** Override wall material (e.g. brick texture). Falls back to palette colour. */
  wallMat?: THREE.Material;
  /** Override roof material (e.g. tile texture). Falls back to palette colour. */
  roofMat?: THREE.Material;
}

/**
 * Build a simple gabled house as a THREE.Group. Deterministic from `seed`.
 * Front face (door + windows) points toward −Z; rotate Y by π to face camera.
 */
export function createLowLodHouse(seed: number, opts: HouseOpts = {}): THREE.Group {
  const rand = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const wallColor = pick(WALL_COLORS);
  const roofColor = pick(ROOF_COLORS);
  const doorColor = pick(DOOR_COLORS);

  const wallMat = opts.wallMat ?? new THREE.MeshLambertMaterial({ color: wallColor });
  const roofMat = opts.roofMat ?? new THREE.MeshLambertMaterial({ color: roofColor, side: THREE.DoubleSide });

  const houseWidth  = 4   + rand() * 2;
  const houseDepth  = 5   + rand() * 2;
  const houseHeight = 4.5 + rand() * 1.5;
  const roofHeight  = 2   + rand() * 0.5;

  const hasChimney = subRand(seed, 'chimney') > 0.35;
  const hasPorch   = subRand(seed, 'porch')   > 0.35;
  const hasGarage  = subRand(seed, 'garage')  > 0.45;
  const garageSide = subRand(seed, 'gside')   > 0.5 ? 1 : -1;

  const group = new THREE.Group();

  // Walls
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(houseWidth, houseHeight, houseDepth),
    wallMat,
  );
  walls.position.y = houseHeight / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  // Gabled roof (single BufferGeometry with all 4 faces)
  const ov = 0.5;
  const hw = houseWidth / 2 + ov;
  const hd = houseDepth / 2 + ov;
  const by = houseHeight;
  const py = houseHeight + roofHeight;
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    // left slope (two tris)
    -hw, by, -hd,  -hw, by,  hd,   0, py,  hd,
    -hw, by, -hd,   0,  py,  hd,   0, py, -hd,
    // right slope (two tris)
     hw, by, -hd,   0,  py, -hd,   0, py,  hd,
     hw, by, -hd,   0,  py,  hd,   hw, by, hd,
    // front gable
    -hw, by, -hd,   0,  py, -hd,   hw, by, -hd,
    // back gable
    -hw, by,  hd,   hw, by,  hd,   0,  py,  hd,
  ]), 3));
  // UVs: u along depth (z), v along slope (eave→ridge).
  // Gable ends get a simple triangular mapping.
  roofGeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    // left slope
    0,0,  1,0,  1,1,
    0,0,  1,1,  0,1,
    // right slope
    0,0,  0,1,  1,1,
    0,0,  1,1,  1,0,
    // front gable
    0,0,  0.5,1,  1,0,
    // back gable
    0,0,  1,0,  0.5,1,
  ]), 2));
  roofGeo.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.castShadow = true;
  group.add(roof);

  // Door
  const dh = 2.2;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.85, dh, 0.1),
    new THREE.MeshLambertMaterial({ color: doorColor }),
  );
  door.position.set(0, dh / 2, -houseDepth / 2 - 0.05);
  group.add(door);

  // Windows
  const winMat = new THREE.MeshLambertMaterial({ color: 0x88CCEE, emissive: 0x224433, emissiveIntensity: 0.4 });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  // Push windows 0.12 units clear of wall face so no z-fighting occurs.
  const zf = -houseDepth / 2 - 0.12;
  const addWin = (x: number, y: number, w: number, h: number) => {
    // Frame sits behind the glass (more +z = further into wall direction).
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.08), frameMat);
    frame.position.set(x, y, zf + 0.04);
    group.add(frame);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), winMat);
    m.position.set(x, y, zf);
    group.add(m);
  };
  for (const side of [-1, 1]) addWin(side * 1.15, houseHeight * 0.65, 0.9, 0.9);
  if (houseWidth > 5) {
    for (const side of [-1, 1]) addWin(side * 1.6, houseHeight * 0.32, 0.8, 0.9);
  }

  // Chimney
  if (hasChimney) {
    const ch = 1.5 + rand() * 0.5;
    const chimney = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, ch, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x9B4513 }),
    );
    const xOff = (rand() - 0.5) * houseWidth * 0.4;
    chimney.position.set(xOff, houseHeight + roofHeight * 0.45 + ch / 2, 0);
    chimney.castShadow = true;
    group.add(chimney);
  }

  // Garage
  if (hasGarage) {
    const gw = 3.2, gh = 2.6, gd = 3.8;
    const gx = garageSide * (houseWidth / 2 + gw / 2 + 0.25);
    const gBody = new THREE.Mesh(
      new THREE.BoxGeometry(gw, gh, gd),
      wallMat,
    );
    gBody.position.set(gx, gh / 2, 0);
    gBody.castShadow = true;
    gBody.receiveShadow = true;
    group.add(gBody);
    const gRoof = new THREE.Mesh(
      new THREE.BoxGeometry(gw + 0.3, 0.18, gd + 0.3),
      roofMat,
    );
    gRoof.position.set(gx, gh + 0.09, 0);
    group.add(gRoof);
    const gDoor = new THREE.Mesh(
      new THREE.BoxGeometry(gw * 0.85, gh * 0.8, 0.05),
      new THREE.MeshLambertMaterial({ color: 0xCCCCCC }),
    );
    gDoor.position.set(gx, gh * 0.4, -gd / 2 - 0.03);
    group.add(gDoor);
  }

  // Porch
  if (hasPorch) {
    const prY = houseHeight * 0.45;
    const pRoof = new THREE.Mesh(
      new THREE.BoxGeometry(houseWidth * 0.65, 0.12, 1.8),
      roofMat,
    );
    pRoof.position.set(0, prY, -houseDepth / 2 - 0.75);
    group.add(pRoof);
    const pFloor = new THREE.Mesh(
      new THREE.BoxGeometry(houseWidth * 0.55, 0.18, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x9B8B6B }),
    );
    pFloor.position.set(0, 0.09, -houseDepth / 2 - 0.75);
    group.add(pFloor);
    // Columns
    const colMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, prY - 0.18, 6), colMat);
      col.position.set(sx * houseWidth * 0.22, (prY - 0.18) / 2, -houseDepth / 2 - 1.35);
      group.add(col);
    }
  }

  return group;
}

/** Approximate footprint (world units) of the house returned by createLowLodHouse. */
export function houseFootprint(seed: number, scale = 1): { width: number; depth: number } {
  const rand = mulberry32(seed);
  rand(); rand(); rand(); // skip color picks
  const houseWidth = (4 + rand() * 2) * scale;
  const houseDepth = (5 + rand() * 2) * scale;
  const hasGarage  = subRand(seed, 'garage') > 0.45;
  return {
    width: hasGarage ? houseWidth + 3.7 * scale : houseWidth,
    depth: houseDepth,
  };
}
