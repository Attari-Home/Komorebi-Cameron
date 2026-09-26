import { useEffect, useRef, type CSSProperties } from 'react';
import { clamp, clamp01, damp, lerp, smoothstep } from '../../engine/math';
import { getCurrentPaletteId, onPaletteChange, resolvePetalColors } from '../../lib/petalPalette';
import { scrollBus } from '../../lib/scrollBus';
import { getCurrentTheme, onThemeChange, type Theme } from '../../lib/theme';

/** Number of trail history samples kept in the ring buffer. */
const TRAIL_CAPACITY = 260;
/** Minimum travel (px) between trail samples. */
const TRAIL_SPACING = 2;
/** Scroll progress at which the petal changes sides (right -> left -> right). */
const SWITCH_POINTS = [0.36, 0.72] as const;
/** Peak thread width in CSS px (kept ultra-thin on purpose). */
const THREAD_WIDTH = 1.7;

/**
 * The Guide Petal: a crisp glowing petal that weaves down the whole page beside
 * the content as the user scrolls, trailing a hairline light thread.
 *
 * Path model
 * ----------
 *  - Vertical: the petal drifts from ~14% to ~86% of the viewport height as
 *    document scroll progress goes 0 -> 1.
 *  - Horizontal: a gentle sine weave inside the gutter beside the content
 *    column (`[data-safe-column]`), so it never passes between text. Twice per
 *    page (SWITCH_POINTS) it fades out, reappears in the opposite gutter and
 *    continues there.
 *  - Physics: soft spring lag, drag, scroll-velocity wind gusts, angular
 *    inertia tumble. Hard-clamped inside its lane.
 *
 * Everything runs in one rAF loop reading `scrollBus.state` and writing
 * straight to DOM styles / a canvas: no React state, no re-renders.
 */
