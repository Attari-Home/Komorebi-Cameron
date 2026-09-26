/**
 * scrollBus — a tiny, framework-free pub/sub store for scroll state.
 *
 * Why this exists: scroll updates happen every animation frame. Pushing them
 * through React state would re-render components 60 times a second. Instead,
 * a single producer (`SmoothScrollProvider`) writes here, and consumers either
 *
 *   - read `scrollBus.state` directly inside their own rAF loop (the canvas
 *     engine does this: zero allocation, zero notifications), or
 *   - `subscribe()` for imperative side effects (e.g. writing a CSS transform
 *     to a DOM node). Listeners run synchronously and never touch React.
 *
 * The store is a singleton pinned to `globalThis`, so separately hydrated
 * Astro islands always share one instance even if the bundler duplicates the
 * module.
 */

import type { ScrollState } from '../engine/types';

export type { ScrollState };
export type ScrollListener = (state: Readonly<ScrollState>) => void;

/** Below this speed (px/s) the scroll is treated as stationary. */
const VELOCITY_EPSILON = 0.5;

class ScrollBus {
  /** Live state. Mutated in place; hold the reference, never copy it. */
  readonly state: ScrollState = {
    y: 0,
    velocity: 0,
    progress: 0,
    direction: 0,
    limit: 0,
  };

  private readonly listeners = new Set<ScrollListener>();
  private lastY = 0;
  private lastTime = -1;

  /**
   * Publish a new scroll sample.
   *
   * @param y      current (animated) scroll offset in CSS px
   * @param limit  maximum scroll offset of the document
   * @param timeMs monotonically increasing timestamp in ms
   * @returns true if anything changed and listeners were notified
   */
  update(y: number, limit: number, timeMs: number): boolean {
    const s = this.state;

    // First sample after construction/reset: establish a baseline only.
    if (this.lastTime < 0) {
      this.lastTime = timeMs;
      this.lastY = y;
      const changed = s.y !== y || s.limit !== limit;
      s.y = y;
      s.limit = limit;
      s.progress = limit > 0 ? clamp01(y / limit) : 0;
      if (changed) this.notify();
      return changed;
    }

    const dtMs = timeMs - this.lastTime;
    if (dtMs <= 0) return false;

    const dy = y - this.lastY;
    // After a long gap (tab was hidden) a velocity would be meaningless.
    const velocity = dtMs > 250 ? 0 : (dy / dtMs) * 1000;
    const snapped = Math.abs(velocity) < VELOCITY_EPSILON ? 0 : velocity;

    this.lastTime = timeMs;
    this.lastY = y;

    const progress = limit > 0 ? clamp01(y / limit) : 0;
    const changed =
      s.y !== y || s.velocity !== snapped || s.limit !== limit || s.progress !== progress;

    if (dy > 0.01) s.direction = 1;
    else if (dy < -0.01) s.direction = -1;

    s.y = y;
    s.velocity = snapped;
    s.limit = limit;
    s.progress = progress;

    if (changed) this.notify();
    return changed;
  }

  /**
   * Register a listener. Returns an unsubscribe function.
   * With `immediate`, the listener is called once with the current state.
   */
  subscribe(listener: ScrollListener, options: { immediate?: boolean } = {}): () => void {
    this.listeners.add(listener);
    if (options.immediate) listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Zero the state and forget timing (call when the producer shuts down). */
  reset(): void {
    const s = this.state;
    s.y = 0;
    s.velocity = 0;
    s.progress = 0;
    s.direction = 0;
    s.limit = 0;
    this.lastY = 0;
    this.lastTime = -1;
  }

  get listenerCount(): number {
    return this.listeners.size;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (error) {
        // One faulty subscriber must never break scrolling or its siblings.
        console.error('[scrollBus] listener threw', error);
      }
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const GLOBAL_KEY = Symbol.for('komorebi.scrollBus');
type GlobalWithBus = typeof globalThis & { [GLOBAL_KEY]?: ScrollBus };

function getBus(): ScrollBus {
  const g = globalThis as GlobalWithBus;
  return (g[GLOBAL_KEY] ??= new ScrollBus());
}

export const scrollBus: ScrollBus = getBus();
export type { ScrollBus };
