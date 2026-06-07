import type { InputState } from '../utils/Constants';

/**
 * Touch controls — no on-screen joystick or buttons.
 *
 *   • Horizontal DRAG anywhere → analog left/right movement (camel slides).
 *   • Quick TAP                → the "Space" action: snip while playing,
 *                                start / restart / skip-cutscene otherwise.
 *   • Small ⏸ button (bottom-left) → pause.
 *
 * Movement is relative to where the finger first landed, so it works as an
 * invisible thumb-stick: push left of the start point to go left, right to go
 * right, hold to keep moving, release to stop.
 */
export default class TouchManager {
  moveX:      number;
  moveY:      number;
  actionHeld: boolean;
  launch:     boolean;
  pause:      boolean;
  enabled:    boolean;

  // px of horizontal travel for full speed; tuned for thumb reach on phones
  private readonly _moveRadius = 70;
  // movement (px) / duration (ms) below which a press counts as a tap, not a drag
  private readonly _tapSlop = 12;
  private readonly _tapMaxMs = 300;

  private _dragId:    number | null;
  private _startX:    number;
  private _startY:    number;
  private _startT:    number;
  private _moved:     boolean;
  private _pendingTap: boolean;

  private surface!: HTMLElement;
  private pauseBtn!: HTMLElement;

  constructor(container?: HTMLElement) {
    this.moveX = 0; this.moveY = 0;
    this.actionHeld = false;
    this.launch     = false;
    this.pause      = false;

    this._dragId     = null;
    this._startX     = 0;
    this._startY     = 0;
    this._startT     = 0;
    this._moved      = false;
    this._pendingTap = false;

    this.enabled = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (!this.enabled) return;

    this._build(container ?? document.body);
    this._bind();
  }

  private _build(container: HTMLElement): void {
    const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) =>
      Object.assign(el.style, s);

    // Full-screen invisible input surface.
    this.surface = document.createElement('div');
    css(this.surface, {
      position: 'fixed', inset: '0',
      pointerEvents: 'auto', touchAction: 'none',
      zIndex: '50',
      background: 'transparent',
    });

    // Pause button — bottom-left, clear of the snip tap zone (which lives on the
    // right). A small frosted-glass disc with two clean bars. Hidden until the
    // game enters PLAYING (setPauseVisible).
    this.pauseBtn = document.createElement('div');
    css(this.pauseBtn, {
      position: 'fixed',
      left:   'calc(env(safe-area-inset-left, 0px) + 16px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      width: '36px', height: '36px',
      borderRadius: '50%',
      background: 'rgba(20,40,15,0.42)',
      border: '2px solid rgba(255,255,255,0.55)',
      boxShadow: '0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)',
      backdropFilter: 'blur(4px)',
      WebkitBackdropFilter: 'blur(4px)',
      pointerEvents: 'auto', touchAction: 'none',
      userSelect: 'none', zIndex: '60',
      transition: 'transform 0.1s ease, background 0.15s ease',
    } as Partial<CSSStyleDeclaration>);
    for (let i = 0; i < 2; i++) {
      const bar = document.createElement('div');
      css(bar, {
        width: '4px', height: '13px',
        borderRadius: '2px',
        background: 'rgba(255,255,255,0.92)',
      });
      this.pauseBtn.append(bar);
    }

    container.append(this.surface, this.pauseBtn);
  }

  private _bind(): void {
    this.surface.addEventListener('pointerdown', (e) => {
      if (this._dragId !== null) return;       // ignore extra fingers
      e.preventDefault();
      this._dragId = e.pointerId;
      this._startX = e.clientX;
      this._startY = e.clientY;
      this._startT = e.timeStamp;
      this._moved  = false;
      this.actionHeld = true;
      this.surface.setPointerCapture?.(e.pointerId);
    });

    this.surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._dragId) return;
      const dx = e.clientX - this._startX;
      const dy = e.clientY - this._startY;
      if (Math.abs(dx) > this._tapSlop || Math.abs(dy) > this._tapSlop) this._moved = true;
      // Clamp to ±1; deadzone equal to the tap slop so taps don't nudge.
      const eff = Math.abs(dx) < this._tapSlop ? 0 : dx;
      this.moveX = Math.max(-1, Math.min(1, eff / this._moveRadius));
    });

    const end = (e: PointerEvent) => {
      if (e.pointerId !== this._dragId) return;
      const quick = (e.timeStamp - this._startT) <= this._tapMaxMs;
      if (!this._moved && quick) this._pendingTap = true;   // it was a tap
      this._dragId = null;
      this._moved  = false;
      this.moveX   = 0;
      this.actionHeld = false;
    };
    this.surface.addEventListener('pointerup',     end);
    this.surface.addEventListener('pointercancel', end);

    this.pauseBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.pauseBtn.style.transform = 'scale(0.9)';
      this.pauseBtn.style.background = 'rgba(20,40,15,0.6)';
      this.pause = true;
    });
    const relax = () => {
      this.pauseBtn.style.transform = 'scale(1)';
      this.pauseBtn.style.background = 'rgba(20,40,15,0.42)';
    };
    this.pauseBtn.addEventListener('pointerup', relax);
    this.pauseBtn.addEventListener('pointercancel', relax);
    this.pauseBtn.addEventListener('pointerleave', relax);
  }

  // Show / hide the ⏸ button (game shows it only during active play).
  setPauseVisible(visible: boolean): void {
    if (!this.enabled) return;
    this.pauseBtn.style.display = visible ? 'flex' : 'none';
  }

  // While paused the full-screen drag surface must not eat snip taps; the Vue
  // overlay sits above it anyway, but disable input here too for safety.
  setPaused(paused: boolean): void {
    if (!this.enabled) return;
    this.surface.style.pointerEvents = paused ? 'none' : 'auto';
    // Drop any in-flight drag/tap so resuming doesn't fire a stale action.
    this._dragId = null;
    this._moved = false;
    this._pendingTap = false;
    this.moveX = 0;
    this.actionHeld = false;
  }

  applyTo(state: InputState): void {
    if (!this.enabled) return;
    if (this.moveX !== 0) state.moveX = this.moveX;
    if (this.actionHeld) state.actionHeld = true;
    // A tap fires the one-shot action (snip / start / restart / skip).
    if (this._pendingTap) {
      state.launch     = true;
      this._pendingTap = false;
    }
    if (this.pause) { state.pause = true; this.pause = false; }
  }
}
