import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MinusIcon, PlusIcon } from '../icons';

export interface Counter {
  /** Sheet size, when the platform declares one. Shown as "of 191", never as a stat. */
  target?: number;
  /**
   * Accepts a resolver as well as a number, because the write is read-modify-write:
   * `(n) => n + 1` is resolved against freshly-read storage rather than against
   * whatever this component last rendered.
   */
  onChange: (next: number | ((current: number) => number)) => Promise<void>;
}

interface Props extends Counter {
  /** Names the platform in the button labels, which are otherwise just "+" and "−". */
  name: string;
  total: number;
  delta?: ReactNode;
}

/**
 * The control for a hand-kept counter — the number *is* the input, rather than a
 * read-only stat with separate buttons underneath. One number on screen, and setting an
 * exact value costs no more clicks than nudging it.
 *
 * Replaces the headline StatBlock for these platforms rather than joining it, which is
 * why it takes the same `delta` slot: "+3 today" still reads identically to every other
 * platform on the page.
 */
export function ManualCounter({ name, total, target, delta, onChange }: Props) {
  const [draft, setDraft] = useState(String(total));
  const [pending, setPending] = useState(false);
  const focused = useRef(false);

  // Follow the stored value, but never yank the field out from under someone typing —
  // the other surface may have written while this one was open.
  useEffect(() => {
    if (!focused.current) setDraft(String(total));
  }, [total]);

  async function write(next: number | ((current: number) => number)) {
    setPending(true);
    try {
      await onChange(next);
    } finally {
      setPending(false);
    }
  }

  /** Commits the typed value, or puts the stored one back if it was not a number. */
  function commit() {
    focused.current = false;
    const parsed = Number(draft.trim());
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(total));
      return;
    }
    if (Math.round(parsed) === total) return;
    void write(parsed);
  }

  return (
    <div className="counter">
      <button
        type="button"
        className="btn-icon counter-step"
        // A count cannot go below zero, so the affordance says so rather than silently
        // clamping and looking broken.
        disabled={pending || total <= 0}
        aria-label={`Subtract one from ${name}`}
        onClick={() => void write((current) => current - 1)}
      >
        <MinusIcon size={14} />
      </button>

      <span className="counter-field">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          className="counter-input num"
          value={draft}
          disabled={pending}
          aria-label={`Problems solved on ${name}`}
          onFocus={() => (focused.current = true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(String(total));
              e.currentTarget.blur();
            }
          }}
        />
        {target !== undefined && <span className="muted counter-target">of {target.toLocaleString()}</span>}
        {delta}
      </span>

      <button
        type="button"
        className="btn-icon counter-step"
        disabled={pending}
        aria-label={`Add one to ${name}`}
        onClick={() => void write((current) => current + 1)}
      >
        <PlusIcon size={14} />
      </button>
    </div>
  );
}
