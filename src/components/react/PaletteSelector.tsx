import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { PETAL_PALETTES, type PetalPaletteId } from '../../data/petalPalettes';
import {
  getCurrentPaletteId,
  getPaletteDefinition,
  onPaletteChange,
} from '../../lib/petalPalette';
import { transitionPalette } from '../../lib/liquidTransition';

/**
 * Petal colour selector for the header.
 *
 * A glass icon button showing the current swatch opens a small radio-group
 * popover. Choosing a palette runs the liquid wave transition, which applies the palette; the canvas
 * engine and guide petal listen for and restyle instantly.
 */
export default function PaletteSelector() {
  const [id, setId] = useState<PetalPaletteId>(() => getCurrentPaletteId());
  const [open, setOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  useEffect(() => {
    setId(getCurrentPaletteId());
    return onPaletteChange(setId);
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Move focus into the menu when it opens.
  useEffect(() => {
    if (!open) return;
    const index = Math.max(
      0,
      PETAL_PALETTES.findIndex((p) => p.id === id),
    );
    optionRefs.current[index]?.focus();
    // Only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The liquid wave applies the palette beneath itself; the selected state
  // follows through `onPaletteChange` at that moment.
  const choose = useCallback((next: PetalPaletteId) => {
    transitionPalette(next);
  }, []);

  const onOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = PETAL_PALETTES.length - 1;
    let target = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = index === last ? 0 : index + 1;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target = index === 0 ? last : index - 1;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = last;
    if (target >= 0) {
      event.preventDefault();
      optionRefs.current[target]?.focus();
    }
  };

  const current = getPaletteDefinition(id);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Petal colour: ${current.label}. Change petal colour`}
        title="Petal colour"
        className="btn-glass btn-glass-icon"
      >
        <span
          aria-hidden="true"
          className="relative block h-5 w-5 rounded-full ring-1 ring-white/40"
          style={{
            background: `radial-gradient(circle at 30% 28%, #fff9 0%, transparent 42%), ${current.swatch}`,
            boxShadow: `0 0 14px -1px ${current.swatch}`,
          }}
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="radiogroup"
          aria-label="Petal colour"
          className="glass-strong !bg-bg/80 absolute right-0 top-[calc(100%+0.75rem)] z-50 w-72 animate-fade-rise rounded-3xl p-2"
        >
          {PETAL_PALETTES.map((palette, index) => {
            const selected = palette.id === id;
            return (
              <button
                key={palette.id}
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(palette.id)}
                onKeyDown={(e) => onOptionKeyDown(e, index)}
                className={[
                  'group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-300',
                  selected ? 'bg-sakura-a/15' : 'hover:bg-fg/5',
                ].join(' ')}
              >
                <span
                  aria-hidden="true"
                  className="block h-8 w-8 shrink-0 rounded-full ring-1 ring-white/30 transition-transform duration-500 ease-out-expo group-hover:scale-110"
                  style={{
                    background: `radial-gradient(circle at 30% 28%, #fff8 0%, transparent 45%), linear-gradient(140deg, ${palette.dark.petalA}, ${palette.dark.petalB})`,
                    boxShadow: `0 0 16px -2px ${palette.swatch}`,
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">{palette.label}</span>
                  <span className="block truncate text-xs text-fg-muted">{palette.description}</span>
                </span>
                {selected && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-sakura-a"
                    aria-hidden="true"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
