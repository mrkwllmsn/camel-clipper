import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GAME_CONFIG, GAME_STATES, COLORS, getMaterial, getLevelConfig, TOOL_NAMES, type GameCallbacks } from './utils/Constants';
import { Hedge } from './entities/Hedge';
import { Camel } from './entities/Camel';
import { Rover } from './entities/Rover';
import { CamelSitting } from './entities/CamelSitting';
import { OldCouple } from './entities/OldCouple';
import { LeafParticles } from './systems/LeafParticles';
import { LaserParticles } from './systems/LaserParticles';
import { makeGnome, makeBench, makeBirdbath, makeWheelbarrow, makeShrub, makeFlowerbed, makeScatterFlower, buildTreeInstances } from './entities/Decor';
import { createLowLodHouse } from './utils/HouseGenerator';
import InputManager from './systems/InputManager';
import GamepadManager from './systems/GamepadManager';
import TouchManager from './systems/TouchManager';
import { OutlinePass }      from './systems/OutlinePass';
import { PostEffectChain }  from './systems/PostEffectChain';
import { ShaderDebugPanel } from './systems/ShaderDebugPanel';
import { AudioManager }     from './systems/AudioManager';
import { Cutscene, CS_BEATS, ROAD_Z } from './entities/Cutscene';
import { makeRoadCurve, ROAD_BEND_START_X, ROAD_BEND_END_X } from './utils/RoadPath';

type CamPhase = 'menu' | 'pan-in' | 'playing' | 'admire' | 'cutscene' | 'rover-intro' | 'win' | 'gameover';

// Duration (s) of the one-time "rover takes over" intro at the first rover level.
const ROVER_INTRO_DUR = 8.0;

export default class Game {
  private canvas:    HTMLCanvasElement;
  private callbacks: GameCallbacks;

  private state:    string;
  private patience: number;
  private _trimmed: number;
  private _level:   number;
  private _score:         number = 0;
  private _hiScore:       number = 0;
  private _highestLevel:  number = 0;

  // Per-level play bounds + tuning, recomputed in _startLevel().
  private _camelMinX = -7.5;
  private _camelMaxX =  7.5;
  private _camBoundX = 0;     // how far the camera may scroll from center (±)
  private _camFollowX = 0;    // eased camera X during gameplay
  private _patienceSeconds: number = GAME_CONFIG.PATIENCE_BASE_SECONDS;
  private _perOvergrown:    number = GAME_CONFIG.PATIENCE_PER_OVERGROWN;
  private _camelSpeed:      number = GAME_CONFIG.CAMEL.SPEED;

  private _accum:       number;
  private _lastTime:    number;
  private _loopRunning: boolean;
  private _rafId:       number;
  private _t:           number;

  private renderer!:     THREE.WebGLRenderer;
  private scene!:        THREE.Scene;
  private camera!:       THREE.PerspectiveCamera;
  private _outline!:     OutlinePass;
  private _postChain!:   PostEffectChain;
  private _shaderPanel!: ShaderDebugPanel;

  private _clouds: Array<{ obj: THREE.Object3D; speed: number }> = [];

  // Width-dependent scenery rebuilt every level; textured materials are created
  // once and reused so rebuilds don't leak GPU textures.
  private _decorGroup = new THREE.Group();
  private _brickMat?:      THREE.MeshLambertMaterial;
  private _gravelMat?:     THREE.MeshLambertMaterial;
  // Separate material instances for house walls/roof (cloned textures so their
  // repeat settings are independent from the side garden-wall materials).
  // Variant pools: one entry per texture; a per-level seed picks which to use so
  // each cottage looks different. Built once, reused across rebuilds.
  private _houseBrickMats?: THREE.MeshLambertMaterial[];
  private _houseRoofMats?:  THREE.MeshLambertMaterial[];
  private _houseWinMats?:   THREE.MeshLambertMaterial[];
  private _floorMats?:      THREE.MeshStandardMaterial[];
  private _groundMesh?:     THREE.Mesh;

  // Camera animation
  private _camPhase: CamPhase = 'menu';
  private _camT = 0;

  // Cutscene between levels
  private _cutscene:          Cutscene | null = null;
  private _streetGroup:       THREE.Group | null = null;  // persists after cutscene ends
  private _csFollowX          = 0;      // eased camera X during travel shots
  private _csRoadStartX       = 8;      // where the road begins (right of hedge)
  private _nextCutsceneLevel  = 1;
  private _csLevelBuilt       = false;
  private _csPrevPhase        = '';     // phase-transition detection
  private _csSettlePos        = new THREE.Vector3();
  private _csSettleLook       = new THREE.Vector3();
  private _debugKeyHandler:   ((e: KeyboardEvent) => void) | null = null;

  // Level-clear "admire your work" interlude: gameplay pauses, the camera sweeps
  // the pristine hedge then pulls back to a hero shot, before the next level.
  private _admiring   = false;
  private _paused     = false;
  private _admireT    = 0;
  private _admireDur  = 5.0;
  private _admireHalfWidth = 0;
  private _nextLevel  = 0;
  private _camPosA    = new THREE.Vector3();
  private _camPosB    = new THREE.Vector3();
  private _camLookA   = new THREE.Vector3();
  private _camLookB   = new THREE.Vector3();
  private _camLookTgt = new THREE.Vector3(0, 2.0, 0);

  private input:   InputManager;
  private gamepad: GamepadManager;
  private touch:   TouchManager;
  private audio:   AudioManager;

  // Touch devices fill the whole screen (aspect tracks the viewport);
  // desktop keeps the framed 16:9 letterbox.
  private _fill = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  private hedge!:  Hedge;
  private camel!:  Camel;
  private couple!: OldCouple;
  private leaves!: LeafParticles;
  private _laser!: LaserParticles;
  private _laserT  = 0;  // render-rate accumulator for sight beam pulsing

  // Rover level entities (null when not in rover mode)
  private _rover:        Rover | null = null;
  private _camelSitting: CamelSitting | null = null;
  private _isRoverLevel  = false;
  private _crossTimer    = 0;   // seconds until next couple crossing
  // One-time "rover takes over" intro — plays the first time rover mode is reached
  private _roverIntro     = false;  // currently mid-intro
  private _roverIntroDone = false;  // already shown this run

  private _snipOffset   = -1.5;
  private _aimX         = 0;
  private _aimSnippable = false;
  private _aimDot!:   THREE.Mesh;

  private _toolTier     = 0;
  private _snipCooldown = 0;
  private _snipInterval = 0;

