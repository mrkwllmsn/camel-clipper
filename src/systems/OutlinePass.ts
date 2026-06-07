import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Roberts cross on linearised depth + view-space normals.
// Outline fires wherever either gradient exceeds its threshold.
const FRAG = /* glsl */`
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2  uTexelSize;
  uniform float uNear;
  uniform float uFar;
  uniform float uDepthThresh;
  uniform float uNormalThresh;
  uniform float uOutlineWidth;
  uniform vec3  uOutlineColor;

  varying vec2 vUv;

  float linearDepth(vec2 uv) {
    float z    = texture2D(tDepth, uv).r;
    float zNdc = z * 2.0 - 1.0;
    float lin  = (2.0 * uNear * uFar) / (uFar + uNear - zNdc * (uFar - uNear));
    return lin / uFar;
  }

  vec3 sampleNormal(vec2 uv) {
    return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
  }

  void main() {
    vec2 t = uTexelSize * uOutlineWidth;

    // Roberts cross — two diagonal pairs
    float d0 = linearDepth(vUv + vec2( t.x,  t.y));
    float d1 = linearDepth(vUv + vec2(-t.x, -t.y));
    float d2 = linearDepth(vUv + vec2(-t.x,  t.y));
    float d3 = linearDepth(vUv + vec2( t.x, -t.y));
    float dEdge = sqrt((d0 - d1) * (d0 - d1) + (d2 - d3) * (d2 - d3));

    vec3 n0 = sampleNormal(vUv + vec2( t.x,  t.y));
    vec3 n1 = sampleNormal(vUv + vec2(-t.x, -t.y));
    vec3 n2 = sampleNormal(vUv + vec2(-t.x,  t.y));
    vec3 n3 = sampleNormal(vUv + vec2( t.x, -t.y));
    float nEdge = max(1.0 - dot(n0, n1), 1.0 - dot(n2, n3));

    float centerDepth = linearDepth(vUv);

    // Relative depth edge: divide by the pixel's own depth so grazing-angle
    // flat surfaces (grass, ground) don't trigger — their per-pixel delta is
    // a tiny fraction of their depth.  True silhouettes (sky→hedge ~0.04 depth,
    // ratio ~34) fire easily; polygon edges on hills (~0.01 delta / 0.18 depth,
    // ratio ~0.08) do not.
    float relDepthEdge = dEdge / (centerDepth + 0.001);

    // Normal edges fade with distance so low-poly hill spheres don't hatch.
    float distFade    = smoothstep(0.06, 0.18, centerDepth);
    float normalWeight = 1.0 - distFade;

    float edge = clamp(
      step(uDepthThresh,  relDepthEdge) +
      step(uNormalThresh, nEdge) * normalWeight,
      0.0, 1.0
    );

    vec4 scene = texture2D(tColor, vUv);
    gl_FragColor = mix(scene, vec4(uOutlineColor, 1.0), edge);
  }
`;

export class OutlinePass {
  private _renderer:  THREE.WebGLRenderer;
  private _sceneRT:   THREE.WebGLRenderTarget;
  private _normalRT:  THREE.WebGLRenderTarget;
  private _quadScene: THREE.Scene;
  private _quadCam:   THREE.OrthographicCamera;
  private _mat:       THREE.ShaderMaterial;
  private _normalMat: THREE.MeshNormalMaterial;

  constructor(renderer: THREE.WebGLRenderer, near: number, far: number) {
    this._renderer  = renderer;
    this._normalMat = new THREE.MeshNormalMaterial();

    const pr = renderer.getPixelRatio();
    const w  = Math.floor(window.innerWidth  * pr);
    const h  = Math.floor(window.innerHeight * pr);

    // Scene RT — colour + depth texture
    this._sceneRT = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    this._sceneRT.texture.colorSpace = THREE.SRGBColorSpace;
    this._sceneRT.depthTexture = new THREE.DepthTexture(w, h);
    this._sceneRT.depthTexture.format = THREE.DepthFormat;
    this._sceneRT.depthTexture.type   = THREE.UnsignedIntType;

    // Normal RT — view-space normals, no depth needed
    this._normalRT = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    this._mat = new THREE.ShaderMaterial({
      toneMapped: false,  // scene RT is already tone-mapped; don't apply ACES a second time
      uniforms: {
        tColor:        { value: this._sceneRT.texture },
        tDepth:        { value: this._sceneRT.depthTexture },
        tNormal:       { value: this._normalRT.texture },
        uTexelSize:    { value: new THREE.Vector2(1 / w, 1 / h) },
        uNear:         { value: near },
        uFar:          { value: far },
        uDepthThresh:  { value: 0.3 },
        uNormalThresh: { value: 0.28 },
        uOutlineWidth: { value: 1.5 },
        uOutlineColor: { value: new THREE.Color(0x1a1020) },
      },
      vertexShader:   VERT,
      fragmentShader: FRAG,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat);
    this._quadCam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._quadScene = new THREE.Scene();
    this._quadScene.add(quad);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    const r = this._renderer;

    // Pass 1 — scene colour + depth
    r.setRenderTarget(this._sceneRT);
    r.render(scene, camera);

    // Pass 2 — view-space normals (Sky dome renders as flat grey — harmless)
    const prev = scene.overrideMaterial;
    scene.overrideMaterial = this._normalMat;
    r.setRenderTarget(this._normalRT);
    r.render(scene, camera);
    scene.overrideMaterial = prev;

    // Pass 3 — outline composite to canvas
    r.setRenderTarget(null);
    r.render(this._quadScene, this._quadCam);
  }

  resize(width: number, height: number): void {
    const pr = this._renderer.getPixelRatio();
    const w  = Math.floor(width  * pr);
    const h  = Math.floor(height * pr);
    this._sceneRT.setSize(w, h);
    this._normalRT.setSize(w, h);
    this._mat.uniforms.uTexelSize.value.set(1 / w, 1 / h);
  }

  dispose(): void {
    this._sceneRT.dispose();
    this._normalRT.dispose();
    this._mat.dispose();
    this._normalMat.dispose();
  }
}
