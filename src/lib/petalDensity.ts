/**
 * Petal density control: how many petals are in the air, relative to the
 * signature look (100%). Stored in localStorage (`kc-petal-density`) and
 * broadcast to the canvas engine through a DOM event, the same pattern as the
 * theme and palette modules.
 */

export const DENSITY_STORAGE_KEY = 'kc-petal-density';
export const DENSITY_CHANGE_EVENT = 'kc:petaldensity';

/** Percent bounds and step used by the slider. */
export const DENSITY_MIN = 10;
export const DENSITY_MAX = 200;
export const DENSITY_STEP = 10;
export const DENSITY_DEFAULT = 100;

export function clampDensity(percent: number): number {
  if (!Number.isFinite(percent)) return DENSITY_DEFAULT;
  return Math.min(DENSITY_MAX, Math.max(DENSITY_MIN, Math.round(percent / DENSITY_STEP) * DENSITY_STEP));
}

export function getPetalDensity(): number {
  if (typeof window === 'undefined') return DENSITY_DEFAULT;
  try {
    const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
    if (stored !== null) return clampDensity(Number(stored));
  } catch {
    /* storage unavailable */
  }
  return DENSITY_DEFAULT;
}

/** Apply, persist and broadcast a density (percent). */
export function setPetalDensity(percent: number): void {
  if (typeof window === 'undefined') return;
  const value = clampDensity(percent);
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, String(value));
  } catch {
    /* ignore storage failures */
  }
  window.dispatchEvent(new CustomEvent<number>(DENSITY_CHANGE_EVENT, { detail: value }));
}

export function onPetalDensityChange(listener: (percent: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = (event: Event) => listener((event as CustomEvent<number>).detail);
  window.addEventListener(DENSITY_CHANGE_EVENT, handle);
  return () => window.removeEventListener(DENSITY_CHANGE_EVENT, handle);
}
