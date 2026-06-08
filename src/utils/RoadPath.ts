import * as THREE from 'three';

// World Z of road centre — must match ROAD_Z in Cutscene.ts
const ROAD_Z = 11.0;

// World X bounds of the straight section.
export const ROAD_BEND_START_X = -68;  // left bend begins here (curves +Z, away from camera)
export const ROAD_BEND_END_X   =  68;  // right bend begins here (curves -Z, toward camera)

// Control points (world_x, world_z).
// Right end bends into -Z, left end bends into +Z; straight section in the middle.
const CP: [number, number][] = [
  [  91, ROAD_Z - 120],
  [  87, ROAD_Z -  78],
  [  81, ROAD_Z -  42],
  [  74, ROAD_Z -  16],
  [  68, ROAD_Z      ],  // right bend end / straight start
  [   0, ROAD_Z      ],
  [ -68, ROAD_Z      ],  // straight end / left bend start
  [ -74, ROAD_Z +  16],
  [ -81, ROAD_Z +  42],
  [ -87, ROAD_Z +  78],
  [ -91, ROAD_Z + 120],
];

export function makeRoadCurve(): THREE.SplineCurve {
  return new THREE.SplineCurve(CP.map(([x, z]) => new THREE.Vector2(x, z)));
}

/**
 * Given a nominal world X and a perpendicular side offset (positive = far/+Z side,
 * negative = near/−Z side), return the adjusted world XZ position and rotation.y
 * for an object placed beside the road.
 *
 * @param samples  Arc-length-spaced samples from makeRoadCurve().getSpacedPoints(N)
 * @param worldX   Nominal world X (as if road were straight at z = ROAD_Z)
 * @param side     Perpendicular offset (e.g. +17 far side, −14 near side)
 */
export function roadSidePlacement(
  samples: THREE.Vector2[],
  worldX:  number,
  side:    number,
): { x: number; z: number; rotY: number } {
  // Straight section: analytical, no curve lookup needed
  if (worldX >= ROAD_BEND_START_X && worldX <= ROAD_BEND_END_X) {
    return {
      x:    worldX,
      z:    ROAD_Z + side,
      rotY: side > 0 ? 0 : Math.PI,
    };
  }

  // Curved section: find arc-length sample closest to worldX
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < samples.length; i++) {
    const d = Math.abs(samples[i].x - worldX);
    if (d < bestDist) { bestDist = d; best = i; }
  }

  const pt   = samples[best];
  const prev = samples[Math.max(best - 1, 0)];
  const next = samples[Math.min(best + 1, samples.length - 1)];

  // Finite-difference tangent (more reliable than getTangent on arc-length samples)
  const tx = next.x - prev.x, tz = next.y - prev.y;
  const tl = Math.sqrt(tx * tx + tz * tz) || 1;
  const tdx = tx / tl, tdz = tz / tl;

  // CW perpendicular of tangent → far/+Z side when road runs in −X direction
  const cx =  tdz;   // CW perp X
  const cz = -tdx;   // CW perp Z

  const sign   = side > 0 ? 1 : -1;
  const absOff = Math.abs(side);

  const hx = pt.x + sign * cx * absOff;
  const hz = pt.y + sign * cz * absOff;

  // rotation.y so house local −Z (front) faces toward road centre.
  // Three.js Ry(θ) front direction = (−sinθ, −cosθ) in XZ.
  // We want that to equal (−sign·cx, −sign·cz), so sinθ = sign·cx, cosθ = sign·cz.
  const rotY = Math.atan2(sign * cx, sign * cz);

  return { x: hx, z: hz, rotY };
}
