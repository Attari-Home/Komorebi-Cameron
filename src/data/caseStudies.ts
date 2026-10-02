/**
 * Flagship portfolio projects shown in the "Portfolio" switcher.
 * Only completed projects belong here. Add new entries to the array as they ship;
 * the switcher tabs appear automatically once there is more than one.
 *
 * VERIFY BEFORE LAUNCH: the `metrics` values and `liveUrl` fields are
 * working figures. Replace them with numbers from your own Lighthouse /
 * WebPageTest runs and the real deployment URLs. A `liveUrl` of `null` hides
 * the live link and shows an "request a walkthrough by email" action instead.
 */

export interface CaseStudyMetrics {
  /** Lighthouse performance score, 0–100. */
  lighthouse: string;
  /** Largest Contentful Paint. */
  lcp: string;
  /** Sustained frame rate during interaction. */
  fps: string;
}

export interface CaseStudy {
  id: string;
  title: string;
  category: string;
  year: string;
  summary: string;
  stack: readonly string[];
  challenge: string;
  solution: string;
  metrics: CaseStudyMetrics;
  liveUrl: string | null;
  liveLabel: string;
}

export const CASE_STUDIES: readonly CaseStudy[] = [
  {
    id: 'komorebi-architecture',
    title: 'Komorebi Architecture',
    category: 'Bespoke Web Architecture',
    year: '2026',
    summary: 'This very platform: sub-0.6s LCP with 120 FPS offscreen particle physics.',
    stack: ['Astro', 'React', 'Tailwind CSS', 'Canvas 2D', 'OffscreenCanvas', 'Lenis'],
    challenge:
      'Build an agency site that is visibly alive (thousands of drifting petals reacting to scroll and cursor) yet loads instantly and scores perfectly on Core Web Vitals. Motion and performance normally pull in opposite directions.',
    solution:
      'Static-first Astro delivery keeps the hero as plain, instantly painted HTML. The particle engine runs on an offscreen canvas with pooled sprites and a frame-time governor that scales density to the device, so the physics hold 120 FPS on capable hardware without ever blocking the main thread.',
    metrics: { lighthouse: '100', lcp: '< 0.6s', fps: '120' },
    liveUrl: '/',
    liveLabel: 'You are here',
  },
] as const;
