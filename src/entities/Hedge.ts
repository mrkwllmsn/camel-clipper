import * as THREE from 'three';
import { COLORS } from '../utils/Constants';
import { GAME_CONFIG, type LevelConfig } from '../utils/Constants';

// A single foliage blob within a segment. We bake two poses at build time —
// a tidy "neat" pose (clipped topiary) and a shaggy "wild" pose (overgrown) —
// and lerp between them by the segment's growth value `w` (0 = neat, 1 = wild).
interface Clump {
  mesh:      THREE.Mesh;
  neatPos:   THREE.Vector3;
  wildPos:   THREE.Vector3;
  neatScale: number;
  wildScale: number;
  wildRot:   THREE.Euler;
  swayPhase: number;
  swayAmt:   number;
}

export interface SegmentData {
  group:          THREE.Group;            // holds all clumps, positioned at centerX
  clumps:         Clump[];
  mat:            THREE.MeshLambertMaterial;
  isOvergrown:    boolean;
  isGrowing:      boolean;   // in active growth phase — snippable early for a point
  growthProgress: number;    // 0→1 during isGrowing
  regrowTimer:    number;    // >0 = dormant countdown after snip; -1 = idle
  graceTimer:     number;    // counts down from GRACE_PERIOD when growing starts; not snippable until 0
  wDisp:          number;    // displayed growth (smoothed toward target each frame)
  trimCount:      number;    // how many times this segment has been snipped this level
  centerX:        number;
  index:          number;
}

