import { PostEffectChain } from './PostEffectChain';
import { CRTSettings }     from './CRTEffect';
import { PixelSettings }   from './PixelEffect';
import { RetroSettings }   from './RetroEffect';

const STORAGE_KEY = 'camelClipper_shader_settings';

interface Saved {
  pixelEnabled?: boolean; pixel?: Partial<PixelSettings>;
  retroEnabled?: boolean; retro?: Partial<RetroSettings>;
  crtEnabled?:   boolean; crt?:   Partial<CRTSettings>;
}

const PRESETS: Record<string, Saved> = {
  'PS2/Xbox': {
    pixelEnabled: false,  pixel: { pixelSize: 2, edgeStrength: 0 },
    retroEnabled: true,   retro: { colorDepth: 24, ditherStrength: 0.25, ditherSize: 4, saturation: 0.88, tint: [1,1,1] },
    crtEnabled:   true,   crt:   { scanlineIntensity: 0.12, curvature: 0.06, vignetteStrength: 0.28, colorBleed: 0.0015, flickerSpeed: 5, flickerAmount: 0.01, brightness: 1.05 },
  },
  'VHS': {
    pixelEnabled: false,  pixel: { pixelSize: 2, edgeStrength: 0 },
    retroEnabled: false,  retro: { colorDepth: 32, ditherStrength: 0.1, ditherSize: 4, saturation: 0.9, tint: [1,1,1] },
    crtEnabled:   true,   crt:   { scanlineIntensity: 0.28, curvature: 0.10, vignetteStrength: 0.45, colorBleed: 0.004, flickerSpeed: 10, flickerAmount: 0.04, brightness: 1.08 },
  },
  'Retro Arcade': {
    pixelEnabled: true,   pixel: { pixelSize: 4, edgeStrength: 0.2 },
    retroEnabled: true,   retro: { colorDepth: 12, ditherStrength: 0.6, ditherSize: 4, saturation: 1.3, tint: [1,1,1] },
    crtEnabled:   true,   crt:   { scanlineIntensity: 0.35, curvature: 0.2, vignetteStrength: 0.5, colorBleed: 0.004, flickerSpeed: 10, flickerAmount: 0.02, brightness: 1.15 },
  },
  'Game Boy': {
    pixelEnabled: true,   pixel: { pixelSize: 6, edgeStrength: 0 },
    retroEnabled: true,   retro: { colorDepth: 2, ditherStrength: 1.0, ditherSize: 4, saturation: 0.0, tint: [0.82, 0.92, 0.38] },
    crtEnabled:   false,  crt:   { scanlineIntensity: 0, curvature: 0, vignetteStrength: 0.1, colorBleed: 0, flickerSpeed: 0, flickerAmount: 0, brightness: 1.0 },
  },
  'N64': {
    pixelEnabled: true,   pixel: { pixelSize: 10, edgeStrength: 0 },
    retroEnabled: true,   retro: { colorDepth: 24, ditherStrength: 0.25, ditherSize: 4, saturation: 0.88, tint: [1,1,1] },
    crtEnabled:   true,   crt:   { scanlineIntensity: 0.12, curvature: 0.06, vignetteStrength: 0.28, colorBleed: 0.0015, flickerSpeed: 5, flickerAmount: 0.01, brightness: 1.05 },
  },
  'NES': {
    pixelEnabled: true,   pixel: { pixelSize: 3, edgeStrength: 0 },
    retroEnabled: true,   retro: { colorDepth: 6, ditherStrength: 0.8, ditherSize: 2, saturation: 1.2, tint: [1,1,1] },
    crtEnabled:   true,   crt:   { scanlineIntensity: 0.2, curvature: 0.08, vignetteStrength: 0.35, colorBleed: 0.002, flickerSpeed: 8, flickerAmount: 0.02, brightness: 1.1 },
  },
  'SNES': {
    pixelEnabled: true,   pixel: { pixelSize: 15, edgeStrength: 0 },
    retroEnabled: true,   retro: { colorDepth: 64, ditherStrength: 1.0, ditherSize: 8, saturation: 2.0, tint: [1,1,1] },
    crtEnabled:   true,   crt:   { scanlineIntensity: 0.36, curvature: 0.16, vignetteStrength: 0.0, colorBleed: 0, flickerSpeed: 0, flickerAmount: 0, brightness: 1.0 },
  },
  'Off': {
    pixelEnabled: false,  pixel: { pixelSize: 2, edgeStrength: 0 },
    retroEnabled: false,  retro: { colorDepth: 64, ditherStrength: 0.0, ditherSize: 4, saturation: 1.0, tint: [1,1,1] },
    crtEnabled:   false,  crt:   { scanlineIntensity: 0, curvature: 0, vignetteStrength: 0, colorBleed: 0, flickerSpeed: 0, flickerAmount: 0, brightness: 1.0 },
  },
};

