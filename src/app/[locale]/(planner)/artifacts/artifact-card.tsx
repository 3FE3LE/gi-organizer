import { Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { GameIcon } from '@/components/game-icon';
import { propLabel, type Catalog } from '@/lib/data/catalog';
import { formatPropValue } from '@/lib/data/props';
import type { OwnedArtifact } from '@/lib/player/artifacts';
import { TIERS, type CritRating, type RollQuality } from '@/lib/rules/rolls';
import { pieceWorth, type Scaler } from '@/lib/rules/worth';
import { mainStatValue } from '@/lib/rules/stats';

/** Loud only where it earns it: a piece nobody would keep stays grey. */
const CRIT_TONE: Record<CritRating, string> = {
  ninguno: 'text-muted',
  bajo: 'text-muted',
  normal: 'text-text',
  bueno: 'text-good',
  'muy bueno': 'text-good',
  excelente: 'text-accent',
};

/**
 * One piece, read as the dice left it.
 *
 * Each substat shows how many times it rolled and how well those rolls landed,
 * because "crit rate 10.9%" says nothing on its own: three maximum rolls and
 * four minimum ones land within a hair of each other, and only one of them is
 * a piece worth keeping.
 */
export async function ArtifactCard({
  piece,
  scaler,
  catalog,
  locale,
}: {
  piece: OwnedArtifact;
  scaler: Scaler | null;
  catalog: Catalog;
  locale: string;
}) {
  const t = await getTranslations('artifacts');
  const slotLabel = await getTranslations('common.slot');
  const scalerLabel = await getTranslations('common.scaler');
  const critRatingLabel = await getTranslations('common.critRating');
  const set = catalog.artifacts.get(piece.setId);
  const worth = pieceWorth(piece, scaler);
  const dead = new Set(worth.substats.filter((entry) => entry.dead).map((entry) => entry.prop));
  const holder = piece.holderId === null
    ? null
    : catalog.characters.get(piece.holderId)?.name ?? `#${piece.holderId}`;

  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-edge bg-surface p-3 transition-colors hover:border-edge-strong">
      <div className="flex items-start gap-2">
        <GameIcon
          filename={set?.pieces[piece.slot]?.icon}
          kind="relic"
          className="h-10 w-10 shrink-0"
          sizes="40px"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs" title={set?.name}>{set?.name ?? `#${piece.setId}`}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[0.65rem]">
            <span className="rounded bg-ink px-1 text-muted">+{piece.level}</span>
            <span className="text-accent">{'★'.repeat(piece.rarity)}</span>
            <span className="text-muted capitalize">
              {slotLabel.has(piece.slot) ? slotLabel(piece.slot) : piece.slot}
            </span>
          </p>
        </div>
        {piece.quality.hasPerfect && (
          <Sparkles
            size={13}
            className="shrink-0 text-accent"
            aria-label={t('perfectSubstatActive')}
          />
        )}
      </div>

      <p className="mt-2 flex items-baseline justify-between gap-2 border-b border-edge pb-1.5">
        <span className="truncate text-xs text-muted">{propLabel(catalog, piece.mainProp)}</span>
        <span className="tabular font-mono text-sm">
          {formatPropValue(
            piece.mainProp,
            mainStatValue(piece.mainProp, piece.rarity, piece.level),
            'percent',
            locale,
          )}
        </span>
      </p>

      {/* A dead substat is dimmed whole, badge included. Left in the tier
          colours, a piece that rolled flat DEF five times reads as five good
          rolls, which is the reading this page exists to correct. */}
      <ul className="mt-1.5 space-y-1">
        {piece.substats.map((substat) => {
          const quality = piece.quality.substats.find((entry) => entry.prop === substat.prop);
          const wasted = dead.has(substat.prop);

          return (
            <li
              key={substat.prop}
              className={`flex items-baseline justify-between gap-2 ${
                wasted ? 'opacity-45' : ''
              }`}
              title={wasted ? t('deadSubstatHint') : undefined}
            >
              <span className="truncate text-[0.7rem] text-muted">
                {propLabel(catalog, substat.prop)}
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-[0.65rem]">
                <span className="tabular">
                  +{formatPropValue(substat.prop, substat.value, 'percent', locale)}
                </span>
                {quality && <RollBadge quality={quality} muted={wasted} />}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-edge pt-1.5 font-mono text-[0.65rem]">
        <span className={holder ? 'text-muted' : 'text-good'}>
          {holder ?? t('free')}
        </span>
        <span className="flex items-baseline gap-2">
          {piece.critValue > 0 && (
            <span
              className={`tabular ${CRIT_TONE[piece.critRating]}`}
              title={t('critValueHint', {
                value: piece.critValue.toFixed(1),
                rating: critRatingLabel(piece.critRating),
              })}
            >
              CV {piece.critValue.toFixed(1)}
            </span>
          )}
          <span className="tabular text-muted">
            {piece.quality.count} {t('rollsCount', { count: piece.quality.count })}
            {piece.quality.efficiency !== null
              && ` · ${Math.round(piece.quality.efficiency * 100)}%`}
          </span>
        </span>
      </p>

      {/* What the piece is for, and what it lost getting there. The first is
          why a mastery piece can rank high without a mastery build on screen;
          the second is the one thing a tier average cannot say. */}
      {(worth.serves !== null || worth.wastedCount > 0) && (
        <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 font-mono text-[0.6rem] text-muted">
          <span>
            {worth.serves !== null && t('servesPrefix', { scaler: scalerLabel(worth.serves) })}
          </span>
          {worth.wastedCount > 0 && (
            <span>
              <span className="text-bad">{worth.wastedCount}</span>
              {` ${t('wastedRolls', { count: worth.count })}`}
            </span>
          )}
        </p>
      )}
    </li>
  );
}

/**
 * How a substat rolled: how many times, and at which tier.
 *
 * Four dots rather than a number, because the tier is the reading and a
 * percentage next to a percentage is unreadable.
 */
async function RollBadge({ quality, muted }: { quality: RollQuality; muted?: boolean }) {
  const t = await getTranslations('artifacts');
  const tierLabel = await getTranslations('common.tier');
  const tier = TIERS.indexOf(quality.tier);

  return (
    <span
      title={`${quality.count} ${t('rollsCount', { count: quality.count })} · ${tierLabel(quality.tier)}`}
      className={`flex items-center gap-0.5 ${
        muted
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
