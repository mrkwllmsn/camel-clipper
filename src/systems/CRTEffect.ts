import * as THREE from 'three';

export interface CRTSettings {
  scanlineIntensity: number;
  curvature:         number;
  vignetteStrength:  number;
  colorBleed:        number;
  flickerSpeed:      number;
  flickerAmount:     number;
  brightness:        number;
}

export class CRTEffect {
  enabled = false;

  settings: CRTSettings = {
    scanlineIntensity: 0.25,
    curvature:         0.15,
    vignetteStrength:  0.4,
    colorBleed:        0.003,
    flickerSpeed:      8.0,
    flickerAmount:     0.03,
    brightness:        1.1,
  };

  private _renderer:  THREE.WebGLRenderer;
  private _material:  THREE.ShaderMaterial;
  private _quadScene: THREE.Scene;
  private _quadCam:   THREE.OrthographicCamera;
  private _time = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this._renderer = renderer;
    const sz = renderer.getSize(new THREE.Vector2());

    this._material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse:          { value: null },
        time:              { value: 0.0 },
        resolution:        { value: new THREE.Vector2(sz.x, sz.y) },
        scanlineIntensity: { value: this.settings.scanlineIntensity },
        curvature:         { value: this.settings.curvature },
        vignetteStrength:  { value: this.settings.vignetteStrength },
        colorBleed:        { value: this.settings.colorBleed },
        flickerSpeed:      { value: this.settings.flickerSpeed },
        flickerAmount:     { value: this.settings.flickerAmount },
        brightness:        { value: this.settings.brightness },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform vec2  resolution;
        uniform float scanlineIntensity;
        uniform float curvature;
        uniform float vignetteStrength;
        uniform float colorBleed;
        uniform float flickerSpeed;
        uniform float flickerAmount;
        uniform float brightness;
        varying vec2 vUv;

        vec2 curveUV(vec2 uv) {
          uv = uv * 2.0 - 1.0;
          vec2 offset = abs(uv.yx) / vec2(curvature == 0.0 ? 1e10 : 1.0 / curvature);
          uv = uv + uv * offset * offset;
          return uv * 0.5 + 0.5;
        }
        float scanline(vec2 uv) {
          float line = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
          return 1.0 - line * scanlineIntensity;
        }
        float vignette(vec2 uv) {
          uv = uv * 2.0 - 1.0;
          return 1.0 - dot(uv, uv) * vignetteStrength;
        }
        vec3 colorBleedSample(sampler2D tex, vec2 uv) {
          float r = texture2D(tex, uv + vec2(-colorBleed, 0.0)).r;
          float g = texture2D(tex, uv).g;
          float b = texture2D(tex, uv + vec2( colorBleed, 0.0)).b;
          return vec3(r, g, b);
        }

        void main() {
          vec2 uv = curveUV(vUv);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
          }
          vec3 col = colorBleedSample(tDiffuse, uv);
          col *= vec3(1.05, 1.0, 0.92);
          col *= scanline(uv);
          col *= vignette(uv);
          float flick = 1.0 - flickerAmount * (sin(time * flickerSpeed) * 0.5 + 0.5);
          col *= flick * brightness;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      depthTest:  false,
      depthWrite: false,
      toneMapped: false,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._material);
    this._quadScene = new THREE.Scene();
    this._quadScene.add(quad);
    this._quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  resize(w: number, h: number): void {
    this._material.uniforms.resolution.value.set(w, h);
  }

  render(inputTexture: THREE.Texture, outputRT: THREE.WebGLRenderTarget | null, dt: number): void {
    this._time += dt;
    const u = this._material.uniforms;
    u.tDiffuse.value          = inputTexture;
    u.time.value              = this._time;
    u.scanlineIntensity.value = this.settings.scanlineIntensity;
    u.curvature.value         = this.settings.curvature;
    u.vignetteStrength.value  = this.settings.vignetteStrength;
    u.colorBleed.value        = this.settings.colorBleed;
    u.flickerSpeed.value      = this.settings.flickerSpeed;
    u.flickerAmount.value     = this.settings.flickerAmount;
    u.brightness.value        = this.settings.brightness;
    this._renderer.setRenderTarget(outputRT);
    this._renderer.render(this._quadScene, this._quadCam);
  }

  dispose(): void {
    this._material.dispose();
  }
}
