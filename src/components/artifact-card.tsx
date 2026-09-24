import { getTranslations } from 'next-intl/server';

import { ArtifactCardView, type ArtifactCardData } from '@/components/artifact-card-view';
import { formatSetEffect, setEffects, statLabel, type Catalog } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import type { Locale } from '@/lib/data/locales';
import { formatPropValue } from '@/lib/data/props';
import type { ArtifactSlot } from '@/lib/data/types';
import type { CritRating, RollQuality } from '@/lib/rules/rolls';

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
 *
 * This is the server half: it words the piece — names, icon, locale — and
 * `artifact-card-view.tsx` draws it. A list loaded after the page, such as the
 * gear dialog's candidates, calls `artifactCardData` in its action and draws
 * the same view on the client.
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
  /** The locked fourth substat, shown but marked: it unlocks at +4. */
  pendingSubstats?: { prop: string; value: number }[];
  /** `2 × CRIT Rate + CRIT DMG`. Omitted or zero on a piece that rolled none. */
  critValue?: number;
  /** The crit value once the locked fourth line unlocks, when it differs. */
  critValueAtFour?: number | null;
  critRating?: CritRating;
  /** At least one substat rolled maximum every time. */
  hasPerfect?: boolean;
};

/** Everything the view needs, worded for the locale. Serializable. */
export async function artifactCardData(
  piece: ArtifactPiece,
  catalog: Catalog,
  locale: Locale | string,
): Promise<ArtifactCardData> {
  const slotLabel = await getTranslations('common.slot');
  const set = catalog.artifacts.get(piece.setId);
  const crit = piece.critValue ?? 0;

  return {
    setName: set?.name ?? `#${piece.setId}`,
    setEffects: setEffects(set).map(formatSetEffect),
    icon: await resolveIcon(set?.pieces[piece.slot]?.icon, 'relic'),
    slot: piece.slot,
    slotLabel: slotLabel.has(piece.slot) ? slotLabel(piece.slot) : piece.slot,
    rarity: piece.rarity,
    level: piece.level,
    main: {
      prop: piece.mainProp,
      label: statLabel(catalog, piece.mainProp),
      text: formatPropValue(piece.mainProp, piece.mainValue, 'percent', locale),
    },
    substats: piece.substats.map((substat) => ({
      prop: substat.prop,
      label: statLabel(catalog, substat.prop),
      text: formatPropValue(substat.prop, substat.value, 'percent', locale),
      rolls: substat.rolls,
      quality: substat.quality ?? null,
      dead: substat.dead ?? false,
      pending: false,
    })).concat((piece.pendingSubstats ?? []).map((substat) => ({
      prop: substat.prop,
      label: statLabel(catalog, substat.prop),
      text: formatPropValue(substat.prop, substat.value, 'percent', locale),
      rolls: null,
      quality: null,
      dead: false,
      pending: true,
    }))),
    critValue: crit,
    critValueAtFour: piece.critValueAtFour ?? null,
    critRating: piece.critRating ?? 'ninguno',
    hasPerfect: piece.hasPerfect ?? false,
  };
}

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
  return (
    <ArtifactCardView
      card={await artifactCardData(piece, catalog, locale)}
      className={className}
      footer={footer}
    >
      {children}
    </ArtifactCardView>
  );
}
