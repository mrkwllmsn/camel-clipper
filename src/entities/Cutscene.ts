import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type CutscenePhase =
  | 'pan'        // wide shot — Tom beside parked car at old garden
  | 'gettin-in'  // Tom climbs in
  | 'depart'     // car drives right away from old garden
  | 'turn'       // car stopped at far end; U-turns; level rebuild fires here
  | 'return'     // car drives left back to new garden
  | 'settle'     // camera eases to pan-in start
  | 'done';

// Street is in FRONT of the hedge (hedge z=0, camera z=12) — car can never clip scenery.
export const ROAD_Z = 11.0;

// Beat boundaries in seconds
export const CS_BEATS = {
  panEnd:     2.2,
  getDinEnd:  3.0,
  departEnd:  6.5,
  turnEnd:    7.4,
  returnEnd:  11.0,
  total:      12.2,
} as const;

const SS = (t: number) => t * t * (3 - 2 * t);
const TRAVEL = 38;   // how far right the car drives before turning around

export class Cutscene {
  readonly group:       THREE.Group;
  readonly roadStartX:  number;

  private _t             = 0;
  private _carGroup      = new THREE.Group();  // handles world position
  private _carModel      = new THREE.Group();  // handles model rotation (child of _carGroup)
  private _standingCamel = new THREE.Group();

  done = false;
  private _onLoaded: (() => void) | null = null;

  constructor(roadStartX: number, onLoaded?: () => void) {
    this.roadStartX = roadStartX;
    this._onLoaded  = onLoaded ?? null;
    this.group      = new THREE.Group();

    this._buildBackground(roadStartX);

    // _carModel is a child of _carGroup so we can rotate the model independently
    this._carModel.rotation.y = 0;   // car front faces −X (heading left on depart)
    this._carGroup.add(this._carModel);
    this._carGroup.position.set(roadStartX, 0, ROAD_Z);
    this.group.add(this._carGroup);

    // Standing camel beside car on the garden side (right / +X)
    this._standingCamel.position.set(1.8, 0, 0.4);
    this._carGroup.add(this._standingCamel);

    void this._loadAssets();
  }

  // ── Background scenery: hills + roadside trees to fill the horizon ──────────

  private _buildBackground(startX: number): void {
    // Hills, extended ground and scattered trees now live in Game.ts as permanent
    // scene geometry so they're always visible (not just during cutscene).
    // Only the roadside kerb trees are cutscene-specific (they follow startX).
    const trunkMat   = new THREE.MeshLambertMaterial({ color: 0x5c3a1a });
    const leafPalette = [0x2d6e22, 0x3a7a2a, 0x2a6020, 0x4a8a30, 0x3d7825];
    const roadsideDefs = [
      { ox:  -5, s: 1.0 }, { ox: -11, s: 1.2 }, { ox: -17, s: 0.9 },
      { ox: -23, s: 1.1 }, { ox: -29, s: 1.3 }, { ox: -35, s: 0.95 },
      { ox: -41, s: 1.15 }, { ox: -47, s: 1.0 }, { ox: -53, s: 1.2 },
    ];
    for (let i = 0; i < roadsideDefs.length; i++) {
      const { ox, s } = roadsideDefs[i];
      const leafMat = new THREE.MeshLambertMaterial({ color: leafPalette[i % leafPalette.length] });
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 6), trunkMat);
      trunk.position.y = 0.9;
      g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 5), leafMat);
      leaves.scale.set(1, 1.25, 1);
      leaves.position.y = 2.5;
      g.add(leaves);
      g.scale.setScalar(s);
      g.position.set(startX + ox, 0, ROAD_Z + 4.8);
      this.group.add(g);
    }
  }

  // ── GLB loading ──────────────────────────────────────────────────────────

  private async _loadAssets(): Promise<void> {
    const loader = new GLTFLoader();
    await Promise.all([this._loadCar(loader), this._loadCamel(loader)]);
    this._onLoaded?.();
  }

  private async _loadCar(loader: GLTFLoader): Promise<void> {
    try {
      const gltf  = await loader.loadAsync(`${import.meta.env.BASE_URL}models/car.glb`);
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      const s     = 2.2 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);
      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      model.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        if (mat) { mat.metalness = 0.05; mat.roughness = 0.8; }
      });
      this._carModel.add(model);
    } catch {
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.1, 1.2),
        new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
      );
      ph.position.y = 0.55;
      this._carModel.add(ph);
    }
  }

  private async _loadCamel(loader: GLTFLoader): Promise<void> {
    try {
      const gltf  = await loader.loadAsync(`${import.meta.env.BASE_URL}models/camel_standing_decimated.glb`);
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      const s     = 2.8 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);
      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -box.min.y, -center.z);
      model.traverse(c => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat?.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        if (mat) { mat.metalness = 0.05; mat.roughness = 0.8; }
      });
      this._standingCamel.add(model);
    } catch {
      const ph = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 2.8, 0.65),
        new THREE.MeshLambertMaterial({ color: 0xd4a853 }),
      );
      ph.position.y = 1.4;
      this._standingCamel.add(ph);
    }
  }

  // ── Public interface ──────────────────────────────────────────────────────

  get t():    number { return this._t; }
  get carX(): number { return this._carGroup.position.x; }

  get phase(): CutscenePhase {
    const { panEnd, getDinEnd, departEnd, turnEnd, returnEnd, total } = CS_BEATS;
    if (this._t < panEnd)    return 'pan';
    if (this._t < getDinEnd) return 'gettin-in';
    if (this._t < departEnd) return 'depart';
    if (this._t < turnEnd)   return 'turn';
    if (this._t < returnEnd) return 'return';
    if (this._t < total)     return 'settle';
    return 'done';
  }

  update(dt: number): void {
    this._t += dt;
    const { getDinEnd, departEnd, turnEnd, returnEnd } = CS_BEATS;
    const { roadStartX } = this;

    if (this._t >= getDinEnd) {
      this._standingCamel.visible = false;
    }

    // Depart: x = roadStartX → roadStartX − TRAVEL, front faces −X
    if (this._t >= getDinEnd && this._t < departEnd) {
      const p = (this._t - getDinEnd) / (departEnd - getDinEnd);
      this._carGroup.position.x  = roadStartX - TRAVEL * SS(p);
      this._carModel.rotation.y  = 0;
    }

    // Turn: stationary U-turn, rotation sweeps 0 → Math.PI
    if (this._t >= departEnd && this._t < turnEnd) {
      const p = (this._t - departEnd) / (turnEnd - departEnd);
      this._carGroup.position.x  = roadStartX - TRAVEL;
      this._carModel.rotation.y  = Math.PI * SS(p);
    }

    // Return: x = roadStartX − TRAVEL → roadStartX, front faces +X (approaching from left)
    if (this._t >= turnEnd && this._t < returnEnd) {
      const p = (this._t - turnEnd) / (returnEnd - turnEnd);
      this._carGroup.position.x  = roadStartX - TRAVEL * (1 - SS(p));
      this._carModel.rotation.y  = Math.PI;
    }

    if (this._t >= returnEnd) {
      this._carGroup.position.x  = roadStartX;
      this._carModel.rotation.y  = Math.PI;
    }

    if (this._t >= CS_BEATS.total) this.done = true;
  }

  dispose(): void {
    this.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }
}