const _neatColor = new THREE.Color(COLORS.hedgeNormal);
const _wildColor = new THREE.Color(COLORS.hedgeGrown);

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class Hedge {
  group:    THREE.Group;
  segments: SegmentData[];
  readonly startX:   number;   // center X of segment 0 (hedge auto-centered on 0)
  private _regrowDelay:    number;
  private _regrowDuration: number;
  private _maxRegrowing:   number;
  private _t = 0;

  // Pool of organically perturbed blob geometries — avoids all blobs looking
  // like identical spheres while keeping the approach shader-free and cheap.
  private static _blobGeos: THREE.BufferGeometry[] = Hedge._makeBlobPool();

  private static _makeBlobPool(): THREE.BufferGeometry[] {
    const pool: THREE.BufferGeometry[] = [];
    for (let v = 0; v < 6; v++) {
      const geo = new THREE.IcosahedronGeometry(1, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const len = Math.sqrt(x * x + y * y + z * z);
        const nx = x / len, ny = y / len, nz = z / len;
        // Deterministic per-vertex hash seeded by variant index.
        const h = (Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + v * 43.3) * 43758.5) % 1;
        const disp = 0.8 + Math.abs(h) * 0.42;
        pos.setXYZ(i, nx * disp, ny * disp, nz * disp);
      }
      geo.computeVertexNormals();
      pool.push(geo);
    }
    return pool;
  }

  constructor(level: LevelConfig) {
    const cfg = GAME_CONFIG.HEDGE;
    this.group    = new THREE.Group();
    this.segments = [];
    this._regrowDelay    = level.regrowDelay;
    this._regrowDuration = level.regrowDuration;
    this._maxRegrowing   = level.maxRegrowing;

    // Center any-length hedge on x=0 → camera/scenery math stays symmetric.
    this.startX = -((level.count - 1) * cfg.SEG_STEP) / 2;

    const indices  = Array.from({ length: level.count }, (_, i) => i);
    const shuffled = [...indices].sort(() => Math.random() - 0.5);
    const grown    = new Set(shuffled.slice(0, level.overgrownCount));

    for (let i = 0; i < level.count; i++) {
      const isOvergrown = grown.has(i);
      const centerX     = this.startX + i * cfg.SEG_STEP;

      const segGroup = new THREE.Group();
      segGroup.position.set(centerX, 0, 0);

      const mat = new THREE.MeshLambertMaterial({
        color: isOvergrown ? _wildColor : _neatColor,
        flatShading: true,
      });

      const clumps = this._buildClumps(segGroup, mat);

      this.group.add(segGroup);
      this.segments.push({
        group: segGroup, clumps, mat,
        isOvergrown, isGrowing: false,
        growthProgress: 0, regrowTimer: -1, graceTimer: 0,
        wDisp: isOvergrown ? 1 : 0, trimCount: 0,
        centerX, index: i,
      });
    }

    // Apply initial pose so overgrown segments start shaggy, the rest tidy.
    for (const seg of this.segments) this._applyPose(seg);
  }

  // Build a cluster of blobs filling a tidy hedge block, each with a baked
  // "fanned out" wild pose so the bush bursts open when overgrown.
  private _buildClumps(parent: THREE.Group, mat: THREE.MeshLambertMaterial): Clump[] {
    const cfg = GAME_CONFIG.HEDGE;
    const halfW = cfg.SEG_WIDTH * 0.5;
    const halfD = cfg.SEG_DEPTH * 0.5;
    const clumps: Clump[] = [];

    // Structured grid of body clumps → continuous, full bush surface.
    const xs = [-halfW * 0.62, 0, halfW * 0.62];
    const zs = [-halfD * 0.55, halfD * 0.55];
    const ys = [0.5, 1.25, 2.0];           // three stacked layers up the height

    for (const y of ys) {
      const topLayer = y === ys[ys.length - 1];
      for (const x of xs) {
        for (const z of zs) {
          const neatPos = new THREE.Vector3(
            x + rand(-0.05, 0.05),
            y + rand(-0.05, 0.05),
            z + rand(-0.04, 0.04),
          );
          // Neat radius tuned so neighbours just overlap → smooth topiary block.
          const neatScale = rand(0.34, 0.4);

          // Wild pose: shove each blob outward from the centre column and up,
          // swell it, and twist it — the overgrown "fan out".
          const outX = (x === 0 ? rand(-0.18, 0.18) : Math.sign(x)) * rand(0.18, 0.34);
          const outZ = Math.sign(z) * rand(0.12, 0.26);
          const wildPos = neatPos.clone().add(new THREE.Vector3(
            outX,
            (topLayer ? rand(0.35, 0.7) : rand(0.05, 0.25)),
            outZ,
          ));
          const wildScale = neatScale * rand(1.2, 1.55);
          const wildRot = new THREE.Euler(rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.5, 0.5));

          clumps.push(this._makeClump(parent, mat, neatPos, wildPos, neatScale, wildScale, wildRot));
        }
      }
    }

    // Sprigs: invisible when neat, they shoot out only when overgrown to give
    // that unkempt, straggly silhouette.
    const sprigCount = 6;
    for (let s = 0; s < sprigCount; s++) {
      const baseY = rand(1.2, 2.3);
      const neatPos = new THREE.Vector3(rand(-halfW, halfW), baseY, rand(-halfD, halfD));
      const wildPos = neatPos.clone().add(new THREE.Vector3(
        rand(-0.5, 0.5),
        rand(0.4, 1.0),
        rand(-0.4, 0.4),
      ));
      const wildScale = rand(0.18, 0.3);
      const wildRot = new THREE.Euler(rand(-0.8, 0.8), rand(-0.8, 0.8), rand(-0.8, 0.8));
      clumps.push(this._makeClump(parent, mat, neatPos, wildPos, 0.001, wildScale, wildRot));
    }

    return clumps;
  }

  private _makeClump(
    parent: THREE.Group, mat: THREE.MeshLambertMaterial,
    neatPos: THREE.Vector3, wildPos: THREE.Vector3,
    neatScale: number, wildScale: number, wildRot: THREE.Euler,
  ): Clump {
    const geo = Hedge._blobGeos[Math.floor(Math.random() * Hedge._blobGeos.length)];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return {
      mesh, neatPos, wildPos, neatScale, wildScale, wildRot,
      swayPhase: rand(0, Math.PI * 2),
      swayAmt:   rand(0.01, 0.03),
    };
  }

  private _applyPose(seg: SegmentData, sway = 0): void {
    const w = seg.wDisp;
    for (const c of seg.clumps) {
      c.mesh.position.lerpVectors(c.neatPos, c.wildPos, w);
      const s = c.neatScale + (c.wildScale - c.neatScale) * w;
      c.mesh.scale.setScalar(s);
      c.mesh.rotation.set(c.wildRot.x * w, c.wildRot.y * w, c.wildRot.z * w);
      if (sway !== 0) {
        c.mesh.position.x += Math.sin(sway + c.swayPhase) * c.swayAmt * w;
        c.mesh.position.y += Math.cos(sway * 0.8 + c.swayPhase) * c.swayAmt * 0.5 * w;
      }
    }
    // Power curve on colour only: small w values read as much lighter so the
    // player notices a segment starting to grow well before it's fully wild.
    seg.mat.color.lerpColors(_neatColor, _wildColor, Math.pow(w, 0.35));
  }

  getSegmentAt(x: number): SegmentData | null {
    const thresh = GAME_CONFIG.HEDGE.SEG_STEP * 0.9;
    let best: SegmentData | null = null;
    let bestDist = thresh;
    for (const seg of this.segments) {
      const d = Math.abs(x - seg.centerX);
      if (d < bestDist) { bestDist = d; best = seg; }
    }
    return best;
  }

  // Schedule a snipped segment to regrow. Call immediately after snip().
  // Each prior snip this level raises the skip chance: 1st regrow=0%, 2nd=50%, 3rd+=85%.
  startGrowing(seg: SegmentData): void {
    const skipChance = seg.trimCount <= 1 ? 0 : seg.trimCount === 2 ? 0.50 : 0.85;
    if (skipChance > 0 && Math.random() < skipChance) return; // stays dormant
    seg.regrowTimer    = this._regrowDelay;
    seg.isGrowing      = false;
    seg.growthProgress = 0;
  }

  // Works on fully overgrown AND actively growing segments (early snip).
  snip(seg: SegmentData): void {
    seg.isOvergrown    = false;
    seg.isGrowing      = false;
    seg.growthProgress = 0;
    seg.regrowTimer    = -1;
    seg.graceTimer     = 0;
    seg.trimCount++;
    // wDisp eases back to 0 in update() for a satisfying "snap to neat".
  }

  isSnippable(seg: SegmentData): boolean {
    return seg.isOvergrown || (seg.isGrowing && seg.graceTimer <= 0);
  }

  update(dt: number): void {
    this._t += dt;

    for (const seg of this.segments) {
      // Advance growth state machine → compute the target growth value.
      let targetW: number;

      if (seg.isOvergrown) {
        targetW = 1;
      } else {
        if (seg.regrowTimer > 0) {
          seg.regrowTimer -= dt;
          if (seg.regrowTimer <= 0) {
            const growing = this.segments.filter(s => s.isGrowing).length;
            if (growing < this._maxRegrowing) {
              seg.regrowTimer = -1;
              seg.isGrowing   = true;
              seg.graceTimer  = 1.0;
            }
            // else: leave regrowTimer at 0 and retry next tick when a slot frees up
          }
        }
        if (seg.isGrowing) {
          if (seg.graceTimer > 0) seg.graceTimer = Math.max(0, seg.graceTimer - dt);
          seg.growthProgress = Math.min(1, seg.growthProgress + dt / this._regrowDuration);
          if (seg.growthProgress >= 1) {
            seg.isGrowing   = false;
            seg.isOvergrown = true;
          }
          targetW = seg.growthProgress;
        } else {
          targetW = 0;
        }
      }

      // Ease displayed growth toward target — fast snap when trimming, quicker
      // track when growing so the colour shift is immediately noticeable.
      const ease = targetW < seg.wDisp ? 10 : 8;
      seg.wDisp += (targetW - seg.wDisp) * Math.min(1, dt * ease);
      if (Math.abs(targetW - seg.wDisp) < 0.002) seg.wDisp = targetW;

      // Gentle sway only matters while there's foliage out (wDisp > 0).
      const sway = seg.wDisp > 0.01
        ? this._t * 1.4 + seg.index * 0.6
        : 0;
      this._applyPose(seg, sway);
    }
  }

  get overgrownCount(): number {
    return this.segments.filter(s => s.isOvergrown).length;
  }

  // True when no segment is overgrown or actively growing — board visually clear
  get allClear(): boolean {
    return !this.segments.some(s => s.isOvergrown || s.isGrowing);
  }

  // Count of segments needing attention (overgrown + actively growing)
  get activeCount(): number {
    return this.segments.filter(s => s.isOvergrown || s.isGrowing).length;
  }

  // Hedge extent along X (segment centers), used by camera/scenery framing.
  get leftX():     number { return this.startX; }
  get rightX():    number { return this.startX + (this.segments.length - 1) * GAME_CONFIG.HEDGE.SEG_STEP; }
  get halfWidth(): number { return (this.segments.length - 1) * GAME_CONFIG.HEDGE.SEG_STEP / 2; }

  // Freeze all growth — cancel timers, snap every segment to neat. Call on level-clear
  // so no bush pops back up during the admire / finish animation.
  freeze(): void {
    for (const seg of this.segments) {
      seg.isOvergrown    = false;
      seg.isGrowing      = false;
      seg.growthProgress = 0;
      seg.regrowTimer    = -1;
      seg.graceTimer     = 0;
      seg.wDisp          = 0;
    }
    for (const seg of this.segments) this._applyPose(seg);
  }

  // Release GPU resources for this hedge's segment materials (geometry is shared
  // and static, so it is intentionally NOT disposed here).
  dispose(): void {
    for (const seg of this.segments) seg.mat.dispose();
  }
}
