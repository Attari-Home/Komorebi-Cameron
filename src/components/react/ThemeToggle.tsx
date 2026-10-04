import { useCallback, useEffect, useState } from 'react';
import { getCurrentTheme, onThemeChange, type Theme } from '../../lib/theme';
import { toggleThemeLiquid } from '../../lib/liquidTransition';

/**
 * Dark / light mode toggle.
 *
 * Switching runs the liquid wave transition (src/lib/liquidTransition.ts).
 *
 * Hydrated with `client:only="react"`, so `window` and `document` always exist
 * when this component first renders and the inline head script has already
 * applied the correct theme to <html>.
 */
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(() => getCurrentTheme());

  useEffect(() => {
    // Re-sync in case the theme changed between render and effect,
    // then follow changes from other tabs / the OS / other components.
    setThemeState(getCurrentTheme());
    return onThemeChange(setThemeState);
  }, []);

  // The liquid wave swaps the theme beneath itself; the icon follows through
  // `onThemeChange` at that moment (or instantly with reduced motion).
  const handleClick = useCallback(() => {
    toggleThemeLiquid();
  }, []);

  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      aria-pressed={!isDark}
      className="btn-glass btn-glass-icon"
    >
      {/* key forces the spin-in animation to replay on every switch */}
      <span key={theme} className="relative animate-theme-spin">
        {isDark ? <MoonIcon /> : <SunIcon />}
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
