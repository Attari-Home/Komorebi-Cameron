import { useEffect, useMemo, useState } from 'react';
import {
  ESTIMATOR_FEATURES,
  PRICING_TIERS,
  priceRange,
  recommendTier,
  type EstimatorFeature,
} from '../../data/pricing';
import { setRecommendedPackage, setSelectedPackage } from '../../lib/packageSelection';

const GROUPS: ReadonlyArray<{ id: EstimatorFeature['group']; title: string }> = [
  { id: 'experience', title: 'The experience' },
  { id: 'engineering', title: 'The engineering' },
];

/**
 * Live tier estimator. Toggle what the project needs; the smallest tier that
 * covers it is recommended on the pricing cards above (without selecting it),
 * with an indicative range. "Use this estimate" selects the tier, adds a short
 * brief to the contact message and scrolls to the form (a real #contact link,
 * so Lenis handles the scroll).
 *
 * The range is indicative: it runs from the tier's starting price up to just
 * below the next tier. Final quotes are always scoped in writing.
 */
export default function TierEstimator() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const tierId = useMemo(() => recommendTier(selected), [selected]);
  const tier = PRICING_TIERS.find((t) => t.id === tierId)!;
  const range = priceRange(tierId);
  const chosen = ESTIMATOR_FEATURES.filter((f) => selected.has(f.id));
  const touched = selected.size > 0;

  // Mirror the recommendation onto the pricing cards (only once they have chosen something).
  useEffect(() => {
    setRecommendedPackage(touched ? tierId : null);
  }, [tierId, touched]);
  useEffect(() => () => setRecommendedPackage(null), []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const useEstimate = () => {
    const brief = chosen.length
      ? `Estimator brief: ${chosen.map((f) => f.label).join(', ')}. Suggested package: ${tier.name} (from ${tier.priceLabel.replace('+', '')}).`
      : `Estimator brief: a single focused page. Suggested package: ${tier.name} (from ${tier.priceLabel.replace('+', '')}).`;
    setSelectedPackage(tier.id, { highlight: true, note: brief });
  };

  return (
    <div className="glass-strong relative overflow-hidden rounded-[2rem] p-6 sm:p-10" data-spotlight>
      <span className="spot" aria-hidden="true" />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <p className="mb-5 flex items-center gap-3 text-xs font-medium uppercase tracking-[0.28em] text-fg-muted">
            <span aria-hidden="true" className="h-px w-10 bg-sakura-gradient" />
            Live estimator
          </p>
          <h3 className="i-text text-balance font-sans text-2xl font-semibold leading-tight sm:text-3xl">
            Shape your build, see the
            <em className="accent-serif text-sakura-gradient ml-2 inline-block pb-[0.1em] pr-[0.06em] text-[1.12em] leading-[0.95]">
              tier
            </em>
          </h3>
          <p className="i-text i-text-muted mt-3 max-w-xl text-sm leading-relaxed">
            Switch on what you need. We point you to the smallest package that covers it.
          </p>

          {GROUPS.map((group) => (
            <fieldset key={group.id} className="mt-7 min-w-0">
              <legend className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-fg-muted">
                {group.title}
              </legend>
              <div className="flex flex-wrap gap-2.5">
                {ESTIMATOR_FEATURES.filter((f) => f.group === group.id).map((feature) => {
                  const on = selected.has(feature.id);
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      onClick={() => toggle(feature.id)}
                      className={[
                        'group inline-flex min-h-11 items-center gap-2.5 rounded-full border px-4 text-sm font-medium transition-[background-color,border-color,box-shadow,color] duration-300',
                        on
                          ? 'border-sakura-a/60 bg-sakura-a/15 text-fg shadow-glow-sm'
                          : 'border-line/15 bg-fg/[0.03] text-fg-muted hover:border-sakura-a/40 hover:text-fg',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          'relative h-4 w-7 shrink-0 rounded-full transition-colors duration-300',
                          on ? 'bg-sakura-a' : 'bg-fg/20',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'absolute top-0.5 h-3 w-3 rounded-full bg-bg transition-transform duration-500 ease-out-expo',
                            on ? 'translate-x-3.5' : 'translate-x-0.5',
                          ].join(' ')}
                        />
                      </span>
                      {feature.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>

        <div className="relative rounded-3xl border border-line/10 bg-fg/[0.03] p-6 sm:p-8" aria-live="polite">
          <p className="text-xs font-medium uppercase tracking-[0.24em] text-sakura-a">
            {touched ? 'Recommended' : 'Starting point'}
          </p>
          <p className="i-text mt-3 font-sans text-xl font-semibold leading-snug">{tier.name}</p>

          <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-fg-muted">Indicative range</p>
          <p
            key={range.label}
            className="text-sakura-gradient mt-1 inline-block animate-fade-rise pb-1 font-sans text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl"
          >
            {range.label}
          </p>

          <ul className="mt-6 space-y-2.5 border-t border-line/10 pt-6">
            {(chosen.length ? chosen.map((f) => f.label) : tier.features).map((label) => (
              <li key={label} className="i-text i-text-muted flex gap-3 text-sm leading-relaxed">
                <span aria-hidden="true" className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-sakura-a shadow-glow-sm" />
                {label}
              </li>
            ))}
          </ul>

          <a href="#contact" onClick={useEstimate} className="btn-glass btn-glass-primary mt-8 w-full">
            Use this estimate
          </a>
          <p className="mt-4 text-center text-xs leading-relaxed text-fg-muted">
            Indicative only. Every quote is scoped in writing before work begins.
          </p>
        </div>
      </div>
    </div>
  );
}
