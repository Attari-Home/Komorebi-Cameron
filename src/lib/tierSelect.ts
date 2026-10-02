/**
 * Tiny bridge between the Pricing cards (Astro) and the Contact form (React).
 * The form is hydrated client-side, so a tier chosen before it mounts is kept
 * in a module-level slot and read on mount; afterwards the event is used.
 */
export interface TierSelection {
  id: string;
  name: string;
  projectType: string;
  budget: string;
}

export const TIER_EVENT = 'komorebi:select-tier';

declare global {
  interface Window {
    __kcPendingTier?: TierSelection;
  }
}

export function setPendingTier(tier: TierSelection): void {
  window.__kcPendingTier = tier;
}

export function takePendingTier(): TierSelection | undefined {
  return window.__kcPendingTier;
}
