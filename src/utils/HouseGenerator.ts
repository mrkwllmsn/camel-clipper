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
  /** Override window glass material (e.g. window texture). Falls back to tinted glass. */
  winMat?: THREE.Material;
}

type HouseStyle = 'standard' | 'bungalow' | 'double' | 'tall' | 'semi';

function pickStyle(seed: number): HouseStyle {
  const r = subRand(seed, 'style');
  if (r < 0.20) return 'bungalow';
  if (r < 0.42) return 'standard';
  if (r < 0.62) return 'double';
  if (r < 0.80) return 'tall';
  return 'semi';
}

// Parameterised gabled roof geometry — wall top at wallTopY, ridge at wallTopY+roofH.
function makeGabledRoof(w: number, d: number, wallTopY: number, roofH: number, ov = 0.5): THREE.BufferGeometry {
  const hw = w / 2 + ov;
  const hd = d / 2 + ov;
  const by = wallTopY;
  const py = wallTopY + roofH;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    -hw, by, -hd,  -hw, by,  hd,   0, py,  hd,
    -hw, by, -hd,   0,  py,  hd,   0, py, -hd,
     hw, by, -hd,   0,  py, -hd,   0, py,  hd,
     hw, by, -hd,   0,  py,  hd,   hw, by,  hd,
    -hw, by, -hd,   0,  py, -hd,   hw, by, -hd,
    -hw, by,  hd,   hw, by,  hd,   0,  py,  hd,
  ]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
    0,0,  1,0,  1,1,  0,0,  1,1,  0,1,
    0,0,  0,1,  1,1,  0,0,  1,1,  1,0,
    0,0,  0.5,1, 1,0,
    0,0,  1,0,  0.5,1,
  ]), 2));
  geo.computeVertexNormals();
  return geo;
}

function addWindow(
  group: THREE.Group, winMat: THREE.Material, frameMat: THREE.Material,
  x: number, y: number, z: number, w = 0.9, h = 0.9,
) {
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.08), frameMat);
  frame.position.set(x, y, z + 0.04);
  group.add(frame);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), winMat);
  glass.position.set(x, y, z);
  group.add(glass);
}

function addSingleGarage(
  group: THREE.Group, houseW: number,
  wallMat: THREE.Material, roofMat: THREE.Material, side: number,
) {
  const gw = 3.2, gh = 2.6, gd = 3.8;
  const gx = side * (houseW / 2 + gw / 2 + 0.25);
  const body = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), wallMat);
  body.position.set(gx, gh / 2, 0);
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const flat = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.3, 0.18, gd + 0.3), roofMat);
  flat.position.set(gx, gh + 0.09, 0);
  group.add(flat);
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(gw * 0.85, gh * 0.8, 0.05),
    new THREE.MeshLambertMaterial({ color: 0xCCCCCC }),
  );
  door.position.set(gx, gh * 0.4, -gd / 2 - 0.03);
  group.add(door);
}

function addDoubleGarage(
  group: THREE.Group, houseW: number,
  wallMat: THREE.Material, roofMat: THREE.Material, side: number,
) {
  const gw = 5.8, gh = 2.8, gd = 4.2;
  const gx = side * (houseW / 2 + gw / 2 + 0.25);
  const body = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), wallMat);
  body.position.set(gx, gh / 2, 0);
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const flat = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.3, 0.2, gd + 0.3), roofMat);
  flat.position.set(gx, gh + 0.1, 0);
  group.add(flat);
  const doorMat = new THREE.MeshLambertMaterial({ color: 0xCCCCCC });
  const dw = gw / 2 * 0.85;
  for (const dsx of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(dw, gh * 0.8, 0.05), doorMat);
    door.position.set(gx + dsx * gw * 0.24, gh * 0.4, -gd / 2 - 0.03);
    group.add(door);
  }
}

function addPorch(
  group: THREE.Group, houseW: number, houseD: number, houseH: number,
  roofMat: THREE.Material,
) {
  const prY = houseH * 0.45;
  const pRoof = new THREE.Mesh(new THREE.BoxGeometry(houseW * 0.65, 0.12, 1.8), roofMat);
  pRoof.position.set(0, prY, -houseD / 2 - 0.75);
  group.add(pRoof);
  const pFloor = new THREE.Mesh(
    new THREE.BoxGeometry(houseW * 0.55, 0.18, 1.5),
    new THREE.MeshLambertMaterial({ color: 0x9B8B6B }),
  );
  pFloor.position.set(0, 0.09, -houseD / 2 - 0.75);
  group.add(pFloor);
  const colMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, prY - 0.18, 6), colMat);
    col.position.set(sx * houseW * 0.22, (prY - 0.18) / 2, -houseD / 2 - 1.35);
    group.add(col);
  }
}

