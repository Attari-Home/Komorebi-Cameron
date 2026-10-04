/**
 * Single source of truth for site-wide metadata and marketing copy config.
 * Update `url`, `contact` and `sameAs` once the production details are final.
 */
export const SITE = {
  name: 'Komorebi Cameron',
  legalName: 'Komorebi Cameron',
  url: 'https://komorebicameron.com',
  tagline: 'Web Architecture & Creative Engineering',
  title: 'Komorebi Cameron | Luxury Web Development & Creative Studio',
  description:
    'Luxury web development and creative engineering studio. Bespoke Astro sites, custom canvas and WebGL, 100/100 Core Web Vitals. 100% async, from $2,500.',
  locale: 'en_US',
  themeColor: '#0A0A0C',
  ogImage: '/og/og-default.jpg',
  ogImageAlt: 'Komorebi Cameron — Crafting Unforgettable Digital Experiences',
  /** Public profile URLs. Leave empty until real profiles exist. */
  sameAs: [] as string[],

  /** Placeholder contact details. Replace before launch. */
  contact: {
    email: 'hello@komorebicameron.com',
    /**
     * Optional form backend (e.g. a Formspree / Basin / custom endpoint that
     * accepts a JSON POST). When empty, the contact form opens the visitor's
     * email client with the message pre-filled instead.
     */
    formEndpoint: '',
    /** Public response-time promise. The studio is 100% asynchronous. */
    responseWindow: 'Within 7 days',
    /** Communication preferences offered on the contact form. Never calls. */
    channels: [
      { value: 'email', label: 'Email' },
      { value: 'discord', label: 'Discord' },
      { value: 'text', label: 'Text' },
    ],
  },

  /** Studio promises shown in the TrustBar. */
  trustPoints: [
    {
      id: 'async',
      icon: 'chat',
      title: '100% Async & Text-First',
      detail: 'Zero calls or phone meetings.',
    },
    {
      id: 'review',
      icon: 'clock',
      title: '7-Day Technical Review',
      detail: 'An in-depth technical review window for every inquiry.',
    },
    {
      id: 'vitals',
      icon: 'gauge',
      title: '100/100 Core Web Vitals',
      detail: 'A performance guarantee, not a target.',
    },
    {
      id: 'ownership',
      icon: 'shield',
      title: '100% Codebase & IP Ownership',
      detail: 'Complete handover. Everything we build is yours.',
    },
  ],

  nav: [
    { label: 'Manifesto', href: '#manifesto' },
    { label: 'Services', href: '#services' },
    { label: 'Process', href: '#process' },
    { label: 'Impact', href: '#impact' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Contact', href: '#contact' },
  ],

  services: [
    {
      id: 'web',
      index: '01',
      name: 'Bespoke Web Engineering',
      kicker: 'Design-led builds',
      description:
        'Hand-built websites and web applications, engineered from a blank file to be fast, accessible, and unmistakably yours. No templates, no page-builder bloat.',
      features: [
        'Astro, React and TypeScript architecture',
        'Design systems with dark and light themes',
        'Accessible by default, WCAG 2.2 AA',
      ],
    },
    {
      id: 'canvas',
      index: '02',
      name: 'Creative WebGL & Canvas Graphics',
      kicker: 'Motion you can feel',
      description:
        'Generative visuals, particle systems, and scroll-driven storytelling that turn a page into an experience, tuned to hold 60fps on real devices.',
      features: [
        'Custom HTML5 canvas and WebGL engines',
        'Scroll physics and micro-interactions',
        'Graceful reduced-motion fallbacks',
      ],
    },
    {
      id: 'performance',
      index: '03',
      name: 'Performance & SEO Architecture',
      kicker: 'Fast, findable, durable',
      description:
        'Static-first delivery, Core Web Vitals engineering, and structured data, so the site you launch is the one search engines and visitors reward.',
      features: [
        'Near-zero-JS initial payloads',
        'Schema.org structured data and rich results',
        'Lighthouse and Core Web Vitals budgets',
      ],
    },
  ],
} as const;
