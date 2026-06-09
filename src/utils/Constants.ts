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
  onToolTier?:        (tier: number, name: string) => void;
  onHeat?:            (heat: number, overheated: boolean) => void;
  onIntroCaption?:    (text: string | null) => void;
}

export const TOOL_NAMES = ['Manual Shears', 'Sharp Shears', 'Power Shears', 'Hedge Trimmer', 'Laser Shears', 'Hedge Rover'] as const;
export type ToolTier = 0 | 1 | 2 | 3 | 4 | 5;

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
  ROVER: {
    ACCEL:               48,    // units/s² acceleration — snappy throttle response
    FRICTION:             5,    // velocity damping factor per second
    MAX_SPEED:           24,    // max speed units/s — zippy top end
    SNIP_COOLDOWN:        0.15, // seconds between auto-snips
    HEAT_PER_SNIP:        0.05, // heat gained per snip (~20 snips to overheat)
    HEAT_DISSIPATE:       0.20, // heat lost per second while not snipping
    OVERHEAT_COOLDOWN:    2.0,  // seconds stopped while cooling down
    JUMP_SPEED:          12,    // initial upward velocity on Space jump (u/s)
    JUMP_CLEAR_HEIGHT:    1.0,  // posY above which rover clears the couple (no collision)
    GRAVITY:             26,    // downward accel applied to jump (u/s²)
    // Tall-pillar mechanic: some hedge segments are raised into tall topiary
    // pillars the grounded blade can't reach — the rover must jump to cut them.
    TALL_SCALE:           1.7,  // vertical scale applied to tall segments
    REACH_HEIGHT:         1.4,  // posY the rover must exceed to snip a tall segment
    GROUND_REACH:         0.7,  // posY the rover must be under to snip a short segment
    COLLISION_RADIUS:     1.1,  // rover-couple collision distance
    PATIENCE_PENALTY:     0.10, // patience lost on collision
    // Rover cuts far slower than fast-tier manual snipping, so the normal spiral
    // drain (tuned for rapid overgrown knock-down) is unsurvivable here. Give rover
    // levels their own gentle base drain and heavily damp the spiral term.
    PATIENCE_SECONDS:    120,    // base drain denominator (gentler than ~45s normal)
    SPIRAL_MULT:          0.2,   // scale the per-overgrown spiral drain down
    CROSS_INTERVAL_MIN:   8,    // min seconds between couple crossings
    CROSS_INTERVAL_MAX:  14,    // max seconds between couple crossings
  },
} as const;

// Per-level difficulty. level starts at 1; everything ramps then plateaus so a
// long endless run stays playable rather than becoming impossible.
export interface LevelConfig {
  count:           number;     // hedge segments
  overgrownCount:  number;     // how many start overgrown
  regrowDelay:     number;     // sec dormant after a snip before regrowing
  regrowDuration:  number;     // sec flat → fully overgrown
  patienceSeconds: number;     // base patience drain denominator
  perOvergrown:    number;     // extra drain rate per fully overgrown segment
  camelSpeed:      number;     // units/sec — ramps so a longer hedge stays coverable
  maxRegrowing:    number;     // max segments allowed to regrow simultaneously
  toolTier:        ToolTier;   // 0=manual, 1=sharp, 2=power, 3=trimmer
  snipInterval:    number;     // sec between auto-snips when space held (0 = one-shot only)
  tallFraction:    number;     // fraction of segments raised into tall pillars (rover mode only)
}

// snipInterval (seconds) per tool tier when holding the snip button. Tier 5 = rover (unused, auto-snip).
const SNIP_INTERVALS: [number, number, number, number, number, number] = [0, 0.35, 0.18, 0.06, 0.025, 0];

export function getLevelConfig(level: number): LevelConfig {
  const L = Math.max(1, level) - 1;  // 0-based step
  const count = Math.min(12 + Math.floor(L / 3) * 4, 40);
  // Difficulty keeps climbing past L8 (where count/speed cap out) via a rising
  // overgrown FRACTION, faster regrowth, and tighter patience — so the run never
  // plateaus. Spiral drain is normalized to the fraction overgrown (see below).
  const frac = Math.min(0.5 + L * 0.025, 0.85);   // 50%→85% of board overgrown
  // Tool tier unlocks: L6=lvl7, L10=lvl11, L14=lvl15, L18=lvl19 (L is 0-based).
  const toolTier = (L < 6 ? 0 : L < 10 ? 1 : L < 14 ? 2 : L < 18 ? 3 : L < 22 ? 4 : 5) as ToolTier;
  return {
    count,
    overgrownCount:  Math.min(Math.round(count * frac), count - 1),
    regrowDelay:     Math.max(5 - L * 0.2, 2),    // L1=5s → floors at 2s (~L15)
    regrowDuration:  Math.max(10 - L * 0.4, 5),   // L1=10s → floors at 5s (~L12)
    patienceSeconds: Math.max(75 - L * 4, 45),    // 75 → floors at 45s (~L8)
    // overgrownCount*perOvergrown = frac*(0.050 + 0.002L): independent of board
    // size, rises with both level and how full the board is (Beer Tapper spiral).
    perOvergrown:    (0.050 + L * 0.002) / count,
    camelSpeed:      Math.min(5.0 + L * 1.6, 13),
    maxRegrowing:    level,  // L1=1, L2=2, ... grows with player progression
    toolTier,
    snipInterval:    SNIP_INTERVALS[toolTier],
    // Rover levels mix in tall pillars the player must jump to reach; ramps with level.
    tallFraction:    toolTier >= 5 ? Math.min(0.3 + (L - 22) * 0.02, 0.55) : 0,
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
