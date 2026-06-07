import * as THREE from 'three';
import { CRTEffect }   from './CRTEffect';
import { PixelEffect } from './PixelEffect';
import { RetroEffect } from './RetroEffect';

// Simple blit: copies a texture to an RT or the screen.
class Blit {
  private _mat:   THREE.ShaderMaterial;
  private _scene: THREE.Scene;
  private _cam:   THREE.OrthographicCamera;

  constructor() {
    this._mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:   /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat);
    this._scene = new THREE.Scene();
    this._scene.add(quad);
    this._cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  render(renderer: THREE.WebGLRenderer, tex: THREE.Texture, outputRT: THREE.WebGLRenderTarget | null): void {
    this._mat.uniforms.tDiffuse.value = tex;
    renderer.setRenderTarget(outputRT);
    renderer.render(this._scene, this._cam);
  }

  dispose(): void { this._mat.dispose(); }
}

export class PostEffectChain {
  crt:   CRTEffect;
  pixel: PixelEffect;
  retro: RetroEffect;

  private _renderer: THREE.WebGLRenderer;
  private _rtA:      THREE.WebGLRenderTarget;
  private _rtB:      THREE.WebGLRenderTarget;
  private _blit:     Blit;

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer;
    const sz = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const w  = Math.floor(sz.x * pr);
    const h  = Math.floor(sz.y * pr);

    const opts: THREE.RenderTargetOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    };
    this._rtA  = new THREE.WebGLRenderTarget(w, h, opts);
    this._rtB  = new THREE.WebGLRenderTarget(w, h, opts);
    this._blit = new Blit();

    this.crt   = new CRTEffect(renderer);
    this.pixel = new PixelEffect(renderer);
    this.retro = new RetroEffect(renderer);
  }

  get anyEnabled(): boolean {
    return this.crt.enabled || this.pixel.enabled || this.retro.enabled;
  }

  // OutlinePass (or whatever renders the scene) writes here.
  get captureRT(): THREE.WebGLRenderTarget { return this._rtA; }

  // Call after scene has been rendered to captureRT.
  render(dt: number): void {
    let readRT  = this._rtA;
    let writeRT = this._rtB;

    if (this.pixel.enabled) {
      this.pixel.render(readRT.texture, writeRT);
      [readRT, writeRT] = [writeRT, readRT];
    }

    if (this.retro.enabled) {
      this.retro.render(readRT.texture, writeRT);
      [readRT, writeRT] = [writeRT, readRT];
    }

    if (this.crt.enabled) {
      this.crt.render(readRT.texture, null, dt);
    } else {
      this._blit.render(this._renderer, readRT.texture, null);
    }
  }

  resize(w: number, h: number): void {
    const pr = this._renderer.getPixelRatio();
    const pw = Math.floor(w * pr);
    const ph = Math.floor(h * pr);
    this._rtA.setSize(pw, ph);
    this._rtB.setSize(pw, ph);
    this.crt.resize(w, h);
    this.pixel.resize(w, h);
    this.retro.resize(w, h);
  }

  dispose(): void {
    this._rtA.dispose();
    this._rtB.dispose();
    this.crt.dispose();
    this.pixel.dispose();
    this.retro.dispose();
    this._blit.dispose();
  }
}
