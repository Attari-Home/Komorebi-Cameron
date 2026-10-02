/**
 * Theme helpers for the dual theme engine.
 *
 * The blocking inline script in `Layout.astro` applies the initial theme
 * before first paint (no flash). These helpers are the runtime counterpart
 * used by interactive components such as `ThemeToggle`.
 *
 * The storage key and attribute name MUST stay in sync with the inline
 * script in `Layout.astro`.
 */

import { runWave } from './wave';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'kc-theme';
export const THEME_ATTRIBUTE = 'data-theme';
export const THEME_CHANGE_EVENT = 'kc:themechange';
export const DEFAULT_THEME: Theme = 'dark';

/** Meta theme-color values matching --bg in each theme. */
const THEME_COLORS: Record<Theme, string> = {
  dark: '#0A0A0C',
  light: '#FAF7F8',
};

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    // Storage can throw (private mode, blocked cookies). Fail soft.
    return null;
  }
}

/**
 * Resolve the theme that should be active right now:
 * 1. explicit user choice in localStorage
 * 2. the value already applied to <html> by the inline head script
 * 3. OS-level preference (prefers-color-scheme)
 * 4. the brand default (dark obsidian)
 */
export function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;

  const stored = readStoredTheme();
  if (stored) return stored;

  const applied = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  if (isTheme(applied)) return applied;

  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }

  return DEFAULT_THEME;
}

/** The theme currently applied to the document. */
export function getCurrentTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const applied = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return isTheme(applied) ? applied : DEFAULT_THEME;
}

interface SetThemeOptions {
  /** Persist the choice to localStorage. Defaults to true. */
  persist?: boolean;
  /** Animate the colour handoff. Defaults to true. */
  animate?: boolean;
  /** Use the flowing wave page transition (user-initiated changes). */
  wave?: boolean;
}

/**
 * Apply a theme to the document, optionally persist it, and notify
 * listeners (canvas engine, guide petal) via a `kc:themechange` event.
 */
export function setTheme(theme: Theme, options: SetThemeOptions = {}): void {
  if (typeof document === 'undefined') return;

  const { persist = true, animate = true, wave = false } = options;
  const root = document.documentElement;

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const apply = () => {
    root.setAttribute(THEME_ATTRIBUTE, theme);
    root.style.colorScheme = theme;

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[theme]);

    if (persist) {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        /* ignore storage failures */
      }
    }

    window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
  };

  if (wave && !reduceMotion) {
    runWave(apply);
    return;
  }

  if (animate && !reduceMotion) {
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 500);
  }
  apply();
}

/** Flip between dark and light and return the new theme. */
export function toggleTheme(): Theme {
  const next: Theme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next, { wave: true });
  return next;
}

/**
 * Subscribe to theme changes (from this tab, other tabs, or the OS when the
 * user has not chosen explicitly). Returns an unsubscribe function.
 */
export function onThemeChange(listener: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<Theme>).detail;
    if (isTheme(detail)) listener(detail);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY && isTheme(event.newValue)) {
      setTheme(event.newValue, { persist: false, animate: true });
    }
  };

  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: light)')
      : null;

  const handleMedia = (event: MediaQueryListEvent) => {
    // Only follow the OS if the user never made an explicit choice.
    if (readStoredTheme() === null) {
      setTheme(event.matches ? 'light' : 'dark', { persist: false });
    }
  };

  window.addEventListener(THEME_CHANGE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  media?.addEventListener('change', handleMedia);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
    media?.removeEventListener('change', handleMedia);
  };
}
