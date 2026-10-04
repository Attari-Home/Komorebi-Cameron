/**
 * Pricing tiers.
 *
 * Single source of truth for the Pricing section, the contact form's package
 * dropdown, and the package-selection bridge between them.
 * All prices are starting prices in USD; every project is scoped in writing.
 */

export interface PricingTier {
  /** Stable id. Also the value used by the contact form's package dropdown. */
  id: string;
  index: string;
  name: string;
  kicker: string;
  /** Starting price as a number (USD). */
  price: number;
  /** Display string, e.g. "$2,500+". */
  priceLabel: string;
  summary: string;
  features: readonly string[];
  /** Highlights the signature tier visually. */
  featured: boolean;
}

export const PRICING_TIERS = [
  {
    id: 'essential',
    index: '01',
    name: 'Essential Web Architecture',
    kicker: 'A single flawless page',
    price: 2500,
    priceLabel: '$2,500+',
    summary:
      'A hand-built, single-page platform engineered to load before your visitor blinks, and to stay that way.',
    features: [
      'Single-page Astro platform',
      'Sub-second LCP',
      '100/100 Core Web Vitals guarantee',
    ],
    featured: false,
  },
  {
    id: 'bespoke',
    index: '02',
    name: 'Bespoke Canvas Platform',
    kicker: 'Motion you can feel',
    price: 5000,
    priceLabel: '$5,000+',
    summary:
      'A multi-page experience with its own living canvas, where scroll, light and motion tell your story.',
    features: [
      'Multi-page architecture',
      'Custom 2D/3D Canvas engine',
      'Lenis scroll physics',
      'Headless CMS integration',
    ],
    featured: true,
  },
  {
    id: 'enterprise',
    index: '03',
    name: 'Enterprise Creative Engine',
    kicker: 'Without compromise',
    price: 10000,
    priceLabel: '$10,000+',
    summary:
      'A fully bespoke creative engine on edge infrastructure, backed by support you can hold us to.',
    features: [
      'Custom WebGL shaders',
      'Multi-palette dynamic theme engine',
      'Full edge infrastructure & SLA support',
    ],
    featured: false,
  },
] as const satisfies readonly PricingTier[];

export type PricingTierId = (typeof PRICING_TIERS)[number]['id'];

/** Value of the contact form's package dropdown when no tier is chosen. */
export const PACKAGE_UNDECIDED = 'undecided' as const;

export type PackageChoice = PricingTierId | typeof PACKAGE_UNDECIDED;

export interface PackageOption {
  value: PackageChoice;
  label: string;
}

/** Options for the contact form's Package / Budget dropdown. */
export const PACKAGE_OPTIONS: readonly PackageOption[] = [
  { value: PACKAGE_UNDECIDED, label: 'Not sure yet, advise me' },
  ...PRICING_TIERS.map((tier) => ({
    value: tier.id,
    label: `${tier.name} (${tier.priceLabel})`,
  })),
];

export const PRICING_NOTE =
  'Starting prices in USD. Every project is scoped in writing, entirely asynchronously, before any work begins.';
