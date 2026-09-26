'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Slider } from '@/components/ui/slider';
import { GameText } from '@/components/game-text';

/**
 * A weapon's passive, and what each refinement does to it.
 *
 * The same argument the talent dialog makes with its level slider: the text at
 * R1 and the text at R5 are the same sentence with different numbers, and the
 * question anyone has — *is another copy worth it* — is a comparison between
 * two of them. So the slider opens on the copy owned and only previews: it
 * writes nothing.
 */
export type WeaponPassiveText = {
  name: string;
  /** One string per refinement, R1 first. */
  refinements: string[];
};

export function WeaponPassive({
  passive,
  refinement,
}: {
  passive: WeaponPassiveText;
  /** Where the slider opens: the copy the player actually holds. */
  refinement: number;
}) {
  const t = useTranslations('build');
  const steps = passive.refinements.length;
  const [rank, setRank] = useState(Math.min(Math.max(refinement, 1), steps || 1));
  const text = passive.refinements[rank - 1] || passive.refinements[0] || '';

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-3">
        <h3 className="min-w-0 truncate font-mono text-2xs uppercase tracking-wide text-muted">
          {passive.name}
        </h3>
        {steps > 1 && (
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
        )}
      </div>
      {/* The values a refinement changes are the ones the game marks, so they
          are what reads as a value; the rest is the same from R1 to R5. */}
      <GameText text={text} values className="text-xs leading-relaxed text-muted" />
    </section>
  );
}
