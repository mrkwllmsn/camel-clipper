import type { InputState } from '../utils/Constants';

export default class InputManager {
  state: InputState;

  private _keys:          Record<string, boolean>;
  private _prevSpace:     boolean;
  private _prevEnter:     boolean;
  private _prevEscape:    boolean;
  private _pendingLaunch: boolean;
  private _enabled:       boolean;

  constructor() {
    this._keys          = {};
    this._prevSpace     = false;
    this._prevEnter     = false;
    this._prevEscape    = false;
    this._pendingLaunch = false;
    this._enabled       = true;

    this.state = {
      moveX: 0, moveY: 0,
      shoot:      false,
      launch:     false,
      start:      false,
      pause:      false,
      actionHeld: false,
    };

    this._setupKeyboard();
    this._setupPointer();
  }

  private _setupKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      if (!this._enabled) return;
      this._keys[e.key.toLowerCase()] = true;
      // Prevent arrow keys + space from scrolling behind the canvas.
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keys[e.key.toLowerCase()] = false;
    });
    // Held keys leak across tab switches; clear on blur.
    window.addEventListener('blur', () => { this._keys = {}; });
  }

  private _setupPointer(): void {
    window.addEventListener('pointerdown', (e) => {
      if (!this._enabled) return;
      if ((e.target as HTMLElement).tagName === 'CANVAS') this._pendingLaunch = true;
    });
  }

  poll(): void {
    const k = this._keys;

    this.state.moveX = 0;
    this.state.moveY = 0;
    if (k['arrowleft']  || k['a']) this.state.moveX -= 1;
    if (k['arrowright'] || k['d']) this.state.moveX += 1;
    if (k['arrowup']    || k['w']) this.state.moveY += 1;
    if (k['arrowdown']  || k['s']) this.state.moveY -= 1;

    this.state.shoot      = !!k[' '];
    this.state.actionHeld = !!k[' '];

    // Rising-edge resolution: set true only on the frame the key went down.
    if (k[' ']      && !this._prevSpace)  this.state.launch = true;
    if (k['enter']  && !this._prevEnter)  this.state.start  = true;
    if (k['escape'] && !this._prevEscape) this.state.pause  = true;
    this._prevSpace  = !!k[' '];
    this._prevEnter  = !!k['enter'];
    this._prevEscape = !!k['escape'];

    if (this._pendingLaunch) { this.state.launch = true; this._pendingLaunch = false; }
  }

  consumeOneShots(): void {
    this.state.launch = false;
    this.state.start  = false;
    this.state.pause  = false;
  }

  enable():  void { this._enabled = true; }
  disable(): void { this._enabled = false; }
}
