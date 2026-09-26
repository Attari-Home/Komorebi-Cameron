import { useEffect, useRef } from 'react';
import { Engine } from '../../engine/Engine';
import { getCurrentPaletteId, onPaletteChange, resolvePetalColors } from '../../lib/petalPalette';
import { scrollBus } from '../../lib/scrollBus';
import { getCurrentTheme, onThemeChange } from '../../lib/theme';

/**
 * Mounts the canvas engine as a fixed, full-viewport layer behind the page.
 *
 * React is only used for lifecycle: the engine runs its own rAF loop and reads
 * `scrollBus.state` each frame, so nothing here re-renders while scrolling.
 * Theme and petal-palette changes are pushed to the engine imperatively.
 * Hydrate with `client:only="react"`.
 */
export default function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const theme = getCurrentTheme();

    const engine = new Engine(canvas, {
      theme,
      petalColors: resolvePetalColors(getCurrentPaletteId(), theme),
      reducedMotion: motionQuery.matches,
    });

    // Zero-re-render coupling: the engine pulls the live state every frame.
    engine.setScrollSource(() => scrollBus.state);

    // Opt-in debug handle for profiling (set window.__KC_DEBUG__ before load).
    if ((window as unknown as { __KC_DEBUG__?: boolean }).__KC_DEBUG__) {
      (window as unknown as { __kcEngine?: Engine }).__kcEngine = engine;
    }

    // Resize handling, coalesced to at most once per animation frame.
    let resizeFrame = 0;
    let pendingWidth = 0;
    let pendingHeight = 0;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      pendingWidth = entry.contentRect.width;
      pendingHeight = entry.contentRect.height;
      if (resizeFrame !== 0) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        engine.resize(pendingWidth, pendingHeight);
      });
    });
    resizeObserver.observe(canvas);

    // Theme or palette change => one atomic sprite rebuild.
    const applyAppearance = () => {
      const t = getCurrentTheme();
      engine.setAppearance(t, resolvePetalColors(getCurrentPaletteId(), t));
    };
    const offTheme = onThemeChange(applyAppearance);
    const offPalette = onPaletteChange(applyAppearance);

    const onMotionChange = (event: MediaQueryListEvent) => engine.setReducedMotion(event.matches);
    motionQuery.addEventListener('change', onMotionChange);

    engine.start();

    return () => {
      if (resizeFrame !== 0) cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      offTheme();
      offPalette();
      motionQuery.removeEventListener('change', onMotionChange);
      engine.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />;
}
