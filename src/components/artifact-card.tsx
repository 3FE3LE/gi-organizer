import { Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { GameIcon } from '@/components/game-icon';
import { Hint } from '@/components/hint';
import { StatIcon } from '@/components/stat-icon';
import { setEffectsHint, statLabel, type Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import { formatPropValue } from '@/lib/data/props';
import type { ArtifactSlot } from '@/lib/data/types';
import { TIERS, type CritRating, type RollQuality } from '@/lib/rules/rolls';

/**
 * One artifact, drawn the same way everywhere.
 *
 * There were two of these — one on the character panel, one in the box — and
 * they disagreed about everything that matters: the panel dimmed nothing, the
 * box showed tiers, and both wrote the main stat as a bare name that cannot
 * tell flat ATK from ATK%. A piece is a piece; the page around it decides what
 * else to say about it, which is what `footer` and `children` are for.
 *
 * Stats are drawn rather than named — see `components/stat-icon.tsx` — and that
 * is what makes the card narrow enough for the box to show four or five across
 * instead of three.
 */

export type ArtifactSubstat = {
  prop: string;
  value: number;
  /** Value in top rolls: 2.8 means "2.8 maximum rolls' worth". `null` if unknown. */
  rolls: number | null;
  /** How the dice landed, where the caller computed it. */
  quality?: RollQuality | null;
  /** Scales with nothing this piece could serve, so it is dimmed whole. */
  dead?: boolean;
};

export type ArtifactPiece = {
  setId: number;
  slot: ArtifactSlot;
  rarity: number;
  level: number;
  mainProp: string;
  /** The caller's own number: read from the table, or as the game stored it. */
  mainValue: number;
  substats: ArtifactSubstat[];
  /** `2 × CRIT Rate + CRIT DMG`. Omitted or zero on a piece that rolled none. */
  critValue?: number;
  critRating?: CritRating;
  /** At least one substat rolled maximum every time. */
  hasPerfect?: boolean;
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

export async function ArtifactCard({
  piece,
  catalog,
  locale,
  className,
  footer,
  children,
}: {
  piece: ArtifactPiece;
  catalog: Catalog;
  locale: Locale | string;
  /** The wrapper's own classes; both call sites are list items of some kind. */
  className?: string;
  /** Whatever the page knows that the piece does not: a holder, a verdict. */
  footer?: React.ReactNode;
  /** Controls drawn over the card, such as the panel's equip menu. */
  children?: React.ReactNode;
}) {
  const t = await getTranslations('artifacts');
  const slotLabel = await getTranslations('common.slot');
  const critRatingLabel = await getTranslations('common.critRating');

  const set = catalog.artifacts.get(piece.setId);
  const crit = piece.critValue ?? 0;
  const rating = piece.critRating ?? 'ninguno';
  const setHint = set && setEffectsHint(set);

  return (
    <li className={`group relative flex min-w-0 flex-col card p-2.5 ${className ?? ''}`}>
      <div className="flex items-start gap-2">
        <GameIcon
          filename={set?.pieces[piece.slot]?.icon}
          kind="relic"
          className="h-9 w-9 shrink-0"
          sizes="36px"
        />
        <div className="min-w-0 flex-1">
          {/* The bonus this set actually grants, which the game shows twice
              in its own UI and this one showed nowhere — a tap or a hover
              away rather than a line every card pays for whether it's read
              or not. */}
          {setHint ? (
            <Hint text={`${set!.name} — ${setHint}`}>
              <button type="button" className="block w-full truncate text-left text-xs leading-tight">
                {set!.name}
              </button>
            </Hint>
          ) : (
            <p className="truncate text-xs leading-tight" title={set?.name}>
              {set?.name ?? `#${piece.setId}`}
            </p>
          )}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 font-mono text-2xs leading-tight">
            <span className="rounded bg-ink px-1 text-muted">+{piece.level}</span>
            <span className="text-accent">{'★'.repeat(piece.rarity)}</span>
            <span className="text-muted capitalize">
              {slotLabel.has(piece.slot) ? slotLabel(piece.slot) : piece.slot}
            </span>
            {crit > 0 && (
              <span
                className={`tabular ${CRIT_TONE[rating]}`}
                title={t('critValueHint', {
                  value: crit.toFixed(1),
                  rating: critRatingLabel(rating),
                })}
              >
                CV {crit.toFixed(1)}
              </span>
            )}
          </p>
        </div>
        {piece.hasPerfect && (
          <Sparkles
            size={12}
            className="shrink-0 text-accent"
            aria-label={t('perfectSubstatActive')}
          />
        )}
      </div>

      {/* The main stat, at the size it deserves: it is the piece's reason for
          existing, and on three of the five slots it is the whole decision. */}
      <p
        className="mt-2 flex items-baseline justify-between gap-2 border-b border-edge pb-1.5"
        title={statLabel(catalog, piece.mainProp)}
      >
        <StatIcon prop={piece.mainProp} label={statLabel(catalog, piece.mainProp)} size={15} />
        <span className="tabular font-mono text-sm">
          {formatPropValue(piece.mainProp, piece.mainValue, 'percent', locale)}
        </span>
      </p>

      {/* A dead substat is dimmed whole, badge included. Left in the tier
          colours, a piece that rolled flat DEF five times reads as five good
          rolls, which is the reading this card exists to correct. */}
      <ul className="mt-1.5 space-y-0.5">
        {piece.substats.map((substat) => (
          <li
            key={substat.prop}
            className={`flex items-baseline justify-between gap-2 ${
              substat.dead ? 'opacity-45' : ''
            }`}
            title={substat.dead
              ? `${statLabel(catalog, substat.prop)} · ${t('deadSubstatHint')}`
              : statLabel(catalog, substat.prop)}
          >
            <StatIcon prop={substat.prop} label={statLabel(catalog, substat.prop)} />
            <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-2xs">
              {/* Fixed width, right-aligned: a flat roll ("+19") and a percent
                  one ("+5.8%") are different lengths, and without a column to
                  end at, the roll mark after it drifted left or right row to
                  row instead of lining up down the card. */}
              <span className="tabular w-9 text-right">
                +{formatPropValue(substat.prop, substat.value, 'percent', locale)}
              </span>
              <RollMark substat={substat} />
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
async function RollMark({ substat }: { substat: ArtifactSubstat }) {
  const t = await getTranslations('artifacts');
  const tierLabel = await getTranslations('common.tier');

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
