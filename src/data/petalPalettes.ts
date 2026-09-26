/**
 * User-selectable petal palettes.
 *
 * Each palette carries a dark-theme and a light-theme variant, because a
 * colour that glows on obsidian (e.g. ghost white) disappears on the cherry
 * blossom background. To add a palette, append an entry here; the header
 * selector and the canvas engine pick it up automatically.
 */

export interface PetalPaletteColors {
  /** Deep end of the petal gradient (base). */
  petalA: string;
  /** Light end of the petal gradient (tip). */
  petalB: string;
  /** Highlight / rim tint. */
  petalTint: string;
  /** Branch rim-light colour. */
  rim: string;
}

export interface PetalPaletteDefinition {
  id: string;
  label: string;
  /** Short descriptor shown under the label in the selector. */
  description: string;
  /** Flat colour used for the selector swatch. */
  swatch: string;
  dark: PetalPaletteColors;
  light: PetalPaletteColors;
}

export const PETAL_PALETTES = [
  {
    id: 'sakura',
    label: 'Sakura Pink',
    description: 'The signature blossom',
    swatch: '#FF70A6',
    dark: { petalA: '#FF70A6', petalB: '#FFB7C5', petalTint: '#FFF1F5', rim: '#FF70A6' },
    light: { petalA: '#E23A79', petalB: '#F58FA8', petalTint: '#FFF7F9', rim: '#E23A79' },
  },
  {
    id: 'golden',
    label: 'Golden Komorebi',
    description: 'Sunlight through leaves',
    swatch: '#FFD700',
    dark: { petalA: '#FFD700', petalB: '#FFE98A', petalTint: '#FFF8DC', rim: '#FFD700' },
    light: { petalA: '#D19A00', petalB: '#F2CB5C', petalTint: '#FFF6D6', rim: '#C99700' },
  },
  {
    id: 'velvet',
    label: 'Velvet Magenta',
    description: 'Deep, dramatic, after dark',
    swatch: '#D81B60',
    dark: { petalA: '#D81B60', petalB: '#F06292', petalTint: '#FFD6E4', rim: '#E91E78' },
    light: { petalA: '#B0124E', petalB: '#E0578A', petalTint: '#FFE3EC', rim: '#B0124E' },
  },
  {
    id: 'ghost',
    label: 'Pure Ghost White',
    description: 'Quiet, pale, weightless',
    swatch: '#FAFAFA',
    dark: { petalA: '#FAFAFA', petalB: '#DDE2F0', petalTint: '#FFFFFF', rim: '#FFFFFF' },
    light: { petalA: '#B7B1C6', petalB: '#E3DFEC', petalTint: '#FFFFFF', rim: '#8F889E' },
  },
] as const satisfies readonly PetalPaletteDefinition[];

export type PetalPaletteId = (typeof PETAL_PALETTES)[number]['id'];

export const DEFAULT_PETAL_PALETTE: PetalPaletteId = 'sakura';
