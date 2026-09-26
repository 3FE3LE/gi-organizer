import 'server-only';

import { getTranslations } from 'next-intl/server';

import { formatSetEffect, setEffects, statLabel } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import {
  artifactCandidates,
  weaponCandidates,
  type GearPiece,
  type GearWeapon,
} from '@/lib/player/queries';
import { readArtifacts } from '@/lib/player/artifacts';
import { MIN_ARTIFACT_RARITY, isRecommendableWeapon } from '@/lib/rules/rarity-floor';

import { ownedArtifactCardData } from '../../artifacts/artifact-card';

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
  const { catalog, db, locale, suggestions, format } = context;
  const t = await getTranslations('build');

  // The box's own read, so each candidate is drawn with the artifacts page's
  // card — rolls, tiers and all — rather than a row of its own. Read once per
  // slot, and only for an artifact slot.
  let box: Map<string, Awaited<ReturnType<typeof readArtifacts>>[number]> | null = null;
  const owned = async (id: string) => {
    box ??= new Map((await readArtifacts(db)).map((piece) => [piece.instanceId, piece]));
    return box.get(id) ?? null;
  };

  // How well each owned piece serves this build, so the slot list is ordered by
  // usefulness rather than by rarity. Set membership is not part of it: a
  // better off-set piece is still a better piece.
  const scoreById = new Map(
    [...suggestions.pieces.values()].flat().map((piece) => [piece.instanceId, piece]),
  );

  const pieceView = async (piece: GearPiece): Promise<CandidateView> => {
    const set = catalog.artifacts.get(piece.setId);
    const scored = scoreById.get(piece.id);
    const inBox = await owned(piece.id);

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
      detail: `+${piece.level} ${statLabel(catalog, piece.mainProp)}`,
      fit,
      fitParts: scored?.fit ?? null,
      setId: piece.setId,
      mainProp: piece.mainProp,
      score: scored?.score ?? 0,
      icon: await resolveIcon(set?.pieces[piece.slot]?.icon, 'relic'),
      holder: format.holderName(piece.equippedTo),
      holderId: piece.equippedTo,
      stats: format.artifactStats(piece),
      card: inBox ? await ownedArtifactCardData(inBox, null, catalog, locale) : null,
      refinement: null,
      passive: null,
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
      fitParts: null,
      setId: null,
      mainProp: null,
      stats: format.weaponStats(weapon),
      card: null,
      refinement: weapon.refinement,
      passive: definition?.effectName
        ? { name: definition.effectName, refinements: definition.refinementsRaw ?? definition.refinements }
        : null,
    };
  };

  return { pieceView, weaponView };
}

async function artifactSlot(
  context: BuildContext,
  slot: (typeof ARTIFACT_SLOTS)[number],
): Promise<SlotView> {
  const { catalog, db, gear, characterId, locale, plannedSetIds, suggestions } = context;
  const { pieceView } = await candidateViews(context);
  const slotLabel = await getTranslations('common.slot');

  const equipped = gear.bySlot.get(slot) ?? null;
  // Four-stars never make the list — see `rarity-floor.ts`. What is worn
  // still shows in the header, whatever it is.
  //
  // Every piece of the slot, not the top of it. This took the forty highest
  // levelled free pieces and the dialog filtered those by set, so a set with
  // its pieces still at +0 offered one or none while the box held a dozen.
  // Every piece is already scored, and the dialog draws them as it scrolls.
  const pieces = await artifactCandidates(
    slot,
    { includeAssigned: true, minRarity: MIN_ARTIFACT_RARITY },
    db,
  );
  const free = pieces.filter((piece) => piece.equippedTo === null);
  const taken = pieces.filter((piece) => piece.equippedTo !== null && piece.equippedTo !== characterId);

  const worthTaking = taken.filter((piece) => plannedSetIds.has(piece.setId));

  const candidates = (await Promise.all([...free, ...worthTaking].map(pieceView)))
    .sort((a, b) => b.score - a.score);

  // The dialog's set strip: the sets these candidates come in, each drawn as
  // its piece for this very slot. The sets the character already wears the
  // most of lead — the swap that keeps a bonus is the one looked for first —
  // and then the most on offer.
  const worn = new Map<number, number>();
  for (const piece of gear.bySlot.values()) {
    if (piece) worn.set(piece.setId, (worn.get(piece.setId) ?? 0) + 1);
  }
  const bySet = new Map<number, { icon: string | null; count: number }>();
  for (const candidate of candidates) {
    if (candidate.setId === null) continue;
    const entry = bySet.get(candidate.setId) ?? { icon: candidate.icon, count: 0 };
    entry.count += 1;
    bySet.set(candidate.setId, entry);
  }
  const sets = [...bySet].map(([setId, entry]) => {
    const set = catalog.artifacts.get(setId);
    return {
      setId,
      name: set?.name ?? `#${setId}`,
      icon: entry.icon,
      effects: setEffects(set).map(formatSetEffect),
      count: entry.count,
    };
  }).sort((a, b) =>
    (worn.get(b.setId) ?? 0) - (worn.get(a.setId) ?? 0)
    || b.count - a.count
    || a.name.localeCompare(b.name, locale));

  return {
    key: slot,
    title: slotLabel.has(slot) ? slotLabel(slot) : slot,
    kind: 'artifact',
    equipped: equipped ? await pieceView(equipped) : null,
    candidates,
    hiddenInUse: taken.length - worthTaking.length,
    sets,
    preferredMain: suggestions.stats.mainStatsBySlot.get(slot)?.[0] ?? null,
  };
}

async function weaponSlot(context: BuildContext): Promise<SlotView> {
  const { catalog, character, characterId, db, gear, suggestions, target } = context;
  const { weaponView } = await candidateViews(context);

  // Only weapons this character can hold. The catalog knows; the schema cannot.
  // Nor three-stars, which are a stopgap and not a choice.
  const usableWeaponIds = (catalog.index.weaponsByType.get(character.weaponType) ?? [])
    .map((weapon) => weapon.id)
    .filter((weaponId) => isRecommendableWeapon(catalog, weaponId));

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
    sets: [],
    preferredMain: null,
  };
}
