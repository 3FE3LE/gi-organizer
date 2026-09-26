import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { AssetImage } from '@/components/asset-image';
import { EffectButton } from '@/components/effect-dialog';
import { SlotIcon } from '@/components/slot-icon';
import { StatIcon } from '@/components/stat-icon';
import type { ArtifactSlot } from '@/lib/data/types';
import { TIERS, type CritRating, type RollQuality } from '@/lib/rules/rolls';

/**
 * The drawing of one artifact, from data already worded by the server.
 *
 * `ArtifactCard` used to be this and its own data layer in one async server
 * component, which meant a list fetched after the page loaded — the gear
 * dialog's candidates — could not draw a piece the way the box does, and drew
 * a second, poorer row instead. Split in two, the server half
 * (`artifact-card.tsx`) resolves the icon and the names and the locale, and
 * this half only draws, so the same card renders on the server for the box and
 * on the client for the dialog.
 *
 * No `'use client'`: from a Server Component it stays one, and from a client
 * module it is bundled like any other client code.
 */
export type ArtifactCardLine = {
  prop: string;
  label: string;
  /** Formatted for the locale. */
  text: string;
};

export type ArtifactCardSubstat = ArtifactCardLine & {
  rolls: number | null;
  quality: RollQuality | null;
  dead: boolean;
  /**
   * The fourth substat of a three-line piece: rolled, and readable by the
   * scanner, but not active until the piece reaches +4.
   */
  pending?: boolean;
};

export type ArtifactCardData = {
  setName: string;
  /** One line per bonus, already formatted. */
  setEffects: string[];
  icon: string | null;
  slot: ArtifactSlot;
  slotLabel: string;
  rarity: number;
  level: number;
  main: ArtifactCardLine;
  substats: ArtifactCardSubstat[];
  critValue: number;
  /** Once the locked fourth line unlocks at +4, when that changes it. */
  critValueAtFour?: number | null;
  critRating: CritRating;
  hasPerfect: boolean;
};

/** Loud only where it earns it: a piece nobody would keep stays grey. */
const CRIT_TONE: Record<CritRating, string> = {
  ninguno: 'text-muted',
  bajo: 'text-muted',
  normal: 'text-text',
  bueno: 'text-good',
  'muy bueno': 'text-good',
  excelente: 'text-accent',
};

