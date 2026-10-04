/**
 * Seasonal petal moods.
 *
 * Each season pairs one of the existing petal palettes with a "mood": density,
 * fall speed, sway and wind multipliers relative to the signature look
 * (spring = 1). Seasonal mode is opt-in and off by default, so the studio's
 * signature sakura scene is what every first-time visitor sees.
 */

import type { PetalPaletteId } from './petalPalettes';

export interface SeasonMood {
  /** Petal count multiplier (clamped by the engine's min / max). */
  density: number;
  /** Fall speed multiplier. */
  fall: number;
  /** Per-petal sway multiplier. */
  sway: number;
  /** Ambient wind multiplier. */
  drift: number;
  /** Branch sway multiplier. */
  branchSway: number;
}

export interface SeasonDefinition {
  id: string;
  label: string;
  description: string;
  /** Months (1-12) this season covers in "Auto" mode (northern hemisphere). */
  months: readonly number[];
  palette: PetalPaletteId;
  mood: SeasonMood;
}

export const SEASONS = [
  {
    id: 'spring',
    label: 'Spring',
    description: 'Full blossom, gentle breeze',
    months: [3, 4, 5],
    palette: 'sakura',
    mood: { density: 1, fall: 1, sway: 1, drift: 1, branchSway: 1 },
  },
  {
    id: 'summer',
    label: 'Summer',
    description: 'Sparse petals, warm light through leaves',
    months: [6, 7, 8],
    palette: 'golden',
    mood: { density: 0.55, fall: 0.75, sway: 0.7, drift: 0.5, branchSway: 0.6 },
  },
  {
    id: 'autumn',
    label: 'Autumn',
    description: 'Wind-swept, restless, deep colour',
    months: [9, 10, 11],
    palette: 'velvet',
    mood: { density: 0.9, fall: 1.3, sway: 1.5, drift: 2.4, branchSway: 1.8 },
  },
  {
    id: 'winter',
    label: 'Winter',
    description: 'Slow, dense, weightless',
    months: [12, 1, 2],
    palette: 'ghost',
    mood: { density: 1.15, fall: 0.55, sway: 0.8, drift: 0.55, branchSway: 0.7 },
  },
] as const satisfies readonly SeasonDefinition[];

export type SeasonId = (typeof SEASONS)[number]['id'];

/** What the visitor chose: no seasons, follow the calendar, or a fixed season. */
export type SeasonSetting = 'off' | 'auto' | SeasonId;

export const SEASON_SETTINGS: readonly SeasonSetting[] = ['off', 'auto', ...SEASONS.map((s) => s.id)];

/** The signature look: every multiplier at 1. */
export const NEUTRAL_MOOD: SeasonMood = { density: 1, fall: 1, sway: 1, drift: 1, branchSway: 1 };
