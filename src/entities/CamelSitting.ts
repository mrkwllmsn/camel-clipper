import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export class CamelSitting {
  group: THREE.Group;
  private _t = 0;
  private _onLoaded: (() => void) | null = null;

  constructor(x: number, z: number, onLoaded?: () => void) {
    this._onLoaded = onLoaded ?? null;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    this._addPlaceholder();
    void this._loadGLB();
  }

  private _addPlaceholder(): void {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 2.2, 0.8),
      new THREE.MeshLambertMaterial({ color: 0xd4a853 }),
    );
    body.position.y = 1.1;
    body.name = 'placeholder';
    this.group.add(body);
  }

  private async _loadGLB(): Promise<void> {
    try {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf   = await loader.loadAsync(`${import.meta.env.BASE_URL}models/camelsitting.glb`);
      const model  = gltf.scene;

      const box  = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s    = 3.5 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(s);

      box.setFromObject(model);
      // Face toward the hedge (camera side)
      model.rotation.y = Math.PI;
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
      });

      const ph = this.group.getObjectByName('placeholder');
      if (ph) {
        this.group.remove(ph);
        (ph as THREE.Mesh).geometry.dispose();
      }
      this.group.add(model);
    } catch (err) {
      console.warn('CamelSitting GLB load failed:', err);
    } finally {
      this._onLoaded?.();
    }
  }

  update(dt: number): void {
    this._t += dt;
    // Gentle idle bob and head-turn — watching the rover
    this.group.rotation.z = Math.sin(this._t * 0.8) * 0.015;
    this.group.rotation.y = Math.PI + Math.sin(this._t * 0.35) * 0.12;
  }
}