export function ArtifactCardView({
  card,
  className,
  footer,
  hideSlot = false,
  children,
}: {
  card: ArtifactCardData;
  /**
   * Leave the slot icon out, for a list that is one slot already — the gear
   * dialog, a slot of the changes tab — where it says nothing on every card.
   */
  hideSlot?: boolean;
  /** The wrapper's own classes; every call site is a list item of some kind. */
  className?: string;
  /** Whatever the page knows that the piece does not: a holder, a verdict. */
  footer?: React.ReactNode;
  /** Controls drawn over or under the card, such as the panel's equip menu. */
  children?: React.ReactNode;
}) {
  const t = useTranslations('artifacts');
  const critRatingLabel = useTranslations('common.critRating');
  const common = useTranslations('common');

  return (
    <li className={`group relative isolate flex min-w-0 flex-col overflow-hidden card-glass p-2.5 ${className ?? ''}`}>
      {/* The rarity, rising from the bottom edge as it does on a roster card:
          gold for five stars, violet for four. Behind everything else. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/5 opacity-20 transition-opacity duration-300 group-hover:opacity-30"
        style={{
          background: `linear-gradient(to top, var(${card.rarity >= 5 ? '--rarity-5' : '--rarity-4'}), transparent)`,
        }}
      />
      <div className="flex items-start gap-2">
        {/*
          * The set is its art, not its name.
          *
          * Written out, the set's name was the longest line on the card and
          * the one a player reads least — the flower already says which set it
          * is, the same way the set strip above the list does. So the icon is
          * the set: its name on hover and for screen readers, and a tap opens
          * the bonus it grants, as the name used to.
          */}
        {card.setEffects.length > 0 ? (
          <EffectButton
            title={card.setName}
            lines={card.setEffects}
            hint={card.setName}
            closeLabel={common('close')}
            className="shrink-0 rounded-md transition-transform hover:scale-105"
          >
            <AssetImage src={card.icon} kind="relic" alt={card.setName} className="h-9 w-9" sizes="36px" />
          </EffectButton>
        ) : (
          <span title={card.setName} className="shrink-0">
            <AssetImage src={card.icon} kind="relic" alt={card.setName} className="h-9 w-9" sizes="36px" />
          </span>
        )}
        <div className="min-w-0 flex-1 self-center">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-2xs leading-tight">
            <span className="rounded bg-ink px-1 text-muted">+{card.level}</span>
            <span className="text-accent">{'★'.repeat(card.rarity)}</span>
            {!hideSlot && <SlotIcon slot={card.slot} label={card.slotLabel} className="text-muted" />}
            {(card.critValue > 0 || card.critValueAtFour != null) && (
              <span
                className={`tabular ${CRIT_TONE[card.critRating]}`}
                title={t('critValueHint', {
                  value: card.critValue.toFixed(1),
                  rating: critRatingLabel(card.critRating),
                })}
              >
                CV {card.critValue.toFixed(1)}
              </span>
            )}
            {/* Where it lands once the locked line unlocks: certain, not a
                forecast — that line has rolled already. */}
            {card.critValueAtFour != null && (
              <span className="tabular text-accent" title={t('pendingSubstatHint')}>
                <ArrowRight size={10} aria-hidden className="mx-0.5 inline" />{card.critValueAtFour.toFixed(1)}
              </span>
            )}
          </p>
        </div>
        {/* Pinned to the corner rather than laid out: in the header row it
            took the width the level, rarity and crit value share, and pushed
            the last of them onto a second line. */}
        {card.hasPerfect && (
          <Sparkles
            size={11}
            className="absolute right-1.5 top-1.5 text-accent"
            aria-label={t('perfectSubstatActive')}
          />
        )}
      </div>

      {/* The main stat, at the size it deserves: it is the piece's reason for
          existing, and on three of the five slots it is the whole decision. */}
      <p
        className="mt-2 flex items-center justify-between gap-2 border-b border-edge pb-1.5"
        title={card.main.label}
      >
        <StatIcon prop={card.main.prop} label={card.main.label} size={15} />
        <span className="tabular font-mono text-sm">{card.main.text}</span>
      </p>

      {/* A dead substat is dimmed whole, badge included. Left in the tier
          colours, a piece that rolled flat DEF five times reads as five good
          rolls, which is the reading this card exists to correct. */}
      <ul className="mt-1.5 space-y-0.5">
        {card.substats.map((substat) => (
          <li
            key={substat.prop}
            className={`flex items-center justify-between gap-2 ${
              substat.dead ? 'opacity-45' : substat.pending ? 'text-muted' : ''
            }`}
            title={substat.pending
              ? `${substat.label} · ${t('pendingSubstatHint')}`
              : substat.dead ? `${substat.label} · ${t('deadSubstatHint')}` : substat.label}
          >
            <StatIcon prop={substat.prop} label={substat.label} className={substat.pending ? 'opacity-60' : undefined} />
            <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-2xs">
              {/* Fixed width, right-aligned: a flat roll ("+19") and a percent
                  one ("+5.8%") are different lengths, and without a column to
                  end at, the roll mark after it drifted left or right row to
                  row instead of lining up down the card. */}
              <span className={`tabular w-11 text-right ${substat.pending ? 'italic opacity-70' : ''}`}>
                +{substat.text}
              </span>
              {/* The locked fourth line: drawn, so the piece reads as the
                  four-line piece it becomes, and marked with the level that
                  unlocks it where the roll mark would be. */}
              {substat.pending ? (
                <span className="rounded border border-dashed border-edge-strong px-1 leading-4 text-muted">
                  +4
                  <span className="sr-only"> · {t('pendingSubstatHint')}</span>
                </span>
              ) : (
                <RollMark substat={substat} />
              )}
            </span>
          </li>
        ))}
      </ul>

      {footer}
      {children}
    </li>
  );
}

/**
 * How a substat rolled: how many times, and at which tier.
 *
 * Bars rather than a number, because the tier is the reading and a percentage
 * next to a percentage is unreadable. Where the caller knows only how many
 * rolls a value is worth — the character panel, which reads a loadout rather
 * than the box — that number stands alone, as the game's own badge does.
 */
function RollMark({ substat }: { substat: ArtifactCardSubstat }) {
  const t = useTranslations('artifacts');
  const tierLabel = useTranslations('common.tier');

  if (!substat.quality) {
    if (substat.rolls === null || substat.rolls < 1) return null;

    return (
      <span className="rounded bg-ink px-1 text-muted">{Math.floor(substat.rolls)}</span>
    );
  }

  const quality = substat.quality;
  const tier = TIERS.indexOf(quality.tier);

  return (
    <span
      title={`${quality.count} ${t('rollsCount', { count: quality.count })} · ${tierLabel(quality.tier)}`}
      className={`flex items-center gap-0.5 ${
        substat.dead
          ? 'text-muted'
          : quality.perfect ? 'text-accent' : tier >= 2 ? 'text-good' : 'text-muted'
      }`}
    >
      <span className="tabular">×{quality.count}</span>
      <span aria-hidden className="tracking-tighter">
        {'▰'.repeat(tier + 1)}{'▱'.repeat(3 - tier)}
      </span>
    </span>
  );
}
