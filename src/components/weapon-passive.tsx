'use client';

import { useTranslations } from 'next-intl';
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

import { Collapse } from '@/components/collapse';
import { FoldMark } from '@/components/fold-mark';
import { GameText } from '@/components/game-text';
import { Slider } from '@/components/ui/slider';

/**
 * A weapon's passive, and what each refinement does to it.
 *
 * The same argument the talent dialog makes with its level slider: the text at
 * R1 and the text at R5 are the same sentence with different numbers, and the
 * question anyone has — *is another copy worth it* — is a comparison between
 * two of them. So the slider opens on the copy owned and only previews: it
 * writes nothing.
 *
 * Inside a `PassiveGroup` the text folds away behind the passive's name. A
 * grid of weapons drew every passive open, and a passive runs from two lines
 * to twelve, so each row was as tall as its longest and the short cards were
 * mostly empty. Folded, every card ends on the same line; opened, the text
 * drops over the row below rather than pushing it down — and, as with every
 * other fold, opening one closes the one that was open.
 */
export type WeaponPassiveText = {
  name: string;
  /** One string per refinement, R1 first. */
  refinements: string[];
};

type Group = { open: string | null; setOpen: (id: string | null) => void };

const PassiveContext = createContext<Group | null>(null);

/** Makes the passives under it fold, one open at a time. */
export function PassiveGroup({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  return <PassiveContext value={{ open, setOpen }}>{children}</PassiveContext>;
}

export function WeaponPassive({
  passive,
  refinement,
  fold = true,
}: {
  passive: WeaponPassiveText;
  /** Where the slider opens: the copy the player actually holds. */
  refinement: number;
  /** `false` to draw it open inside a `PassiveGroup` — a dialog over the grid. */
  fold?: boolean;
}) {
  const t = useTranslations('build');
  const context = useContext(PassiveContext);
  const group = fold ? context : null;
  const id = useId();
  const rootRef = useRef<HTMLElement>(null);
  const steps = passive.refinements.length;
  const [rank, setRank] = useState(Math.min(Math.max(refinement, 1), steps || 1));
  const text = passive.refinements[rank - 1] || passive.refinements[0] || '';
  const open = group?.open === id;

  // An overlay that stays put over the next card has to be easy to dismiss:
  // Escape, or a press anywhere outside it.
  useEffect(() => {
    if (!open || !group) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape'
        : !rootRef.current?.contains(event.target as Node)) group.setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open, group]);

  const slider = steps > 1 && (
    <label className="flex flex-1 items-center gap-2">
      <span className="sr-only">{t('refinementSlider')}</span>
      <Slider
        min={1}
        max={steps}
        step={1}
        value={rank}
        onValueChange={(next) => setRank(Number(next))}
        className="min-w-16 flex-1"
      />
      <span className={`tabular w-7 shrink-0 text-right font-mono text-2xs ${
        rank === refinement ? 'text-text' : 'text-accent'
      }`}>
        R{rank}
      </span>
    </label>
  );
  // The values a refinement changes are the ones the game marks, so they are
  // what reads as a value; the rest is the same from R1 to R5.
  const body = <GameText text={text} values className="text-xs leading-relaxed text-muted" />;

  if (!group) {
    return (
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="min-w-0 truncate font-mono text-2xs uppercase tracking-wide text-muted">
            {passive.name}
          </h3>
          {slider}
        </div>
        {body}
      </section>
    );
  }

  return (
    <section ref={rootRef} data-passive-open={open || undefined} className="relative">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-text`}
          onClick={() => group.setOpen(open ? null : id)}
          className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded text-left outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <FoldMark open={open} />
          <h3 className="min-w-0 truncate font-mono text-2xs uppercase tracking-wide text-muted">
            {passive.name}
          </h3>
        </button>
        {slider}
      </div>
      {/* Hung from the card's bottom edge, the width of the card: the
          section's own padding is the card's, so the offsets reach its
          border. Opaque, since it lies over the card below. */}
      <div className="absolute -inset-x-3.25 top-full z-10 mt-[11px]">
        <Collapse open={open} id={`${id}-text`} lazy>
          <div className="rounded-b-[var(--radius-card)] border border-t-0 border-edge bg-surface px-3 pb-3 pt-1 shadow-[var(--shadow-raised)]">
            {body}
          </div>
        </Collapse>
      </div>
    </section>
  );
}
