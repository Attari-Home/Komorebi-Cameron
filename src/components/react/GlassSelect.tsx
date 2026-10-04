import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface GlassSelectOption {
  value: string;
  label: string;
  /** Short secondary text shown to the right (e.g. a price). */
  hint?: string;
}

interface GlassSelectProps {
  /** Id of the trigger button; point a <label htmlFor> at it. */
  id: string;
  /** Posted with the form (via a hidden input). */
  name: string;
  value: string;
  options: readonly GlassSelectOption[];
  onChange: (value: string) => void;
}

const LIST_MAX_PX = 288;

/**
 * Themed listbox that replaces the native <select>, whose operating-system
 * popup ignores the site's glass, palette and light/dark themes.
 *
 * Accessibility follows the WAI-ARIA "select-only combobox" pattern: the
 * trigger keeps focus and points at the active option with
 * `aria-activedescendant`. Arrow keys / Home / End move, Enter or Space picks,
 * Escape closes, typing jumps to a matching option. The menu flips upward when
 * there is no room below. A hidden input keeps normal form submission working.
 */
export default function GlassSelect({ id, name, value, options, onChange }: GlassSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', timer: 0 });

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex);
  const [flipUp, setFlipUp] = useState(false);

  const current = options[selectedIndex];

  const openMenu = useCallback(() => {
    const root = rootRef.current;
    if (root) {
      const rect = root.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom;
      const needed = Math.min(LIST_MAX_PX, options.length * 52 + 16);
      setFlipUp(below < needed + 12 && rect.top > below);
    }
    setActive(selectedIndex);
    setOpen(true);
  }, [options.length, selectedIndex]);

  const closeMenu = useCallback(() => setOpen(false), []);

  const choose = useCallback(
    (index: number) => {
      const option = options[index];
      if (option) onChange(option.value);
      setOpen(false);
    },
    [onChange, options],
  );

  // Close on outside pointer-down.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Keep the active option in view while navigating by keyboard.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => () => window.clearTimeout(typed.current.timer), []);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;

    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActive((i) => (i >= last ? 0 : i + 1));
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive((i) => (i <= 0 ? last : i - 1));
        return;
      case 'Home':
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        event.preventDefault();
        setActive(last);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        return;
      case 'Tab':
        closeMenu();
        return;
      default:
        break;
    }

    // Type-ahead: jump to the next option starting with what was typed.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      window.clearTimeout(typed.current.timer);
      typed.current.text += event.key.toLowerCase();
      typed.current.timer = window.setTimeout(() => {
        typed.current.text = '';
      }, 600);
      const from = typed.current.text.length > 1 ? active : active + 1;
      for (let step = 0; step < options.length; step++) {
        const index = (from + step) % options.length;
        if (options[index]!.label.toLowerCase().startsWith(typed.current.text)) {
          setActive(index);
          break;
        }
      }
    }
  };

  return (
    <div ref={rootRef} className={['relative', open ? 'z-40' : ''].join(' ').trim()}>
      <input type="hidden" name={name} value={value} />

      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          // Close when focus leaves the control (but not when it moves into the list).
          if (!rootRef.current?.contains(event.relatedTarget as Node | null)) closeMenu();
        }}
        className="field flex cursor-pointer items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0 truncate">{current?.label}</span>
        <span className="flex shrink-0 items-center gap-3">
          {current?.hint && <span className="text-sm text-sakura-a">{current.hint}</span>}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={['text-fg-muted transition-transform duration-500 ease-out-expo', open ? 'rotate-180' : ''].join(' ')}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          tabIndex={-1}
          // Opaque enough to read over the form (nested backdrop blur is not reliable).
          style={{ backgroundColor: 'rgb(var(--bg) / 0.97)' }}
          className={[
            'glass-strong absolute left-0 right-0 z-50 max-h-72 animate-fade-rise overflow-y-auto rounded-2xl p-1.5',
            flipUp ? 'bottom-[calc(100%+0.5rem)]' : 'top-[calc(100%+0.5rem)]',
          ].join(' ')}
        >
          {options.map((option, index) => {
            const selected = index === selectedIndex;
            const isActive = index === active;
            return (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                // pointerdown keeps focus on the trigger so the blur handler never races the click.
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                className={[
                  'flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors duration-200',
                  selected ? 'bg-sakura-a/15 text-sakura-a' : isActive ? 'bg-fg/[0.06] text-fg' : 'text-fg-muted',
                ].join(' ')}
              >
                <span className="min-w-0">
                  <span className="block font-medium">{option.label}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  {option.hint && <span className="text-xs font-semibold tracking-wide text-sakura-a">{option.hint}</span>}
                  {selected && (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
