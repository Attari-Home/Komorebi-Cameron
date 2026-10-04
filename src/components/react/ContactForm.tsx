import { useEffect, useId, useState, type SyntheticEvent } from 'react';
import { PROJECT_TYPES } from '../../data/content';
import { PACKAGE_OPTIONS, packageLabel } from '../../data/pricing';
import { SITE } from '../../data/site';
import {
  getSelectedPackage,
  isPackageChoice,
  onPackageChange,
  setSelectedPackage,
  type PackageChoice,
} from '../../lib/packageSelection';
import InteractiveText from './InteractiveText';
import GlassSelect from './GlassSelect';

type Status = 'idle' | 'sending' | 'sent' | 'mailto' | 'error';
type Channel = (typeof SITE.contact.channels)[number]['value'];

interface FieldErrors {
  name?: string;
  email?: string;
  handle?: string;
  message?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** How long the form's aura lingers after a package is chosen above. */
const AURA_MS = 3200;

/** Label and input hints for the optional contact handle, per channel. */
const HANDLE_FIELD: Record<Exclude<Channel, 'email'>, { label: string; placeholder: string; type: 'text' | 'tel'; autoComplete: string }> = {
  discord: { label: 'Discord username', placeholder: 'username', type: 'text', autoComplete: 'off' },
  text: { label: 'Mobile number for text', placeholder: '+1 555 000 0000', type: 'tel', autoComplete: 'tel' },
};

const channelLabel = (value: string): string =>
  SITE.contact.channels.find((c) => c.value === value)?.label ?? 'Email';

/**
 * Lead-capture form. 100% asynchronous: email, Discord or text, never a call.
 *
 * With `SITE.contact.formEndpoint` set, the message is POSTed there as JSON.
 * Otherwise (the default until a backend exists) the visitor's email client
 * opens with the message pre-filled, so no lead is ever silently dropped and
 * nothing pretends to have been "sent" when it has not.
 *
 * The Package dropdown is kept in sync with the pricing cards through
 * `src/lib/packageSelection.ts`; choosing a tier above scrolls here, selects it
 * and makes this card glow.
 */
export default function ContactForm() {
  const uid = useId();
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pkg, setPkg] = useState<PackageChoice>(() => getSelectedPackage());
  const [channel, setChannel] = useState<Channel>('email');
  const [project, setProject] = useState<string>(PROJECT_TYPES[0]);
  const [message, setMessage] = useState('');
  const [aura, setAura] = useState(false);
  const [sentChannel, setSentChannel] = useState<Channel>('email');

  useEffect(() => {
    // Pick up a package chosen before this island hydrated.
    setPkg(getSelectedPackage());

    let startTimer = 0;
    let endTimer = 0;

    const off = onPackageChange(({ id, highlight, note }) => {
      setPkg(id);
      if (note) {
        // The estimator's summary: add it once, never clobber what they typed.
        setMessage((prev) => (prev.includes(note) ? prev : prev.trim() ? `${prev.trimEnd()}\n\n${note}` : note));
      }
      if (!highlight) return;

      // A fresh choice from the pricing cards: show the form again and glow
      // once the smooth scroll has (nearly) arrived.
      setStatus((s) => (s === 'sent' || s === 'mailto' ? 'idle' : s));
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      setAura(false);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      startTimer = window.setTimeout(() => {
        setAura(true);
        endTimer = window.setTimeout(() => setAura(false), AURA_MS);
      }, reduced ? 0 : 650);
    });

    return () => {
      off();
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
    };
  }, []);

  const validate = (data: FormData): FieldErrors => {
    const next: FieldErrors = {};
    if (!String(data.get('name') ?? '').trim()) next.name = 'Please tell us your name.';
    const email = String(data.get('email') ?? '').trim();
    if (!EMAIL_PATTERN.test(email)) next.email = 'Please enter a valid email address.';
    if (channel !== 'email' && !String(data.get('handle') ?? '').trim()) {
      next.handle =
        channel === 'discord'
          ? 'Please share your Discord username so we can reach you there.'
          : 'Please share the number we should text.';
    }
    if (message.trim().length < 10) {
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

    const packageText = packageLabel(pkg);
    const payload = {
      name: String(data.get('name')).trim(),
      email: String(data.get('email')).trim(),
      contactPreference: channelLabel(channel),
      contactHandle: channel === 'email' ? '' : String(data.get('handle') ?? '').trim(),
      project,
      package: packageText,
      message: message.trim(),
    };

    setSentChannel(channel);

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
        setChannel('email');
        setMessage('');
        setStatus('sent');
      } catch {
        setStatus('error');
      }
      return;
    }

