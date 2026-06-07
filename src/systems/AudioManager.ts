import { Howl, Howler } from 'howler';

/**
 * Audio manager — looping background music plus one-shot snip SFX.
 *
 * Browsers block audio until a user gesture. We defer BOTH the Howl creation
 * and playback until the first interaction (pointer / key / touch), so nothing
 * is loaded or decoded until the player actually engages.
 */
const SNIP_SRCS = [
  'sounds/snips/snip.mp3',
  'sounds/snips/snip2.mp3',
  'sounds/snips/snip3.mp3',
  'sounds/snips/snip5.mp3',
];

export class AudioManager {
  private _music: Howl | null = null;
  private _car: Howl | null = null;  // engine sound for the drive cutscene
  private _snips: Howl[] = [];     // one Howl per snip variant, lazy-loaded
  private _lastSnip = -1;          // last variant played — avoid back-to-back repeats
  private _armed = false;          // first-gesture listeners attached
  private _started = false;        // music has begun
  private _muted = false;
  private readonly _volume = 0.175;
  private readonly _snipVolume = 0.6;
  private readonly _carVolume = 0.5;

  private _onGesture = () => this._begin();

  /** Attach one-shot listeners that start the music on first user gesture. */
  arm(): void {
    if (this._armed || this._started) return;
    this._armed = true;
    window.addEventListener('pointerdown', this._onGesture, { once: true });
    window.addEventListener('keydown',     this._onGesture, { once: true });
    window.addEventListener('touchstart',  this._onGesture, { once: true });
  }

  private _begin(): void {
    if (this._started) return;
    this._started = true;
    this._removeListeners();

    this._music = new Howl({
      src:    ['sounds/nature2.mp3'],
      loop:   true,
      volume: this._muted ? 0 : this._volume,
      html5:  false,
    });
    // Resume synchronously within the gesture stack — Howl.play() defers until
    // decode finishes, by which point the user-gesture window has closed and
    // ctx.resume() would be rejected.
    if (Howler.ctx && Howler.ctx.state !== 'running') Howler.ctx.resume();
    this._music.play();

    // Preload snip variants now that the audio context is unlocked.
    this._snips = SNIP_SRCS.map(src => new Howl({
      src:    [src],
      volume: this._snipVolume,
      html5:  false,
    }));

    this._car = new Howl({
      src:    ['sounds/cars-driving-away.mp3'],
      volume: this._carVolume,
      html5:  false,
    });
  }

  /** Play a random snip SFX (never the same one twice in a row). */
  playSnip(): void {
    if (this._muted || this._snips.length === 0) return;
    let i = Math.floor(Math.random() * this._snips.length);
    if (this._snips.length > 1 && i === this._lastSnip) {
      i = (i + 1) % this._snips.length;
    }
    this._lastSnip = i;
    this._snips[i].play();
  }

  /** Play the car engine sound (used during the drive cutscene). */
  playCar(): void {
    if (this._muted || !this._car) return;
    if (!this._car.playing()) this._car.play();
  }

  /** Stop the car engine sound — e.g. when the player skips the cutscene. */
  stopCar(): void {
    if (this._car) this._car.stop();
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this._music) this._music.volume(this._muted ? 0 : this._volume);
    return this._muted;
  }

  private _removeListeners(): void {
    window.removeEventListener('pointerdown', this._onGesture);
    window.removeEventListener('keydown',     this._onGesture);
    window.removeEventListener('touchstart',  this._onGesture);
  }

  destroy(): void {
    this._removeListeners();
    if (this._music) { this._music.stop(); this._music.unload(); this._music = null; }
    if (this._car) { this._car.stop(); this._car.unload(); this._car = null; }
    this._snips.forEach(s => s.unload());
    this._snips = [];
    Howler.stop();
  }
}
