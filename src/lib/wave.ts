/**
 * "Liquid wave" page transition for theme and palette changes.
 *
 * Uses the View Transitions API: the browser snapshots the old page, we apply
 * the change, then reveal the new page through a wavy edge that rises from the
 * bottom of the screen like water flowing up and over the page.
 *
 * Browsers without the API (or visitors who prefer reduced motion) simply get
 * the change applied immediately; nothing breaks.
 */

type ViewTransitionLike = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type StartViewTransition = (update: () => void) => ViewTransitionLike;

/** Fired once the wave has fully finished (or was skipped). */
export const WAVE_DONE_EVENT = 'kc:wavedone';

let running = false;

const DURATION_MS = 1400;
const FRAMES = 56;
/** Wave height as a percentage of the viewport. */
const AMPLITUDE = 6.5;
/** Number of crests across the screen. */
const CRESTS = 1.75;
const POINTS = 28;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Edge height (% of viewport) at progress t in [0,1] for horizontal position x01. */
function edgeAt(t: number, x01: number): number {
  const e = easeInOut(t);
  const base = 100 + AMPLITUDE + 2 - e * (100 + (AMPLITUDE + 2) * 2);
  const phase = t * Math.PI * 4;
  const calm = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 0.6 + 0.4;
  return base + Math.sin(x01 * Math.PI * 2 * CRESTS + phase) * AMPLITUDE * calm;
}

function buildKeyframes(): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let f = 0; f <= FRAMES; f++) {
    const t = f / FRAMES;
    const pts: string[] = [];
    for (let i = 0; i <= POINTS; i++) {
      const x01 = i / POINTS;
      pts.push(`${(x01 * 100).toFixed(2)}% ${edgeAt(t, x01).toFixed(2)}%`);
    }
    frames.push({ clipPath: `polygon(${pts.join(',')},100% 100%,0% 100%)`, offset: t });
  }
  return frames;
}

let activeAnimation: Animation | null = null;
let waveActive = false;

/**
 * Live sampler of the wave edge (y as a fraction of viewport height) for
 * canvas layers that must change look exactly as the wave crosses them.
 * Returns null once the wave is over. Before the reveal animation actually
 * starts the edge sits below the screen (nothing revealed yet).
 */
export function getWaveEdge(): ((x01: number) => number) | null {
  if (!waveActive) return null;
  const ct = activeAnimation ? Number(activeAnimation.currentTime ?? 0) : 0;
  const t = Math.min(1, Math.max(0, ct / DURATION_MS));
  return (x01: number) => edgeAt(t, x01) / 100;
}

/** Run `apply` inside a flowing wave reveal (or immediately if unsupported). */
export function runWave(apply: () => void): void {
  const start = (document as unknown as { startViewTransition?: StartViewTransition })
    .startViewTransition;
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!start || reduced || running) {
    apply();
    return;
  }

  running = true;
  waveActive = true;
  const root = document.documentElement;
  root.classList.add('wave-transition');

  const transition = start.call(document, apply);
  transition.ready
    .then(() => {
      activeAnimation = root.animate(buildKeyframes(), {
        duration: DURATION_MS,
        easing: 'linear',
        fill: 'forwards',
        pseudoElement: '::view-transition-new(root)',
      } as KeyframeAnimationOptions);
    })
    .catch(() => {
      /* transition skipped; the change is already applied */
    });

  const done = () => {
    running = false;
    waveActive = false;
    activeAnimation = null;
    root.classList.remove('wave-transition');
    window.dispatchEvent(new Event(WAVE_DONE_EVENT));
  };
  transition.finished.then(done, done);
}
