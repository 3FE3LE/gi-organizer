import { statLabel, type Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import { formatPropValue } from '@/lib/data/props';
import { statsAtLevel } from '@/lib/data/stats';
import type { ArtifactSlot } from '@/lib/data/types';
import type { GearWeapon } from '@/lib/player/queries';
import type { Suggestions } from '@/lib/rules/assemble';
import { rollsOf } from '@/lib/rules/piece-score';
import { mainStatValue } from '@/lib/rules/stats';

import type { PieceStats, StatLine } from './piece-stats';

/**
 * How one piece of gear reads: its numbers, and which of them this build wants.
 *
 * The "wanted" flag is the whole point of the module. A substat list without it
 * is a piece's stats; with it, it is an argument — and the gear tab and the
 * swaps tab have to make the same argument about the same piece, which they did
 * not when each built its own rows.
 */
export type PieceFormatter = {
  artifactStats: (piece: {
    slot: ArtifactSlot;
    rarity: number;
    level: number;
    mainProp: string;
    substats: { prop: string; value: number }[];
  }) => PieceStats;
  weaponStats: (weapon: GearWeapon) => PieceStats | null;
  /** Who is wearing it, or null when nobody else is. */
  holderName: (holder: number | null) => string | null;
};

export function pieceFormatter({
  catalog,
  locale,
  characterId,
  suggestions,
}: {
  catalog: Catalog;
  locale: Locale;
  characterId: number;
  suggestions: Suggestions;
}): PieceFormatter {
  const wantedSubstats = new Set(suggestions.stats.substats);

  const statLine = (
    prop: string,
    value: number,
    rolls: number | null,
    wanted: boolean,
    scale: 'percent' | 'ratio' = 'percent',
  ): StatLine => ({
    prop,
    // `statLabel`, not `propLabel`: a comparison table listing "ATQ" twice —
    // once for the sands' 46.6% and once for a 33-point roll — is the one
    // place the game's naming collision actually costs a decision.
    label: statLabel(catalog, prop),
    text: formatPropValue(prop, value, scale, locale),
    value,
    rolls,
    wanted,
  });

  const artifactStats: PieceFormatter['artifactStats'] = (piece) => ({
    main: statLine(
      piece.mainProp,
      mainStatValue(piece.mainProp, piece.rarity, piece.level),
      null,
      (suggestions.stats.mainStatsBySlot.get(piece.slot) ?? []).includes(piece.mainProp),
    ),
    substats: piece.substats.map((substat) =>
      statLine(
        substat.prop,
        substat.value,
        rollsOf(substat.prop, substat.value, piece.rarity),
        wantedSubstats.has(substat.prop),
      ),
    ),
  });

  // A weapon has no substats, so its two numbers stand in: base ATK as the main
  // line, the secondary stat below it. Both come from the table at its own
  // level, which is what makes two candidates comparable.
  const weaponStats: PieceFormatter['weaponStats'] = (weapon) => {
    const definition = catalog.weapons.get(weapon.weaponId);
    if (!definition) return null;

    const stats = statsAtLevel(definition.stats, weapon.level, weapon.ascension);

    return {
      main: statLine('FIGHT_PROP_ATTACK', stats.attack ?? 0, null, false),
      substats: definition.mainStatType
        ? [statLine(
            definition.mainStatType,
            stats.specialized ?? 0,
            null,
            wantedSubstats.has(definition.mainStatType),
            'ratio',
          )]
        : [],
    };
  };

  const holderName: PieceFormatter['holderName'] = (holder) =>
    holder === null || holder === characterId
      ? null
      : catalog.characters.get(holder)?.name ?? `#${holder}`;

  return { artifactStats, weaponStats, holderName };
}
