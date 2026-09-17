import 'server-only';

import { getTranslations } from 'next-intl/server';

import { propLabel } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import {
  artifactCandidates,
  weaponCandidates,
  type GearPiece,
  type GearWeapon,
} from '@/lib/player/queries';

import type { BuildContext } from './context';
import type { CandidateView, SlotView } from './gear-slot';

/**
 * One slot, with the pieces that could fill it.
 *
 * Built per slot and on demand: scoring and resolving an icon for every
 * candidate in the box is most of what this page could cost, and the player
 * opens one slot at a time. It used to be built for all six on every render of
 * a tab that existed only to show them.
 *
 * The rule that keeps the lists readable is the same for weapons and artifacts:
 * free pieces always, and something already on another character only when it
 * advances this build's set plan. Every other worn piece is a displacement that
 * buys nothing here, and hundreds of them bury the pieces that are free.
 */
export function gearSlotFor(context: BuildContext, key: string): Promise<SlotView | null> {
  if (key === 'weapon') return weaponSlot(context);
  if ((ARTIFACT_SLOTS as readonly string[]).includes(key)) {
    return artifactSlot(context, key as (typeof ARTIFACT_SLOTS)[number]);
  }
  return Promise.resolve(null);
}

async function candidateViews(context: BuildContext) {
  const { catalog, suggestions, format } = context;
  const t = await getTranslations('build');

  // How well each owned piece serves this build, so the slot list is ordered by
  // usefulness rather than by rarity. Set membership is not part of it: a
  // better off-set piece is still a better piece.
  const scoreById = new Map(
    [...suggestions.pieces.values()].flat().map((piece) => [piece.instanceId, piece]),
  );

  const pieceView = async (piece: GearPiece): Promise<CandidateView> => {
    const set = catalog.artifacts.get(piece.setId);
    const scored = scoreById.get(piece.id);

    const fit = scored
      ? [
          scored.mainStatWanted === false ? t('mainStatOff') : null,
          scored.mainStatWanted === true ? 'main stat ok' : null,
          t('usefulRolls', { score: scored.score.toFixed(1) }),
        ].filter(Boolean).join(' · ')
      : null;

    return {
      id: piece.id,
      label: set?.name ?? `#${piece.setId}`,
      detail: `+${piece.level} ${propLabel(catalog, piece.mainProp)}`,
      fit,
      score: scored?.score ?? 0,
      icon: await resolveIcon(set?.pieces[piece.slot]?.icon, 'relic'),
      holder: format.holderName(piece.equippedTo),
      holderId: piece.equippedTo,
      stats: format.artifactStats(piece),
    };
  };

  const weaponView = async (weapon: GearWeapon): Promise<CandidateView> => {
    const definition = catalog.weapons.get(weapon.weaponId);

    return {
      id: weapon.id,
      label: definition?.name ?? `#${weapon.weaponId}`,
      detail: `Lv${weapon.level} R${weapon.refinement}`,
      fit: null,
      score: 0,
      icon: await resolveIcon(definition?.icon, 'weapon'),
      holder: format.holderName(weapon.equippedTo),
      holderId: weapon.equippedTo,
      stats: format.weaponStats(weapon),
    };
  };

  return { pieceView, weaponView };
}

async function artifactSlot(
  context: BuildContext,
  slot: (typeof ARTIFACT_SLOTS)[number],
): Promise<SlotView> {
  const { db, gear, characterId, plannedSetIds } = context;
  const { pieceView } = await candidateViews(context);
  const slotLabel = await getTranslations('common.slot');

  const equipped = gear.bySlot.get(slot) ?? null;
  const free = await artifactCandidates(slot, { limit: 40 }, db);
  const taken = (await artifactCandidates(slot, { includeAssigned: true, limit: 60 }, db))
    .filter((piece) => piece.equippedTo !== null && piece.equippedTo !== characterId);

  const worthTaking = taken.filter((piece) => plannedSetIds.has(piece.setId));

  return {
    key: slot,
    title: slotLabel.has(slot) ? slotLabel(slot) : slot,
    kind: 'artifact',
    equipped: equipped ? await pieceView(equipped) : null,
    candidates: (await Promise.all([...free, ...worthTaking].map(pieceView)))
      .sort((a, b) => b.score - a.score),
    hiddenInUse: taken.length - worthTaking.length,
  };
}

async function weaponSlot(context: BuildContext): Promise<SlotView> {
  const { catalog, character, characterId, db, gear, suggestions, target } = context;
  const { weaponView } = await candidateViews(context);

  // Only weapons this character can hold. The catalog knows; the schema cannot.
  const usableWeaponIds = (catalog.index.weaponsByType.get(character.weaponType) ?? [])
    .map((weapon) => weapon.id);

  const free = await weaponCandidates(usableWeaponIds, { limit: 40 }, db);
  const taken = (await weaponCandidates(usableWeaponIds, { includeAssigned: true, limit: 60 }, db))
    .filter((weapon) => weapon.equippedTo !== null && weapon.equippedTo !== characterId);

  // Same rule as artifacts: taking a weapon off someone else only earns a place
  // in the list when it is the one this build or target names.
  const wanted = new Set(
    [suggestions.build?.weaponId, target.weaponId].filter((id) => id !== null),
  );
  const worthTaking = taken.filter((weapon) => wanted.has(weapon.weaponId));

  return {
    key: 'weapon',
    title: character.weaponText,
    kind: 'weapon',
    equipped: gear.weapon ? await weaponView(gear.weapon) : null,
    candidates: await Promise.all([...free, ...worthTaking].map(weaponView)),
    hiddenInUse: taken.length - worthTaking.length,
  };
}
