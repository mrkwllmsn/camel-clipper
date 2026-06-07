import * as THREE from 'three';

export interface RetroSettings {
  colorDepth:      number;
  ditherStrength:  number;
  ditherSize:      number;
  saturation:      number;
  tint:            [number, number, number];
}

export class RetroEffect {
  enabled = false;

  settings: RetroSettings = {
    colorDepth:     16,
    ditherStrength: 0.5,
    ditherSize:     4,
    saturation:     1.0,
    tint:           [1.0, 1.0, 1.0],
  };

  private _renderer:  THREE.WebGLRenderer;
  private _material:  THREE.ShaderMaterial;
  private _quadScene: THREE.Scene;
  private _quadCam:   THREE.OrthographicCamera;

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer;
    const sz = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();

    this._material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:       { value: null },
        resolution:     { value: new THREE.Vector2(sz.x * pr, sz.y * pr) },
        colorDepth:     { value: this.settings.colorDepth },
        ditherStrength: { value: this.settings.ditherStrength },
        ditherSize:     { value: this.settings.ditherSize },
        saturation:     { value: this.settings.saturation },
        tint:           { value: new THREE.Vector3(...this.settings.tint) },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2  resolution;
        uniform float colorDepth;
        uniform float ditherStrength;
        uniform float ditherSize;
        uniform float saturation;
        uniform vec3  tint;
        varying vec2 vUv;

        float bayer2(vec2 pos) {
          ivec2 p = ivec2(mod(pos, 2.0));
          int idx = p.x + p.y * 2;
          float m;
          if (idx == 0) m = 0.0; else if (idx == 1) m = 2.0;
          else if (idx == 2) m = 3.0; else m = 1.0;
          return m / 4.0;
        }
        float bayer4(vec2 pos) {
          ivec2 p = ivec2(mod(pos, 4.0));
          int idx = p.x + p.y * 4;
          float m;
          if      (idx==0)  m=0.0;  else if (idx==1)  m=8.0;
          else if (idx==2)  m=2.0;  else if (idx==3)  m=10.0;
          else if (idx==4)  m=12.0; else if (idx==5)  m=4.0;
          else if (idx==6)  m=14.0; else if (idx==7)  m=6.0;
          else if (idx==8)  m=3.0;  else if (idx==9)  m=11.0;
          else if (idx==10) m=1.0;  else if (idx==11) m=9.0;
          else if (idx==12) m=15.0; else if (idx==13) m=7.0;
          else if (idx==14) m=13.0; else m=5.0;
          return m / 16.0;
        }
        float bayer8(vec2 pos) { return (bayer4(pos) + bayer4(pos * 0.5)) * 0.5; }

        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          float gray = dot(col, vec3(0.299, 0.587, 0.114));
          col = mix(vec3(gray), col, saturation);

          vec2 pixelPos = vUv * resolution;
          float dither;
          if (ditherSize < 3.0)      dither = bayer2(pixelPos);
          else if (ditherSize < 6.0) dither = bayer4(pixelPos);
          else                       dither = bayer8(pixelPos);

          float spread = ditherStrength / colorDepth;
          col += (dither - 0.5) * spread;
          col = floor(col * colorDepth + 0.5) / colorDepth;
          col = clamp(col * tint, 0.0, 1.0);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest: false, depthWrite: false, toneMapped: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._material);
    this._quadScene = new THREE.Scene();
    this._quadScene.add(quad);
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w: number, h: number): void {
    const pr = this._renderer.getPixelRatio();
    this._material.uniforms.resolution.value.set(w * pr, h * pr);
  }

  render(inputTexture: THREE.Texture, outputRT: THREE.WebGLRenderTarget | null): void {
    const u = this._material.uniforms;
    u.tDiffuse.value       = inputTexture;
    u.colorDepth.value     = this.settings.colorDepth;
    u.ditherStrength.value = this.settings.ditherStrength;
    u.ditherSize.value     = this.settings.ditherSize;
    u.saturation.value     = this.settings.saturation;
    u.tint.value.set(...this.settings.tint);
    this._renderer.setRenderTarget(outputRT);
    this._renderer.render(this._quadScene, this._quadCam);
  }

  dispose(): void {
    this._material.dispose();
  }
}
