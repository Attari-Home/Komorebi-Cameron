# Komorebi Cameron

Flagship site for **Komorebi Cameron**, a luxury web development and creative engineering studio. A dark, minimal, cyber-Japanese aesthetic: obsidian backgrounds, glowing sakura accents, a procedural blossom branch and falling petals drawn on canvas, and a sumi-e (ink wash) landscape footer.

## Stack

- [Astro 5](https://astro.build) (static output) with React islands (`client:only="react"`)
- Tailwind CSS 3, design tokens as RGB channel CSS variables
- Custom Canvas 2D engine (no framework): branches, petals, ambient glow leaves
- [Lenis](https://lenis.darkroom.engineering) smooth scrolling
- Fonts: Plus Jakarta Sans (variable) and Cormorant Garamond italic, self-hosted via Fontsource

## Getting started

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # type-check (astro check) + static build into dist/
npm run preview    # serve the production build
```

Requires Node 18.20+ (Node 20+ recommended).

## Features

- **Dual theme** (dark / light), applied by a blocking inline script before first paint, so there is no flash. Choice is stored in `localStorage` (`kc-theme`) and follows the OS by default.
- **Petal palettes**: Sakura Pink, Golden Komorebi, Velvet Magenta, Pure Ghost White. A palette drives the canvas petals *and* the UI accent tokens (`--sakura-a`, `--sakura-b`, `--accent-glow`, `--text-accent`, `--border-accent`), including the footer landscape. Light-mode variants are tuned for at least 4.5:1 text contrast. Stored as `kc-petal-palette`.
- **Canvas engine** (`src/engine/`): typed-array petal pool, pre-rendered sprites, seeded branch generation with wind sway, adaptive quality governor, pauses when hidden. Mobile uses a lean config (30 to 40 petals).
- **Guide Petal**: a petal with spring physics that drifts down the side gutters beside the content, trailing a hairline light thread. It switches sides twice per page and never crosses text.
- **Cursor-proximity text** glow, glass button and card system, animated stat counters, process timeline, contact form with validation and honeypot.
- **Accessibility and performance**: reduced-motion fallbacks, 44px touch targets, skip link, font preloads, JSON-LD (`ProfessionalService`), sitemap, Open Graph image.

## Project structure

```
src/
  components/astro/   Static sections: Header, Hero, Manifesto, Services, Process, Impact, Contact, Footer
  components/react/   Islands: CanvasStage, GuidePetal, ThemeToggle, PaletteSelector, ContactForm, SmoothScrollProvider
  engine/             Framework-agnostic canvas engine
  data/               site.ts (SEO and contact), content.ts (copy), petalPalettes.ts
  lib/                theme, palette and scroll-state helpers
  scripts/            proximity, reveal and enhance scripts
  styles/global.css   Tokens, glass system, footer landscape styles
public/
  og/og-default.jpg   1200x630 social preview
  _headers            Caching and security headers (Netlify / Cloudflare Pages format)
```

## Configuration

Edit `src/data/site.ts`:

- `url`: **placeholder** (`https://komorebicameron.com`). Set your real domain once you have one; canonical URLs, the Open Graph image and the sitemap all use it. Also update `Sitemap:` in `public/robots.txt`.
- `contact.email` and `contact.formEndpoint`: with no endpoint the form falls back to a `mailto:` link. Point it at a form service (Formspree, Getform, your own API) that accepts a JSON POST.
- Placeholder impact figures in `src/data/content.ts` should be replaced with verified data before launch.

To add a palette, append an entry to `src/data/petalPalettes.ts` and add matching `[data-petal-palette='<id>']` blocks (dark and light) in `src/styles/global.css`.

## Deployment

Any static host works; deploy `dist/`. `public/_headers` sets immutable caching for `/_astro/*` on Netlify and Cloudflare Pages; other hosts need equivalent rules.
