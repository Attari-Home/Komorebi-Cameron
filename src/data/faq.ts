/**
 * Frequently asked questions.
 * Rendered by Faq.astro AND emitted as FAQPage structured data (index.astro),
 * so what search engines read always matches what visitors see.
 */

export interface FaqItem {
  question: string;
  /** Plain text. Also used verbatim in the structured data. */
  answer: string;
}

export const FAQ: readonly FaqItem[] = [
  {
    question: 'How do we work together without calls?',
    answer:
      'Everything runs in writing. Briefs, reviews and feedback happen by email, Discord or text, at your pace and in your time zone. We never schedule calls or phone meetings, which keeps every decision documented and every deadline clear.',
  },
  {
    question: 'How long until I hear back after I send an inquiry?',
    answer:
      'Within 7 days. Each inquiry gets an in-depth technical review of your goals, scope and constraints, so the reply you receive is specific to your project rather than a template.',
  },
  {
    question: 'How much does a project cost?',
    answer:
      'Packages start at $2,500 for the Essential Web Architecture (a single-page Astro platform), $5,000 for the Bespoke Canvas Platform (multi-page, custom canvas engine, headless CMS) and $10,000 for the Enterprise Creative Engine (custom WebGL shaders, a multi-palette theme engine, edge infrastructure and SLA support). Every project is scoped in writing before any work begins.',
  },
  {
    question: 'Who owns the code and the intellectual property?',
    answer:
      'You do, completely. At handover you receive 100% of the codebase and all intellectual property, along with documentation so your team can run and extend it with confidence.',
  },
  {
    question: 'What does the 100/100 Core Web Vitals guarantee mean?',
    answer:
      'We commit to delivering a 100/100 Core Web Vitals result. Sites are built static-first on Astro with a near-zero JavaScript initial payload, and every release is measured against Lighthouse and Core Web Vitals budgets before it is handed over.',
  },
  {
    question: 'What do you need from me to get started?',
    answer:
      'A short written brief: what you are building, who it is for, any references you love and your rough timeline. Pick the package that fits (or "Not sure yet") on the contact form, or use the estimator above to shape it, and we take it from there.',
  },
  {
    question: 'Do you support the site after launch?',
    answer:
      'Yes. Launch includes deployment, monitoring, documentation and a post-launch review of Core Web Vitals and search performance. The Enterprise tier adds SLA support.',
  },
];
