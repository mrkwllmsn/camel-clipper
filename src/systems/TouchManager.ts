import type { InputState } from '../utils/Constants';

export default class TouchManager {
  moveX:      number;
  moveY:      number;
  actionHeld: boolean;
  launch:     boolean;
  pause:      boolean;
  enabled:    boolean;

  private _stickId:     number | null;
  private _stickOrigin: { x: number; y: number };
  private _stickRadius: number;
  private _actionId:    number | null;
  private _prevAction:  boolean;

  private stickArea!: HTMLElement;
  private stickRing!: HTMLElement;
  private stickKnob!: HTMLElement;
  private actionBtn!: HTMLElement;
  private pauseBtn!:  HTMLElement;

  constructor(container?: HTMLElement) {
    this.moveX      = 0; this.moveY = 0;
    this.actionHeld = false;
    this.launch     = false;
    this.pause      = false;
    this._prevAction  = false;
    this._stickId     = null;
    this._stickOrigin = { x: 0, y: 0 };
    this._stickRadius = 60;
    this._actionId    = null;

    this.enabled = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!this.enabled) return;

    this._build(container ?? document.body);
    this._bind();
  }

  private _build(container: HTMLElement): void {
    const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
      Object.assign(el.style, s);

    this.stickArea = document.createElement('div');
    css(this.stickArea, {
      position: 'absolute', left: '0', bottom: '0',
      width: '50%', height: '60%',
      pointerEvents: 'auto', touchAction: 'none', zIndex: '50',
    });

    this.stickRing = document.createElement('div');
    css(this.stickRing, {
      position: 'absolute',
      width: '120px', height: '120px',
      border: '2px solid rgba(255,255,255,0.5)',
      borderRadius: '50%',
      pointerEvents: 'none', opacity: '0.5', zIndex: '51',
      left: '40px', bottom: '40px',
    });

    this.stickKnob = document.createElement('div');
    css(this.stickKnob, {
      position: 'absolute',
      width: '50px', height: '50px',
      borderRadius: '50%',
      background: 'rgba(255,221,51,0.75)',
      border: '2px solid #000',
      pointerEvents: 'none', zIndex: '52',
      left: '75px', bottom: '75px',
    });

    this.actionBtn = document.createElement('div');
    css(this.actionBtn, {
      position: 'absolute',
      right: '30px', bottom: '40px',
      width: '120px', height: '120px',
      borderRadius: '50%',
      background: 'rgba(136,204,255,0.28)',
      border: '3px solid #fff',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '114px',
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '12px',
      textShadow: '2px 2px 0 #000',
      pointerEvents: 'auto', touchAction: 'none',
      userSelect: 'none', zIndex: '50',
    });
    this.actionBtn.textContent = 'GO';

    this.pauseBtn = document.createElement('div');
    css(this.pauseBtn, {
      position: 'absolute',
      right: '18px', top: '18px',
      width: '52px', height: '52px',
      borderRadius: '8px',
      background: 'rgba(0,0,0,0.55)',
      border: '2px solid rgba(255,255,255,0.7)',
      color: '#fff',
      textAlign: 'center',
      lineHeight: '48px',
      fontFamily: "'Press Start 2P', monospace",
      fontSize: '18px',
      textShadow: '2px 2px 0 #000',
      pointerEvents: 'auto', touchAction: 'none',
      userSelect: 'none', zIndex: '50',
    });
    this.pauseBtn.textContent = 'II';

    container.append(this.stickArea, this.stickRing, this.stickKnob, this.actionBtn, this.pauseBtn);
  }

  private _bind(): void {
    this.stickArea.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._stickId = e.pointerId;
      this._stickOrigin.x = e.clientX;
      this._stickOrigin.y = e.clientY;
      this._placeStick(e.clientX, e.clientY, 0, 0);
      this.stickRing.style.opacity = '0.9';
    });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._stickId) return;
      const dx   = e.clientX - this._stickOrigin.x;
      const dy   = e.clientY - this._stickOrigin.y;
      const r    = this._stickRadius;
      const dist = Math.min(Math.hypot(dx, dy), r);
      const ang  = Math.atan2(dy, dx);
      const kx   = Math.cos(ang) * dist;
      const ky   = Math.sin(ang) * dist;
      this.moveX =  kx / r;
      this.moveY = -ky / r;
      this._placeStick(this._stickOrigin.x, this._stickOrigin.y, kx, ky);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this._stickId) return;
      this._stickId = null;
      this.moveX = 0; this.moveY = 0;
      this.stickRing.style.opacity = '0.5';
      this.stickRing.style.left   = '40px';
      this.stickRing.style.top    = 'auto';
      this.stickRing.style.bottom = '40px';
      this.stickKnob.style.left   = '75px';
      this.stickKnob.style.top    = 'auto';
      this.stickKnob.style.bottom = '75px';
    };
    window.addEventListener('pointerup',     release);
    window.addEventListener('pointercancel', release);

    this.actionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._actionId  = e.pointerId;
      this.actionHeld = true;
    });
    const actionRelease = (e: PointerEvent) => {
      if (e.pointerId !== this._actionId) return;
      this._actionId  = null;
      this.actionHeld = false;
    };
    this.actionBtn.addEventListener('pointerup',     actionRelease);
    this.actionBtn.addEventListener('pointercancel', actionRelease);
    this.actionBtn.addEventListener('pointerleave',  actionRelease);

    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pause = true;
    });
  }

  private _placeStick(cx: number, cy: number, kx: number, ky: number): void {
    this.stickRing.style.left   = `${cx - 60}px`;
    this.stickRing.style.top    = `${cy - 60}px`;
    this.stickRing.style.bottom = 'auto';
    this.stickKnob.style.left   = `${cx + kx - 25}px`;
    this.stickKnob.style.top    = `${cy + ky - 25}px`;
    this.stickKnob.style.bottom = 'auto';
  }

  applyTo(state: InputState): void {
    if (!this.enabled) return;
    if (this.moveX !== 0) state.moveX = this.moveX;
    if (this.moveY !== 0) state.moveY = this.moveY;
    if (this.actionHeld) {
      state.actionHeld = true;
      if (!this._prevAction) state.launch = true;
      this._prevAction = true;
    } else {
      this._prevAction = false;
    }
    if (this.pause) { state.pause = true; this.pause = false; }
  }
}
