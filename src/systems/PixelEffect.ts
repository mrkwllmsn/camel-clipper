import * as THREE from 'three';

export interface PixelSettings {
  pixelSize:    number;
  edgeStrength: number;
}

export class PixelEffect {
  enabled = false;

  settings: PixelSettings = {
    pixelSize:    4,
    edgeStrength: 0.0,
  };

  private _renderer:   THREE.WebGLRenderer;
  private _lowResRT:   THREE.WebGLRenderTarget;
  private _material:   THREE.ShaderMaterial;
  private _copyMat:    THREE.ShaderMaterial;
  private _quadScene:  THREE.Scene;
  private _copyScene:  THREE.Scene;
  private _quadCam:    THREE.OrthographicCamera;

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer;
    const sz = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const w  = sz.x * pr;
    const h  = sz.y * pr;
    const ps = Math.max(1, this.settings.pixelSize);

    this._lowResRT = new THREE.WebGLRenderTarget(
      Math.floor(w / ps), Math.floor(h / ps),
      { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter },
    );

    this._copyMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader:   /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }`,
      depthTest: false, depthWrite: false, toneMapped: false,
    });

    this._material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:     { value: null },
        resolution:   { value: new THREE.Vector2(w, h) },
        pixelSize:    { value: ps },
        edgeStrength: { value: this.settings.edgeStrength },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2  resolution;
        uniform float pixelSize;
        uniform float edgeStrength;
        varying vec2 vUv;

        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          if (edgeStrength > 0.0) {
            vec2 t = pixelSize / resolution;
            vec3 tl = texture2D(tDiffuse, vUv + vec2(-t.x,  t.y)).rgb;
            vec3 tt = texture2D(tDiffuse, vUv + vec2(0.0,   t.y)).rgb;
            vec3 tr = texture2D(tDiffuse, vUv + vec2( t.x,  t.y)).rgb;
            vec3 l  = texture2D(tDiffuse, vUv + vec2(-t.x,  0.0)).rgb;
            vec3 r  = texture2D(tDiffuse, vUv + vec2( t.x,  0.0)).rgb;
            vec3 bl = texture2D(tDiffuse, vUv + vec2(-t.x, -t.y)).rgb;
            vec3 b  = texture2D(tDiffuse, vUv + vec2(0.0,  -t.y)).rgb;
            vec3 br = texture2D(tDiffuse, vUv + vec2( t.x, -t.y)).rgb;
            vec3 gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
            vec3 gy = -tl - 2.0*tt - tr + bl + 2.0*b + br;
            float edge = smoothstep(0.1, 0.5, length(gx) + length(gy));
            col = mix(col, vec3(0.0), edge * edgeStrength);
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false,
    });

    const geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo, this._material);
    this._quadScene = new THREE.Scene();
    this._quadScene.add(quad);

    const copyQuad = new THREE.Mesh(geo.clone(), this._copyMat);
    this._copyScene = new THREE.Scene();
    this._copyScene.add(copyQuad);

    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w: number, h: number): void {
    const pr = this._renderer.getPixelRatio();
    const pw = w * pr, ph = h * pr;
    const ps = Math.max(1, this.settings.pixelSize);
    this._lowResRT.setSize(Math.floor(pw / ps), Math.floor(ph / ps));
    this._material.uniforms.resolution.value.set(pw, ph);
  }

  updatePixelSize(): void {
    const sz = this._renderer.getSize(new THREE.Vector2());
    const pr = this._renderer.getPixelRatio();
    const ps = Math.max(1, this.settings.pixelSize);
    this._lowResRT.setSize(Math.floor(sz.x * pr / ps), Math.floor(sz.y * pr / ps));
  }

  render(inputTexture: THREE.Texture, outputRT: THREE.WebGLRenderTarget | null): void {
    this._material.uniforms.pixelSize.value    = this.settings.pixelSize;
    this._material.uniforms.edgeStrength.value = this.settings.edgeStrength;
    // Downsample input → low-res RT
    this._copyMat.uniforms.tDiffuse.value = inputTexture;
    this._renderer.setRenderTarget(this._lowResRT);
    this._renderer.render(this._copyScene, this._quadCam);
    // Upscale low-res (nearest filter) → output
    this._material.uniforms.tDiffuse.value = this._lowResRT.texture;
    this._renderer.setRenderTarget(outputRT);
    this._renderer.render(this._quadScene, this._quadCam);
  }

  dispose(): void {
    this._lowResRT.dispose();
    this._material.dispose();
    this._copyMat.dispose();
  }
}
