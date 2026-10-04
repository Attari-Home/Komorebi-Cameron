/**
 * Pointer-driven polish, delegated from the document so it also covers
 * React-rendered nodes:
 *
 *  - Spotlight: elements marked `data-spotlight` get a soft palette-coloured
 *    light that follows the cursor (`--mx` / `--my`, drawn by `.spot`).
 *  - Ink ripple: pressing a `.btn-glass` blooms an ink-wash ripple from the
 *    exact point of contact.
 *
 * Both are skipped with `prefers-reduced-motion`, and neither touches layout.
 */
export function initInteractions(): () => void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  let frame = 0;
  let pending: PointerEvent | null = null;

  const paintSpotlight = () => {
    frame = 0;
    const event = pending;
    pending = null;
    if (!event) return;
    const host = (event.target as Element | null)?.closest<HTMLElement>('[data-spotlight]');
    if (!host) return;
    const rect = host.getBoundingClientRect();
    host.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    host.style.setProperty('--my', `${event.clientY - rect.top}px`);
  };

  const onMove = (event: PointerEvent) => {
    if (reduced.matches || !finePointer.matches) return;
    pending = event;
    if (!frame) frame = requestAnimationFrame(paintSpotlight);
  };

  const onDown = (event: PointerEvent) => {
    if (reduced.matches || event.button !== 0) return;
    const button = (event.target as Element | null)?.closest<HTMLElement>('.btn-glass');
    if (!button || button.matches(':disabled')) return;

    const rect = button.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Big enough to reach the farthest corner from the point of contact.
    const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));

    const ink = document.createElement('span');
    ink.className = 'ink';
    ink.setAttribute('aria-hidden', 'true');
    ink.style.left = `${x}px`;
    ink.style.top = `${y}px`;
    ink.style.width = ink.style.height = `${radius * 2}px`;
    button.appendChild(ink);
    ink.addEventListener('animationend', () => ink.remove(), { once: true });
    window.setTimeout(() => ink.remove(), 1600); // belt and braces
  };

  document.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerdown', onDown, { passive: true });

  return () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerdown', onDown);
    if (frame) cancelAnimationFrame(frame);
  };
}
