/**
 * Package selection bridge.
 *
 * The Pricing section (static Astro + a tiny script) and the ContactForm
 * (a React island) are hydrated separately, so they share the visitor's chosen
 * package through this small store plus a DOM event, the same pattern as
 * `theme.ts` and `petalPalette.ts`.
 *
 * The store is pinned to `globalThis` so separately bundled islands always
 * see one instance, and a selection made before the form has hydrated is not
 * lost: the form reads the current value when it mounts.
 */

import { PACKAGE_OPTIONS, PACKAGE_UNDECIDED, type PackageChoice } from '../data/pricing';

export type { PackageChoice };

export const PACKAGE_CHANGE_EVENT = 'kc:packagechange';

export interface PackageChangeDetail {
  id: PackageChoice;
  /** True when the change came from a pricing CTA and the form should draw the eye. */
  highlight: boolean;
  /** Optional text to add to the message box (the estimator's summary). */
  note?: string;
}

const GLOBAL_KEY = Symbol.for('komorebi.packageSelection');
type Store = { id: PackageChoice };
type GlobalWithStore = typeof globalThis & { [GLOBAL_KEY]?: Store };

function getStore(): Store {
  const g = globalThis as GlobalWithStore;
  return (g[GLOBAL_KEY] ??= { id: PACKAGE_UNDECIDED });
}

export function isPackageChoice(value: unknown): value is PackageChoice {
  return PACKAGE_OPTIONS.some((option) => option.value === value);
}

export function getSelectedPackage(): PackageChoice {
  return getStore().id;
}

/** Record a selection and notify listeners (pricing cards, contact form). */
export function setSelectedPackage(
  id: PackageChoice,
  options: { highlight?: boolean; note?: string } = {},
): void {
  getStore().id = id;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PackageChangeDetail>(PACKAGE_CHANGE_EVENT, {
      detail: { id, highlight: options.highlight ?? false, note: options.note },
    }),
  );
}

/** Subscribe to selection changes. Returns an unsubscribe function. */
export function onPackageChange(listener: (detail: PackageChangeDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<PackageChangeDetail>).detail;
    if (detail && isPackageChoice(detail.id)) listener(detail);
  };
  window.addEventListener(PACKAGE_CHANGE_EVENT, handle);
  return () => window.removeEventListener(PACKAGE_CHANGE_EVENT, handle);
}

/* -------------------------------------------------------------------------- */
/* Recommendation (from the estimator): highlights a card without selecting it */
/* -------------------------------------------------------------------------- */

export const RECOMMEND_EVENT = 'kc:recommend';

/** Mark a tier as "recommended for you" on the pricing cards (null clears it). */
export function setRecommendedPackage(id: PackageChoice | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<PackageChoice | null>(RECOMMEND_EVENT, { detail: id }));
}

export function onRecommendedPackage(listener: (id: PackageChoice | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<PackageChoice | null>).detail;
    listener(detail === null || isPackageChoice(detail) ? detail : null);
  };
  window.addEventListener(RECOMMEND_EVENT, handle);
  return () => window.removeEventListener(RECOMMEND_EVENT, handle);
}
