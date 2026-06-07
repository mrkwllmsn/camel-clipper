import * as THREE from 'three';
import { getMaterial } from '../utils/Constants';
import { mulberry32, deriveSeed } from '../utils/SeededRNG';

interface PersonParts {
  group: THREE.Group;
  armR:  THREE.Mesh;
  head:  THREE.Mesh;
}

// Idle wander state — the figure ambles toward a target, pauses, picks another.
interface Wander {
  tgtX:   number;
  tgtZ:   number;
  pause:  number;   // seconds left standing still before moving again
  phase:  number;   // personal animation phase offset
}

// Roomy bounds the couple potter about within (in front of / beside the garden).
// Keep the couple on their own side of the garden (right of the play area,
// which spans x −5.5…+5.5) and a little nearer the camera, so their speech
// bubble never drifts over Tom and the hedge.
const WANDER = { X_MIN: 6.2, X_MAX: 9, Z_MIN: 2.0, Z_MAX: 4.0 };

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function newWanderTarget(w: Wander): void {
  w.tgtX  = rand(WANDER.X_MIN, WANDER.X_MAX);
  w.tgtZ  = rand(WANDER.Z_MIN, WANDER.Z_MAX);
  w.pause = rand(1.5, 4.0);
}

const BODY_COLOURS = [0x6b7a8d, 0x8b5e8b, 0x5e8b6b, 0xb06040, 0x4a6fa5, 0xb04060, 0x7a8b5e, 0xa07040];
const HAT_COLOURS  = [0x3a3a3a, 0x9b7b4a, 0x5c3a1e, 0x6b4e71, 0x2e5b3a, 0x8b3a3a, 0x1a3a5c, 0x6b6b3a];
const LEG_COLOURS  = [0x2a3060, 0x3d2a1e, 0x1e3d2a, 0x4a3a2a, 0x2a2a4a, 0x3a2a3a, 0x1e2a3d, 0x3a3a2a];


function pickIdx(r: () => number, arr: unknown[]): number { return Math.floor(r() * arr.length); }

function buildPerson(
  bodyColor: number, skinColor: number, hatColor: number, legColor: number, heightScale: number
): PersonParts {
  const g = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.0, 0.3), getMaterial(bodyColor));
  body.position.y = 0.85;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.38), getMaterial(skinColor));
  head.position.y = 1.55;
  head.castShadow = true;
  g.add(head);

  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.52), getMaterial(hatColor));
  hat.position.y = 1.85;
  hat.castShadow = true;
  g.add(hat);

  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), getMaterial(bodyColor));
  armL.position.set(-0.35, 0.8, 0);
  armL.rotation.z = 0.18;
  armL.castShadow = true;
  g.add(armL);

  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.6, 0.2), getMaterial(bodyColor));
  armR.position.set(0.35, 0.8, 0);
  armR.rotation.z = -0.18;
  armR.castShadow = true;
  g.add(armR);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), getMaterial(legColor));
    leg.position.set(side * 0.14, 0.3, 0);
    leg.castShadow = true;
    g.add(leg);
  }

  g.scale.y = heightScale;

  return { group: g, armR, head };
}

export class OldCouple {
  group: THREE.Group;
  private _manParts:   PersonParts;
  private _womanParts: PersonParts;
  private _manWander:   Wander;
  private _womanWander: Wander;
  private _t          = 0;
  private _impatient  = false;

  // Reused scratch vector so the speech-bubble getter allocates nothing.
  private _headWorld = new THREE.Vector3();

