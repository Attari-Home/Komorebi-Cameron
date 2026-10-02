import { useEffect, useState } from 'react';

const STUDIO_ZONE = 'Asia/Dubai';

interface Reading {
  studio: string;
  local: string;
  localZone: string;
}

function read(): Reading {
  const now = new Date();
  const fmt = (zone?: string) =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: zone,
    }).format(now);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone.replace(/_/g, ' ');
  return { studio: fmt(STUDIO_ZONE), local: fmt(), localZone };
}

/**
 * Two live clocks: the studio's and the visitor's. Async work means time zones
 * stop mattering, and this makes that visible. Rendered client-only because the
 * visitor's zone is unknown at build time.
 */
export default function StudioClock() {
  const [time, setTime] = useState<Reading>(read);

  useEffect(() => {
    const id = window.setInterval(() => setTime(read()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const cell = (label: string, value: string, sub: string) => (
    <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.22em] text-fg-muted">
        {label}
      </p>
      <p className="mt-1 font-sans text-2xl font-semibold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 truncate text-xs text-fg-muted">{sub}</p>
    </div>
  );

  return (
    <div className="flex gap-3" role="group" aria-label="Studio time and your local time">
      {cell('Studio', time.studio, 'Dubai (UTC+4)')}
      {cell('You', time.local, time.localZone)}
    </div>
  );
}