export class ShaderDebugPanel {
  private _chain:   PostEffectChain;
  private _panel:   HTMLDivElement;
  visible = false;

  // Track slider elements for sync
  private _sliders: Record<string, HTMLInputElement> = {};
  private _toggles: Record<string, HTMLInputElement> = {};

  constructor(chain: PostEffectChain) {
    this._chain = chain;
    this._panel = this._build();
    document.body.appendChild(this._panel);
    this._loadFromStorage();
  }

  private _build(): HTMLDivElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed; bottom: 10px; left: 10px;
      background: rgba(8, 8, 20, 0.96); color: #ddd;
      border: 1px solid #444; border-radius: 6px;
      padding: 14px 18px; z-index: 10000;
      font-family: monospace; font-size: 11px;
      width: 340px; max-height: 80vh; overflow-y: auto;
      display: none; user-select: none;
      box-shadow: 0 0 24px rgba(0,0,0,0.9);
    `;
    panel.addEventListener('keydown', e => e.stopPropagation());
    panel.addEventListener('keyup',   e => e.stopPropagation());

    // Title
    panel.appendChild(this._el('div', 'SHADER DEBUG  [F4]', `
      font-size: 12px; color: #ffd700; margin-bottom: 12px;
      text-align: center; letter-spacing: 2px;
    `));

    // Presets row
    this._section(panel, 'PRESETS');
    const row = this._el('div', '', 'display:flex; flex-wrap:wrap; gap:5px; margin-bottom:12px;');
    for (const name of Object.keys(PRESETS)) {
      const btn = this._el('button', name, `
        font-family:monospace; font-size:10px; background:#222; color:#bbb;
        border:1px solid #555; padding:3px 8px; cursor:pointer; border-radius:3px;
      `) as HTMLButtonElement;
      btn.addEventListener('mouseenter', () => { btn.style.background = '#444'; });
      btn.addEventListener('mouseleave', () => { btn.style.background = '#222'; });
      btn.addEventListener('click', () => this._applyPreset(name));
      row.appendChild(btn);
    }
    panel.appendChild(row);

    // ── Pixel ──
    this._section(panel, 'PIXELATION');
    this._toggle(panel, 'pixel_enabled', 'Enabled', this._chain.pixel.enabled, v => { this._chain.pixel.enabled = v; });
    this._slider(panel, 'pixel_pixelSize', 'Pixel Size', 1, 16, 1, this._chain.pixel.settings.pixelSize, v => {
      this._chain.pixel.settings.pixelSize = v;
      this._chain.pixel.updatePixelSize();
    });
    this._slider(panel, 'pixel_edgeStrength', 'Edge Outline', 0, 1, 0.05, this._chain.pixel.settings.edgeStrength, v => {
      this._chain.pixel.settings.edgeStrength = v;
    });

    // ── Retro ──
    this._section(panel, 'RETRO COLORS');
    this._toggle(panel, 'retro_enabled', 'Enabled', this._chain.retro.enabled, v => { this._chain.retro.enabled = v; });
    this._slider(panel, 'retro_colorDepth', 'Color Depth', 2, 64, 1, this._chain.retro.settings.colorDepth, v => {
      this._chain.retro.settings.colorDepth = v;
    });
    this._slider(panel, 'retro_ditherStrength', 'Dither Str', 0, 1, 0.05, this._chain.retro.settings.ditherStrength, v => {
      this._chain.retro.settings.ditherStrength = v;
    });
    this._slider(panel, 'retro_ditherSize', 'Dither Size', 2, 8, 2, this._chain.retro.settings.ditherSize, v => {
      this._chain.retro.settings.ditherSize = v;
    });
    this._slider(panel, 'retro_saturation', 'Saturation', 0, 2, 0.05, this._chain.retro.settings.saturation, v => {
      this._chain.retro.settings.saturation = v;
    });
    this._slider(panel, 'retro_tintR', 'Tint R', 0, 1, 0.01, this._chain.retro.settings.tint[0], v => { this._chain.retro.settings.tint[0] = v; });
    this._slider(panel, 'retro_tintG', 'Tint G', 0, 1, 0.01, this._chain.retro.settings.tint[1], v => { this._chain.retro.settings.tint[1] = v; });
    this._slider(panel, 'retro_tintB', 'Tint B', 0, 1, 0.01, this._chain.retro.settings.tint[2], v => { this._chain.retro.settings.tint[2] = v; });

    // ── CRT ──
    this._section(panel, 'CRT EFFECT');
    this._toggle(panel, 'crt_enabled', 'Enabled', this._chain.crt.enabled, v => { this._chain.crt.enabled = v; });
    this._slider(panel, 'crt_scanlineIntensity', 'Scanlines',    0,    1, 0.01,   this._chain.crt.settings.scanlineIntensity, v => { this._chain.crt.settings.scanlineIntensity = v; });
    this._slider(panel, 'crt_curvature',         'Curvature',    0,  0.5, 0.01,   this._chain.crt.settings.curvature,         v => { this._chain.crt.settings.curvature = v; });
    this._slider(panel, 'crt_vignetteStrength',  'Vignette',     0,    1, 0.01,   this._chain.crt.settings.vignetteStrength,  v => { this._chain.crt.settings.vignetteStrength = v; });
    this._slider(panel, 'crt_colorBleed',        'Color Bleed',  0, 0.01, 0.0005, this._chain.crt.settings.colorBleed,        v => { this._chain.crt.settings.colorBleed = v; });
    this._slider(panel, 'crt_flickerSpeed',      'Flicker Speed',0,   30, 0.5,    this._chain.crt.settings.flickerSpeed,      v => { this._chain.crt.settings.flickerSpeed = v; });
    this._slider(panel, 'crt_flickerAmount',     'Flicker Amt',  0,  0.2, 0.005,  this._chain.crt.settings.flickerAmount,     v => { this._chain.crt.settings.flickerAmount = v; });
    this._slider(panel, 'crt_brightness',        'Brightness',  0.5, 1.5, 0.01,  this._chain.crt.settings.brightness,        v => { this._chain.crt.settings.brightness = v; });

    // ── Save/Reset ──
    this._section(panel, '');
    const btnRow = this._el('div', '', 'display:flex; gap:6px; margin-top:4px;');
    const saveBtn = this._mkBtn('Save', '#2a5a2a', '#8f8', '#4a4');
    saveBtn.addEventListener('click', () => this._saveToStorage());
    const resetBtn = this._mkBtn('Reset All', '#5a2a2a', '#f88', '#a44');
    resetBtn.addEventListener('click', () => this._applyPreset('Off'));
    const closeBtn = this._mkBtn('Close [F4]', '#222', '#aaa', '#555');
    closeBtn.addEventListener('click', () => this.hide());
    btnRow.append(saveBtn, resetBtn, closeBtn);
    panel.appendChild(btnRow);

    return panel;
  }

  private _el(tag: string, text: string, css: string): HTMLElement {
    const el = document.createElement(tag);
    el.textContent = text;
    el.style.cssText = css;
    return el;
  }

  private _mkBtn(text: string, bg: string, color: string, border: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      font-family:monospace; font-size:10px; background:${bg}; color:${color};
      border:1px solid ${border}; padding:5px 10px; cursor:pointer; border-radius:3px; flex:1;
    `;
    return btn;
  }

  private _section(parent: HTMLElement, label: string): void {
    const div = document.createElement('div');
    div.textContent = label;
    div.style.cssText = 'color:#666; font-size:10px; margin:10px 0 5px; border-top:1px solid #333; padding-top:8px; letter-spacing:1px;';
    parent.appendChild(div);
  }

  private _toggle(parent: HTMLElement, key: string, label: string, initial: boolean, onChange: (v: boolean) => void): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; margin-bottom:6px; gap:8px;';
    const lbl = this._el('span', label, 'width:120px; flex-shrink:0;');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = initial;
    cb.style.cssText = 'width:16px; height:16px; accent-color:#ffd700; cursor:pointer;';
    cb.addEventListener('change', () => onChange(cb.checked));
    row.append(lbl, cb);
    parent.appendChild(row);
    this._toggles[key] = cb;
  }

  private _slider(parent: HTMLElement, key: string, label: string, min: number, max: number, step: number, initial: number, onChange: (v: number) => void): void {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; margin-bottom:5px; gap:6px;';
    const lbl = this._el('span', label, 'width:110px; flex-shrink:0; font-size:10px;');
    const sl = document.createElement('input');
    sl.type = 'range'; sl.min = String(min); sl.max = String(max); sl.step = String(step); sl.value = String(initial);
    sl.style.cssText = 'flex:1; accent-color:#ffd700; cursor:pointer;';
    const val = this._el('span', Number(initial).toFixed(step < 1 ? (step < 0.01 ? 4 : 2) : 0), 'width:42px; text-align:right; color:#ffd700; font-size:10px;');
    sl.addEventListener('input', () => {
      const v = parseFloat(sl.value);
      val.textContent = v.toFixed(step < 1 ? (step < 0.01 ? 4 : 2) : 0);
      onChange(v);
    });
    row.append(lbl, sl, val);
    parent.appendChild(row);
    this._sliders[key] = sl;
  }

  private _syncUI(): void {
    const c = this._chain;
    const setS = (key: string, v: number) => {
      const sl = this._sliders[key]; if (!sl) return;
      sl.value = String(v);
      const step = parseFloat(sl.step);
      const valEl = sl.nextElementSibling as HTMLElement;
      if (valEl) valEl.textContent = v.toFixed(step < 1 ? (step < 0.01 ? 4 : 2) : 0);
    };
    const setT = (key: string, v: boolean) => { if (this._toggles[key]) this._toggles[key].checked = v; };

    setT('pixel_enabled', c.pixel.enabled);
    setS('pixel_pixelSize',    c.pixel.settings.pixelSize);
    setS('pixel_edgeStrength', c.pixel.settings.edgeStrength);

    setT('retro_enabled', c.retro.enabled);
    setS('retro_colorDepth',     c.retro.settings.colorDepth);
    setS('retro_ditherStrength', c.retro.settings.ditherStrength);
    setS('retro_ditherSize',     c.retro.settings.ditherSize);
    setS('retro_saturation',     c.retro.settings.saturation);
    setS('retro_tintR',          c.retro.settings.tint[0]);
    setS('retro_tintG',          c.retro.settings.tint[1]);
    setS('retro_tintB',          c.retro.settings.tint[2]);

    setT('crt_enabled', c.crt.enabled);
    setS('crt_scanlineIntensity', c.crt.settings.scanlineIntensity);
    setS('crt_curvature',         c.crt.settings.curvature);
    setS('crt_vignetteStrength',  c.crt.settings.vignetteStrength);
    setS('crt_colorBleed',        c.crt.settings.colorBleed);
    setS('crt_flickerSpeed',      c.crt.settings.flickerSpeed);
    setS('crt_flickerAmount',     c.crt.settings.flickerAmount);
    setS('crt_brightness',        c.crt.settings.brightness);
  }

  private _applyPreset(name: string): void {
    const p = PRESETS[name];
    if (!p) return;
    const c = this._chain;

    if (p.pixelEnabled !== undefined) c.pixel.enabled = p.pixelEnabled;
    if (p.pixel) Object.assign(c.pixel.settings, p.pixel);
    if (p.pixel?.pixelSize) c.pixel.updatePixelSize();

    if (p.retroEnabled !== undefined) c.retro.enabled = p.retroEnabled;
    if (p.retro) Object.assign(c.retro.settings, p.retro);

    if (p.crtEnabled !== undefined) c.crt.enabled = p.crtEnabled;
    if (p.crt) Object.assign(c.crt.settings, p.crt);

    this._syncUI();
  }

  private _getState(): Saved {
    const c = this._chain;
    return {
      pixelEnabled: c.pixel.enabled, pixel: { ...c.pixel.settings },
      retroEnabled: c.retro.enabled, retro: { ...c.retro.settings },
      crtEnabled:   c.crt.enabled,   crt:   { ...c.crt.settings },
    };
  }

  private _saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._getState()));
    } catch (_) { /* ignore */ }
  }

  private _loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) { this._applyPreset('Off'); return; }
      const s = JSON.parse(raw) as Saved;
      const c = this._chain;
      if (s.pixelEnabled !== undefined) c.pixel.enabled = s.pixelEnabled;
      if (s.pixel) { Object.assign(c.pixel.settings, s.pixel); c.pixel.updatePixelSize(); }
      // crt/retro always default off regardless of saved state
      if (s.retro) Object.assign(c.retro.settings, s.retro);
      if (s.crt) Object.assign(c.crt.settings, s.crt);
      this._syncUI();
    } catch (_) {
      this._applyPreset('Off');
    }
  }

  toggle(): void { this.visible ? this.hide() : this.show(); }

  show(): void {
    this.visible = true;
    this._syncUI();
    this._panel.style.display = 'block';
  }

  hide(): void {
    this.visible = false;
    this._panel.style.display = 'none';
  }

  destroy(): void {
    this._panel.remove();
  }
}