/**
 * Build a house as a THREE.Group. Style is deterministic from `seed`.
 * Five styles: standard, bungalow, double (2-storey detached), tall (3-storey), semi-detached.
 * Front face (door + windows) points toward −Z; rotate Y by π to face camera.
 */
export function createLowLodHouse(seed: number, opts: HouseOpts = {}): THREE.Group {
  const rand = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  const wallColor = pick(WALL_COLORS);
  const roofColor = pick(ROOF_COLORS);
  const doorColor = pick(DOOR_COLORS);

  const wallMat    = opts.wallMat ?? new THREE.MeshLambertMaterial({ color: wallColor });
  const roofMat    = opts.roofMat ?? new THREE.MeshLambertMaterial({ color: roofColor, side: THREE.DoubleSide });
  const winMat     = opts.winMat  ?? new THREE.MeshLambertMaterial({ color: 0x88CCEE, emissive: 0x224433, emissiveIntensity: 0.4 });
  const frameMat   = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const doorMat    = new THREE.MeshLambertMaterial({ color: doorColor });
  const chimneyMat = new THREE.MeshLambertMaterial({ color: 0x9B4513 });

  const style      = pickStyle(seed);
  const hasChimney = subRand(seed, 'chimney')   > 0.35;
  const hasPorch   = subRand(seed, 'porch')     > 0.35;
  const hasGarage  = subRand(seed, 'garage')    > 0.45;
  const hasDblGar  = subRand(seed, 'dblgarage') > 0.5;
  const garageSide = subRand(seed, 'gside')     > 0.5 ? 1 : -1;

  const sr = (s: string) => subRand(seed, s);
  const group = new THREE.Group();

  const addWin = (x: number, y: number, z: number, w = 0.9, h = 0.9) =>
    addWindow(group, winMat, frameMat, x, y, z, w, h);

  // ── standard ──────────────────────────────────────────────────────────────
  if (style === 'standard') {
    const W  = 4   + sr('sw')  * 2;
    const D  = 5   + sr('sd')  * 2;
    const H  = 4.5 + sr('sh')  * 1.5;
    const RH = 2   + sr('srh') * 0.5;
    const zf = -D / 2 - 0.12;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
    walls.position.y = H / 2;
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(makeGabledRoof(W, D, H, RH), roofMat);
    roof.castShadow = true;
    group.add(roof);

    const dh = 2.2;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, dh, 0.1), doorMat);
    door.position.set(0, dh / 2, -D / 2 - 0.05);
    group.add(door);

    for (const sx of [-1, 1]) addWin(sx * 1.15, H * 0.65, zf);
    if (W > 5) for (const sx of [-1, 1]) addWin(sx * 1.6, H * 0.32, zf, 0.8, 0.9);

    if (hasChimney) {
      const ch = 1.5 + sr('chl') * 0.5;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, ch, 0.55), chimneyMat);
      chimney.position.set((sr('chx') - 0.5) * W * 0.4, H + RH * 0.45 + ch / 2, 0);
      chimney.castShadow = true;
      group.add(chimney);
    }
    if (hasGarage)  addSingleGarage(group, W, wallMat, roofMat, garageSide);
    if (hasPorch)   addPorch(group, W, D, H, roofMat);
  }

  // ── bungalow ──────────────────────────────────────────────────────────────
  else if (style === 'bungalow') {
    const W  = 7   + sr('bw')  * 3;     // 7-10, wide single storey
    const D  = 5.5 + sr('bd')  * 2;
    const H  = 2.5 + sr('bh')  * 1.0;  // low
    const RH = 1.2 + sr('brh') * 0.5;
    const zf = -D / 2 - 0.12;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
    walls.position.y = H / 2;
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    const roof = new THREE.Mesh(makeGabledRoof(W, D, H, RH, 0.6), roofMat);
    roof.castShadow = true;
    group.add(roof);

    const dh = 2.0;
    const dxOff = (sr('bdx') - 0.5) * W * 0.3;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, dh, 0.1), doorMat);
    door.position.set(dxOff, dh / 2, -D / 2 - 0.05);
    group.add(door);

    // Spread 3-4 windows along wide front, skipping space near door
    const winCount = 3 + Math.floor(sr('bwc') * 2);
    const spacing  = W / (winCount + 1);
    for (let i = 0; i < winCount; i++) {
      const wx = -W / 2 + spacing * (i + 1);
      if (Math.abs(wx - dxOff) > 0.9) addWin(wx, H * 0.58, zf, 1.0, 0.85);
    }

    if (hasChimney) {
      const ch = 1.0 + sr('chl') * 0.4;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, ch, 0.55), chimneyMat);
      chimney.position.set((sr('chx') - 0.5) * W * 0.4, H + RH * 0.5 + ch / 2, 0);
      chimney.castShadow = true;
      group.add(chimney);
    }
    if (hasGarage) addSingleGarage(group, W, wallMat, roofMat, garageSide);
    if (hasPorch)  addPorch(group, W, D, H, roofMat);
  }

  // ── double (large 2-storey detached) ──────────────────────────────────────
  else if (style === 'double') {
    const W  = 6.5 + sr('dw')  * 2;    // 6.5-8.5
    const D  = 5.5 + sr('dd')  * 1.5;
    const H1 = 3.0 + sr('dh1') * 0.5;  // ground floor
    const H2 = 2.8 + sr('dh2') * 0.4;  // upper floor
    const H  = H1 + H2;
    const RH = 2.2 + sr('drh') * 0.6;
    const zf = -D / 2 - 0.12;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
    walls.position.y = H / 2;
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    // String course between floors
    const ledge = new THREE.Mesh(
      new THREE.BoxGeometry(W + 0.1, 0.18, D + 0.1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
    );
    ledge.position.y = H1;
    group.add(ledge);

    const roof = new THREE.Mesh(makeGabledRoof(W, D, H, RH), roofMat);
    roof.castShadow = true;
    group.add(roof);

    const dh = 2.3;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, dh, 0.1), doorMat);
    door.position.set(0, dh / 2, -D / 2 - 0.05);
    group.add(door);

    // Wide flanking ground-floor windows
    for (const sx of [-1, 1]) addWin(sx * (W / 2 - 1.1), H1 * 0.52, zf, 1.0, 1.1);
    // Row of upper windows
    const upN = W > 7.5 ? 4 : 3;
    const upSp = W / (upN + 1);
    for (let i = 0; i < upN; i++) addWin(-W / 2 + upSp * (i + 1), H1 + H2 * 0.52, zf, 0.9, 0.95);

    if (hasChimney || sr('dchi') > 0.3) {
      const ch = 1.8 + sr('chl') * 0.5;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, ch, 0.6), chimneyMat);
      chimney.position.set((sr('chx') - 0.5) * W * 0.35, H + RH * 0.4 + ch / 2, 0);
      chimney.castShadow = true;
      group.add(chimney);
    }
    if (hasDblGar)       addDoubleGarage(group, W, wallMat, roofMat, garageSide);
    else if (hasGarage)  addSingleGarage(group, W, wallMat, roofMat, garageSide);
    if (hasPorch)        addPorch(group, W, D, H, roofMat);
  }

  // ── tall (3-storey Victorian/Edwardian) ───────────────────────────────────
  else if (style === 'tall') {
    const W  = 4   + sr('tw')  * 1.5;  // narrower, 4-5.5
    const D  = 4.5 + sr('td')  * 1.5;
    const FL = 2.8 + sr('tfh') * 0.4;  // per-floor height
    const H  = FL * 3;
    const RH = 2.5 + sr('trh') * 0.8;  // steep
    const zf = -D / 2 - 0.12;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat);
    walls.position.y = H / 2;
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    // Horizontal string courses between each floor
    const ledgeMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
    for (const fy of [FL, FL * 2]) {
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.08, 0.14, D + 0.08), ledgeMat);
      ledge.position.y = fy;
      group.add(ledge);
    }

    const roof = new THREE.Mesh(makeGabledRoof(W, D, H, RH, 0.4), roofMat);
    roof.castShadow = true;
    group.add(roof);

    // Tall panelled door
    const dh = 2.45;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.88, dh, 0.1), doorMat);
    door.position.set(0, dh / 2, -D / 2 - 0.05);
    group.add(door);

    // Two tall sash windows per floor
    for (let fl = 0; fl < 3; fl++) {
      const fy = FL * fl + FL * 0.55;
      for (const sx of [-1, 1]) addWin(sx * W * 0.28, fy, zf, 0.72, 1.12);
    }

    // Chimney stack — tall houses always have one
    const ch = 2.0 + sr('chl') * 0.6;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, ch, 0.55), chimneyMat);
    chimney.position.set((sr('chx') - 0.5) * W * 0.3, H + RH * 0.5 + ch / 2, 0);
    chimney.castShadow = true;
    group.add(chimney);

    // Canopy/hood over door instead of full porch
    if (hasPorch) {
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.1, 0.85), roofMat);
      canopy.position.set(0, dh + 0.12, -D / 2 - 0.47);
      group.add(canopy);
    }
  }

  // ── semi-detached ─────────────────────────────────────────────────────────
  else {
    const UW = 3.8 + sr('sw')  * 1.2;  // per-unit width
    const D  = 5   + sr('sd')  * 2;
    const H  = 5   + sr('sh')  * 1.5;
    const RH = 2   + sr('srh') * 0.6;
    const TW = UW * 2;
    const zf = -D / 2 - 0.12;

    const walls = new THREE.Mesh(new THREE.BoxGeometry(TW, H, D), wallMat);
    walls.position.y = H / 2;
    walls.castShadow = walls.receiveShadow = true;
    group.add(walls);

    // Party-wall line on front face
    const divider = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, H, 0.08),
      new THREE.MeshLambertMaterial({ color: 0xbbbbbb }),
    );
    divider.position.set(0, H / 2, -D / 2 - 0.04);
    group.add(divider);

    const roof = new THREE.Mesh(makeGabledRoof(TW, D, H, RH), roofMat);
    roof.castShadow = true;
    group.add(roof);

    // One door per unit, each offset toward party wall
    const dh   = 2.2;
    const dxOff = UW * 0.22;
    for (const sx of [-1, 1]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.85, dh, 0.1), doorMat);
      door.position.set(sx * (UW / 2 - dxOff), dh / 2, -D / 2 - 0.05);
      group.add(door);
    }

    // Windows per unit
    for (const sx of [-1, 1]) {
      const bx = sx * UW / 2;
      // Ground floor: wide window beside door
      addWin(bx + sx * UW * 0.32, H * 0.32, zf, 1.1, 1.05);
      // Upper floor centre
      addWin(bx, H * 0.72, zf, 0.9, 0.9);
      // Upper floor flanking (if wide enough)
      if (sr(`swf${sx}`) > 0.4) addWin(bx + sx * UW * 0.28, H * 0.72, zf, 0.75, 0.75);
    }

    // Chimney per unit (independent probability)
    for (const sx of [-1, 1]) {
      if (subRand(seed, `chi${sx}`) > 0.35) {
        const ch = 1.5 + sr('chl') * 0.5;
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, ch, 0.5), chimneyMat);
        chimney.position.set(sx * TW * 0.38, H + RH * 0.4 + ch / 2, 0);
        chimney.castShadow = true;
        group.add(chimney);
      }
    }

    if (hasGarage) addSingleGarage(group, TW, wallMat, roofMat, garageSide);
  }

  return group;
}

