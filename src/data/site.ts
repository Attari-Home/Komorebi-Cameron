/**
 * Single source of truth for site-wide metadata.
 * Update `url`, `email` and `sameAs` once the production details are final.
 */
export const SITE = {
  name: 'Komorebi Cameron',
  legalName: 'Komorebi Cameron',
  url: 'https://komorebicameron.com',
  tagline: 'Web Architecture & Creative Engineering',
  title: 'Komorebi Cameron — Luxury Web Development & Creative Engineering Studio',
  description:
    'Komorebi Cameron is a luxury web development and creative engineering studio crafting unforgettable digital experiences: bespoke websites, canvas graphics, and performance-first SEO architecture.',
  locale: 'en_US',
  themeColor: '#0A0A0C',
  ogImage: '/og/og-default.jpg',
  ogImageAlt: 'Komorebi Cameron — Crafting Unforgettable Digital Experiences',
  /** Public profile URLs. Leave empty until real profiles exist. */
  sameAs: [] as string[],
  services: [
    {
      name: 'Bespoke Web Development',
      description:
        'Hand-built, design-led websites and web applications engineered for speed, accessibility, and longevity.',
    },
    {
      name: 'Creative Engineering & Canvas Graphics',
      description:
        'Custom WebGL and HTML5 canvas experiences, generative visuals, and scroll-driven motion systems.',
    },
    {
      name: 'Performance & SEO Architecture',
      description:
        'Static-first architecture, Core Web Vitals engineering, and structured data for measurable search visibility.',
    },
  ],
} as const;
