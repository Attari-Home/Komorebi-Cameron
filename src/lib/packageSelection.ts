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
export function setSelectedPackage(id: PackageChoice, options: { highlight?: boolean } = {}): void {
  getStore().id = id;
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<PackageChangeDetail>(PACKAGE_CHANGE_EVENT, {
      detail: { id, highlight: options.highlight ?? false },
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
