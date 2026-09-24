'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { AssetImage } from '@/components/asset-image';
import { Hint } from '@/components/hint';
import { buttonVariants } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';

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

/** A weapon as the detail view and the objective both read it. */
export type WeaponInfo = {
  name: string;
  icon: string | null;
  rarity: number;
  level: number;
  refinement: number;
  /** Base ATK, then the secondary stat, already formatted. */
  stats: { label: string; text: string }[];
  passive: WeaponPassiveText | null;
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
      <p className="text-xs leading-relaxed text-muted">
        <Numbers text={text} />
      </p>
    </section>
  );
}

/**
 * The numbers are what a refinement changes, so they are what is marked.
 * Everything else in the sentence is identical from R1 to R5.
 */
function Numbers({ text }: { text: string }) {
  return text.split(/(\d+(?:[.,]\d+)?(?:\/\d+(?:[.,]\d+)?)*\s?%?)/g).map((part, index) =>
    index % 2 === 1
      ? <span key={index} className="tabular text-text">{part}</span>
      : part,
  );
}

/**
 * A weapon's name that opens into the weapon: its numbers and its passive.
 *
 * It replaces a plain effect dialog that printed the passive at one
 * refinement and nothing else — the stats were on the card behind it, but a
 * dialog that covers the card has to say them again.
 */
export function WeaponButton({
  weapon,
  className,
  children,
}: {
  weapon: WeaponInfo;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('build');
  const [open, setOpen] = useState(false);

  return (
    <>
      <Hint text={weapon.passive?.name ?? weapon.name}>
        <button type="button" onClick={() => setOpen(true)} className={className}>
          {children}
        </button>
      </Hint>

      <Dialog open={open} onOpenChange={setOpen}>
        {open && (
          <DialogContent
            showCloseButton={false}
            className="panel max-h-[85vh] w-full max-w-md gap-0 overflow-hidden p-0 ring-0 sm:max-w-md"
          >
            <header className="flex items-start gap-3 border-b border-edge px-4 py-3">
              <AssetImage
                src={weapon.icon}
                kind="weapon"
                alt=""
                className="h-11 w-11 shrink-0 field"
                sizes="44px"
              />
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm font-normal">{weapon.name}</DialogTitle>
                <p className="font-mono text-2xs text-muted">
                  <span className="text-accent">{'★'.repeat(weapon.rarity)}</span>
                  {' · '}{t('levelPrefix')} {weapon.level} · R{weapon.refinement}
                </p>
              </div>
              <DialogClose
                aria-label={t('closeAria')}
                className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
              >
                <X size={16} aria-hidden />
              </DialogClose>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
              <WeaponStats stats={weapon.stats} />
              {weapon.passive && (
                <WeaponPassive passive={weapon.passive} refinement={weapon.refinement} />
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

export function WeaponStats({ stats }: { stats: WeaponInfo['stats'] }) {
  return (
    <dl className="divide-y divide-edge/60 border-y border-edge/60">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-baseline gap-3 py-1.5">
          <dt className="min-w-0 flex-1 text-xs text-muted">{stat.label}</dt>
          <dd className="tabular shrink-0 font-mono text-xs">{stat.text}</dd>
        </div>
      ))}
    </dl>
  );
}