    const subject = encodeURIComponent(
      `New project enquiry: ${payload.project || 'General'}${pkg === 'undecided' ? '' : ` / ${packageText}`}`,
    );
    const preference =
      channel === 'email'
        ? 'Email'
        : `${payload.contactPreference} (${payload.contactHandle})`;
    const body = encodeURIComponent(
      `Hi Komorebi Cameron,\n\n${payload.message}\n\nPackage: ${packageText}\nPreferred channel: ${preference}\n\n— ${payload.name}\n${payload.email}`,
    );
    window.location.href = `mailto:${SITE.contact.email}?subject=${subject}&body=${body}`;
    setStatus('mailto');
  };

  const describedBy = (key: keyof FieldErrors) => (errors[key] ? `${uid}-${key}-error` : undefined);
  const handleField = channel === 'email' ? null : HANDLE_FIELD[channel];

  let content;

  if (status === 'sent' || status === 'mailto') {
    content = (
      <div role="status" className="glass-strong rounded-3xl p-8 text-center sm:p-12">
        <InteractiveText as="p" className="accent-serif text-sakura-gradient inline-block pb-2 pr-1 text-5xl">
          {status === 'sent' ? 'Thank you.' : 'Almost there.'}
        </InteractiveText>
        <InteractiveText as="p" tone="muted" className="mx-auto mt-4 block max-w-sm leading-relaxed">
          {status === 'sent'
            ? 'Inquiry received. We will review your project details and respond via email/text within 7 days.'
            : 'Your email app should have opened with your message ready to send. Once it is sent, we will review your project details and respond within 7 days. If it did not open, write to us directly at the address below.'}
        </InteractiveText>
        <p className="mt-4 text-sm text-fg-muted">
          Preferred channel: <span className="font-semibold text-fg">{channelLabel(sentChannel)}</span>. 100% async, zero calls.
        </p>
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
  } else {
    content = (
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

        <div className="grid gap-5 sm:grid-cols-2">
          <div className={handleField ? '' : 'sm:col-span-2'}>
            <label htmlFor={`${uid}-channel`} className="mb-2 block text-sm font-medium text-fg-muted">
              How should we reach you?
            </label>
            <GlassSelect
              id={`${uid}-channel`}
              name="channel"
              value={channel}
              options={SITE.contact.channels}
              onChange={(value) => {
                setChannel(value as Channel);
                setErrors((prev) => ({ ...prev, handle: undefined }));
              }}
            />
          </div>

          {handleField && (
            <div>
              <label htmlFor={`${uid}-handle`} className="mb-2 block text-sm font-medium text-fg-muted">
                {handleField.label}
              </label>
              <input
                id={`${uid}-handle`}
                name="handle"
                type={handleField.type}
                autoComplete={handleField.autoComplete}
                placeholder={handleField.placeholder}
                className="field"
                aria-invalid={errors.handle ? 'true' : undefined}
                aria-describedby={describedBy('handle')}
              />
              {errors.handle && (
                <p id={`${uid}-handle-error`} className="mt-2 text-sm text-[#ff6a7a]">
                  {errors.handle}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label htmlFor={`${uid}-package`} className="mb-2 block text-sm font-medium text-fg-muted">
            Package / budget
          </label>
          <GlassSelect
            id={`${uid}-package`}
            name="package"
            value={pkg}
            options={PACKAGE_OPTIONS}
            onChange={(value) => {
              if (isPackageChoice(value)) setSelectedPackage(value);
            }}
          />
        </div>

        <div>
          <label htmlFor={`${uid}-project`} className="mb-2 block text-sm font-medium text-fg-muted">
            What are you looking for?
          </label>
          <GlassSelect
            id={`${uid}-project`}
            name="project"
            value={project}
            options={PROJECT_TYPES.map((type) => ({ value: type, label: type }))}
            onChange={setProject}
          />
        </div>

        <div>
          <label htmlFor={`${uid}-message`} className="mb-2 block text-sm font-medium text-fg-muted">
            Tell us about your project
          </label>
          <textarea
            id={`${uid}-message`}
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
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
          <p className="max-w-[17rem] text-sm leading-relaxed text-fg-muted" aria-live="polite">
            {status === 'error'
              ? 'Something went wrong. Please try again or email us directly.'
              : `100% async, zero calls. We reply ${SITE.contact.responseWindow.toLowerCase()}.`}
          </p>
          <button type="submit" className="btn-glass btn-glass-primary" disabled={status === 'sending'}>
            {status === 'sending' ? 'Sending…' : 'Send inquiry'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div id="contact-form" className={['package-aura-host rounded-3xl', aura ? 'package-aura' : ''].join(' ').trim()}>
      {content}
    </div>
  );
}
