import { useEffect, useRef } from 'react';
import { Engine } from '../../engine/Engine';
import { getCurrentTheme, onThemeChange } from '../../lib/theme';
import { scrollBus } from '../../lib/scrollBus';

/**
 * Mounts the canvas engine into the hero.
 *
 * React is only used for lifecycle: the engine runs its own rAF loop and reads
 * `scrollBus.state` each frame, so nothing here ever re-renders while
 * scrolling. Hydrate with `client:only="react"`.
 */
export default function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const engine = new Engine(canvas, {
      theme: getCurrentTheme(),
      reducedMotion: motionQuery.matches,
    });

    // Zero-re-render coupling: the engine pulls the live state every frame.
    engine.setScrollSource(() => scrollBus.state);

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

    // Pause the loop entirely while the hero is scrolled out of view.
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) engine.setInViewport(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    const offTheme = onThemeChange((theme) => engine.setTheme(theme));
    const onMotionChange = (event: MediaQueryListEvent) => engine.setReducedMotion(event.matches);
    motionQuery.addEventListener('change', onMotionChange);

    engine.start();

    return () => {
      if (resizeFrame !== 0) cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      offTheme();
      motionQuery.removeEventListener('change', onMotionChange);
      engine.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="block h-full w-full" />;
}
