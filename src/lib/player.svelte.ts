/**
 * A tiny timeline for step animations: progress runs from 0 to `length` while playing.
 * Under prefers-reduced-motion the timeline jumps straight to the end (and never autoplays);
 * it pauses while the page is hidden.
 */

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Player {
  progress = $state(0);
  playing = $state(false);
  length = $state(1);
  /** Units per second. */
  speed = $state(10);

  private raf = 0;
  private last = 0;

  constructor(length = 1, speed = 10) {
    this.length = length;
    this.speed = speed;
  }

  get done(): boolean {
    return this.progress >= this.length;
  }

  reset(length: number, speed = this.speed) {
    this.stop();
    this.length = Math.max(1, length);
    this.speed = speed;
    this.progress = 0;
  }

  play() {
    if (prefersReducedMotion()) {
      this.progress = this.length;
      return;
    }
    if (this.progress >= this.length) this.progress = 0;
    this.playing = true;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  toggle() {
    if (this.playing) this.stop();
    else this.play();
  }

  seek(p: number) {
    this.stop();
    this.progress = Math.max(0, Math.min(this.length, p));
  }

  finish() {
    this.seek(this.length);
  }

  private tick = (now: number) => {
    if (!this.playing) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.last = now;
      this.raf = requestAnimationFrame(this.tick);
      return;
    }
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.progress = Math.min(this.length, this.progress + dt * this.speed);
    if (this.progress >= this.length) {
      this.playing = false;
      return;
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
