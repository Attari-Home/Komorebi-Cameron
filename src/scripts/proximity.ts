/**
 * Cursor-proximity text interaction.
 *
 * Any element with the `.i-text` class (see global.css) gets a `--prox`
 * custom property between 0 and 1 that rises as the cursor approaches and
 * falls as it leaves. CSS turns that number into a lift, a glow, and a colour
 * shift, so this script only ever writes one property per element.
 *
 * A single pointer listener drives everything; only elements currently in
 * the viewport are measured, and the rAF loop sleeps whenever nothing is
 * moving. Touch input, coarse pointers, and reduced motion are ignored.
 */

const SELECTOR = '.i-text';
/** Distance (px) from an element's box at which the effect begins. */
const RADIUS = 150;
/** Smoothing rate (1/s) toward the target proximity. */
const RATE = 9;
/** Below this the effect is treated as fully off. */
const EPSILON = 0.004;

interface Item {
  el: HTMLElement;
  prox: number;
  written: number;
  visible: boolean;
}

export function initProximity(): () => void {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches || reduced.matches) return () => {};

  const items = new Map<Element, Item>();
  const pointer = { x: -9999, y: -9999, active: false };
  let rafId = 0;
  let last = 0;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const item = items.get(entry.target);
        if (!item) continue;
        item.visible = entry.isIntersecting;
        if (!entry.isIntersecting) write(item, 0);
      }
      schedule();
    },
    { rootMargin: `${RADIUS}px 0px` },
  );

  function register(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>(SELECTOR).forEach(add);
    if (root instanceof HTMLElement && root.matches(SELECTOR)) add(root);
  }

  function add(el: HTMLElement): void {
    if (items.has(el)) return;
    items.set(el, { el, prox: 0, written: 0, visible: false });
    io.observe(el);
  }

  function write(item: Item, value: number): void {
    item.prox = value;
    if (Math.abs(item.written - value) < EPSILON && value !== 0) return;
    item.written = value;
    item.el.style.setProperty('--prox', value < EPSILON ? '0' : value.toFixed(3));
  }

  function schedule(): void {
    if (rafId === 0) {
      last = 0;
      rafId = requestAnimationFrame(tick);
    }
  }

  function tick(now: number): void {
    rafId = 0;
    const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 0.05);
    last = now;
    const follow = 1 - Math.exp(-RATE * dt);

    // Read phase, then write phase: no layout thrash.
    const targets: Array<[Item, number]> = [];
    for (const item of items.values()) {
      if (!item.visible) continue;

      let target = 0;
      if (pointer.active) {
        const r = item.el.getBoundingClientRect();
        const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
        const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
        const t = 1 - Math.min(Math.hypot(dx, dy) / RADIUS, 1);
        target = t * t * (3 - 2 * t); // smoothstep
      }
      targets.push([item, target]);
    }

    let busy = false;
    for (const [item, target] of targets) {
      const next = item.prox + (target - item.prox) * follow;
      write(item, Math.abs(next - target) < EPSILON ? target : next);
      if (item.prox !== target) busy = true;
    }

    if (busy || pointer.active) schedule();
  }

  const onMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
    schedule();
  };
  const onLeave = (): void => {
    pointer.active = false;
    schedule();
  };
  const onScroll = (): void => {
    if (pointer.active) schedule();
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  window.addEventListener('scroll', onScroll, { passive: true });

  // Pick up elements rendered later (React islands, hydrated content).
  register(document);
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) register(node);
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  return () => {
    if (rafId !== 0) cancelAnimationFrame(rafId);
    io.disconnect();
    mo.disconnect();
    document.removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
    window.removeEventListener('blur', onLeave);
    window.removeEventListener('scroll', onScroll);
    items.forEach((item) => item.el.style.removeProperty('--prox'));
    items.clear();
  };
}
