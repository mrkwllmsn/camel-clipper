import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GAME_CONFIG } from '../utils/Constants';

export class Rover {
  group:       THREE.Group;
  velX:        number = 0;
  velY:        number = 0;       // vertical velocity for jumping
  posY:        number = 0;       // height above ground
  private _jumpsLeft: number = 2; // remaining jumps before landing (double jump)
  heat:        number = 0;       // 0..1
  isOverheated: boolean = false;
  private _coolTimer: number = 0;
  private _t: number = 0;
  private _onLoaded: (() => void) | null = null;

  constructor(onLoaded?: () => void) {
    this._onLoaded = onLoaded ?? null;
    this.group = new THREE.Group();
    this.group.position.set(0, 0, GAME_CONFIG.CAMEL.Z);
    // Model body runs along X natively, so it already drives side-on. Face right at rest.
    this.group.rotation.y = 0;
    this._addPlaceholder();
    void this._loadGLB();
  }

  private _addPlaceholder(): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.5, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x44aa44 }),
    );
    body.position.y = 0.25;
    body.name = 'placeholder';
    this.group.add(body);
  }

  private async _loadGLB(): Promise<void> {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf   = await loader.loadAsync(`${import.meta.env.BASE_URL}models/rover_decimated.glb`);
      const model  = gltf.scene;

      const box  = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s    = 2.8 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);

      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.x = -center.x;
      model.position.y = -box.min.y;
      model.position.z = -center.z;

      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        // The rover GLB ships highly metallic with no env map, so it renders
        // near-black under the scene's ambient+sun lights. Knock metalness down
        // and add a touch of emissive so it reads in the diffuse lighting.
        if (mat.isMaterial) {
          mat.metalness = 0.1;
          mat.roughness = Math.max(0.6, mat.roughness ?? 1.0);
          mat.emissive = new THREE.Color(0x222222);
          mat.emissiveIntensity = 1.0;
          mat.needsUpdate = true;
        }
      });

      const ph = this.group.getObjectByName('placeholder');
      if (ph) {
        this.group.remove(ph);
        (ph as THREE.Mesh).geometry.dispose();
      }
      this.group.add(model);
    } catch (err) {
      console.warn('Rover GLB load failed:', err);
    } finally {
      this._onLoaded?.();
    }
  }

  get x(): number { return this.group.position.x; }
  set x(v: number) { this.group.position.x = v; }

  update(dt: number, moveX: number, xMin: number, xMax: number): void {
    this._t += dt;
    const cfg = GAME_CONFIG.ROVER;

    if (this.isOverheated) {
      this._coolTimer -= dt;
      if (this._coolTimer <= 0) {
        this.isOverheated = false;
        this.heat         = 0;
        this.velX         = 0;
      }
      // Jitter while cooling
      this.group.rotation.z = Math.sin(this._t * 14) * 0.05;
      return;
    }

    this.velX += moveX * cfg.ACCEL * dt;
    this.velX -= this.velX * cfg.FRICTION * dt;
    this.velX  = Math.max(-cfg.MAX_SPEED, Math.min(cfg.MAX_SPEED, this.velX));
    const newX = this.group.position.x + this.velX * dt;
    this.group.position.x = Math.max(xMin, Math.min(xMax, newX));

    // Bounce off bounds
    if (this.group.position.x === xMin || this.group.position.x === xMax) {
      this.velX *= -0.4;
    }

    // Face direction of travel (model faces -X natively)
    if (Math.abs(this.velX) > 0.3) {
      this.group.rotation.y = this.velX > 0 ? Math.PI : 0;
    }

    // Vertical jump physics — gravity pulls posY back to the ground.
    if (this.posY > 0 || this.velY !== 0) {
      this.velY -= cfg.GRAVITY * dt;
      this.posY += this.velY * dt;
      if (this.posY <= 0) { this.posY = 0; this.velY = 0; this._jumpsLeft = 2; }
    }

    const speed = Math.abs(this.velX);
    // Subtle bounce while moving, on top of any jump height
    const bounce = Math.abs(Math.sin(this._t * 7)) * speed * 0.005;
    this.group.position.y = this.posY + bounce;
    // Tilt slightly nose-up while airborne for a bit of flair
    this.group.rotation.z = this.posY > 0 ? (this.velX > 0 ? 0.12 : -0.12) : 0;
  }

  jump(): void {
    // Ground jump + one mid-air jump (double jump). Not while frozen overheating.
    if (this.isOverheated || this._jumpsLeft <= 0) return;
    this.velY = GAME_CONFIG.ROVER.JUMP_SPEED;
    this._jumpsLeft--;
  }

  addHeat(amount: number): void {
    if (this.isOverheated) return;
    this.heat = Math.min(1, this.heat + amount);
    if (this.heat >= 1) {
      this.isOverheated = true;
      this._coolTimer   = GAME_CONFIG.ROVER.OVERHEAT_COOLDOWN;
      this.velX         = 0;
    }
  }

  coolPassive(dt: number): void {
    if (!this.isOverheated) {
      this.heat = Math.max(0, this.heat - GAME_CONFIG.ROVER.HEAT_DISSIPATE * dt);
    }
  }
}