  constructor(levelSeed = 0) {
    this.group = new THREE.Group();

    const sessionSeed = (Date.now() + levelSeed) & 0xffffffff;
    const rMan   = mulberry32(deriveSeed(sessionSeed, 'man'));
    const rWoman = mulberry32(deriveSeed(sessionSeed, 'woman'));

    this._manParts   = buildPerson(
      BODY_COLOURS[pickIdx(rMan,   BODY_COLOURS)],
      0xf0d8c0,
      HAT_COLOURS [pickIdx(rMan,   HAT_COLOURS)],
      LEG_COLOURS [pickIdx(rMan,   LEG_COLOURS)],
      0.92 + rMan() * 0.2,
    );
    this._womanParts = buildPerson(
      BODY_COLOURS[pickIdx(rWoman, BODY_COLOURS)],
      0xf5e0c5,
      HAT_COLOURS [pickIdx(rWoman, HAT_COLOURS)],
      LEG_COLOURS [pickIdx(rWoman, LEG_COLOURS)],
      0.85 + rWoman() * 0.18,
    );

    this._manParts.group.position.set(7.5, 0, 1.0);
    this._womanParts.group.position.set(8.7, 0, 0.8);

    this._manWander   = { tgtX: 7.5, tgtZ: 1.0, pause: 0, phase: 0   };
    this._womanWander = { tgtX: 8.7, tgtZ: 0.8, pause: 0, phase: 1.1 };

    this.group.add(this._manParts.group, this._womanParts.group);
  }

  setImpatient(v: boolean): void { this._impatient = v; }

  // Send the couple ambling over to stand and admire freshly trimmed work,
  // flanking `centerX` just in front of the hedge. The long pause keeps them
  // contentedly put for the duration of the curtain-call sweep.
  gatherNear(centerX: number): void {
    this._impatient = false;
    this._manWander.tgtX   = centerX - 1.1;
    this._manWander.tgtZ   = 2.6;
    this._manWander.pause  = 999;
    this._womanWander.tgtX = centerX + 1.1;
    this._womanWander.tgtZ = 2.9;
    this._womanWander.pause = 999;
  }

  // Live world position of the man's head — the speech bubble anchors here as
  // the couple wander about. Returns a reused vector (do not retain).
  get headWorld(): THREE.Vector3 {
    this._manParts.head.getWorldPosition(this._headWorld);
    return this._headWorld;
  }

  // Amble one figure toward its target, repick on arrival or after a pause.
  private _wander(p: PersonParts, w: Wander, speed: number, dt: number): void {
    const g = p.group;
    const dx = w.tgtX - g.position.x;
    const dz = w.tgtZ - g.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 0.08) {
      // Arrived — stand and dawdle, then choose somewhere new.
      w.pause -= dt;
      if (w.pause <= 0) newWanderTarget(w);
    } else {
      const step = Math.min(speed * dt, dist);
      g.position.x += (dx / dist) * step;
      g.position.z += (dz / dist) * step;
      // Face roughly the direction of travel.
      g.rotation.y = Math.atan2(dx, dz);
    }
  }

  update(dt: number): void {
    this._t += dt;

    // Impatient = bustle about faster and wave; content = gentle potter.
    const speed = this._impatient ? 1.6 : 0.7;
    this._wander(this._manParts,   this._manWander,   speed,        dt);
    this._wander(this._womanParts, this._womanWander, speed * 0.85, dt);

    if (this._impatient) {
      const wave = Math.sin(this._t * 5.5);
      this._manParts.armR.rotation.z   = -0.4 - wave * 0.55;
      this._womanParts.armR.rotation.z = -0.35 + wave * 0.4;
    } else {
      this._manParts.armR.rotation.z   = -0.18;
      this._womanParts.armR.rotation.z = -0.18;
    }

    // Gentle head nod
    this._manParts.head.rotation.x   = Math.sin(this._t * 0.9) * 0.06;
    this._womanParts.head.rotation.x = Math.sin(this._t * 1.1 + 0.8) * 0.06;

    // Subtle idle weight-shift bob (offset so they're out of phase)
    this._manParts.group.position.y   = Math.abs(Math.sin(this._t * 1.2)) * 0.03;
    this._womanParts.group.position.y = Math.abs(Math.sin(this._t * 1.2 + 1.1)) * 0.03;
  }
}
