/**
 * Seasonal petal mode: the runtime counterpart of `data/seasons.ts`.
 *
 * Choosing a season runs the liquid wave to that season's palette and
 * broadcasts its mood to the canvas engine. The setting is stored in
 * localStorage (`kc-season`); "off" (the default) keeps the signature look.
 */

import {
  NEUTRAL_MOOD,
  SEASONS,
  SEASON_SETTINGS,
  type SeasonDefinition,
  type SeasonMood,
  type SeasonSetting,
} from '../data/seasons';
import { transitionPalette } from './liquidTransition';

export const SEASON_STORAGE_KEY = 'kc-season';
export const SEASON_CHANGE_EVENT = 'kc:seasonchange';

export function isSeasonSetting(value: unknown): value is SeasonSetting {
  return SEASON_SETTINGS.includes(value as SeasonSetting);
}

export function getSeasonSetting(): SeasonSetting {
  if (typeof window === 'undefined') return 'off';
  try {
    const stored = window.localStorage.getItem(SEASON_STORAGE_KEY);
    if (isSeasonSetting(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  return 'off';
}

/** The season that applies to a date (northern hemisphere calendar). */
export function seasonForDate(date: Date = new Date()): SeasonDefinition {
  const month = date.getMonth() + 1;
  return SEASONS.find((s) => (s.months as readonly number[]).includes(month)) ?? SEASONS[0];
}

/** The season a setting resolves to right now, or null when seasons are off. */
export function resolveSeason(setting: SeasonSetting): SeasonDefinition | null {
  if (setting === 'off') return null;
  if (setting === 'auto') return seasonForDate();
  return SEASONS.find((s) => s.id === setting) ?? null;
}

export function moodFor(setting: SeasonSetting): SeasonMood {
  return resolveSeason(setting)?.mood ?? NEUTRAL_MOOD;
}

/** Apply, persist and broadcast a season setting. */
export function setSeasonSetting(setting: SeasonSetting, options: { palette?: boolean } = {}): void {
  if (typeof window === 'undefined') return;
  const { palette = true } = options;

  try {
    window.localStorage.setItem(SEASON_STORAGE_KEY, setting);
  } catch {
    /* ignore storage failures */
  }

  const season = resolveSeason(setting);
  if (season && palette) transitionPalette(season.palette);

  window.dispatchEvent(new CustomEvent<SeasonSetting>(SEASON_CHANGE_EVENT, { detail: setting }));
}

/** Subscribe to season changes. Returns an unsubscribe function. */
export function onSeasonChange(listener: (setting: SeasonSetting) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<SeasonSetting>).detail;
    if (isSeasonSetting(detail)) listener(detail);
  };
  window.addEventListener(SEASON_CHANGE_EVENT, handle);
  return () => window.removeEventListener(SEASON_CHANGE_EVENT, handle);
}
