import { artifactCardData } from '@/components/artifact-card';
import {
  OwnedArtifactCardView,
  type OwnedArtifactCardData,
} from '@/components/owned-artifact-card-view';
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
 *
 * Worded here and drawn by `OwnedArtifactCardView`, so the gear dialog on the
 * build screen can draw a piece identically from the same data.
 */
export async function ownedArtifactCardData(
  piece: OwnedArtifact,
  scaler: Scaler | null,
  catalog: Catalog,
  locale: string,
): Promise<OwnedArtifactCardData> {
  const worth = pieceWorth(piece, scaler);
  const dead = new Set(worth.substats.filter((entry) => entry.dead).map((entry) => entry.prop));

  return {
    card: await artifactCardData({
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
    }, catalog, locale),
    holder: piece.holderId === null
      ? null
      : catalog.characters.get(piece.holderId)?.name ?? `#${piece.holderId}`,
    rolls: piece.quality.count,
    efficiency: piece.quality.efficiency,
    serves: worth.serves,
    wastedCount: worth.wastedCount,
    worthCount: worth.count,
  };
}

export async function OwnedArtifactCard({
  piece,
  scaler,
  catalog,
  locale,
  children,
}: {
  piece: OwnedArtifact;
  scaler: Scaler | null;
  catalog: Catalog;
  locale: string;
  /** What another page adds under the card — the changes tab's verdict. */
  children?: React.ReactNode;
}) {
  return (
    <OwnedArtifactCardView data={await ownedArtifactCardData(piece, scaler, catalog, locale)}>
      {children}
    </OwnedArtifactCardView>
  );
}
