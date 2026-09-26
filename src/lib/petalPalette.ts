/**
 * Petal palette state helpers: the runtime counterpart of `theme.ts`.
 *
 * The chosen palette id is stored in localStorage and mirrored to
 * `<html data-petal-palette>`. Changes are broadcast with a DOM event so the
 * canvas engine, guide petal, and selector UI stay in sync without sharing
 * React state.
 */

import {
  DEFAULT_PETAL_PALETTE,
  PETAL_PALETTES,
  type PetalPaletteColors,
  type PetalPaletteDefinition,
  type PetalPaletteId,
} from '../data/petalPalettes';
import type { Theme } from './theme';

export const PALETTE_STORAGE_KEY = 'kc-petal-palette';
export const PALETTE_ATTRIBUTE = 'data-petal-palette';
export const PALETTE_CHANGE_EVENT = 'kc:palettechange';

export function isPaletteId(value: unknown): value is PetalPaletteId {
  return PETAL_PALETTES.some((p) => p.id === value);
}

export function getPaletteDefinition(id: PetalPaletteId): PetalPaletteDefinition {
  return PETAL_PALETTES.find((p) => p.id === id) ?? PETAL_PALETTES[0];
}

/** The palette id currently active: attribute, then storage, then default. */
export function getCurrentPaletteId(): PetalPaletteId {
  if (typeof document === 'undefined') return DEFAULT_PETAL_PALETTE;

  const applied = document.documentElement.getAttribute(PALETTE_ATTRIBUTE);
  if (isPaletteId(applied)) return applied;

  try {
    const stored = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    if (isPaletteId(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_PETAL_PALETTE;
}

/** Colours for a palette under a given theme. */
export function resolvePetalColors(id: PetalPaletteId, theme: Theme): PetalPaletteColors {
  const def = getPaletteDefinition(id);
  return theme === 'light' ? def.light : def.dark;
}

/** Apply, persist, and broadcast a palette choice. */
export function setPetalPalette(id: PetalPaletteId, options: { persist?: boolean } = {}): void {
  if (typeof document === 'undefined') return;
  const { persist = true } = options;

  document.documentElement.setAttribute(PALETTE_ATTRIBUTE, id);

  if (persist) {
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, id);
    } catch {
      /* ignore storage failures */
    }
  }

  window.dispatchEvent(new CustomEvent<PetalPaletteId>(PALETTE_CHANGE_EVENT, { detail: id }));
}

/** Subscribe to palette changes (this tab and other tabs). */
export function onPaletteChange(listener: (id: PetalPaletteId) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<PetalPaletteId>).detail;
    if (isPaletteId(detail)) listener(detail);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PALETTE_STORAGE_KEY && isPaletteId(event.newValue)) {
      setPetalPalette(event.newValue, { persist: false });
    }
  };

  window.addEventListener(PALETTE_CHANGE_EVENT, handleCustom);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(PALETTE_CHANGE_EVENT, handleCustom);
    window.removeEventListener('storage', handleStorage);
  };
}