  private _assetsTotal  = 1; // camel2.glb (only GLB needed before first frame)
  private _assetsLoaded = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks = {}) {
    this.canvas    = canvas;
    this.callbacks = callbacks;

    this.state    = GAME_STATES.MENU;
    this.patience = 1;
    this._trimmed = 0;
    this._level   = 1;
    this._hiScore      = parseInt(localStorage.getItem('camelClipper_hiScore') || '0', 10);
    this._highestLevel = parseInt(localStorage.getItem('camelClipper_highestLevel') || '0', 10);
    this._accum       = 0;
    this._lastTime    = 0;
    this._loopRunning = false;
    this._rafId       = 0;
    this._t           = 0;

    this.input   = new InputManager();
    this.gamepad = new GamepadManager();
    this.touch   = new TouchManager(document.body);
    this.audio   = new AudioManager();
    this.audio.arm(); // music starts on first user gesture — nothing loaded before

    this._initRenderer();
    this._initScene();
    this._initEntities();

    // Debug: press 1 to preview the cutscene from any state
    this._debugKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'F4') { this._shaderPanel.toggle(); return; }
      if (e.key === '1' && this.state !== GAME_STATES.CUTSCENE) {
        if (this._cutscene) { this.scene.remove(this._cutscene.group); this._cutscene.dispose(); this._cutscene = null; }
        this._beginCutscene(this._level + 1);
      }
      if (e.key === '2') {
        if (this._cutscene) { this.scene.remove(this._cutscene.group); this._cutscene.dispose(); this._cutscene = null; }
        this._startLevel(this._level + 1, true);
        this._setState(GAME_STATES.PLAYING);
      }
      // Debug: jump directly to rover level (23) for testing — replays the intro
      if (e.key === '3') {
        if (this._cutscene) { this.scene.remove(this._cutscene.group); this._cutscene.dispose(); this._cutscene = null; }
        this._roverIntroDone = false;
        this._startLevel(23, true);
        this.camel.group.visible  = false;
        this.couple.group.visible = true;
        if (this._rover)        this._rover.group.visible        = true;
        if (this._camelSitting) this._camelSitting.group.visible = true;
        this._beginRoverIntro();
      }
    };
    window.addEventListener('keydown', this._debugKeyHandler);

    setTimeout(() => this.callbacks.onHighScore?.(this._hiScore, this._highestLevel), 0);
  }

  private _viewSize(): { w: number; h: number } {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (this._fill) return { w: vw, h: vh };
    const TARGET = 16 / 9;
    if (vw / vh > TARGET) {
      const h = vh; return { w: Math.round(h * TARGET), h };
    } else {
      const w = vw; return { w, h: Math.round(w / TARGET) };
    }
  }

  private _viewAspect(): number {
    const { w, h } = this._viewSize();
    return this._fill ? w / h : 16 / 9;
  }

  private _initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const { w, h } = this._viewSize();
    this.renderer.setSize(w, h);
    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.72;
    this.renderer.shadowMap.enabled   = true;
    this.renderer.shadowMap.type      = THREE.PCFShadowMap;
    window.addEventListener('resize', () => this._onResize());
    window.addEventListener('orientationchange', () => this._onResize());
    this._outline    = new OutlinePass(this.renderer, 0.1, 300);
    this._postChain  = new PostEffectChain(this.renderer);
    this._shaderPanel = new ShaderDebugPanel(this._postChain);
  }

  private _initScene(): void {
    this.scene = new THREE.Scene();
    // Fog colour matches sky horizon — warm hazy blue
    this.scene.fog = new THREE.FogExp2(0xc4d8e8, 0.013);

    this.camera = new THREE.PerspectiveCamera(55, this._viewAspect(), 0.1, 300);
    this.camera.layers.enable(1); // see detail layer (frames, glass, ledges)
    this.camera.position.set(0, 3.5, 12);
    this.camera.lookAt(0, 2.0, 0);

    // Procedural sky
    const sky = new Sky();
    sky.scale.setScalar(10000);
    this.scene.add(sky);
    const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
    skyU['turbidity'].value       = 2.5;
    skyU['rayleigh'].value        = 1.6;
    skyU['mieCoefficient'].value  = 0.004;
    skyU['mieDirectionalG'].value = 0.85;
    // English afternoon sun — high and slightly off to the side
    const sunDir = new THREE.Vector3(12, 22, 18).normalize();
    skyU['sunPosition'].value.copy(sunDir);

    // Warm ambient + directional sun matching sky sun position
    this.scene.add(new THREE.AmbientLight(0xfff4e0, 1.1));
    const sun = new THREE.DirectionalLight(0xfffbe8, 2.9);
    sun.position.set(12, 22, 18);
    sun.castShadow            = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near    = 0.5;
    sun.shadow.camera.far     = 80;
    sun.shadow.camera.left    = -22;
    sun.shadow.camera.right   = 22;
    sun.shadow.camera.top     = 16;
    sun.shadow.camera.bottom  = -6;
    sun.shadow.camera.layers.enable(1); // cast shadows from detail layer too
    sun.shadow.bias           = -0.001;
    this.scene.add(sun);

    const loader = new THREE.TextureLoader();

    // Grass lawn — the main ground, covering everything.
    const grassTex = loader.load(`${import.meta.env.BASE_URL}textures/grass1.jpg`);
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(40, 20);
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 60),
      new THREE.MeshStandardMaterial({
        map: grassTex,
        roughness: 1.0,
        metalness: 0.0,
      }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Stone patio — a strip in front of the hedge where the camel works.
    // Material is swapped each level from _floorMats; placeholder until first level starts.
    this._groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.0 }),
    );
    this._groundMesh.rotation.x = -Math.PI / 2;
    this._groundMesh.position.set(0, 0.01, 1.5); // lifted to avoid z-fighting with grass
    this._groundMesh.receiveShadow = true;
    this.scene.add(this._groundMesh);

    this.scene.add(this._decorGroup);
    this._buildStaticScenery();
    this._buildPermanentRoad();
    this._buildClouds();
  }

  private _buildPermanentRoad(): void {
    const curve = makeRoadCurve();
    const N     = 300;
    const pts   = curve.getSpacedPoints(N);

    // Build a flat ribbon mesh from arc-length-spaced samples.
    // offA / offB are signed perpendicular distances from road centre:
    //   positive = far/+Z side (CW from tangent), negative = near/−Z side.
    const buildRibbon = (offA: number, offB: number, y: number, mat: THREE.Material | number) => {
      const verts: number[] = [], uvs: number[] = [], inds: number[] = [];
      for (let i = 0; i <= N; i++) {
        const p    = pts[i];
        const prev = pts[Math.max(i - 1, 0)];
        const next = pts[Math.min(i + 1, N)];
        const tx   = next.x - prev.x,  tz = next.y - prev.y;
        const tl   = Math.sqrt(tx * tx + tz * tz) || 1;
        const px   =  tz / tl,  pz = -tx / tl;  // CW unit perp
        verts.push(p.x + px * offA, y, p.y + pz * offA);
        verts.push(p.x + px * offB, y, p.y + pz * offB);
        uvs.push(0, i / N,  1, i / N);
        if (i > 0) {
          const b = (i - 1) * 2;
          inds.push(b, b + 2, b + 1,  b + 1, b + 2, b + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,   2));
      geo.setIndex(inds);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat instanceof THREE.Material ? mat : new THREE.MeshLambertMaterial({ color: mat }));
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    // Road surface: textured with road.jpg, tiling along the road length
    const roadTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/road.jpg`);
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    roadTex.colorSpace = THREE.SRGBColorSpace;
    roadTex.repeat.set(4, 80);
    buildRibbon(-3.78, 3.78, 0.013, new THREE.MeshLambertMaterial({ map: roadTex }));

    // Far kerb: road edge (+3.5) to outer edge (+3.78), raised to y=0.07
    buildRibbon(3.5, 3.78, 0.07, 0xbbbbbb);
    // Near kerb: outer edge (−3.78) to road edge (−3.5)
    buildRibbon(-3.78, -3.5, 0.07, 0xbbbbbb);

    // ── Centre-line dashes — full curve, arc-length spaced ─────────────────
    const dashMat  = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const dashLen  = 2.1;
    const dashGap  = 2.1;   // gap between dashes; period = 4.2
    let   arcAcc   = 0;
    let   nextMid  = dashLen / 2;   // arc length at which to place next dash centre
    let   inDash   = true;          // alternate dash / gap
    for (let i = 1; i <= N; i++) {
      const p    = pts[i];
      const prev = pts[i - 1];
      const dx   = p.x - prev.x,  dz = p.y - prev.y;
      arcAcc += Math.sqrt(dx * dx + dz * dz);
      if (arcAcc >= nextMid) {
        if (inDash) {
          const pn = pts[Math.min(i + 1, N)];
          const pp = pts[Math.max(i - 1, 0)];
          const tx = pn.x - pp.x,  tz = pn.y - pp.y;
          const tl = Math.sqrt(tx * tx + tz * tz) || 1;
          const d  = new THREE.Mesh(new THREE.PlaneGeometry(dashLen, 0.13), dashMat);
          d.rotation.set(-Math.PI / 2, Math.atan2(-tz, tx), 0, 'YXZ');
          d.position.set(p.x, 0.028, p.y);
          this.scene.add(d);
        }
        nextMid += inDash ? dashGap : dashLen;
        inDash = !inDash;
      }
    }
  }

  // Far-distance scenery that never changes with hedge length.
  private _buildStaticScenery(): void {
    // ── Instanced trees: 2 draw calls for all N trees ──────────────────────
    // Left cluster (beside/behind cottage), right cluster, centre back, far BG row.
    // ── Sheffield rolling hills — 6 ridges at staggered depths ────────────
    // [x, z, rx, ry, rz, color]  — low-segment sphere, no shadows, eaten by fog
    const hillData: Array<[number, number, number, number, number, number]> = [
      [-35, -52, 22, 7.5, 14, 0x3a7a2a],  // Loxley ridge
      [-55, -42, 24, 7.0, 13, 0x3c8030],  // Rivelin valley wall
      [-72, -58, 26, 8.5, 16, 0x367828],  // Bradfield moors (plugs far-left edge)
      [-10, -44, 15, 5.5, 10, 0x427832],  // Meersbrook (left-centre)
      [  8, -60, 26, 9.5, 16, 0x367828],  // Ecclesall woods (centre)
      [ 30, -48, 18, 6.5, 11, 0x3e7c2e],  // Gleadless (right-centre)
      [ 52, -55, 20, 7.0, 13, 0x3a7a2a],  // Woodhouse (far right)
      [  0, -80, 50,12.0, 22, 0x2e6020],  // deep backdrop ridge
      // Front-side hills (+Z) — visible during the drive cutscene and gameplay
      [ -20,  80,  24, 8.0, 16, 0x367828],
      [  12,  90,  28, 9.5, 20, 0x2e6020],
      [  48,  78,  22, 7.5, 15, 0x3a7a2a],
      [  76,  85,  20, 8.0, 16, 0x3c8030],
      // Right-side extension (+X) — fills horizon during depart
      [  78, -44,  22, 7.5, 14, 0x3c8030],
      [  98, -58,  24, 8.0, 16, 0x367828],
      [ 115, -50,  20, 7.0, 13, 0x3a7a2a],
      // Deep front backdrop ridge
      [  28, 130,  75,14.0, 32, 0x2a5a1e],
      // ── Bend-blocking hills — pushed well past the bend so they read as distant ──
      [ -105,  50,  24, 18, 32, 0x3a7a2a],  // left-bend, on bend axis (+Z flank)
      [ -115,  30,  20, 14, 26, 0x367828],  // left-bend, secondary
      [  105, -28,  24, 18, 32, 0x3a7a2a],  // right-bend, on bend axis (−Z flank)
      [  115,  -8,  20, 14, 26, 0x367828],  // right-bend, secondary
    ];
    for (const [x, z, rx, ry, rz, col] of hillData) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), getMaterial(col));
      hill.scale.set(rx, ry, rz);
      hill.position.set(x, -ry * 0.3, z);
      this.scene.add(hill);
    }

    // ── Extended ground — covers z > +30 where main grass plane ends ─────────
    const extGround = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 400),
      getMaterial(0x548030),
    );
    extGround.rotation.x = -Math.PI / 2;
    extGround.position.set(20, -0.04, 70);
    this.scene.add(extGround);

    // ── Scattered trees on extended ground ────────────────────────────────────
    const frontTrees: Array<{x: number; z: number; s: number}> = [
      { x:  18, z: 22, s: 1.3 }, { x:  30, z: 30, s: 1.5 }, { x:  46, z: 24, s: 1.1 },
      { x:  60, z: 38, s: 1.6 }, { x:  72, z: 20, s: 1.2 }, { x:  82, z: 42, s: 1.7 },
      { x: -12, z: 28, s: 1.2 }, { x: -28, z: 36, s: 1.4 }, { x: -40, z: 22, s: 1.0 },
      { x:  25, z: 50, s: 1.8 }, { x:  55, z: 55, s: 2.0 }, { x: -10, z: 48, s: 1.6 },
      { x:  88, z: -18, s: 1.4 }, { x: 100, z: -38, s: 1.6 },
    ];
    const ftLeafColors = [0x2d6e22, 0x3a7a2a, 0x2a6020, 0x4a8a30, 0x3d7825];
    for (let i = 0; i < frontTrees.length; i++) {
      const { x, z, s } = frontTrees[i];
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.8, 6), getMaterial(0x5c3a1a));
      trunk.position.y = 0.9;
      g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(1.1, 7, 5), getMaterial(ftLeafColors[i % ftLeafColors.length]));
      leaves.scale.set(1, 1.25, 1);
      leaves.position.y = 2.5;
      g.add(leaves);
      g.scale.setScalar(s);
      g.position.set(x, 0, z);
      this.scene.add(g);
    }

    // ── Instanced trees — ground clusters + hill-top scatter, 2 draw calls ──
    // Hill trees use y= to sit on the hill surface (≈ hill_cy + ry*0.9).
    const treePositions: Array<{x: number; z: number; s?: number; y?: number}> = [
      // Left side cluster
      { x: -10, z: -5,  s: 1.15 },
      { x: -12, z: -8,  s: 1.30 },
      { x: -14, z: -5.5,s: 1.05 },
      { x: -16, z: -10, s: 1.40 },
      { x:  -9, z: -12, s: 0.95 },
      // Right side cluster
      { x:  10, z: -5,  s: 1.10 },
      { x:  12, z: -8,  s: 1.25 },
      { x:  14, z: -5.5,s: 1.00 },
      { x:  16, z: -10, s: 1.35 },
      { x:   9, z: -12, s: 0.90 },
      // Behind cottage, centre
      { x:  -5, z: -10, s: 1.20 },
      { x:   2, z: -13, s: 1.50 },
      { x:   6, z: -9,  s: 1.10 },
      { x: -18, z: -14, s: 1.60 },
      { x:  18, z: -14, s: 1.55 },
      // Far background tree line
      { x: -25, z: -20, s: 1.80 },
      { x: -18, z: -22, s: 1.90 },
      { x:  -8, z: -24, s: 2.00 },
      { x:   4, z: -23, s: 1.85 },
      { x:  15, z: -21, s: 1.75 },
      { x:  24, z: -19, s: 1.65 },
      { x: -32, z: -18, s: 1.70 },
      { x:  30, z: -17, s: 1.60 },
      // Extra depth
      { x: -40, z: -26, s: 2.20 },
      { x:  38, z: -25, s: 2.10 },
      // Mid-distance left — mask the new hill edges
      { x: -60, z: -28, s: 2.50, y: -2 },
      { x: -70, z: -30, s: 2.60, y: -2 },
      { x: -80, z: -28, s: 2.80, y: -2 },
      { x: -90, z: -33, s: 3.00, y: -2 },
      // Rivelin hill trees (hill_cy≈-2.1, hry=7.0, top≈4.9)
      { x: -58, z: -42, s: 1.7, y: 3.4 },
      { x: -52, z: -43, s: 1.5, y: 3.1 },
      { x: -55, z: -46, s: 1.8, y: 2.6 },
      // Bradfield moors trees (hill_cy≈-2.55, hry=8.5, top≈5.95)
      { x: -74, z: -58, s: 2.0, y: 4.4 },
      { x: -68, z: -57, s: 1.8, y: 4.1 },
      { x: -72, z: -61, s: 2.2, y: 3.6 },
      // Loxley hill trees (hill_cy≈-2.25, hry=7.5, top≈5.25)
      { x: -38, z: -52, s: 1.8, y: 3.8 },
      { x: -32, z: -51, s: 1.6, y: 4.1 },
      { x: -35, z: -55, s: 2.0, y: 3.3 },
      // Meersbrook hill trees (hill_cy≈-1.65, hry=5.5, top≈3.85)
      { x: -13, z: -44, s: 1.4, y: 2.7 },
      { x:  -7, z: -45, s: 1.3, y: 2.9 },
      // Ecclesall hill trees (hill_cy≈-2.85, hry=9.5, top≈6.65)
      { x:   5, z: -60, s: 2.3, y: 4.7 },
      { x:  11, z: -59, s: 2.1, y: 4.4 },
      { x:   8, z: -63, s: 2.5, y: 3.7 },
      // Gleadless hill trees (hill_cy≈-1.95, hry=6.5, top≈4.55)
      { x:  28, z: -48, s: 1.5, y: 3.2 },
      { x:  33, z: -49, s: 1.4, y: 3.0 },
      // Woodhouse hill trees (hill_cy≈-2.1, hry=7.0, top≈4.9)
      { x:  50, z: -55, s: 1.7, y: 3.4 },
      { x:  55, z: -54, s: 1.6, y: 3.1 },
      // Deep backdrop ridge trees (hill_cy≈-3.6, hry=12, top≈8.4)
      { x: -20, z: -80, s: 3.0, y: 5.1 },
      { x:  -5, z: -81, s: 3.2, y: 6.1 },
      { x:  12, z: -79, s: 2.9, y: 5.6 },
      { x:  28, z: -80, s: 2.8, y: 4.6 },
    ];

    const [trunks, foliage] = buildTreeInstances(treePositions);
    this.scene.add(trunks, foliage);
  }

  // Cottage + garden dressing sized to the current hedge width. Cleared and
  // rebuilt each level; per-rebuild geometry is disposed, textured materials are
  // created once (lazily) and reused, getMaterial() colours are cache-shared.
  private _buildLevelScenery(halfWidth: number): void {
    // Tear down the previous level's scenery, freeing its geometry.
    for (const child of this._decorGroup.children) {
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this._decorGroup.clear();

    const loader = new THREE.TextureLoader();
    const wallW  = Math.max(22, halfWidth * 2 + 8);

    // ── Shared materials (created once; house/wall use separate instances so
    //    their texture.repeat settings don't stomp on each other) ──────────
    if (!this._brickMat) {
      const brickTex = loader.load(`${import.meta.env.BASE_URL}textures/bricks_512.png`);
      brickTex.wrapS = brickTex.wrapT = THREE.RepeatWrapping;
      brickTex.colorSpace = THREE.SRGBColorSpace;
      this._brickMat = new THREE.MeshLambertMaterial({ map: brickTex });
    }
    // Wall/roof/window variant pools. Each texture loaded once; a per-level seed
    // selects one so successive cottages differ in brick, tile and glazing.
    // `gain` normalizes each texture's intrinsic brightness so dark variants
    // (e.g. slate roofs ~74/255 vs light tiles ~129/255) don't read as near-black
    // under ACES tone mapping. Diffuse = map × color; three.js allows color > 1.
    const texMat = (
      file: string, repX: number, repY: number, gain = 1, extra: THREE.MeshLambertMaterialParameters = {},
    ): THREE.MeshLambertMaterial => {
      const tex = loader.load(`${import.meta.env.BASE_URL}textures/${file}`);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(repX, repY);
      return new THREE.MeshLambertMaterial({ map: tex, color: new THREE.Color(gain, gain, gain), ...extra });
    };
    if (!this._houseBrickMats) {
      // [file, gain] — gains normalize measured mean brightness toward ~150/255.
      this._houseBrickMats = ([
        ['bricks_512.png', 0.78], ['bricks/bricks3.jpg', 1.55], ['bricks/bricks4.jpg', 1.18],
        ['bricks/bricks5.jpg', 1.22], ['bricks/bricks6.jpg', 1.45],
      ] as [string, number][]).map(([f, g]) => texMat(f, 3, 2, g));
    }
    if (!this._houseRoofMats) {
      // Gains normalize toward ~125/255 so slate variants aren't near-black.
      this._houseRoofMats = ([
        ['tiles1.jpg', 0.97], ['tiles2.webp', 1.62], ['tiles3.jpg', 1.65],
      ] as [string, number][]).map(([f, g]) => texMat(f, 4, 3, g, { side: THREE.DoubleSide }));
    }
    if (!this._houseWinMats) {
      // Index 0 = default tinted glass (no texture); rest = textured glazing.
      this._houseWinMats = [
        new THREE.MeshLambertMaterial({ color: 0x88CCEE, emissive: 0x224433, emissiveIntensity: 0.4 }),
        texMat('window1.jpg', 1, 1),
      ];
    }

    // ── Patio floor variant pool — built once, swapped per level ─────────────
    // Each entry: [colorFile, repX, repY, bumpFile?]
    if (!this._floorMats) {
      const floorConfigs: [string, number, number, string?][] = [
        ['floors/huge_floor_1.jpg',   20, 4, 'floors/huge_floor_black_low.jpg'],
        ['floors/brick_floor.jpg',    20, 2],
        ['floors/floor_patio.jpg',    20, 2],
        ['floors/paving_stone.jpg',   30, 2],
        ['floors/stones_floor.jpg',   24, 2],
      ];
      this._floorMats = floorConfigs.map(([colorFile, repX, repY, bumpFile]) => {
        const tex = loader.load(`${import.meta.env.BASE_URL}textures/${colorFile}`);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.repeat.set(repX, repY);
        const params: THREE.MeshStandardMaterialParameters = { map: tex, roughness: 0.9, metalness: 0.0 };
        if (bumpFile) {
          const bump = loader.load(`${import.meta.env.BASE_URL}textures/${bumpFile}`);
          bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
          bump.repeat.set(repX, repY);
          params.bumpMap = bump;
          params.bumpScale = 2.5;
        }
        return new THREE.MeshStandardMaterial(params);
      });
    }

    // ── Procedural house (unique per level, deterministic from level number) ──
    // Deterministic variant pick per level (distinct salts → independent choices).
    const pickVariant = <T>(arr: T[], salt: number): T =>
      arr[Math.abs(Math.imul(this._level + salt, 2654435761)) % arr.length];

    if (this._groundMesh) this._groundMesh.material = pickVariant(this._floorMats, 0x4444);
    const houseScale = 1.4;
    const house = createLowLodHouse(this._level, {
      wallMat: pickVariant(this._houseBrickMats, 0x1111),
      roofMat: pickVariant(this._houseRoofMats, 0x2222),
      winMat:  pickVariant(this._houseWinMats, 0x3333),
    });
    house.scale.setScalar(houseScale);
    house.rotation.y = Math.PI; // rotate so front (door/windows) faces the camera
    house.position.set(0, 0, -10);
    house.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this._decorGroup.add(house);

    // ── Low brick garden wall flanking the house on wide levels ──────────
    const wallH = 1.8;
    // Generous half-width covering house + possible garage at this scale
    const houseHalfX = 5.5 * houseScale;
    const sideWallW = Math.max(0, wallW / 2 - houseHalfX);
    if (sideWallW > 0.5) {
      (this._brickMat.map as THREE.Texture).repeat.set(Math.max(1, Math.round(sideWallW / 1.4)), 1);
      for (const sx of [-1, 1]) {
        const sideWall = new THREE.Mesh(
          new THREE.BoxGeometry(sideWallW, wallH, 0.45),
          this._brickMat,
        );
        sideWall.position.set(sx * (houseHalfX + sideWallW / 2), wallH / 2, -7);
        sideWall.receiveShadow = true;
        this._decorGroup.add(sideWall);
      }
    }

    // ── Garden path (gravel strip, centered) ──
    if (!this._gravelMat) {
      const gravelTex = loader.load(`${import.meta.env.BASE_URL}textures/gravel1.jpg`);
      gravelTex.wrapS = gravelTex.wrapT = THREE.RepeatWrapping;
      gravelTex.repeat.set(2, 14);
      this._gravelMat = new THREE.MeshLambertMaterial({ map: gravelTex });
    }
    const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 20), this._gravelMat);
    path.rotation.x = -Math.PI / 2;
    path.position.set(0, 0.006, 5);
    path.receiveShadow = true;
    this._decorGroup.add(path);

    // ── Flowers on the grass (cobble ends at z=5.5; grass beyond that) ──
    const flowerColors = [0xe74c3c, 0x9b59b6, 0xf39c12, 0xec407a, 0xf5f5dc, 0x3498db, 0xff6b35, 0xd4a0e0];
    const flowerCount = Math.max(16, Math.round(halfWidth * 2 + 6));
    for (let i = 0; i < flowerCount; i++) {
      const fc = flowerColors[i % flowerColors.length];
      const fx = -(halfWidth + 4) + Math.random() * (halfWidth + 4) * 2;
      const fz = 1.5 + Math.random() * 5.0;
      const flower = makeScatterFlower(fc);
      flower.position.set(fx, 0, fz);
      this._decorGroup.add(flower);
    }

    // ── A few flowers near the side tree clusters ──
    const treePatch = [
      { x: -10, z: -5 }, { x: -13, z: -7 }, { x: -11, z: -9 },
      {  x: 10, z: -5 }, {  x: 13, z: -7 }, {  x: 11, z: -9 },
      { x: -15, z: -6 }, {  x: 15, z: -6 },
    ];
    for (let i = 0; i < treePatch.length; i++) {
      const fc = flowerColors[i % flowerColors.length];
      const fx = treePatch[i].x + (Math.random() - 0.5) * 2.5;
      const fz = treePatch[i].z + (Math.random() - 0.5) * 2.0;
      const flower = makeScatterFlower(fc);
      flower.position.set(fx, 0, fz);
      this._decorGroup.add(flower);
    }

    // Shrubs tucked behind the cottage wall to soften the wall-meets-ground edge.
    const backShrubCount = Math.max(8, Math.round(halfWidth * 1.0));
    for (let i = 0; i < backShrubCount; i++) {
      const shrub = makeShrub();
      const bx = -halfWidth + (i / (backShrubCount - 1)) * halfWidth * 2;
      const bz = -4.4 - Math.random() * 1.2;
      shrub.position.set(bx, 0, bz);
      shrub.scale.setScalar(0.7 + Math.random() * 0.5);
      this._decorGroup.add(shrub);
    }

    // Tom's Garden Care sign at the right end
    const signX = halfWidth + 3.5;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), getMaterial(0x8b5e3c));
    post.position.set(signX, 1.05, -2.5);
    this._decorGroup.add(post);
    const signTex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/tom_sign.png`);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshLambertMaterial({ map: signTex, transparent: true, alphaTest: 0.1 });
    const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.0), signMat);
    signBoard.position.set(signX, 2.6, -2.5);
    this._decorGroup.add(signBoard);

    this._scatterDecor(halfWidth);
  }

  // Hero props + cheap scatter sprinkled along the play width so a long garden
  // doesn't feel empty as the camera scrolls.
  private _scatterDecor(halfWidth: number): void {
    const heroes = [makeBench(), makeBirdbath(), makeWheelbarrow(), makeGnome(), makeGnome()];
    for (let i = 0; i < heroes.length; i++) {
      const h = heroes[i];
      // Even-ish spread across the width, alternating front/back of the path.
      const x = -halfWidth + ((i + 0.5) / heroes.length) * (halfWidth * 2);
      const z = (i % 2 === 0) ? -1.4 : 2.4;
      h.position.set(x, 0, z);
      h.rotation.y = (i % 2 === 0) ? 0 : Math.PI;
      this._decorGroup.add(h);
    }

    // Low scatter (shrubs + flowerbeds) filling gaps in front of the wall.
    const scatterCount = Math.round(halfWidth * 1.2);
    for (let i = 0; i < scatterCount; i++) {
      const piece = (i % 3 === 0) ? makeFlowerbed() : makeShrub();
      const x = -halfWidth - 0.5 + Math.random() * (halfWidth * 2 + 1);
      const z = -2.6 - Math.random() * 0.8;
      piece.position.set(x, 0, z);
      this._decorGroup.add(piece);
    }
  }

  private _buildClouds(): void {
    const cloudMat = new THREE.MeshLambertMaterial({ color: 0xf8f8ff, transparent: true, opacity: 0.92 });

    // Each cloud is a cluster of overlapping spheres — rounder, better with outline shader.
    // Puff layout: [dx, dy, dz, radius] relative to cloud origin.
    const cloudDefs: Array<{ x: number; y: number; z: number; scale: number; speed: number;
                              puffs: Array<[number, number, number, number]> }> = [
      {
        x: -18, y: 22, z: -35, scale: 1.0, speed: 0.30,
        puffs: [[0,0,0,2.4], [2.8,0.4,0,1.8], [-2.6,0.2,0,1.9], [1.0,1.6,0,1.6], [-1.0,1.4,0,1.4]],
      },
      {
        x:   6, y: 26, z: -48, scale: 1.4, speed: 0.18,
        puffs: [[0,0,0,2.8], [3.2,0.6,0,2.0], [-3.0,0.4,0,2.2], [-1.2,1.8,0,1.8], [1.4,2.0,0,2.0], [0,2.8,0,1.4]],
      },
      {
        x:  22, y: 20, z: -30, scale: 0.85, speed: 0.42,
        puffs: [[0,0,0,2.0], [2.4,0.3,0,1.5], [-2.2,0.2,0,1.6], [0.8,1.4,0,1.3]],
      },
      {
        x: -36, y: 24, z: -50, scale: 1.2, speed: 0.22,
        puffs: [[0,0,0,2.6], [3.0,0.5,0,2.0], [-2.8,0.3,0,1.8], [1.2,1.9,0,1.7], [-1.0,1.7,0,1.5]],
      },
      {
        x:  38, y: 19, z: -38, scale: 0.9, speed: 0.35,
        puffs: [[0,0,0,2.1], [2.6,0.4,0,1.6], [-2.4,0.2,0,1.7], [0.6,1.5,0,1.4]],
      },
      {
        x:  -4, y: 30, z: -60, scale: 1.6, speed: 0.14,
        puffs: [[0,0,0,3.2], [3.8,0.7,0,2.4], [-3.6,0.5,0,2.6], [-1.4,2.2,0,2.0], [1.6,2.4,0,2.2], [0,3.4,0,1.8]],
      },
    ];

    for (const def of cloudDefs) {
      const group = new THREE.Group();
      group.position.set(def.x, def.y, def.z);
      group.scale.setScalar(def.scale);

      for (const [dx, dy, dz, r] of def.puffs) {
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), cloudMat);
        sphere.position.set(dx, dy, dz);
        group.add(sphere);
      }

      this.scene.add(group);
      this._clouds.push({ obj: group, speed: def.speed });
    }
  }

  private _initEntities(): void {
    this.hedge  = new Hedge(getLevelConfig(1));
    this.scene.add(this.hedge.group);
    this._buildLevelScenery(this.hedge.halfWidth);

    this.camel = new Camel(() => this._onAssetLoaded());
    this.scene.add(this.camel.group);

    this.couple = new OldCouple();
    this.scene.add(this.couple.group);

    this.leaves = new LeafParticles();
    this.scene.add(this.leaves.group);

    this._laser = new LaserParticles();
    this.scene.add(this._laser.group);

    // Debug aim dot — bright sphere showing the snip query point on the hedge
    this._aimDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2200, depthTest: false }),
    );
    this._aimDot.renderOrder = 999;
    this._aimDot.visible = false;
    this.scene.add(this._aimDot);
  }

  private _onAssetLoaded(): void {
    this._assetsLoaded = Math.min(this._assetsLoaded + 1, this._assetsTotal);
    this.callbacks.onLoadProgress?.(this._assetsLoaded, this._assetsTotal);
    if (this._assetsLoaded >= this._assetsTotal) {
      this.callbacks.onLoadComplete?.();
    }
  }

  setSnipOffset(v: number): void {
    this._snipOffset = v;
  }

  private _onResize(): void {
    const { w, h } = this._viewSize();
    this.renderer.setSize(w, h);
    this.camera.aspect = this._viewAspect();
    this.camera.updateProjectionMatrix();
    this._outline.resize(w, h);
    this._postChain.resize(w, h);
  }

  start(): void {
    this._lastTime = performance.now() / 1000;
    if (!this._loopRunning) {
      this._loopRunning = true;
      this._rafId = requestAnimationFrame((t) => this._loop(t));
    }
    this._setState(GAME_STATES.MENU);
  }

  destroy(): void {
    cancelAnimationFrame(this._rafId);
    this._loopRunning = false;
    if (this._debugKeyHandler) window.removeEventListener('keydown', this._debugKeyHandler);
    this.audio.destroy();
    this._laser.dispose();
    this._outline.dispose();
    this._postChain.dispose();
    this._shaderPanel.destroy();
    this.renderer.dispose();
  }

  private _loop(nowMs: number): void {
    const now = nowMs / 1000;
    let dt = now - this._lastTime;
    this._lastTime = now;
    if (dt > 0.25) dt = 0.25;

    this._accum += dt;
    const step = GAME_CONFIG.TIMESTEP;
    while (this._accum >= step) {
      this._fixedUpdate(step);
      this._accum -= step;
    }

    this._renderUpdate(dt);
    if (this._postChain.anyEnabled) {
      this._outline.render(this.scene, this.camera, this._postChain.captureRT);
      this._postChain.render(dt);
    } else {
      this._outline.render(this.scene, this.camera);
    }

    if (this.callbacks.onCoupleScreenPos) {
      const ndc = this.couple.headWorld.clone().project(this.camera);
      this.callbacks.onCoupleScreenPos(
        (ndc.x * 0.5 + 0.5) * 100,
        (-ndc.y * 0.5 + 0.5) * 100,
      );
    }

    // Crosshair reticle — normal levels only; rover mode has no aim point.
    if (this.callbacks.onAimScreenPos && !this._isRoverLevel && this.state === 'PLAYING' && !this._admiring && this._camPhase === 'playing') {
      const aimWorld = new THREE.Vector3(this._aimX, GAME_CONFIG.HEDGE.SEG_HEIGHT_GROWN + 0.15, 0);
      const ndc = aimWorld.project(this.camera);
      this.callbacks.onAimScreenPos(
        (ndc.x * 0.5 + 0.5) * 100,
        (-ndc.y * 0.5 + 0.5) * 100,
        this._aimSnippable,
      );
    }

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  // Smooth per-frame updates (camera, clouds) — NOT fixed-step
  private _renderUpdate(dt: number): void {
    this._camT  += dt;
    this._laserT += dt;
    if (this._cutscene) this._cutscene.update(dt);

    // Laser Shears tier 4: targeting sight beam follows the aim position.
    // Excludes rover mode (tier 5), which has no aim point.
    const laserActive = this._toolTier === 4
      && this.state === GAME_STATES.PLAYING
      && !this._admiring
      && this._camPhase === 'playing';
    this._laser.setSight(
      this._aimX,
      GAME_CONFIG.HEDGE.SEG_HEIGHT_GROWN + 0.35,
      laserActive,
      this._laserT,
    );

    // Drift clouds eastward, wrap around
    for (const c of this._clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > 50) c.obj.position.x = -50;
    }

    const ss = (t: number) => t * t * (3 - 2 * t); // smoothstep easing

    if (this._camPhase === 'menu') {
      // Gentle wide survey drift — shows off the whole garden
      const t = this._camT;
      this.camera.position.set(
        Math.sin(t * 0.27) * 2.8,
        3.5 + Math.sin(t * 0.18) * 0.35,
        12.0 + Math.cos(t * 0.22) * 0.9,
      );
      this.camera.lookAt(0, 2.0, 0);

    } else if (this._camPhase === 'pan-in') {
      // Cinematic sweep from close side angle to gameplay position
      const PAN_DUR = 2.2;
      const p = Math.min(this._camT / PAN_DUR, 1);
      const e = ss(p);
      this._camPosA.set(-7, 1.6, 8);
      this._camPosB.set(0, 3.5, 12);
      this._camLookA.set(0, 3.0, 0);
      this._camLookB.set(0, 2.0, 0);
      this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
      this._camLookTgt.lerpVectors(this._camLookA, this._camLookB, e);
      this.camera.lookAt(this._camLookTgt);
      if (p >= 1) {
        this._camPhase = 'playing';
        this._camT = 0;
      }

    } else if (this._camPhase === 'playing') {
      // Follow Tom along X with easing + lookahead, clamped to the level bounds.
      const cam = GAME_CONFIG.CAMERA;
      const dir = Math.sign(this.input.state.moveX);
      const followX = this._isRoverLevel ? (this._rover?.x ?? 0) : this.camel.x;
      const tgt = Math.max(-this._camBoundX, Math.min(this._camBoundX,
        followX + dir * cam.LOOKAHEAD));
      this._camFollowX += (tgt - this._camFollowX) * Math.min(1, dt * cam.FOLLOW_EASE);
      const bob = Math.sin(this._camT * 1.7) * 0.04;
      this.camera.position.set(this._camFollowX, 3.5 + bob, 12);
      this.camera.lookAt(this._camFollowX, 2.0, 0);

    } else if (this._camPhase === 'admire') {
      // "Admire your work" — a two-leg cinematic sweep over the freshly trimmed
      // hedge, then a pull-back to a wide hero shot framing the whole garden:
      // the pristine hedge, Tom (centred), and the contented old couple.
      const hw = this._admireHalfWidth;
      const p  = Math.min(this._camT / this._admireDur, 1);
      if (p < 0.55) {
        // Leg 1: glide low along the hedge from the left end to centre.
        const e = ss(p / 0.55);
        this._camPosA.set(-hw - 2.0, 1.5, 6.5);
        this._camPosB.set( hw * 0.4, 2.4, 8.5);
        this._camLookA.set(-hw * 0.4, 2.0, 0);
        this._camLookB.set( hw * 0.15, 1.9, 0);
        this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
        this._camLookTgt.lerpVectors(this._camLookA, this._camLookB, e);
      } else {
        // Leg 2: rise and pull back to frame everyone for the curtain call.
        const e = ss((p - 0.55) / 0.45);
        this._camPosA.set(hw * 0.4, 2.4, 8.5);
        this._camPosB.set(0, 5.5, Math.max(15, hw + 9));
        this._camLookA.set(hw * 0.15, 1.9, 0);
        this._camLookB.set(0, 1.6, 0);
        this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
        this._camLookTgt.lerpVectors(this._camLookA, this._camLookB, e);
      }
      this.camera.lookAt(this._camLookTgt);

    } else if (this._camPhase === 'cutscene') {
      const cs = this._cutscene;
      if (!cs) return;

      const { panEnd, getDinEnd, departEnd, turnEnd, returnEnd, total } = CS_BEATS;
      const phase = cs.phase;
      const rsx   = this._csRoadStartX;

      // Snapshot camera when entering settle so the lerp start is stable
      if (phase !== this._csPrevPhase) {
        if (phase === 'settle') {
          this._csSettlePos.copy(this.camera.position);
          this._csSettleLook.copy(this._camLookTgt);
        }
        this._csPrevPhase = phase;
        this.callbacks.onCutscenePhase?.(phase);
        // Kick the engine sound the moment the car comes into view.
        if (phase === 'pan') this.audio.playCar();
      }

      const t = cs.t;

      if (t < panEnd) {
        // Close over-bonnet shot — camera sits at hood height, tracking camel walking in from right
        const p = ss(t / panEnd);
        const lookX = rsx + 6 - p * 4.5;  // pan from rsx+6 → rsx+1.5 as camel approaches
        this.camera.position.set(rsx - 1.5, 2.2, ROAD_Z - 1.2);
        this._camLookTgt.set(lookX, 1.0, ROAD_Z + 0.4);
        this.camera.lookAt(this._camLookTgt);

      } else if (t < getDinEnd) {
        // Hold — Tom climbs in; tighten on car
        this.camera.position.set(rsx + 1, 3.5, 16);
        this._camLookTgt.set(rsx, 1.8, 0);
        this.camera.lookAt(this._camLookTgt);

      } else if (t < departEnd) {
        // Follow BEHIND departing car (right/garden side as car heads left −X)
        this._csFollowX += (cs.carX + 6 - this._csFollowX) * Math.min(1, dt * 2.5);
        this.camera.position.set(this._csFollowX, 2.6, 10);
        this._camLookTgt.set(this._csFollowX - 9, 1.5, ROAD_Z);
        this.camera.lookAt(this._camLookTgt);

      } else if (t < turnEnd) {
        // Crane arc: glides ahead of the car while it U-turns
        this._csFollowX += (cs.carX - 6 - this._csFollowX) * Math.min(1, dt * 3.5);
        this.camera.position.set(this._csFollowX, 2.9, 10);
        this._camLookTgt.set(cs.carX, 1.5, ROAD_Z);
        this.camera.lookAt(this._camLookTgt);

      } else if (t < returnEnd) {
        // Camera BEHIND returning car — new garden approaches from the right
        this._csFollowX += (cs.carX - 6 - this._csFollowX) * Math.min(1, dt * 2.5);
        this.camera.position.set(this._csFollowX, 2.6, 10);
        this._camLookTgt.set(this._csFollowX + 9, 1.5, ROAD_Z);
        this.camera.lookAt(this._camLookTgt);

      } else if (t < total) {
        // Settle: ease from arrival framing to the standard pan-in start
        const p = ss((t - returnEnd) / (total - returnEnd));
        this._camPosB.set(-7, 1.6, 8);
        this._camLookB.set(0, 3.0, 0);
        this.camera.position.lerpVectors(this._csSettlePos, this._camPosB, p);
        this._camLookTgt.lerpVectors(this._csSettleLook, this._camLookB, p);
        this.camera.lookAt(this._camLookTgt);

      } else {
        if (cs.done) this._endCutscene();
      }

    } else if (this._camPhase === 'rover-intro') {
      // Three beats: (1) open close on Tom kicking back in his chair, (2) pan back
      // and across to the hedge, (3) follow the Rover zooming in to trim.
      const ct   = this._camT;
      const rx   = this._rover?.x ?? 0;
      const tomX = this.hedge.rightX + 1.5;
      if (ct < 2.6) {
        // Beat 1: tight on Tom, slow push-in.
        const e = ss(Math.min(ct / 2.6, 1));
        this._camPosA.set(tomX + 2.7, 1.9, 5.6);
        this._camPosB.set(tomX + 1.9, 2.1, 4.7);
        this._camLookTgt.set(tomX, 1.3, 2.4);
        this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
      } else if (ct < 4.0) {
        // Beat 2: swing back and across toward the rover's starting end.
        const e = ss((ct - 2.6) / 1.4);
        this._camPosA.set(tomX + 1.9, 2.1, 4.7);
        this._camPosB.set(rx, 3.4, 11.5);
        this._camLookA.set(tomX, 1.3, 2.4);
        this._camLookB.set(rx, 1.7, 0);
        this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
        this._camLookTgt.lerpVectors(this._camLookA, this._camLookB, e);
      } else {
        // Beat 3: follow the rover as it trims its way along the hedge.
        this.camera.position.set(rx, 3.4, 11.5);
        this._camLookTgt.set(rx, 1.7, 0);
      }
      this.camera.lookAt(this._camLookTgt);

    } else if (this._camPhase === 'win') {
      // Triumphant pull-back + rise — reveals the whole trimmed hedge
      const WIN_DUR = 3.5;
      const p = Math.min(this._camT / WIN_DUR, 1);
      const e = ss(p);
      this._camPosA.set(0, 3.5, 12);
      this._camPosB.set(0, 8.0, 18);
      this._camLookA.set(0, 2.0, 0);
      this._camLookB.set(0, 0.5, 0);
      this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
      this._camLookTgt.lerpVectors(this._camLookA, this._camLookB, e);
      this.camera.lookAt(this._camLookTgt);

    } else if (this._camPhase === 'gameover') {
      // Slow dramatic drop toward ground level
      const OVER_DUR = 2.8;
      const p = Math.min(this._camT / OVER_DUR, 1);
      const e = ss(p);
      this._camPosA.set(0, 3.5, 12);
      this._camPosB.set(0, 0.9, 10.5);
      this._camLookA.set(0, 2.0, 0);
      this._camLookB.set(0, 1.5, 0);
      this.camera.position.lerpVectors(this._camPosA, this._camPosB, e);
      this._camLookTgt.lerpVectors(this._camLookA, this._camLookB, e);
      this.camera.lookAt(this._camLookTgt);
    }
  }

  private _fixedUpdate(dt: number): void {
    this.input.poll();
    this.gamepad.poll();
    this.gamepad.applyTo(this.input.state);
    this.touch.applyTo(this.input.state);

    // Pause toggle (Esc / touch ⏸) — only meaningful during active play.
    // Frozen frames skip all gameplay ticks; the loop keeps rendering the
    // last frame underneath the Vue pause overlay.
    if (this.input.state.pause && (this.state === GAME_STATES.PLAYING || this._paused)) {
      this._setPaused(!this._paused);
    }
    if (this._paused) {
      this.input.consumeOneShots();
      return;
    }

    switch (this.state) {
      case GAME_STATES.MENU:      this._tickMenu(dt);      break;
      case GAME_STATES.PLAYING:   this._tickPlaying(dt);   break;
      case GAME_STATES.CUTSCENE:  this._tickCutscene(dt);  break;
      case GAME_STATES.WIN:
      case GAME_STATES.GAME_OVER: this._tickEndScreen(dt); break;
    }

    // Particles animate in all states (win celebration, fade-out)
    this.leaves.update(dt);
    this._laser.update(dt);
    this.input.consumeOneShots();
  }

  private _tickMenu(dt: number): void {
    this._t += dt;
    this.camel.update(dt);
    this.couple.update(dt);
    if (this.input.state.launch) {
      this._startNewGame();
    } else if (this.input.state.start) {
      if (this._highestLevel > 1) {
        this.startFromLevel(this._highestLevel);
      } else {
        this._startNewGame();
      }
    }
  }

  private _startNewGame(): void {
    this.patience = 1;
    this._trimmed = 0;
    this._score   = 0;
    this._t       = 0;
    this._toolTier = -1;  // force onToolTier to fire even if re-starting at tier 0
    this._roverIntroDone = false;
    this._startLevel(1, true);
    this._setState(GAME_STATES.PLAYING);
  }

  startFromLevel(level: number): void {
    this.patience  = 1;
    this._trimmed  = 0;
    this._score    = 0;
    this._t        = 0;
    this._toolTier = -1;
    // Starting straight into rover territory shouldn't replay the intro mid-jump;
    // only the natural progression past L23 should trigger it.
    this._roverIntroDone = getLevelConfig(level).toolTier >= 5;
    this._startLevel(level, true);
    this._setState(GAME_STATES.PLAYING);
  }

  // Build a level: rebuild the hedge from its config, recompute play/camera
  // bounds and difficulty, rebuild width-fitted scenery. `fresh` = new run
  // (patience resets to full) vs. advancing mid-run (patience tops up).
  private _startLevel(level: number, fresh: boolean): void {
    this._level = level;
    const cfg = getLevelConfig(level);

    this.scene.remove(this.hedge.group);
    this.hedge.dispose();
    this.hedge = new Hedge(cfg);
    this.scene.add(this.hedge.group);

    this.scene.remove(this.couple.group);
    this.couple = new OldCouple(level);
    this.scene.add(this.couple.group);

    // Camel range so its aim point (x + snipOffset) can reach every segment.
    this._camelMinX = this.hedge.leftX  - this._snipOffset;
    this._camelMaxX = this.hedge.rightX - this._snipOffset;
    const cam = GAME_CONFIG.CAMERA;
    this._camBoundX  = Math.max(0, this.hedge.halfWidth - cam.VISIBLE_HALF_X + cam.BOUND_MARGIN);
    this._camFollowX = 0;
    this.camel.x     = 0;

    this._patienceSeconds = cfg.patienceSeconds;
    this._perOvergrown    = cfg.perOvergrown;
    this._camelSpeed      = cfg.camelSpeed;
    this._snipInterval    = cfg.snipInterval;
    this._snipCooldown    = 0;
    if (cfg.toolTier !== this._toolTier) {
      this._toolTier = cfg.toolTier;
      this.callbacks.onToolTier?.(this._toolTier, TOOL_NAMES[this._toolTier]);
    }

    this._buildLevelScenery(this.hedge.halfWidth);

    // Rover level setup
    const wasRoverLevel = this._isRoverLevel;
    this._isRoverLevel = cfg.toolTier >= 5;

    if (this._isRoverLevel) {
      // First entry into rover mode: create entities
      if (!wasRoverLevel) {
        this.camel.group.visible = false;
        this._rover = new Rover();
        this.scene.add(this._rover.group);
        const seatX = this.hedge.rightX + 1.5;
        this._camelSitting = new CamelSitting(seatX, 2.4);
        this.scene.add(this._camelSitting.group);
      }
      // Reposition sitting camel and reset rover each level
      if (this._camelSitting) {
        this._camelSitting.group.position.x = this.hedge.rightX + 1.5;
      }
      if (this._rover) { this._rover.x = 0; this._rover.velX = 0; this._rover.heat = 0; this._rover.isOverheated = false; }
      // Rover snips the segment directly beneath it (no aim offset), so it must be
      // able to travel the full hedge span — not the camel's offset-shifted range.
      this._camelMinX = this.hedge.leftX;
      this._camelMaxX = this.hedge.rightX;
      this._crossTimer = GAME_CONFIG.ROVER.CROSS_INTERVAL_MIN
        + Math.random() * (GAME_CONFIG.ROVER.CROSS_INTERVAL_MAX - GAME_CONFIG.ROVER.CROSS_INTERVAL_MIN);
      // Rover can't snip fast enough to outrun the normal spiral drain — soften it.
      this._patienceSeconds = GAME_CONFIG.ROVER.PATIENCE_SECONDS;
      this._perOvergrown    = cfg.perOvergrown * GAME_CONFIG.ROVER.SPIRAL_MULT;
    } else if (wasRoverLevel) {
      // Returning to normal (shouldn't happen mid-run, but clean up)
      if (this._rover) { this.scene.remove(this._rover.group); this._rover = null; }
      if (this._camelSitting) { this.scene.remove(this._camelSitting.group); this._camelSitting = null; }
      this.camel.group.visible = true;
    }

    this.patience = 1;  // always reset to full — each level is a fresh challenge

    this.couple.setImpatient(this.patience < 0.5);
    this.callbacks.onLevel?.(level);
    this.callbacks.onPatience?.(this.patience);
    this.callbacks.onProgress?.(this.hedge.activeCount, this.hedge.segments.length);
  }

  private _tickPlaying(dt: number): void {
    this._t += dt;

    if (this._admiring) { this._tickAdmire(dt); return; }

    if (this._roverIntro) { this._tickRoverIntro(dt); return; }

    if (this._isRoverLevel) { this._tickPlayingRover(dt); return; }

    const newX = this.camel.x + this.input.state.moveX * this._camelSpeed * dt;
    this.camel.x = Math.max(this._camelMinX, Math.min(this._camelMaxX, newX));
    this.camel.update(dt);

    const aimX = this.camel.x + this._snipOffset;
    this._aimX = aimX;
    const aimSeg = this.hedge.getSegmentAt(aimX);
    this._aimSnippable = !!(aimSeg && this.hedge.isSnippable(aimSeg));

    if (this._snipCooldown > 0) this._snipCooldown -= dt;

    const wantSnip = this.input.state.launch ||
      (this._toolTier > 0 && this.input.state.actionHeld && this._snipCooldown <= 0);

    if (wantSnip) {
      const seg = aimSeg;
      if (seg && this.hedge.isSnippable(seg)) {
        this.hedge.snip(seg);
        this.hedge.startGrowing(seg);
        this.camel.triggerSnip();
        this.audio.playSnip();
        if (this._toolTier >= 4) {
          this._laser.burst(seg.centerX, GAME_CONFIG.HEDGE.SEG_HEIGHT_GROWN, 0.3);
        } else {
          this.leaves.burst(seg.centerX, GAME_CONFIG.HEDGE.SEG_HEIGHT_GROWN, 0.3);
        }
        this._trimmed++;
        const snipPts = GAME_CONFIG.SCORE.PER_SNIP * this._level;
        this._score += snipPts;
        this.callbacks.onScore?.(this._score);
        this.callbacks.onProgress?.(this.hedge.activeCount, this.hedge.segments.length);
        this._snipCooldown = this._snipInterval;
      }
    }

    // Patience drains faster the more overgrown segments are active (Beer Tapper spiral)
    const overdrainRate = this.hedge.overgrownCount * this._perOvergrown;
    this.patience = Math.max(0, this.patience - (1 / this._patienceSeconds + overdrainRate) * dt);
    this.callbacks.onPatience?.(this.patience);
    this.couple.setImpatient(this.patience < 0.5);
    this.couple.update(dt);

    this.hedge.update(dt);
    this.callbacks.onProgress?.(this.hedge.activeCount, this.hedge.segments.length);

    if (this.hedge.allClear) {
      // Endless escalation: pause to admire the pristine hedge, then roll into
      // a harder level once the curtain-call sweep finishes.
      this._beginAdmire();
      return;
    }
    if (this.patience <= 0) {
      this._setState(GAME_STATES.GAME_OVER);
    }
  }

  private _tickPlayingRover(dt: number): void {
    const rover = this._rover!;
    const cfg   = GAME_CONFIG.ROVER;

    if (this.input.state.launch) rover.jump();
    rover.update(dt, this.input.state.moveX, this._camelMinX, this._camelMaxX);
    rover.coolPassive(dt);
    this._camelSitting?.update(dt);

    // Auto-snip: trim whatever segment the rover is currently over — but only if
    // the blade can reach it. Tall pillars demand a jump; short hedges are cut
    // from the ground (and can't be snipped mid-leap, so jumps stay deliberate).
    if (!rover.isOverheated && this._snipCooldown <= 0) {
      const seg = this.hedge.getSegmentAt(rover.x);
      const canReach = seg && (seg.tall
        ? rover.posY >= cfg.REACH_HEIGHT
        : rover.posY <= cfg.GROUND_REACH);
      if (seg && canReach && this.hedge.isSnippable(seg)) {
        this.hedge.snip(seg);
        this.hedge.startGrowing(seg);
        rover.addHeat(cfg.HEAT_PER_SNIP);
        // Rover shreds the hedge — a big leafy burst instead of laser sparks.
        const topY = this.hedge.segTopY(seg);
        this.leaves.burst(seg.centerX, topY, 0.3, 56);
        this.leaves.burst(seg.centerX, topY * 0.6, 0.3, 24);
        this._trimmed++;
        const snipPts = GAME_CONFIG.SCORE.PER_SNIP * this._level;
        this._score += snipPts;
        this.callbacks.onScore?.(this._score);
        this.callbacks.onProgress?.(this.hedge.activeCount, this.hedge.segments.length);
        this._snipCooldown = cfg.SNIP_COOLDOWN;
      }
    }
    if (this._snipCooldown > 0) this._snipCooldown -= dt;

    this.callbacks.onHeat?.(rover.heat, rover.isOverheated);

    // Couple crossing — periodically send one member through the rover lane
    this._crossTimer -= dt;
    if (this._crossTimer <= 0) {
      this._crossTimer = cfg.CROSS_INTERVAL_MIN
        + Math.random() * (cfg.CROSS_INTERVAL_MAX - cfg.CROSS_INTERVAL_MIN);
      const toRight  = Math.random() < 0.5;
      const toX      = toRight ? this.hedge.rightX + 1 : this.hedge.leftX - 1;
      if (Math.random() < 0.5) {
        this.couple.crossMan(toX);
      } else {
        this.couple.crossWoman(toX);
      }
    }

    // Collision: rover hits a couple member — patience penalty + knockback.
    // Jumping clears the couple: skip the check while airborne above their head height.
    const rX = rover.x, rZ = GAME_CONFIG.CAMEL.Z;
    const airborneOver = rover.posY > cfg.JUMP_CLEAR_HEIGHT;
    if (!rover.isOverheated && !airborneOver && (
      Math.hypot(rX - this.couple.manX, rZ - this.couple.manZ) < cfg.COLLISION_RADIUS ||
      Math.hypot(rX - this.couple.womanX, rZ - this.couple.womanZ) < cfg.COLLISION_RADIUS
    )) {
      this.patience = Math.max(0, this.patience - cfg.PATIENCE_PENALTY);
      rover.velX *= -0.6;
    }

    // Patience drain (same formula as normal mode)
    const overdrainRate = this.hedge.overgrownCount * this._perOvergrown;
    this.patience = Math.max(0, this.patience - (1 / this._patienceSeconds + overdrainRate) * dt);
    this.callbacks.onPatience?.(this.patience);
    this.couple.setImpatient(this.patience < 0.5);
    this.couple.update(dt);
    this.hedge.update(dt);
    this.callbacks.onProgress?.(this.hedge.activeCount, this.hedge.segments.length);

    if (this.hedge.allClear) { this._beginAdmire(); return; }
    if (this.patience <= 0)  { this._setState(GAME_STATES.GAME_OVER); }
  }

  // Kick off the "admire your work" interlude after a level is cleared.
  private _beginAdmire(): void {
    this._admiring         = true;
    this._admireT          = 0;
    this._admireHalfWidth  = this.hedge.halfWidth;
    this._nextLevel        = this._level + 1;

    this._camPhase = 'admire';
    this._camT     = 0;

    // Lock the hedge — no segment should regrow during the finish animation.
    this.hedge.freeze();

    // Confetti of clippings along the freshly trimmed hedge.
    const segs = this.hedge.segments;
    for (let i = 0; i < segs.length; i += 2) {
      if (this._toolTier >= 4) {
        this._laser.burst(segs[i].centerX, GAME_CONFIG.HEDGE.SEG_HEIGHT + 0.5, 0.2);
      } else {
        this.leaves.burst(segs[i].centerX, GAME_CONFIG.HEDGE.SEG_HEIGHT + 0.5, 0.2);
      }
    }

    // The couple are delighted — they amble over to admire Tom's handiwork.
    this.couple.setImpatient(false);
    this.couple.gatherNear(0);

    this.callbacks.onLevelCleared?.(this._level);
    const bonus = Math.floor(this.patience * GAME_CONFIG.SCORE.BONUS_MAX * this._level);
    this._score += bonus;
    this.callbacks.onScore?.(this._score);
    this.callbacks.onLevelBonus?.(bonus, this._score);
  }

  // Per-step choreography during the admire interlude. Camera is driven in
  // _renderUpdate; here we centre Tom, let the couple gather, and keep foliage
  // swaying. When the sweep finishes, advance to the next (harder) level.
  private _tickAdmire(dt: number): void {
    this._admireT += dt;

    if (this._isRoverLevel) {
      // Rover coasts to a stop
      this._rover?.update(dt, 0, this._camelMinX, this._camelMaxX);
      this._camelSitting?.update(dt);
    } else {
      // Ease Tom to centre stage for the curtain call.
      this.camel.x += (0 - this.camel.x) * Math.min(1, dt * 2);
      this.camel.update(dt);
    }
    this.couple.update(dt);
    this.hedge.update(dt);

    if (this._admireT >= this._admireDur) {
      this._admiring = false;
      this._beginCutscene(this._nextLevel);
    }
  }

  private _beginCutscene(nextLevel: number): void {
    this._nextCutsceneLevel = nextLevel;
    this._csLevelBuilt      = false;
    this._csPrevPhase       = '';
    this._csRoadStartX      = -(this.hedge.halfWidth + 2.5);
    if (this._cutscene) { this._cutscene.disposeStreet(); }
    if (this._streetGroup) { this.scene.remove(this._streetGroup); this._streetGroup = null; }
    this._cutscene = new Cutscene(this._csRoadStartX, nextLevel);
    this.scene.add(this._cutscene.group);
    this.scene.add(this._cutscene.streetGroup);
    this._streetGroup = this._cutscene.streetGroup;
    this.camel.group.visible  = false;
    this.couple.group.visible = false;
    if (this._rover)        this._rover.group.visible        = false;
    if (this._camelSitting) this._camelSitting.group.visible = false;
    // Camera starts right of car; depart phase eases from here
    this._csFollowX = this._csRoadStartX + 1;
    this._camPhase  = 'cutscene';
    this._camT      = 0;
    // Show the next level number on the cutscene card immediately
    this.callbacks.onLevel?.(nextLevel);
    this._setState(GAME_STATES.CUTSCENE);
  }

  private _tickCutscene(_dt: number): void {
    // Rebuild level at turn beat — car is at far-left end of road, old garden off-screen
    if (!this._csLevelBuilt && this._cutscene?.phase === 'turn') {
      this._startLevel(this._nextCutsceneLevel, false);
      this.couple.group.visible = false;   // re-hide the freshly created couple
      this._csLevelBuilt = true;
    }
    // Space / launch skips to gameplay immediately
    if (this.input.state.start || this.input.state.launch) {
      this._endCutscene();
    }
  }

  private _endCutscene(): void {
    if (!this._cutscene) return;
    this.audio.stopCar();   // halt engine sound (covers skip mid-drive too)
    // If skipped before transit, build the level now
    if (!this._csLevelBuilt) {
      this._startLevel(this._nextCutsceneLevel, false);
      this._csLevelBuilt = true;
    }
    this.scene.remove(this._cutscene.group);
    this._cutscene.dispose();
    this._cutscene = null;
    this.camel.group.visible  = !this._isRoverLevel;
    this.couple.group.visible = true;
    if (this._rover)        this._rover.group.visible        = this._isRoverLevel;
    if (this._camelSitting) this._camelSitting.group.visible = this._isRoverLevel;
    this._csPrevPhase = '';
    this._camT     = 0;
    // First arrival at a rover garden: roll the one-time "rover takes over" intro
    // instead of the usual pan-in.
    if (this._isRoverLevel && !this._roverIntroDone) {
      this._beginRoverIntro();
    } else {
      this._camPhase = 'pan-in';
      this._setState(GAME_STATES.PLAYING);
    }
  }

  // One-time showcase: Tom sits by his signpost while the new Rover rolls along
  // the hedge auto-trimming a few sections, then control passes to the player.
  // Demo-snipped bushes regrow on the normal timer, so the level stays intact.
  private _beginRoverIntro(): void {
    this._roverIntro     = true;
    this._roverIntroDone = true;
    // Park the rover just off the left end, ready to drive across.
    if (this._rover) {
      this._rover.x            = this.hedge.leftX - 1.5;
      this._rover.velX         = 0;
      this._rover.heat         = 0;
      this._rover.isOverheated = false;
      this._rover.group.rotation.y = 0;   // face +X (driving right)
    }
    this._snipCooldown = 0;
    this.callbacks.onIntroCaption?.('Tom hangs up his shears — let the Rover take it from here!');
    // Enter PLAYING first — _setState forces camPhase to 'pan-in', so claim the
    // rover-intro phase *after* it (mirrors how CUTSCENE is handled).
    this._setState(GAME_STATES.PLAYING);
    this._camPhase = 'rover-intro';
    this._camT     = 0;
  }

  private _tickRoverIntro(dt: number): void {
    const rover = this._rover;
    const cfg   = GAME_CONFIG.ROVER;

    // Idle life: Tom's head-turn, couple ambling, foliage sway.
    this._camelSitting?.update(dt);
    this.couple.update(dt);
    this.hedge.update(dt);

    if (rover) {
      // Scripted glide from the left end to the right end. Stays parked off the
      // left edge through the Tom beat + pan, then rolls once the camera arrives.
      const driveStart = 3.0;
      const driveEnd   = ROVER_INTRO_DUR - 0.8;
      const p = Math.max(0, Math.min(1, (this._camT - driveStart) / (driveEnd - driveStart)));
      const e = p * p * (3 - 2 * p);  // smoothstep so it eases in and out
      const fromX = this.hedge.leftX - 1.5;
      const toX   = 0;   // ease to mid-screen — where the player takes over (no jump)
      const prevX = rover.x;
      rover.x = fromX + (toX - fromX) * e;
      rover.group.rotation.y = rover.x >= prevX ? 0 : Math.PI;
      // Subtle driving bounce.
      rover.group.position.y = Math.abs(Math.sin(this._camT * 9)) * 0.06;

      // Auto-snip the short bush it's rolling over — pure spectacle, regrows later.
      // Leave at least a few overgrown so the board can't auto-clear mid-intro.
      if (this._snipCooldown <= 0 && this.hedge.overgrownCount > 3) {
        const seg = this.hedge.getSegmentAt(rover.x);
        if (seg && !seg.tall && this.hedge.isSnippable(seg)) {
          this.hedge.snip(seg);
          this.hedge.startGrowing(seg);
          const topY = this.hedge.segTopY(seg);
          this.leaves.burst(seg.centerX, topY, 0.3, 56);
          this.leaves.burst(seg.centerX, topY * 0.6, 0.3, 24);
          this._snipCooldown = cfg.SNIP_COOLDOWN;
        }
      }
      if (this._snipCooldown > 0) this._snipCooldown -= dt;
    }

    // Skip on input, or finish when the window elapses.
    if (this.input.state.start || this.input.state.launch || this._camT >= ROVER_INTRO_DUR) {
      this._endRoverIntro();
    }
  }

  private _endRoverIntro(): void {
    this._roverIntro = false;
    this.callbacks.onIntroCaption?.(null);
    // Reset the rover to centre and clear any demo heat before the player drives.
    if (this._rover) {
      this._rover.x                = 0;
      this._rover.velX             = 0;
      this._rover.heat             = 0;
      this._rover.isOverheated     = false;
      this._rover.group.position.y = 0;
      this._rover.group.rotation.y = 0;
    }
    this._snipCooldown = 0;
    this._camFollowX = 0;
    this._camPhase = 'pan-in';
    this._camT     = 0;
  }

  private _tickEndScreen(dt: number): void {
    this.couple.update(dt);
    this.camel.update(dt);
    // Ignore input for a beat so space-spam from gameplay can't skip past the
    // score screen before the player has even seen it.
    if (this._camT < 1.2) return;
    if (this.input.state.start || this.input.state.launch) {
      // On game over, if a checkpoint exists, Space/Enter continues from the
      // highest level reached rather than dropping back to the menu.
      if (this.state === GAME_STATES.GAME_OVER && this._highestLevel > 1) {
        this.startFromLevel(this._highestLevel);
      } else {
        this._setState(GAME_STATES.MENU);
      }
    }
  }

  // Freeze / unfreeze gameplay. Notifies the HUD so it can show the overlay,
  // and toggles the touch ⏸ button (only shown while a frozen-able state runs).
  private _setPaused(paused: boolean): void {
    if (this._paused === paused) return;
    this._paused = paused;
    this.touch.setPaused(paused);
    this.callbacks.onPause?.(paused);
  }

  // Public resume — called by the HUD's RESUME button / backdrop tap.
  resume(): void { this._setPaused(false); }

  // Public quit to menu — called by the HUD's QUIT button.
  goToMenu(): void { this._setState(GAME_STATES.MENU); }

  toggleShaderPanel(): void { this._shaderPanel.toggle(); }

  private _setState(next: string): void {
    this.state = next;
    this.callbacks.onStateChange?.(next);

    // Leaving play (win / loss / menu) always clears a lingering pause.
    if (next !== GAME_STATES.PLAYING) this._setPaused(false);
    // The touch ⏸ button only makes sense during active play.
    this.touch.setPauseVisible(next === GAME_STATES.PLAYING);

    if (next === GAME_STATES.CUTSCENE) {
      // Camera phase already set in _beginCutscene — don't touch it here
    } else if (next === GAME_STATES.PLAYING) {
      this._camPhase = 'pan-in';
      this._camT = 0;
    } else if (next === GAME_STATES.WIN) {
      this._camPhase = 'win';
      this._camT = 0;
      // Celebration: burst clippings from every trimmed segment
      const segs = this.hedge.segments;
      for (let i = 0; i < segs.length; i += 2) {
        if (this._toolTier >= 4) {
          this._laser.burst(segs[i].centerX, GAME_CONFIG.HEDGE.SEG_HEIGHT + 0.5, 0.2);
        } else {
          this.leaves.burst(segs[i].centerX, GAME_CONFIG.HEDGE.SEG_HEIGHT + 0.5, 0.2);
        }
      }
      if (this._score > this._hiScore) {
        this._hiScore = this._score;
        localStorage.setItem('camelClipper_hiScore', String(this._hiScore));
      }
      if (this._level > this._highestLevel) {
        this._highestLevel = this._level;
        localStorage.setItem('camelClipper_highestLevel', String(this._highestLevel));
      }
      this.callbacks.onHighScore?.(this._hiScore, this._highestLevel);
    } else if (next === GAME_STATES.GAME_OVER) {
      this._camPhase = 'gameover';
      this._camT = 0;
      if (this._score > this._hiScore) {
        this._hiScore = this._score;
        localStorage.setItem('camelClipper_hiScore', String(this._hiScore));
      }
      if (this._level > this._highestLevel) {
        this._highestLevel = this._level;
        localStorage.setItem('camelClipper_highestLevel', String(this._highestLevel));
      }
      this.callbacks.onHighScore?.(this._hiScore, this._highestLevel);
    } else if (next === GAME_STATES.MENU) {
      this._camPhase = 'menu';
      this._camT = 0;
    }
  }
}
