import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { scrollBus } from '../../lib/scrollBus';

interface SmoothScrollProviderProps {
  /** Lenis interpolation factor. Lower = floatier. */
  lerp?: number;
  /** Multiplier applied to wheel input. */
  wheelMultiplier?: number;
}

/**
 * Initialises Lenis smooth scrolling and publishes scroll position, velocity
 * and progress into `scrollBus` on every frame.
 *
 * It renders nothing and holds no React state, so scrolling never causes a
 * re-render. Hydrate with `client:only="react"`.
 *
 * With `prefers-reduced-motion: reduce`, Lenis is not created: native
 * scrolling is kept and only position/progress are published.
 */
export default function SmoothScrollProvider({
  lerp = 0.085,
  wheelMultiplier = 1,
}: SmoothScrollProviderProps) {
  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let teardown: (() => void) | null = null;

    const startNative = (): (() => void) => {
      const publish = () => {
        const limit = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        scrollBus.update(window.scrollY, limit, performance.now());
      };

      window.addEventListener('scroll', publish, { passive: true });
      window.addEventListener('resize', publish, { passive: true });
      publish();

      return () => {
        window.removeEventListener('scroll', publish);
        window.removeEventListener('resize', publish);
      };
    };

    const startLenis = (): (() => void) => {
      const lenis = new Lenis({
        autoRaf: false, // we drive it below so the bus updates in lockstep
        lerp,
        wheelMultiplier,
        smoothWheel: true,
        anchors: true,
      });

      let rafId = 0;
      const tick = (time: number) => {
        lenis.raf(time);
        // Published every frame (even when idle) so velocity decays to zero.
        scrollBus.update(lenis.animatedScroll, lenis.limit, time);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafId);
        lenis.destroy();
      };
    };

    const start = () => {
      teardown?.();
      scrollBus.reset();
      teardown = motionQuery.matches ? startNative() : startLenis();
    };

    start();
    motionQuery.addEventListener('change', start);

    return () => {
      motionQuery.removeEventListener('change', start);
      teardown?.();
      teardown = null;
      scrollBus.reset();
    };
  }, [lerp, wheelMultiplier]);

  return null;
}
