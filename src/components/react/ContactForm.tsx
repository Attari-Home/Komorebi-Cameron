import { useId, useState, type SyntheticEvent } from 'react';
import { PROJECT_TYPES } from '../../data/content';
import { SITE } from '../../data/site';
import InteractiveText from './InteractiveText';

type Status = 'idle' | 'sending' | 'sent' | 'mailto' | 'error';

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lead-capture form.
 *
 * With `SITE.contact.formEndpoint` set, the message is POSTed there as JSON.
 * Otherwise (the default until a backend exists) the visitor's email client
 * opens with the message pre-filled, so no lead is ever silently dropped and
 * nothing pretends to have been "sent" when it has not.
 */
export default function ContactForm() {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});

  const validate = (data: FormData): FieldErrors => {
    const next: FieldErrors = {};
    if (!String(data.get('name') ?? '').trim()) next.name = 'Please tell us your name.';
    const email = String(data.get('email') ?? '').trim();
    if (!EMAIL_PATTERN.test(email)) next.email = 'Please enter a valid email address.';
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
      project: String(data.get('project') ?? ''),
      message: String(data.get('message')).trim(),
    };

    if (SITE.contact.formEndpoint) {
      setStatus('sending');
      try {
        const response = await fetch(SITE.contact.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        form.reset();
        setStatus('sent');
      } catch {
        setStatus('error');
      }
      return;
    }

    const subject = encodeURIComponent(`New project enquiry: ${payload.project || 'General'}`);
    const body = encodeURIComponent(
      `Hi Komorebi Cameron,\n\n${payload.message}\n\n— ${payload.name}\n${payload.email}`,
    );
    window.location.href = `mailto:${SITE.contact.email}?subject=${subject}&body=${body}`;
    setStatus('mailto');
  };

  if (status === 'sent' || status === 'mailto') {
    return (
      <div role="status" className="glass-strong rounded-3xl p-8 text-center sm:p-12">
        <InteractiveText as="p" className="accent-serif text-sakura-gradient inline-block pb-2 pr-1 text-5xl">
          {status === 'sent' ? 'Thank you.' : 'Almost there.'}
        </InteractiveText>
        <InteractiveText as="p" tone="muted" className="mx-auto mt-4 block max-w-sm leading-relaxed">
          {status === 'sent'
            ? `Your message is with us. We reply ${SITE.contact.responseTime}.`
            : 'Your email app should have opened with your message ready to send. If it did not, write to us directly at the address below.'}
        </InteractiveText>
        <a
          href={`mailto:${SITE.contact.email}`}
          className="mt-6 inline-block text-sm font-semibold text-sakura-a underline-offset-4 hover:underline"
        >
          {SITE.contact.email}
        </a>
        <div className="mt-8">
          <button type="button" className="btn-glass" onClick={() => setStatus('idle')}>
            Send another message
          </button>
        </div>
      </div>
    );
  }

  const describedBy = (key: keyof FieldErrors) => (errors[key] ? `${uid}-${key}-error` : undefined);

  return (
    <form onSubmit={onSubmit} noValidate className="glass-strong space-y-5 rounded-3xl p-6 sm:p-10">
      {/* Honeypot */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-name`} className="mb-2 block text-sm font-medium text-fg-muted">
            Your name
          </label>
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
          {errors.name && (
            <p id={`${uid}-name-error`} className="mt-2 text-sm text-[#ff6a7a]">
              {errors.name}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${uid}-email`} className="mb-2 block text-sm font-medium text-fg-muted">
            Email
          </label>
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
          {errors.email && (
            <p id={`${uid}-email-error`} className="mt-2 text-sm text-[#ff6a7a]">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`${uid}-project`} className="mb-2 block text-sm font-medium text-fg-muted">
          What are you looking for?
        </label>
        <select id={`${uid}-project`} name="project" className="field" defaultValue={PROJECT_TYPES[0]}>
          {PROJECT_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${uid}-message`} className="mb-2 block text-sm font-medium text-fg-muted">
          Tell us about your project
        </label>
        <textarea
          id={`${uid}-message`}
          name="message"
          rows={5}
          placeholder="Goals, timeline, anything that inspires you…"
          className="field resize-y"
          aria-invalid={errors.message ? 'true' : undefined}
          aria-describedby={describedBy('message')}
        />
        {errors.message && (
          <p id={`${uid}-message-error`} className="mt-2 text-sm text-[#ff6a7a]">
            {errors.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <p className="text-sm text-fg-muted" aria-live="polite">
          {status === 'error'
            ? 'Something went wrong. Please try again or email us directly.'
            : `We reply ${SITE.contact.responseTime}.`}
        </p>
        <button type="submit" className="btn-glass btn-glass-primary" disabled={status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Start the conversation'}
        </button>
      </div>
    </form>
  );
}
