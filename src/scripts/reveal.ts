/**
 * Scroll reveal.
 *
 * Elements marked `data-reveal` start hidden (only when the `js` class is on
 * <html>, so no-JS visitors still see everything) and fade-rise into place
 * the first time they enter the viewport. `--reveal-delay` staggers siblings.
 */
export function initReveal(): () => void {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (targets.length === 0) return () => {};

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-visible'));
    return () => {};
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );

  targets.forEach((el) => io.observe(el));
  return () => io.disconnect();
}
