import type { InputState } from '../utils/Constants';

export default class GamepadManager {
  moveX:      number;
  moveY:      number;
  actionHeld: boolean;
  launch:     boolean;
  start:      boolean;

  readonly DEADZONE = 0.2;

  private _index:      number | null;
  private _prevAction: boolean;
  private _prevStart:  boolean;

  constructor() {
    this._index      = null;
    this._prevAction = false;
    this._prevStart  = false;

    this.moveX = 0; this.moveY = 0;
    this.actionHeld = false;
    this.launch     = false;
    this.start      = false;

    // gamepadconnected doesn't fire reliably (Xbox/Edge/Chromium bugs),
    // so we also sweep getGamepads() each poll until we latch on.
    window.addEventListener('gamepadconnected', (e) => {
      if (this._index === null) this._index = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this._index) {
        this._index      = null;
        this._prevAction = false;
        this._prevStart  = false;
      }
    });
  }

  private _dz(v: number): number {
    if (Math.abs(v) < this.DEADZONE) return 0;
    return Math.sign(v) * (Math.abs(v) - this.DEADZONE) / (1 - this.DEADZONE);
  }

  poll(): void {
    this.moveX = 0; this.moveY = 0;
    this.actionHeld = false;
    this.launch     = false;
    this.start      = false;

    if (this._index === null) {
      const pads = navigator.getGamepads();
      for (let i = 0; i < pads.length; i++) {
        if (pads[i]?.connected) { this._index = i; break; }
      }
      if (this._index === null) return;
    }
    const gp = navigator.getGamepads()[this._index];
    if (!gp) return;

    const btn = (i: number) => !!(gp.buttons[i]?.pressed);

    this.moveX =  this._dz(gp.axes[0] ?? 0);
    this.moveY = -this._dz(gp.axes[1] ?? 0);
    if (btn(12)) this.moveY =  1;
    if (btn(13)) this.moveY = -1;
    if (btn(14)) this.moveX = -1;
    if (btn(15)) this.moveX =  1;

    const actionNow  = btn(0) || btn(5) || btn(7);
    this.actionHeld  = actionNow;
    this.launch      = actionNow && !this._prevAction;
    this._prevAction = actionNow;

    const startNow  = btn(9);
    this.start      = startNow && !this._prevStart;
    this._prevStart = startNow;
  }

  applyTo(state: InputState): void {
    if (this._index === null) return;
    if (this.moveX !== 0) state.moveX = this.moveX;
    if (this.moveY !== 0) state.moveY = this.moveY;
    if (this.actionHeld)  state.actionHeld = true;
    if (this.launch) state.launch = true;
    if (this.start)  { state.start = true; state.pause = true; }
  }
}
