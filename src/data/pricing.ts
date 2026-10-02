/**
 * Transparent package tiers. `projectType` and `budget` must match option
 * values in `PROJECT_TYPES` / `BUDGET_TIERS` (src/data/content.ts) so the
 * "Start via Email" CTA can pre-fill the contact form.
 */
export interface PricingTier {
  id: string;
  name: string;
  kicker: string;
  price: string;
  priceNote: string;
  summary: string;
  features: readonly string[];
  featured: boolean;
  projectType: string;
  budget: string;
}

export const PRICING_TIERS: readonly PricingTier[] = [
  {
    id: 'essential',
    name: 'Essential Web Architecture',
    kicker: 'Launch fast, rank honestly',
    price: '$2.5k+',
    priceNote: 'fixed scope, from',
    summary: 'A single, beautifully engineered page built to load instantly and convert.',
    features: [
      'Single-page Astro platform',
      'Sub-second LCP',
      'Core Web Vitals guarantee',
      'Written updates by email throughout',
    ],
    featured: false,
    projectType: 'Bespoke Web Architecture',
    budget: '$2,500 – $5,000',
  },
  {
    id: 'canvas',
    name: 'Bespoke Canvas Platform',
    kicker: 'Most requested',
    price: '$5k+',
    priceNote: 'fixed scope, from',
    summary: 'A multi-page site with a living, custom-built canvas at its heart.',
    features: [
      'Multi-page architecture',
      'Custom 2D/3D Canvas particle engine',
      'Lenis scroll physics',
      'Headless CMS integration',
    ],
    featured: true,
    projectType: 'WebGL/Canvas Interactive Experience',
    budget: '$5,000 – $10,000',
  },
  {
    id: 'enterprise',
    name: 'Enterprise Creative Engine',
    kicker: 'Full-scale creative systems',
    price: '$10k+',
    priceNote: 'scoped to your needs, from',
    summary: 'A bespoke creative platform with the infrastructure to carry it.',
    features: [
      'Custom WebGL shaders',
      'Multi-palette dynamic theme engine',
      'Full edge infrastructure',
      'SLA support',
    ],
    featured: false,
    projectType: 'Dynamic Web Application',
    budget: '$10,000+',
  },
] as const;
