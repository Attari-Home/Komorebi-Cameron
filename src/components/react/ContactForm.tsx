import { useEffect, useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { BUDGET_TIERS, COMM_PREFERENCES, PROJECT_TYPES, TIMELINES } from '../../data/content';
import { SITE } from '../../data/site';
import { TIER_EVENT, takePendingTier, type TierSelection } from '../../lib/tierSelect';
import InteractiveText from './InteractiveText';

type Status = 'idle' | 'sending' | 'sent' | 'mailto' | 'error';

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Async lead-capture form (email / text only, no calls).
 *
 * With `SITE.contact.formEndpoint` set (Formspree / Web3Forms), the inquiry is
 * POSTed there as JSON. Without one, the visitor's email client opens with the
 * brief pre-filled, so no lead is silently dropped and nothing claims to have
 * been "sent" when it has not.
 *
 * Pricing cards pre-select a tier through `lib/tierSelect`.
 */
export default function ContactForm() {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [project, setProject] = useState<string>(PROJECT_TYPES[0]);
  const [budget, setBudget] = useState<string>(BUDGET_TIERS[0]);
  const [tier, setTier] = useState<TierSelection | null>(null);

  useEffect(() => {
    const apply = (t: TierSelection) => {
      setTier(t);
      setProject(t.projectType);
      setBudget(t.budget);
      setStatus((s) => (s === 'sent' || s === 'mailto' ? 'idle' : s));
    };
    const pending = takePendingTier();
    if (pending) apply(pending);

    const handler = (e: Event) => apply((e as CustomEvent<TierSelection>).detail);
    window.addEventListener(TIER_EVENT, handler);
    return () => window.removeEventListener(TIER_EVENT, handler);
  }, []);

  const validate = (data: FormData): FieldErrors => {
    const next: FieldErrors = {};
    if (!String(data.get('name') ?? '').trim()) next.name = 'Please tell us your name.';
    if (!EMAIL_PATTERN.test(String(data.get('email') ?? '').trim())) {
      next.email = 'Please enter a valid email address.';
    }
    if (String(data.get('message') ?? '').trim().length < 10) {
      next.message = 'A few words about your project would help (10+ characters).';
    }
    return next;
  };

  const onSubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    // Honeypot: real visitors never fill this in.
    if (String(data.get('website') ?? '')) return;

    const found = validate(data);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = {
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      communication: String(data.get('communication') ?? ''),
      project: String(data.get('project') ?? ''),
      budget: String(data.get('budget') ?? ''),
      timeline: String(data.get('timeline') ?? ''),
      package: tier?.name ?? '',
      message: String(data.get('message')).trim(),
    };

    if (SITE.contact.formEndpoint) {
      setStatus('sending');
      try {
        const response = await fetch(SITE.contact.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            ...payload,
            subject: `New project inquiry: ${payload.project}`,
            ...(SITE.contact.formAccessKey ? { access_key: SITE.contact.formAccessKey } : {}),
          }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        form.reset();
        setTier(null);
        setProject(PROJECT_TYPES[0]);
        setBudget(BUDGET_TIERS[0]);
        setStatus('sent');
      } catch {
        setStatus('error');
      }
      return;
    }

    const subject = encodeURIComponent(`New project inquiry: ${payload.project}`);
    const body = encodeURIComponent(
      [
        'Hi Komorebi Cameron,',
        '',
        `Project: ${payload.project}`,
        payload.package ? `Package: ${payload.package}` : null,
        `Budget: ${payload.budget}`,
        `Timeline: ${payload.timeline}`,
        `Preferred contact: ${payload.communication}`,
        '',
        payload.message,
        '',
        `— ${payload.name}`,
        payload.email,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    );
    window.location.href = `mailto:${SITE.contact.email}?subject=${subject}&body=${body}`;
    setStatus('mailto');
  };

  const describedBy = (key: keyof FieldErrors) => (errors[key] ? `${uid}-${key}-error` : undefined);

  const Label = ({ id, children }: { id: string; children: ReactNode }) => (
    <label htmlFor={`${uid}-${id}`} className="mb-2 block text-sm font-medium text-fg-muted">
      {children}
    </label>
  );

  const ErrorText = ({ id, text }: { id: keyof FieldErrors; text?: string }) =>
    text ? (
      <p id={`${uid}-${id}-error`} className="mt-2 text-sm text-[#ff6a7a]">
        {text}
      </p>
    ) : null;

  const done = status === 'sent' || status === 'mailto';

  return (
    <div className="relative">
      <form
        onSubmit={onSubmit}
        noValidate
        aria-busy={status === 'sending'}
        className="glass-strong space-y-5 rounded-3xl p-6 sm:p-10"
      >
        {/* Honeypot */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {status === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-[#ff6a7a]/40 bg-[#ff6a7a]/10 p-4 backdrop-blur-md"
          >
            <span aria-hidden="true" className="mt-0.5 text-lg">
              &#9888;
            </span>
            <p className="text-sm leading-relaxed text-fg">
              We could not send your inquiry. Nothing was lost: please try again, or email us
              directly at{' '}
              <a
                className="font-semibold text-sakura-a underline-offset-4 hover:underline"
                href={`mailto:${SITE.contact.email}`}
              >
                {SITE.contact.email}
              </a>
              .
            </p>
          </div>
        )}

        {tier && (
          <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-sakura-a/30 bg-sakura-a/10 px-4 py-3 text-sm text-fg">
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-sakura-a">
              Selected package
            </span>
            <span className="font-semibold">{tier.name}</span>
            <button
              type="button"
              onClick={() => setTier(null)}
              className="ml-auto text-xs font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
            >
              Clear
            </button>
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label id="name">Client name</Label>
            <input
              id={`${uid}-name`}
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Ada Lovelace"
              className="field"
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={describedBy('name')}
            />
            <ErrorText id="name" text={errors.name} />
          </div>
          <div>
            <Label id="email">Preferred work email</Label>
            <input
              id={`${uid}-email`}
              name="email"
              type="email"
              autoComplete="email"
              placeholder="ada@company.com"
              className="field"
              aria-invalid={errors.email ? 'true' : undefined}
              aria-describedby={describedBy('email')}
            />
            <ErrorText id="email" text={errors.email} />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-fg-muted">
            Communication preference
          </legend>
          <div className="flex flex-wrap gap-3">
            {COMM_PREFERENCES.map((option, i) => (
              <label key={option} className="cursor-pointer">
                <input
                  type="radio"
                  name="communication"
                  value={option}
                  defaultChecked={i === 0}
                  className="peer sr-only"
                />
                <span className="inline-flex min-h-11 items-center rounded-full border border-white/15 bg-white/5 px-5 text-sm font-medium text-fg-muted backdrop-blur-md transition-all duration-300 hover:border-sakura-a/40 peer-checked:border-sakura-a/70 peer-checked:bg-sakura-a/15 peer-checked:text-fg peer-focus-visible:ring-4 peer-focus-visible:ring-sakura-a/30">
                  {option}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Label id="project">Project type</Label>
          <select
            id={`${uid}-project`}
            name="project"
            className="field"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label id="budget">Budget tier</Label>
            <select
              id={`${uid}-budget`}
              name="budget"
              className="field"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            >
              {BUDGET_TIERS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label id="timeline">Timeline</Label>
            <select
              id={`${uid}-timeline`}
              name="timeline"
              className="field"
              defaultValue={TIMELINES[0]}
            >
              {TIMELINES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <Label id="message">Scope &amp; project details</Label>
          <textarea
            id={`${uid}-message`}
            name="message"
            rows={6}
            placeholder="Goals, audience, pages or features you have in mind, links that inspire you…"
            className="field resize-y"
            aria-invalid={errors.message ? 'true' : undefined}
            aria-describedby={describedBy('message')}
          />
          <ErrorText id="message" text={errors.message} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
          <p className="max-w-xs text-sm text-fg-muted">
            Written replies only, no calls. We respond {SITE.contact.responseTime}.
          </p>
          <button
            type="submit"
            className="btn-glass btn-glass-primary"
            disabled={status === 'sending'}
          >
            Send inquiry
          </button>
        </div>
      </form>

      {status === 'sending' && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 z-10 grid place-items-center rounded-3xl bg-bg/50 backdrop-blur-md"
        >
          <div className="flex flex-col items-center gap-4">
            <span
              aria-hidden="true"
              className="h-10 w-10 animate-spin rounded-full border-2 border-sakura-a/25 border-t-sakura-a motion-reduce:animate-none"
            />
            <p className="text-sm font-medium text-fg">Sending your inquiry…</p>
          </div>
        </div>
      )}

      {done && (
        <div
          role="status"
          aria-live="polite"
          className="glass-strong absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl p-8 text-center backdrop-blur-2xl sm:p-12"
        >
          <span
            aria-hidden="true"
            className="mb-5 grid h-14 w-14 place-items-center rounded-full border border-sakura-a/40 bg-sakura-a/15 text-2xl text-sakura-a shadow-glow-md"
          >
            &#10003;
          </span>
          <InteractiveText
            as="p"
            className="accent-serif text-sakura-gradient inline-block pb-2 pr-1 text-5xl"
          >
            {status === 'sent' ? 'Thank you.' : 'Almost there.'}
          </InteractiveText>
          <InteractiveText
            as="p"
            tone="muted"
            className="mx-auto mt-4 block max-w-sm leading-relaxed"
          >
            {status === 'sent'
              ? "We'll respond to your email within 7 days."
              : 'Your email app should have opened with your brief ready to send. If it did not, write to us directly. We respond within 7 days.'}
          </InteractiveText>
          <a
            href={`mailto:${SITE.contact.email}`}
            className="mt-6 inline-block text-sm font-semibold text-sakura-a underline-offset-4 hover:underline"
          >
            {SITE.contact.email}
          </a>
          <div className="mt-8">
            <button type="button" className="btn-glass" onClick={() => setStatus('idle')}>
              Send another inquiry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