export default function GuidePetal() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLCanvasElement>(null);
  const petalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const trail = trailRef.current;
    const petal = petalRef.current;
    if (!root || !trail || !petal) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      root.style.display = 'none';
      return;
    }

    const tctx = trail.getContext('2d');
    if (!tctx) return;

    // ---- Colours ---------------------------------------------------------
    let theme: Theme = getCurrentTheme();
    let colorA = '#FF70A6';
    let colorB = '#FFB7C5';

    const applyColors = () => {
      theme = getCurrentTheme();
      const c = resolvePetalColors(getCurrentPaletteId(), theme);
      colorA = c.petalA;
      colorB = c.petalB;
      root.style.setProperty('--gp-a', c.petalA);
      root.style.setProperty('--gp-b', c.petalB);
      root.style.setProperty('--gp-tint', c.petalTint);
    };
    applyColors();
    const offTheme = onThemeChange(applyColors);
    const offPalette = onPaletteChange(applyColors);

    // ---- Layout / gutters ------------------------------------------------
    let vw = 0;
    let vh = 0;
    let size = 30;
    let laneCenter = 0;
    let amplitude = 0;
    let usable = true;
    let dpr = 1;
    /** Gutter lanes outside the content column: 0 = left, 1 = right. */
    const lanes = [
      { center: 0, amp: 0, size: 30, gutter: 0 },
      { center: 0, amp: 0, size: 30, gutter: 0 },
    ];
    let bothSides = true;
    let curSide = 1; // start on the right
    let switching = false;

    const applyLane = (side: number) => {
      const l = lanes[side]!;
      size = l.size;
      laneCenter = l.center;
      amplitude = l.amp;
      petal.style.width = `${size}px`;
      petal.style.height = `${size * 1.2}px`;
    };

    const measure = () => {
      vw = document.documentElement.clientWidth;
      vh = window.innerHeight;

      let left = Infinity;
      let right = -Infinity;
      document.querySelectorAll<HTMLElement>('[data-safe-column]').forEach((el) => {
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        left = Math.min(left, rect.left + (parseFloat(cs.paddingLeft) || 0));
        right = Math.max(right, rect.right - (parseFloat(cs.paddingRight) || 0));
      });
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        left = vw * 0.1;
        right = vw * 0.9;
      }

      const buffer = 6;
      const leftW = Math.max(0, left - buffer);
      const rightStart = right + buffer;
      const rightW = Math.max(0, vw - rightStart);
      const build = (i: number, gutter: number, start: number) => {
        const sz = clamp(gutter * 0.7, 10, 40);
        lanes[i] = {
          center: start + gutter / 2,
          amp: Math.max(0, gutter / 2 - sz / 2 - 1),
          size: sz,
          gutter,
        };
      };
      build(0, leftW, 0);
      build(1, rightW, rightStart);

      // Only switch sides when both gutters are roomy enough; otherwise stay
      // on the wider one.
      bothSides = leftW >= 26 && rightW >= 26;
      if (!bothSides) curSide = rightW >= leftW ? 1 : 0;
      usable = Math.max(leftW, rightW) >= 9;
      applyLane(curSide);

      // Trail canvas matches the viewport, at a capped density.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      trail.width = Math.round(vw * dpr);
      trail.height = Math.round(vh * dpr);
    };
    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.documentElement);
    window.addEventListener('resize', measure);

    // ---- Simulation state ------------------------------------------------
    const s = { x: 0, y: 0, vx: 0, vy: 0, rot: 0, av: 0, opacity: 0 };
    let initialised = false;

    const trailX = new Float32Array(TRAIL_CAPACITY);
    const trailY = new Float32Array(TRAIL_CAPACITY);
    const trailT = new Float64Array(TRAIL_CAPACITY);
    let trailHead = 0;
    let trailCount = 0;
    let trailDirty = false;

    const startedAt = performance.now();
    let last = 0;
    let rafId = 0;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);

      const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 0.05);
      last = now;
      const time = (now - startedAt) / 1000;

      const bus = scrollBus.state;
      const p = clamp01(bus.progress);
      // Gentle side-to-side weave inside the current gutter lane.
      const phase = p * Math.PI * 6;

      // Side schedule: starts on the right, crosses over twice.
      const wantSide = !bothSides
        ? curSide
        : p < SWITCH_POINTS[0]
          ? 1
          : p < SWITCH_POINTS[1]
            ? 0
            : 1;
      if (wantSide !== curSide) switching = true;

      const idleSway = Math.sin(time * 0.7) * amplitude * 0.12;
      const targetX = clamp(
        laneCenter + Math.sin(phase) * amplitude + idleSway,
        laneCenter - amplitude,
        laneCenter + amplitude,
      );
      const bob = Math.sin(time * 0.9) * 5;
      const eased = p * p * (3 - 2 * p);
      const targetY = vh * lerp(0.14, 0.86, eased) + Math.cos(phase) * Math.min(vh * 0.04, 28) + bob;

      if (!initialised) {
        s.x = targetX;
        s.y = targetY - 40;
        initialised = true;
      }

      // ---- Inertial spring: the petal lags the scroll, then glides after it ---
      // Soft spring (low k) + drag (low damping ratio) gives a floaty overshoot;
      // fast scrolling adds a wind gust that pushes it sideways.
      const k = 11;
      const c = 2 * Math.sqrt(k) * 0.62;
      const gust = clamp(bus.velocity * 0.02, -60, 60) * Math.sin(time * 1.3 + phase);
      s.vx += (k * (targetX - s.x) - c * s.vx + gust) * dt;
      s.vy += (k * (targetY - s.y) - c * s.vy - clamp(bus.velocity, -3000, 3000) * 0.02) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // Hard guarantee: never leave the lane, whatever the spring does.
      s.x = clamp(s.x, laneCenter - amplitude, laneCenter + amplitude);
      s.y = clamp(s.y, size * 0.5, vh - size * 0.5);

      // ---- Orientation: angular inertia driven by velocity (rot += vel * 0.05) ---
      const torque =
        (Math.cos(phase) * 0.9 + s.vx * 0.05 * 0.06 + clamp(bus.velocity * 0.0004, -0.8, 0.8)) - s.rot;
      s.av += (torque * 9 - s.av * 3.2) * dt;
      s.rot += s.av * dt;

      // Pseudo-3D tumble: squash local x by |cos|.
      const tumble = time * 0.7 + phase + s.av * 0.6;
      const squash = 0.38 + 0.62 * Math.abs(Math.cos(tumble));

      // ---- Visibility: intro fade-in, fade out near the footer -------------
      const intro = smoothstep(2.4, 3.8, time);
      const outro = 1 - smoothstep(0.93, 0.995, p);
      const target = usable && !switching ? intro * outro : 0;
      s.opacity = damp(s.opacity, target, switching ? 9 : 6, dt);

      // Side change: fade out beside the text, reappear in the other gutter
      // (never flying across the content), thread reset.
      if (switching && s.opacity < 0.04) {
        curSide = wantSide;
        applyLane(curSide);
        s.x = laneCenter;
        s.vx = 0;
        s.av = 0;
        trailCount = 0;
        switching = false;
      }

      petal.style.opacity = s.opacity.toFixed(3);
      petal.style.transform = `translate3d(${(s.x - size / 2).toFixed(2)}px, ${(s.y - size * 0.6).toFixed(2)}px, 0) rotate(${s.rot.toFixed(3)}rad) scale(${squash.toFixed(3)}, 1)`;

      // ---- Trail history ---------------------------------------------------
      if (s.opacity > 0.04) {
        const lastIdx = (trailHead - 1 + TRAIL_CAPACITY) % TRAIL_CAPACITY;
        const moved =
          trailCount === 0 ||
          Math.hypot(s.x - trailX[lastIdx]!, s.y - trailY[lastIdx]!) >= TRAIL_SPACING;
        if (moved) {
          trailX[trailHead] = s.x;
          trailY[trailHead] = s.y;
          trailT[trailHead] = time;
          trailHead = (trailHead + 1) % TRAIL_CAPACITY;
          if (trailCount < TRAIL_CAPACITY) trailCount++;
        }
      }

      // Trail lifetime stretches with scroll speed.
      const life = 1.5 + clamp(Math.abs(bus.velocity) / 2500, 0, 1) * 1.1;
      while (trailCount > 0) {
        const oldest = (trailHead - trailCount + TRAIL_CAPACITY) % TRAIL_CAPACITY;
        if (time - trailT[oldest]! > life) trailCount--;
        else break;
      }

      if (trailCount > 1 || trailDirty) {
        drawTrail(time, life);
        trailDirty = trailCount > 1;
      }
    };

    /**
     * Draw the light thread: a hairline (<= 1.7px) that tapers and decays with
     * age, a faint wider glow beneath it, and a few sparkle motes shed along
     * its length. Canvas rather than SVG so it costs one clear + a handful of
     * strokes per frame with no DOM churn.
     */
    const drawTrail = (time: number, life: number) => {
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, trail.width, trail.height);
      if (trailCount < 2) return;

      tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tctx.lineCap = 'round';
      tctx.lineJoin = 'round';
      tctx.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'source-over';

      const at = (n: number) => (trailHead - trailCount + n + TRAIL_CAPACITY) % TRAIL_CAPACITY;

      const pass = (color: string, width: number, alphaScale: number) => {
        tctx.strokeStyle = color;
        for (let n = 1; n < trailCount - 1; n++) {
          const i0 = at(n - 1);
          const i1 = at(n);
          const i2 = at(n + 1);

          const age = clamp01((time - trailT[i1]!) / life);
          const fade = 1 - age;
          const alpha = Math.pow(fade, 1.7) * alphaScale * s.opacity;
          if (alpha < 0.005) continue;

          tctx.globalAlpha = alpha;
          tctx.lineWidth = Math.max(0.4, width * (0.35 + 0.65 * fade));

          const mx0 = (trailX[i0]! + trailX[i1]!) / 2;
          const my0 = (trailY[i0]! + trailY[i1]!) / 2;
          const mx1 = (trailX[i1]! + trailX[i2]!) / 2;
          const my1 = (trailY[i1]! + trailY[i2]!) / 2;

          tctx.beginPath();
          tctx.moveTo(mx0, my0);
          tctx.quadraticCurveTo(trailX[i1]!, trailY[i1]!, mx1, my1);
          tctx.stroke();
        }
      };

      pass(colorA, THREAD_WIDTH * 3, 0.16); // soft halo
      pass(colorB, THREAD_WIDTH, 0.9); // hairline core

      // Sparkle motes: tiny dots on every 7th sample, fading with age.
      tctx.fillStyle = colorB;
      for (let n = 3; n < trailCount; n += 7) {
        const i = at(n);
        const fade = 1 - clamp01((time - trailT[i]!) / life);
        const a = fade * fade * 0.85 * s.opacity;
        if (a < 0.02) continue;
        tctx.globalAlpha = a;
        // Deterministic offset from the sample time, so motes shimmer in place.
        const off = Math.sin(trailT[i]! * 37.7) * 3.2;
        tctx.beginPath();
        tctx.arc(trailX[i]! + off, trailY[i]! + Math.cos(trailT[i]! * 23.1) * 2.4, 0.7 + fade * 0.6, 0, Math.PI * 2);
        tctx.fill();
      }

      tctx.globalAlpha = 1;
      tctx.globalCompositeOperation = 'source-over';
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      offTheme();
      offPalette();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
      style={
        {
          '--gp-a': '#FF70A6',
          '--gp-b': '#FFB7C5',
          '--gp-tint': '#FFF1F5',
        } as CSSProperties
      }
    >
      <canvas ref={trailRef} className="absolute inset-0 h-full w-full" />

      <div
        ref={petalRef}
        className="absolute left-0 top-0 will-change-transform"
        style={{ opacity: 0, width: 44, height: 53 }}
      >
        {/* Radial glow halo */}
        <span
          className="absolute -inset-[55%] animate-petal-glow rounded-full"
          style={{
            background:
              'radial-gradient(circle, color-mix(in srgb, var(--gp-a) 45%, transparent) 0%, transparent 60%)',
            filter: 'blur(4px)',
          }}
        />

        <svg
          viewBox="0 0 40 48"
          className="relative block h-full w-full overflow-visible"
          style={{ filter: 'drop-shadow(0 0 3px var(--gp-a))' }}
          focusable="false"
        >
          <defs>
            <linearGradient id="gp-body" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" style={{ stopColor: 'var(--gp-a)' }} />
              <stop offset="0.6" style={{ stopColor: 'var(--gp-b)' }} />
              <stop offset="1" style={{ stopColor: 'var(--gp-tint)' }} />
            </linearGradient>
            <radialGradient id="gp-sheen" cx="0.5" cy="0.3" r="0.55">
              <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M20 46 C8 38 3 22 11 5 Q15 2 20 10 Q25 2 29 5 C37 22 32 38 20 46 Z"
            fill="url(#gp-body)"
          />
          <path
            d="M20 46 C8 38 3 22 11 5 Q15 2 20 10 Q25 2 29 5 C37 22 32 38 20 46 Z"
            fill="url(#gp-sheen)"
          />
          <path
            d="M20 43 Q21 26 20 12"
            fill="none"
            stroke="#fff"
            strokeOpacity="0.4"
            strokeWidth="0.9"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
