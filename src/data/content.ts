/**
 * Long-form page content: process, impact metrics, and manifesto principles.
 * Numbers and copy below are placeholders; replace with real project data.
 */

export const PRINCIPLES = [
  {
    title: 'Restraint',
    text: 'Luxury is what you leave out. We remove everything that does not earn its place, until only the essential remains and it feels inevitable.',
  },
  {
    title: 'Precision',
    text: 'Every easing curve, kerning pair and millisecond is chosen. Craft lives in the details nobody notices until they are missing.',
  },
  {
    title: 'Wonder',
    text: 'Behind the discipline is delight: the small, unexpected moment when a page responds like something alive.',
  },
] as const;

export const PROCESS_STEPS = [
  {
    id: 'discovery',
    number: '01',
    title: 'Discovery',
    summary: 'We listen first: goals, audience, constraints, ambition.',
    description:
      'We begin with conversation, not a template. Stakeholder interviews, competitor and audience research, and a technical audit define what the site must achieve and what will make it memorable.',
    deliverables: ['Creative and technical brief', 'Audience and competitor insights', 'Scope, timeline and success metrics'],
    duration: '1 – 2 weeks',
  },
  {
    id: 'architecture',
    number: '02',
    title: 'Architecture',
    summary: 'Structure, systems and performance budgets before pixels.',
    description:
      'Information architecture, content model, design tokens and a performance budget are agreed up front. The technical foundation is chosen for speed, SEO and long-term maintainability.',
    deliverables: ['Sitemap and content model', 'Design system and tokens', 'Performance and SEO blueprint'],
    duration: '1 – 2 weeks',
  },
  {
    id: 'craft',
    number: '03',
    title: 'Craft',
    summary: 'Design and engineering, iterated in the open.',
    description:
      'Interfaces are designed and built together in a live environment. Motion, typography and interaction are refined against real devices, with regular reviews so nothing arrives as a surprise.',
    deliverables: ['Production-ready build', 'Motion and interaction system', 'Accessibility and device testing'],
    duration: '3 – 6 weeks',
  },
  {
    id: 'launch',
    number: '04',
    title: 'Launch',
    summary: 'A calm release, then continued care.',
    description:
      'Staged deployment, redirects, analytics and monitoring are set up and rehearsed. After launch we track Core Web Vitals and search performance, and hand over documentation so your team is confident.',
    deliverables: ['Deployment and monitoring', 'Documentation and handover', 'Post-launch performance review'],
    duration: '1 week + ongoing',
  },
] as const;

export const STATS = [
  {
    value: 120,
    decimals: 0,
    prefix: '',
    suffix: '+',
    label: 'Digital experiences shipped',
    note: 'Sites, apps and campaigns',
  },
  {
    value: 0.8,
    decimals: 1,
    prefix: '',
    suffix: 's',
    label: 'Average Largest Contentful Paint',
    note: 'Measured on mid-range mobile',
  },
  {
    value: 99,
    decimals: 0,
    prefix: '',
    suffix: '',
    label: 'Average Lighthouse score',
    note: 'Performance, SEO, accessibility',
  },
  {
    value: 3.4,
    decimals: 1,
    prefix: '',
    suffix: '×',
    label: 'Average organic traffic lift',
    note: 'Within twelve months of launch',
  },
] as const;

export const PROJECT_TYPES = [
  'Bespoke website',
  'Creative canvas / WebGL experience',
  'Performance & SEO overhaul',
  'Something else',
] as const;
