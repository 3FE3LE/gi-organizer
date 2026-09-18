import { getTranslations } from 'next-intl/server';

import { ArtifactCard } from '@/components/artifact-card';
import type { Catalog } from '@/lib/data/catalog';
import type { OwnedArtifact } from '@/lib/player/artifacts';
import { rollsOf } from '@/lib/rules/piece-score';
import { mainStatValue } from '@/lib/rules/stats';
import { pieceWorth, type Scaler } from '@/lib/rules/worth';

/**
 * One piece of the box, read as the dice left it.
 *
 * The card itself is shared with the character panel — see
 * `components/artifact-card.tsx`. What belongs to this page is underneath it:
 * who is wearing it, how the rolls landed in total, and what the piece is for.
 * None of that is a fact about the artifact; it is this page's question about
 * it, which is why the shared card takes it as a footer rather than knowing it.
 */
export async function OwnedArtifactCard({
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
  const scalerLabel = await getTranslations('common.scaler');
  const worth = pieceWorth(piece, scaler);
  const dead = new Set(worth.substats.filter((entry) => entry.dead).map((entry) => entry.prop));
  const holder = piece.holderId === null
    ? null
    : catalog.characters.get(piece.holderId)?.name ?? `#${piece.holderId}`;

  return (
    <ArtifactCard
      catalog={catalog}
      locale={locale}
      piece={{
        setId: piece.setId,
        slot: piece.slot,
        rarity: piece.rarity,
        level: piece.level,
        mainProp: piece.mainProp,
        // The table's number rather than a stored one: the box keeps substats,
        // and a main stat is a function of slot, rarity and level.
        mainValue: mainStatValue(piece.mainProp, piece.rarity, piece.level),
        substats: piece.substats.map((substat) => ({
          prop: substat.prop,
          value: substat.value,
          rolls: rollsOf(substat.prop, substat.value, piece.rarity),
          quality: piece.quality.substats.find((entry) => entry.prop === substat.prop) ?? null,
          dead: dead.has(substat.prop),
        })),
        critValue: piece.critValue,
        critRating: piece.critRating,
        hasPerfect: piece.quality.hasPerfect,
      }}
      className="transition-colors hover:border-edge-strong"
      footer={
        <>
          <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-edge pt-1.5 font-mono text-2xs">
            <span className={holder ? 'text-muted' : 'text-good'}>{holder ?? t('free')}</span>
            <span className="tabular text-muted">
              {piece.quality.count} {t('rollsCount', { count: piece.quality.count })}
              {piece.quality.efficiency !== null
                && ` · ${Math.round(piece.quality.efficiency * 100)}%`}
            </span>
          </p>

          {/* What the piece is for, and what it lost getting there. The first is
              why a mastery piece can rank high without a mastery build on
              screen; the second is the one thing a tier average cannot say. */}
          {(worth.serves !== null || worth.wastedCount > 0) && (
            <p className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 font-mono text-2xs text-muted">
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
        </>
      }
    />
  );
}
