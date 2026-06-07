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
 *
 * Multi-touch: every finger is tracked independently. One finger owns movement
 * (the first one that drags past the slop); any *other* finger can tap to snip
 * at the same time, so you can hold a slide with the thumb and spam snips with
 * the index finger. Taps queue up — each applyTo() fires one — so rapid double
 * taps register even when they land inside a single frame.
 */
interface Touch {
  startX: number;
  startY: number;
  startT: number;
  moved:  boolean;
}

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

  // All fingers currently down on the surface, keyed by pointerId.
  private _touches = new Map<number, Touch>();
  // The finger that currently owns horizontal movement (null = none dragging).
  private _moveId: number | null;
  // Buffered taps awaiting consumption by applyTo() — one fires per frame.
  private _pendingTaps: number;

  private surface!: HTMLElement;
  private pauseBtn!: HTMLElement;

  constructor(container?: HTMLElement) {
    this.moveX = 0; this.moveY = 0;
    this.actionHeld = false;
    this.launch     = false;
    this.pause      = false;

    this._moveId       = null;
    this._pendingTaps  = 0;

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
      e.preventDefault();
      this._touches.set(e.pointerId, {
        startX: e.clientX, startY: e.clientY, startT: e.timeStamp, moved: false,
      });
      this.actionHeld = true;
      // Capture per-pointer so each finger's moves/ups route here even if it
      // drifts off the surface — essential for reliable multi-touch.
      this.surface.setPointerCapture?.(e.pointerId);
    });

    this.surface.addEventListener('pointermove', (e) => {
      const t = this._touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      if (Math.abs(dx) > this._tapSlop || Math.abs(dy) > this._tapSlop) t.moved = true;
      // First finger to drag past the slop claims movement; others stay taps.
      if (t.moved && this._moveId === null) this._moveId = e.pointerId;
      if (e.pointerId !== this._moveId) return;
      // Clamp to ±1; deadzone equal to the tap slop so taps don't nudge.
      const eff = Math.abs(dx) < this._tapSlop ? 0 : dx;
      this.moveX = Math.max(-1, Math.min(1, eff / this._moveRadius));
    });

    const end = (e: PointerEvent) => {
      const t = this._touches.get(e.pointerId);
      if (!t) return;
      const quick = (e.timeStamp - t.startT) <= this._tapMaxMs;
      if (!t.moved && quick) this._pendingTaps++;   // it was a tap → queue a snip
      this._touches.delete(e.pointerId);
      if (this._touches.size === 0) this.actionHeld = false;
      if (e.pointerId === this._moveId) {
        // Hand movement to another finger that's already dragging, if any.
        this._moveId = null;
        this.moveX   = 0;
        for (const [id, o] of this._touches) {
          if (o.moved) { this._moveId = id; break; }
        }
      }
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
    // Drop any in-flight drags/taps so resuming doesn't fire a stale action.
    this._touches.clear();
    this._moveId = null;
    this._pendingTaps = 0;
    this.moveX = 0;
    this.actionHeld = false;
  }

  applyTo(state: InputState): void {
    if (!this.enabled) return;
    if (this.moveX !== 0) state.moveX = this.moveX;
    if (this.actionHeld) state.actionHeld = true;
    // A tap fires the one-shot action (snip / start / restart / skip). Taps are
    // buffered, so spamming the snip finger while the other drags still lands
    // every press — one per frame.
    if (this._pendingTaps > 0) {
      state.launch = true;
      this._pendingTaps--;
    }
    if (this.pause) { state.pause = true; this.pause = false; }
  }
}
