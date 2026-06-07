import * as THREE from 'three';

export interface InputState {
  moveX:      number;
  moveY:      number;
  shoot:      boolean;
  launch:     boolean;
  start:      boolean;
  pause:      boolean;
  actionHeld: boolean;
}

export interface GameCallbacks {
  onScore?:           (score: number) => void;
  onStateChange?:     (state: string) => void;
  onPause?:           (paused: boolean) => void;
  onPatience?:        (p: number) => void;
  onProgress?:        (trimmed: number, total: number) => void;
  onCoupleScreenPos?: (x: number, y: number) => void;
  onAimScreenPos?:    (x: number, y: number, snippable: boolean) => void;
  onLevel?:           (level: number) => void;
  onLevelCleared?:    (level: number) => void;
  onHighScore?:       (hiScore: number, highestLevel: number) => void;
  onLevelBonus?:      (bonus: number, total: number) => void;
  onCutscenePhase?:   (phase: string) => void;
  onLoadProgress?:    (loaded: number, total: number) => void;
  onLoadComplete?:    () => void;
}

export const COLORS = {
  sky:          0x87ceeb,
  ground:       0x3a7a2a,
  hedgeNormal:  0x2d6e22,
  hedgeGrown:   0x5cb84a,
  cottage:      0xc8b89a,
  cottageRoof:  0x6b3a2a,
  hud:          0xffffff,
} as const;

export const GAME_STATES = {
  MENU:      'MENU',
  PLAYING:   'PLAYING',
  CUTSCENE:  'CUTSCENE',
  WIN:       'WIN',
  GAME_OVER: 'GAME_OVER',
} as const;

export const GAME_CONFIG = {
  TIMESTEP: 1 / 60,
  GROUND_Y: 0,
  HEDGE: {
    COUNT:             12,
    SEG_WIDTH:         0.92,
    SEG_STEP:          1.0,
    SEG_HEIGHT:        2.5,
    SEG_HEIGHT_GROWN:  3.1,
    SEG_DEPTH:         0.7,
    START_X:           -5.5,
    OVERGROWN_COUNT:   6,
    REGROWTH_DELAY:    8,   // seconds dormant after snip before regrowing
    REGROWTH_DURATION: 12,  // seconds to grow from flat to fully overgrown
  },
  CAMEL: {
    SPEED: 5.0,
    X_MIN: -7.5,
    X_MAX:  7.5,
    Z:      1.8,
  },
  PATIENCE_BASE_SECONDS:  120,    // base drain — slower than before
  PATIENCE_PER_OVERGROWN: 0.006,  // extra drain rate added per fully overgrown segment
  TARGET_SNIPS:           20,     // reach this score to win
  SCORE: {
    PER_SNIP:       100,   // base points per snip, multiplied by level
    BONUS_MAX:      1000,  // max time bonus per level clear (at full patience)
  },
  CAMERA: {
    LOOKAHEAD:      2.5,   // units the camera leads ahead in the move direction
    FOLLOW_EASE:    3.0,   // higher = snappier follow
    VISIBLE_HALF_X: 9.0,   // approx half-width visible at z=0 (z=12 / FOV55 rig)
    BOUND_MARGIN:   1.5,   // let the camera overshoot the visible edge slightly
  },
} as const;

// Per-level difficulty. level starts at 1; everything ramps then plateaus so a
// long endless run stays playable rather than becoming impossible.
export interface LevelConfig {
  count:           number;  // hedge segments
  overgrownCount:  number;  // how many start overgrown
  regrowDelay:     number;  // sec dormant after a snip before regrowing
  regrowDuration:  number;  // sec flat → fully overgrown
  patienceSeconds: number;  // base patience drain denominator
  perOvergrown:    number;  // extra drain rate per fully overgrown segment
  camelSpeed:      number;  // units/sec — ramps so a longer hedge stays coverable
}

export function getLevelConfig(level: number): LevelConfig {
  const L = Math.max(1, level) - 1;  // 0-based step
  const count = Math.min(12 + L * 4, 40);
  return {
    count,
    overgrownCount:  Math.min(Math.round(count * 0.5), count - 1),  // fixed 50%, no extra per level
    regrowDelay:     Math.max(18 - L * 0.6, 10),  // L1=18s, L5=15.6s, floors at 10s
    regrowDuration:  Math.max(14 - L * 0.6, 8),   // L1=14s, L5=11.6s, floors at 8s
    patienceSeconds: Math.max(120 - L * 5, 90),   // gentle drop: 120→115→110→105…→90
    perOvergrown:    0.004 + L * 0.0004,           // tiny per-level bump: 0.004→0.0044→0.0048…
    camelSpeed:      Math.min(5.0 + L * 1.8, 14),
  };
}

const _matCache = new Map<number, THREE.MeshLambertMaterial>();

export function getMaterial(colorHex: number): THREE.MeshLambertMaterial {
  let m = _matCache.get(colorHex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: colorHex });
    _matCache.set(colorHex, m);
  }
  return m;
}
