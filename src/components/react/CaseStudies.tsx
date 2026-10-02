import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { CASE_STUDIES } from '../../data/caseStudies';
import { SITE } from '../../data/site';

/**
 * Interactive case-study switcher.
 *
 * Accessible tab pattern: arrow keys / Home / End move between projects, and
 * the active panel is announced via aria-labelledby. The first project is
 * server-rendered by Astro (`client:load`) so the section is never empty.
 */
export default function CaseStudies() {
  const uid = useId();
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const study = CASE_STUDIES[active];
  const multiple = CASE_STUDIES.length > 1;

  const focusTab = (index: number) => {
    setActive(index);
    tabRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = CASE_STUDIES.length - 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      focusTab(active === last ? 0 : active + 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      focusTab(active === 0 ? last : active - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusTab(last);
    }
  };

  const metrics = [
    { label: 'Lighthouse', value: study.metrics.lighthouse, unit: '/100' },
    { label: 'LCP', value: study.metrics.lcp, unit: '' },
    { label: 'Frame rate', value: study.metrics.fps, unit: ' FPS' },
  ];

  const isExternal = study.liveUrl?.startsWith('http');

  return (
    <div
      className={
        multiple
          ? 'grid gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-8'
          : 'grid gap-6'
      }
    >
      <div
        role="tablist"
        aria-label="Selected projects"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
        className={
          multiple
            ? 'flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0'
            : 'hidden'
        }
      >
        {CASE_STUDIES.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(i)}
              className={[
                'glass group relative min-w-[15rem] flex-1 rounded-3xl p-5 text-left transition-all duration-500 ease-out-expo lg:min-w-0 lg:flex-none lg:p-6',
                selected
                  ? 'border-sakura-a/60 shadow-glow-md'
                  : 'opacity-70 hover:opacity-100 hover:border-sakura-a/30',
              ].join(' ')}
            >
              <span className="flex items-center justify-between text-xs font-medium uppercase tracking-[0.24em] text-fg-muted">
                <span className={selected ? 'text-sakura-a' : ''}>0{i + 1}</span>
                <span>{item.year}</span>
              </span>
              <span className="i-text mt-4 block font-sans text-xl font-semibold leading-tight">
                {item.title}
              </span>
              <span className="i-text i-text-muted mt-2 block text-sm leading-relaxed">
                {item.category}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role={multiple ? 'tabpanel' : undefined}
        id={`${uid}-panel`}
        aria-labelledby={multiple ? `${uid}-tab-${study.id}` : undefined}
        tabIndex={multiple ? 0 : undefined}
        key={study.id}
        className="glass-strong animate-fade-rise rounded-3xl p-6 sm:p-10"
      >
        <p className="i-text text-xs font-medium uppercase tracking-[0.24em] !text-sakura-a">
          {study.category} · {study.year}
        </p>
        <h3 className="i-text mt-3 text-balance font-sans text-3xl font-semibold leading-tight sm:text-4xl">
          {study.title}
        </h3>
        <p className="i-text i-text-muted mt-4 max-w-2xl text-lg leading-relaxed">
          {study.summary}
        </p>

        <ul className="mt-6 flex flex-wrap gap-2" aria-label="Tech stack">
          {study.stack.map((tag) => (
            <li
              key={tag}
              className="rounded-full border border-sakura-a/25 bg-sakura-a/10 px-3.5 py-1.5 text-xs font-medium tracking-wide text-fg"
            >
              {tag}
            </li>
          ))}
        </ul>

        <dl className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="glass rounded-2xl p-4 sm:p-5">
              <dt className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-fg-muted sm:text-xs">
                {m.label}
              </dt>
              <dd className="mt-2 font-sans text-2xl font-semibold text-sakura-gradient sm:text-3xl">
                {m.value}
                <span className="text-sm font-medium text-fg-muted">{m.unit}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <section aria-labelledby={`${uid}-challenge`}>
            <h4
              id={`${uid}-challenge`}
              className="i-text i-text-muted text-xs font-medium uppercase tracking-[0.24em]"
            >
              The challenge
            </h4>
            <p className="i-text i-text-muted mt-3 leading-relaxed">{study.challenge}</p>
          </section>
          <section aria-labelledby={`${uid}-solution`}>
            <h4
              id={`${uid}-solution`}
              className="i-text i-text-muted text-xs font-medium uppercase tracking-[0.24em]"
            >
              Technical solution
            </h4>
            <p className="i-text i-text-muted mt-3 leading-relaxed">{study.solution}</p>
          </section>
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4 border-t border-line/10 pt-8">
          {study.liveUrl ? (
            <a
              href={study.liveUrl}
              className="btn-glass btn-glass-primary"
              {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {study.liveLabel}
            </a>
          ) : (
            <a
              href={`mailto:${SITE.contact.email}?subject=${encodeURIComponent(`Walkthrough request: ${study.title}`)}`}
              className="btn-glass btn-glass-primary"
            >
              Request a written walkthrough
            </a>
          )}
          <p className="i-text i-text-muted text-sm">
            Walkthroughs are sent by email, never on a call.
          </p>
        </div>
      </div>
    </div>
  );
}