/** Approximate footprint (world units) of the house returned by createLowLodHouse. */
export function houseFootprint(seed: number, scale = 1): { width: number; depth: number } {
  const sr = (s: string) => subRand(seed, s);
  const style = pickStyle(seed);

  let baseW: number, depth: number, garW = 0;
  switch (style) {
    case 'standard':
      baseW = 4 + sr('sw') * 2;
      depth = 5 + sr('sd') * 2;
      if (sr('garage') > 0.45) garW = 3.7;
      break;
    case 'bungalow':
      baseW = 7 + sr('bw') * 3;
      depth = 5.5 + sr('bd') * 2;
      if (sr('garage') > 0.45) garW = 3.7;
      break;
    case 'double':
      baseW = 6.5 + sr('dw') * 2;
      depth = 5.5 + sr('dd') * 1.5;
      if (sr('dblgarage') > 0.5) garW = 6.3;
      else if (sr('garage') > 0.45) garW = 3.7;
      break;
    case 'tall':
      baseW = 4 + sr('tw') * 1.5;
      depth = 4.5 + sr('td') * 1.5;
      break;
    default: // semi
      baseW = (3.8 + sr('sw') * 1.2) * 2;
      depth = 5 + sr('sd') * 2;
      if (sr('garage') > 0.45) garW = 3.7;
      break;
  }

  return {
    width: (baseW + garW) * scale,
    depth: depth * scale,
  };
}
