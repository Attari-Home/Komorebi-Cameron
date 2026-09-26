import { createElement, type CSSProperties, type ReactNode } from 'react';

type Tone = 'default' | 'muted';

interface InteractiveTextProps {
  /** Element to render. Defaults to `span`. */
  as?: keyof HTMLElementTagNameMap;
  /** `muted` starts in the secondary text colour before warming up on hover. */
  tone?: Tone;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Reusable cursor-proximity text.
 *
 * Renders an element carrying the `.i-text` class. The global proximity
 * script (`src/scripts/proximity.ts`, loaded from Layout.astro) watches every
 * `.i-text` element, including ones rendered later by React, and feeds it a
 * `--prox` value; CSS turns that into a soft lift (translateY -2px), a neon
 * pink glow, and a colour shift as the cursor approaches.
 *
 * In `.astro` files, apply the classes directly instead:
 *   <p class="i-text i-text-muted">…</p>
 */
export default function InteractiveText({
  as = 'span',
  tone = 'default',
  className = '',
  style,
  children,
}: InteractiveTextProps) {
  const classes = ['i-text', tone === 'muted' ? 'i-text-muted' : '', className]
    .filter(Boolean)
    .join(' ');

  return createElement(as, { className: classes, style }, children);
}
