import { useEffect, useRef } from 'react';
import { registerLiquidCanvas } from '../../lib/liquidTransition';

/**
 * Full-screen canvas that hosts the liquid wave drawn by
 * `src/lib/liquidTransition.ts` whenever the theme or petal palette changes.
 *
 * It is hidden (display: none) while idle, so it costs nothing at rest. It
 * renders no React state and never re-renders. Hydrate with `client:only`.
 */
export default function LiquidThemeTransition() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return registerLiquidCanvas(canvas);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[80] h-full w-full"
      style={{ display: 'none' }}
    />
  );
}
