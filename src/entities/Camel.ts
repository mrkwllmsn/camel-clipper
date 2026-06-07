import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GAME_CONFIG } from '../utils/Constants';

export class Camel {
  group:           THREE.Group;
  private _t:      number = 0;
  private _snip:   number = 0;

  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, GAME_CONFIG.CAMEL.Z);
    this._addPlaceholder();
    void this._loadGLB();
  }

  private _addPlaceholder(): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 3.2, 0.8),
      new THREE.MeshLambertMaterial({ color: 0xd4a853 }),
    );
    body.position.y = 1.6;
    body.name = 'placeholder';
    this.group.add(body);
  }

  private async _loadGLB(): Promise<void> {
    try {
      const loader = new GLTFLoader();
      const gltf   = await loader.loadAsync('/models/camel2.glb');
      const model  = gltf.scene;

      const box  = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s    = 4.2 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);

      box.setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.rotation.y = -Math.PI / 2;

      model.position.x = -center.x;
      model.position.y = -box.min.y;
      model.position.z = -center.z;

      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      });

      const ph = this.group.getObjectByName('placeholder');
      if (ph) {
        this.group.remove(ph);
        (ph as THREE.Mesh).geometry.dispose();
      }
      this.group.add(model);
    } catch (err) {
      console.warn('Camel GLB load failed:', err);
    }
  }

  get x(): number { return this.group.position.x; }
  set x(v: number) { this.group.position.x = v; }

  triggerSnip(): void {
    this._snip = 0.28;
  }

  update(dt: number): void {
    this._t += dt;

    // Ladder sway
    this.group.rotation.z = Math.sin(this._t * 1.3) * 0.028;

    // Snip lunge: forward Z push + forward lean rotation
    if (this._snip > 0) {
      this._snip -= dt;
      const t = Math.max(0, this._snip / 0.28);
      const arc = Math.sin(t * Math.PI);
      this.group.position.z = GAME_CONFIG.CAMEL.Z - arc * 0.4;
      this.group.rotation.x = -arc * 0.18;
    } else {
      this.group.position.z = GAME_CONFIG.CAMEL.Z;
      this.group.rotation.x = 0;
    }
  }
}
