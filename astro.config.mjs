// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  // Canonical production origin. Used for sitemap, canonical and OG URLs.
  site: 'https://komorebicameron.com',

  // Pure static site generation: zero server runtime, zero-JS initial payload.
  output: 'static',

  // Inline small stylesheets to remove render-blocking requests.
  build: {
    inlineStylesheets: 'auto',
  },

  // Prefetch on hover/focus for instant in-site navigation.
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },

  integrations: [
    react(),
    tailwind({
      // We ship our own global.css (imported in Layout.astro) so we can
      // control layer order and CSS variable declarations precisely.
      applyBaseStyles: false,
    }),
    sitemap(),
  ],

  vite: {
    build: {
      // Keep fonts as separate cacheable files rather than base64 inlined.
      assetsInlineLimit: 0,
    },
  },
});
