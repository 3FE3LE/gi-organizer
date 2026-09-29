import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getDb, type Db } from '@/lib/db/client';
import type { Catalog } from '@/lib/data/catalog';
import type { ArtifactSlot } from '@/lib/data/types';
import type { MechanicIndex } from '@/lib/data/mechanics';
import { resolveAnnotations } from '@/lib/annotations/resolve';
import { seedRules } from '@/lib/annotations/seed-rules';
import type { AnnotationFile, ResolvedAnnotations } from '@/lib/annotations/types';
import { getBossDrops, getResinRates, getWeaponSources } from '@/lib/data/registry';
import { getProfileId, readInventory, readMaterialStock } from '@/lib/player/db';
import { readRoster } from '@/lib/player/characters';
import {
  goalLabel,
  readBuild,
  readBuilds,
  readBuildsFor,
  resolveBuildForSlot,
  type Build,
} from '@/lib/player/builds';
import { readDeployments, readTeams } from '@/lib/player/teams';
import { readTargets } from '@/lib/player/targets';
import { refinementResolver } from '@/lib/player/weapon-copies';
import { readWorldLevel } from '@/lib/player/world-level';

import { evaluate, type CharacterGear, type EvaluationInput } from './evaluate';
import {
  ASSUMED_TARGET,
  type DemandSource,
  type Progress,
  type Reason,
  type Schedule,
  computeDemand,
  scheduleNeeds,
  tallyDemand,
} from './materials';
import { cardProgress } from './card-progress';
import { estimateResin, type ResinEstimate } from './resin';
import {
  type BuildStats, type PieceFit, type PieceScore, buildStatsFor, fitOf, scorePiece,
} from './piece-score';
import {
  type BuildPriority,
  type SetSuggestion,
  type WeaponSuggestion,
  suggestSets,
  suggestWeapons,
} from './suggest';
import { type SetRequirement, effectiveSetPlan } from './set-fit';
import type { Rule, TeamRole } from './types';
import { isRecommendableSet, isRecommendableWeapon } from './rarity-floor';

/**
 * Assembles everything the engine needs: teams from the database, gear as
 * currently assigned, weapon stock, curated annotations, and the rules — seeded
 * from the annotations plus whatever the user wrote.
 */

const CURATED = path.join(process.cwd(), 'src', 'data', 'curated', 'annotations.json');
const BUILDS = path.join(process.cwd(), 'src', 'generated', 'data', 'builds.json');
const MECHANICS = path.join(process.cwd(), 'src', 'generated', 'data', 'core', 'mechanics.json');

let mechanicFile: Promise<MechanicIndex> | undefined;

/** Mechanic membership, derived by `pnpm data:build` from the English text. */
export function getMechanics() {
  mechanicFile ??= readFile(MECHANICS, 'utf8').then((raw) => JSON.parse(raw) as MechanicIndex);
  return mechanicFile;
}

let annotationFile: Promise<AnnotationFile> | undefined;

function loadAnnotationFile() {
  // Outside `src/generated`, so `pnpm data:build` cannot delete it.
  annotationFile ??= readFile(CURATED, 'utf8').then((raw) => JSON.parse(raw) as AnnotationFile);
  return annotationFile;
}

/**
 * The curated annotations, merged and version-checked once.
 *
 * There are no user overrides yet, so the result is a pure function of a file
 * that is itself read once per process — and four call sites reach for it on a
 * single page (`assemble`, `suggestionsFor`, `readLoadout`, the teams page),
 * each of which was rebuilding three maps and re-scanning them for stale
 * entries. Keyed by game version so a dataset rebuild still produces a fresh
 * answer.
 */
const resolvedAnnotations = new Map<string, Promise<ResolvedAnnotations>>();

export function getAnnotations(catalog: Catalog): Promise<ResolvedAnnotations> {
  let pending = resolvedAnnotations.get(catalog.gameVersion);
  if (!pending) {
    pending = loadAnnotationFile()
      .then((file) => resolveAnnotations(file, {}, catalog.gameVersion));
    resolvedAnnotations.set(catalog.gameVersion, pending);
  }
  return pending;
}

let buildFile: Promise<Map<number, BuildPriority>> | undefined;

/** Candidate priorities, ids only. Refreshed by `pnpm data:builds`. */
export function getBuildPriorities() {
  buildFile ??= readFile(BUILDS, 'utf8')
    .then((raw) => JSON.parse(raw) as { entries: BuildPriority[] })
    .then((file) => new Map(file.entries.map((entry) => [entry.characterId, entry])))
    .catch(() => new Map<number, BuildPriority>());
  return buildFile;
}

export async function readUserRules(db: Db): Promise<{ rules: Rule[]; disabledSeeds: Set<string> }> {
  const rows = (await db
    .prepare('SELECT id, kind, enabled, severity, params_json, label FROM rule WHERE profile_id IS NOT NULL OR profile_id = ?')
    .all(await getProfileId(db))) as unknown as {
      id: string; kind: string; enabled: number; severity: string;
      params_json: string; label: string;
    }[];

  const rules: Rule[] = [];
  const disabledSeeds = new Set<string>();

  for (const row of rows) {
    // A disabled seed rule is stored as a row rather than a deletion, so
    // regenerating the seed does not resurrect it.
    if (row.id.startsWith('seed:')) {
      if (row.enabled === 0) disabledSeeds.add(row.id);
      continue;
    }

    rules.push({
      ...(JSON.parse(row.params_json) as Rule),
      id: row.id,
      enabled: row.enabled === 1,
      severity: row.severity as Rule['severity'],
      label: row.label,
      source: 'user',
    } as Rule);
  }

  return { rules, disabledSeeds };
}

export async function assemble(catalog: Catalog, db: Db = getDb()) {
  const profileId = await getProfileId(db);
  const annotations = await getAnnotations(catalog);
  const { rules: userRules, disabledSeeds } = await readUserRules(db);

  const teams = await readTeams(db);
  const deployments = await readDeployments(db);

  const gear = await readGearByCharacter(db, profileId);
  const stock = await readWeaponStock(db, profileId);
  const refinements = await refinementResolver(db);

  const input: EvaluationInput = {
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      mode: team.mode,
      slots: team.slots.map((slot) => ({
        characterId: slot.characterId,
        roles: slot.roles,
        declarations: slot.declarations,
      })),
    })),
    deployments: deployments.map((deployment) => ({
      id: deployment.id,
      mode: deployment.mode,
      teamIds: deployment.teamIds,
      theater: deployment.theater ?? undefined,
    })),
    gear,
    stock,
    targets: new Map(
      [...await readTargets(db)].map(([characterId, target]) => [
        characterId,
        {
          weaponId: target.weaponId,
          // Off the copy, not the stored number — see `rules/refinement.ts`.
          refinement: target.weaponId === null
            ? target.refinement
            : refinements.resolve(characterId, target.weaponId, target.refinement),
        },
      ]),
    ),
    characters: new Map(
      [...catalog.characters.values()].map((character) => [
        character.id, { elementType: character.elementType },
      ]),
    ),
    tags: {
      ofCharacter: (id) => annotations.characters.get(id)?.mechanics ?? [],
      ofArtifactSet: (id) => annotations.sets.get(id)?.mechanics ?? [],
      ofWeapon: (id) => annotations.weapons.get(id)?.mechanics ?? [],
    },
    // Not the rules that split an aura by an element the player declares —
    // Viridescent's shred, say. What that shred is worth depends on an enemy
    // and its resistances, and the app models neither, so the declaration was
    // a question with nothing to answer it for. The aura panel still says
    // when a second copy of a set is on the team.
    rules: [...seedRules(annotations, disabledSeeds), ...userRules]
      .filter((rule) => !(rule.kind === 'non-stacking' && rule.partition.by === 'declaration')),
  };

  return { input, annotations, teams, deployments, result: evaluate(input) };
}

async function readGearByCharacter(db: Db, profileId: string) {
  const artifacts = (await db
    .prepare(`SELECT assigned_character_id AS characterId, slot, set_id AS setId
              FROM artifact_instance
              WHERE profile_id = ? AND assigned_character_id IS NOT NULL`)
    .all(profileId)) as unknown as { characterId: number; slot: string; setId: number }[];

  const weapons = (await db
    .prepare(`SELECT assigned_character_id AS characterId, id AS instanceId,
                     weapon_id AS weaponId, refinement
              FROM weapon_instance
              WHERE profile_id = ? AND assigned_character_id IS NOT NULL`)
    .all(profileId)) as unknown as {
      characterId: number; instanceId: string; weaponId: number; refinement: number;
    }[];

  const gear = new Map<number, CharacterGear>();

  for (const row of artifacts) {
    const entry = gear.get(row.characterId) ?? { sets: new Map(), weapon: null };
    entry.sets.set(row.slot as ArtifactSlot, row.setId);
    gear.set(row.characterId, entry);
  }

  for (const row of weapons) {
    const entry = gear.get(row.characterId) ?? { sets: new Map(), weapon: null };
    entry.weapon = {
      instanceId: row.instanceId, weaponId: row.weaponId, refinement: row.refinement,
    };
    gear.set(row.characterId, entry);
  }

  return gear;
}

async function readWeaponStock(db: Db, profileId: string) {
  const rows = (await db
    .prepare(`SELECT weapon_id AS weaponId, refinement, COUNT(*) AS count
              FROM weapon_instance WHERE profile_id = ?
              GROUP BY weapon_id, refinement`)
    .all(profileId)) as unknown as { weaponId: number; refinement: number; count: number }[];

  return new Map(
    rows.map((row) => [`${row.weaponId}|${row.refinement}`, row]),
  );
}

export type ScoredPiece = PieceScore & {
  instanceId: string;
  /** The same score, as the cards draw it. See `FitIcons`. */
  fit: PieceFit;
};

export type Suggestions = {
  /** The target this was measured against, when the player authored one. */
  build: Build | null;
  /** Every build the character has, for the picker. */
  builds: Build[];
  sets: SetSuggestion[];
  /**
   * The sets every swap was measured against: the build's own plan, or the
   * one "fill from the role" would write when it has none. See
   * `effectiveSetPlan` — one answer, so the build tab, the queue and the
   * chain cannot each hold a character to different sets.
   */
  setPlan: SetRequirement[];
  weapons: WeaponSuggestion[];
  /** What the build wants per slot, so the UI can say why a piece ranks. */
  stats: BuildStats;
  /** Owned pieces ranked against the build, best first, per slot. */
  pieces: Map<ArtifactSlot, ScoredPiece[]>;
};

/**
 * Ranks the pieces the player owns for one character.
 *
 * Set membership is deliberately not part of the score. Four pieces of a set is
 * a constraint the set suggestions handle; this answers the other half — given
 * this slot, which of the pieces in the box actually serves the build.
 */
async function scoreOwnedPieces(
  db: Db,
  profileId: string,
  characterId: number,
  stats: BuildStats,
) {
  const rows = (await db
    .prepare(`SELECT id, slot, rarity, level, main_prop, substats_json, unactivated_json
              FROM artifact_instance
              WHERE profile_id = ?
                AND (assigned_character_id IS NULL OR assigned_character_id = ?)`)
    .all(profileId, characterId)) as unknown as {
      id: string; slot: string; rarity: number; level: number;
      main_prop: string; substats_json: string; unactivated_json: string | null;
    }[];

  const bySlot = new Map<ArtifactSlot, ScoredPiece[]>();

  for (const row of rows) {
    const slot = row.slot as ArtifactSlot;
    const scored = scorePiece({
      slot,
      rarity: row.rarity,
      level: row.level,
      mainProp: row.main_prop,
      // The locked fourth line counts: it has rolled, and nothing can change
      // it — reaching +4 only unlocks it. See `ComparablePiece.unactivated`.
      substats: [
        ...JSON.parse(row.substats_json) as { prop: string; value: number }[],
        ...(row.unactivated_json ? JSON.parse(row.unactivated_json) as { prop: string; value: number }[] : []),
      ],
    }, stats);

    const fit = fitOf(scored, { slot, mainProp: row.main_prop }, stats);
    bySlot.set(slot, [...(bySlot.get(slot) ?? []), { ...scored, instanceId: row.id, fit }]);
  }

  for (const pieces of bySlot.values()) pieces.sort((a, b) => b.score - a.score);
  return bySlot;
}

/**
 * Ranked alternatives for one character, aware of the teams they are in.
 *
 * The upstream list ranks in a vacuum; everything that makes this a suggestion
 * rather than a repeat happens here — what is free in the box, and what the
 * rest of the team already supplies.
 */
export async function suggestionsFor(
  characterId: number,
  catalog: Catalog,
  db: Db = getDb(),
  /**
   * Which of the character's builds to measure against. The build screen lets
   * the player pick; everywhere else the team slot's role decides, which is
   * what `null` means.
   */
  buildId: string | null = null,
): Promise<Suggestions> {
  const profileId = await getProfileId(db);
  const [annotations, priorities, weaponSources] = await Promise.all([
    getAnnotations(catalog),
    getBuildPriorities(),
    getWeaponSources(),
  ]);

  const { rules: userRules, disabledSeeds } = await readUserRules(db);
  const rules = [...seedRules(annotations, disabledSeeds), ...userRules];
  const mechanics = await getMechanics();

  const teams = (await readTeams(db)).filter((team) =>
    team.slots.some((slot) => slot.characterId === characterId));

  // One objective per character: if they are in two teams with different
  // purposes, neither can claim the suggestion, so neither does.
  const objectives = [...new Set(teams.map((team) => team.objective).filter(Boolean))];
  const objective = objectives.length === 1 ? objectives[0]! : null;

  const teamMembers = [...new Set(teams.flatMap((team) =>
    team.slots.map((slot) => slot.characterId)))];

  const roles = new Map<number, TeamRole[]>();
  for (const team of teams) {
    for (const slot of team.slots) roles.set(slot.characterId, slot.roles);
  }

  // The player's own statement about this character in this team, which
  // outranks any external ordering.
  const declaredRoles = roles.get(characterId) ?? [];
  const targets = await readTargets(db);
  const pinnedSetIds = targets.get(characterId)?.setIds ?? [];

  const freeSlotsBySet = new Map<number, Set<ArtifactSlot>>();
  const freeRows = (await db
    .prepare(`SELECT DISTINCT set_id, slot FROM artifact_instance
              WHERE profile_id = ? AND assigned_character_id IS NULL`)
    .all(profileId)) as unknown as { set_id: number; slot: string }[];

  for (const row of freeRows) {
    const slots = freeSlotsBySet.get(row.set_id) ?? new Set<ArtifactSlot>();
    slots.add(row.slot as ArtifactSlot);
    freeSlotsBySet.set(row.set_id, slots);
  }

  const stock = new Map<string, number>();
  for (const [key, entry] of await readWeaponStock(db, profileId)) stock.set(key, entry.count);

  // A copy another build is planning on is not spare, even if it is unequipped.
  const claimedByOthers = new Map<number, number>();
  const claim = (weaponId: number | null) => {
    if (weaponId === null) return;
    claimedByOthers.set(weaponId, (claimedByOthers.get(weaponId) ?? 0) + 1);
  };

  for (const [otherId, target] of targets) {
    if (otherId !== characterId) claim(target.weaponId);
  }
  for (const other of await readBuilds(db)) {
    if (other.characterId !== characterId) claim(other.weaponId);
  }

  // The player's own build is the target when there is one. The external list
  // only fills in for a character nobody has planned yet — measuring against a
  // stranger's priorities when the player stated their own would answer the
  // wrong question.
  const builds = await readBuildsFor(characterId, db);
  const chosen = buildId ? await readBuild(buildId, db) : null;
  const build = chosen?.characterId === characterId
    ? chosen
    : await resolveBuildForSlot(characterId, declaredRoles, null, db);

  const stats: BuildStats = build
    ? {
        mainStatsBySlot: new Map(
          Object.entries(build.mainStats) as [ArtifactSlot, string[]][],
        ),
        substats: build.substats,
      }
    : buildStatsFor(priorities.get(characterId));

  // A build's set plan is a statement of intent, so it pins like a pin.
  const planned = build?.setPlan.flatMap((plan) => plan.setIds) ?? [];

  // Pinned is the player's word and survives; see `rarity-floor.ts`.
  const sets = suggestSets({
    characterId,
    teamMembers,
    declaredRoles,
    pinnedSetIds: [...new Set([...pinnedSetIds, ...planned])],
    allSetIds: [...catalog.artifacts.keys()],
    priorities,
    gear: await readGearByCharacter(db, profileId),
    freeSlotsBySet,
    rules,
    roles,
    setRoles: new Map(
      [...annotations.sets].map(([setId, annotation]) => [setId, annotation.roles ?? []]),
    ),
    objective: build?.objective ?? objective,
    setMechanics: new Map(
      Object.entries(mechanics.artifactSets).map(([setId, tags]) => [Number(setId), tags]),
    ),
  }).filter((suggestion) =>
    suggestion.reasons.some((reason) => reason.kind === 'pinned')
    || suggestion.setIds.every((setId) => isRecommendableSet(catalog, setId)));

  // Measured against a plan even when the player has not written one down: a
  // build with no sets is not a build that accepts every set, and treating it
  // as one is what put random-set pieces at the top of its swaps.
  const setPlan = effectiveSetPlan(build?.setPlan, sets);


  return {
    build,
    builds,
    stats,
    pieces: await scoreOwnedPieces(db, profileId, characterId, stats),
    sets,
    setPlan,
    weapons: suggestWeapons(
      characterId, priorities, stock, claimedByOthers,
      // Only what this character can hold; the catalog knows, the schema cannot.
      (catalog.index.weaponsByType.get(
        catalog.characters.get(characterId)?.weaponType ?? '',
      ) ?? []).map((weapon) => weapon.id),
      weaponSources,
    ).filter((suggestion) => isRecommendableWeapon(catalog, suggestion.weaponId)),
  };
}

/**
 * What the farming plan is allowed to count.
 *
 * Every field narrows: an absent one means no restriction. The filters live
 * here rather than in the page because a page that filters rendered rows still
 * pays for the demand it throws away, and because "only this team" has to
 * change the totals, not just hide lines.
 */
export type FarmingFilter = {
  /** Only these characters contribute demand. */
  characterIds?: ReadonlySet<number>;
  /** Only these kinds of cost are counted. */
  reasons?: ReadonlySet<Reason>;
  /**
   * Count owned characters with no stated target as if they were headed for
   * the cap.
   *
   * On by default. Sixty characters with nothing written down still have sixty
   * characters' worth of demand, and answering "you have not said" made the
   * planner useless until the player had typed a target sixty times. The
   * assumption is only defensible because it can be refused: a dismissed
   * character contributes nothing, whatever this says.
   */
  includeWithoutTarget?: boolean;
};

/**
 * What some demand costs in resin, at the account's world level.
 *
 * Shared by the plan and the build's cost panel, so the two cannot price the
 * same books differently. It reads the unfiltered tally: the covered tiers are
 * what a surplus crafts from — see `tallyDemand`.
 */
export async function resinEstimateFor(
  catalog: Catalog,
  sources: DemandSource[],
  stock: Map<number, number>,
  db: Db = getDb(),
): Promise<ResinEstimate> {
  const [rates, bosses, worldLevel] = await Promise.all([
    getResinRates(), getBossDrops(), readWorldLevel(db),
  ]);

  return estimateResin({
    demand: tallyDemand(sources, stock),
    stock,
    materials: catalog.materials,
    bosses,
    rates,
    worldLevel,
  });
}

/**
 * The farming plan: what every build still needs, and where it drops.
 *
 * Demand is the gap between where a character is and where their build says
 * they should be, so a build with no levelling target contributes nothing —
 * silence rather than an assumed ninety, unless the caller asks for the
 * assumption explicitly.
 */
export async function farmingPlan(
  catalog: Catalog,
  db: Db = getDb(),
  filter: FarmingFilter = {},
): Promise<{
  schedule: Schedule;
  sources: number;
  /** Everyone on the roster, with what the plan is doing about each. */
  roster: {
    characterId: number;
    hasTarget: boolean;
    dismissed: boolean;
    /** A talent is still short of where it is headed — see `cardProgress`. */
    talentsShort: boolean;
  }[];
  /** How many the player has said no to, which is the list's own undo. */
  dismissed: number;
  /** The least resin the same demand costs. */
  resin: ResinEstimate;
}> {
  const profileId = await getProfileId(db);
  const builds = await readBuilds(db);
  const roster = new Map(
    (await readRoster(db, profileId)).map((entry) => [entry.characterId, entry]),
  );
  const stock = await readMaterialStock(db, profileId);

  const wants = (characterId: number) =>
    !filter.characterIds || filter.characterIds.has(characterId);
  const counts = (reason: Reason) => !filter.reasons || filter.reasons.has(reason);
  const assume = filter.includeWithoutTarget ?? true;

  const weaponsOwned = new Map<number, number>();
  const heldBy = new Map<number, number>();
  for (const weapon of (await readInventory(db, profileId)).weapons) {
    weaponsOwned.set(weapon.weaponId, Math.max(weaponsOwned.get(weapon.weaponId) ?? 0, weapon.ascension));
    if (weapon.equippedTo !== null) heldBy.set(weapon.equippedTo, weapon.weaponId);
  }

  // A character is levelled once. The target now lives on the roster row for
  // exactly that reason, so demand reads it there instead of reconciling one
  // copy per goal.
  const byCharacter = new Map<number, DemandSource>();

  for (const current of roster.values()) {
    // A refusal outranks both the target and the assumption: somebody who
    // looked at this character and said no is not asking what to farm for them.
    if (current.dismissedAt !== null) continue;

    const wanted = current.target;
    const stated = wanted.level !== null || wanted.talents !== null;
    if (!stated && !assume) continue;
    if (!wants(current.characterId)) continue;

    const character = catalog.characters.get(current.characterId);
    if (!character) continue;

    // What an unstated half of a target falls back to: the cap when the caller
    // asked for the assumption, otherwise where the character already is —
    // which costs nothing and so says nothing.
    const here: Progress = {
      level: current.level, ascension: current.ascension, talents: current.talent,
    };
    const fallback = assume ? ASSUMED_TARGET : here;

    byCharacter.set(current.characterId, {
      characterId: current.characterId,
      buildName: catalog.characters.get(current.characterId)?.name ?? `#${current.characterId}`,
      assumed: !stated,
      current: here,
      target: {
        level: wanted.level ?? fallback.level,
        ascension: wanted.ascension ?? fallback.ascension,
        talents: wanted.talents ?? fallback.talents,
      },
      ascensionCosts: counts('ascension') ? character.costs : {},
      talentCosts: counts('talent') ? character.talentCosts : {},
      weapon: null,
    });
  }

  // Weapons are the exception: two builds planning different weapons really do
  // need both ascended. Deduped by weapon, not by character.
  const plannedWeapons = new Map<number, { weaponId: number; characterId: number; buildName: string }>();
  for (const build of builds) {
    if (!counts('weapon')) break;
    if (build.weaponId === null || !weaponsOwned.has(build.weaponId)) continue;
    // Only for someone the plan counts. `byCharacter` has already been through
    // the dismissals, the scope and the target assumption; checking the scope
    // alone here let a dismissed character's weapon back in by this route.
    if (!byCharacter.has(build.characterId)) continue;
    if (!plannedWeapons.has(build.weaponId)) {
      plannedWeapons.set(build.weaponId, {
        weaponId: build.weaponId,
        characterId: build.characterId,
        buildName: goalLabel(build),
      });
    }
  }

  // The weapon somebody is already holding, when no goal names one.
  //
  // Same assumption as the levelling: a character equipped with a weapon is a
  // character whose plan is that weapon, and waiting for the player to write
  // that down left the ore and the ascension materials out of a plan that had
  // already committed to the character. `byCharacter` has been through the
  // dismissals and the scope filter, so this inherits both.
  if (counts('weapon')) {
    for (const source of byCharacter.values()) {
      const weaponId = heldBy.get(source.characterId);
      if (weaponId === undefined || plannedWeapons.has(weaponId)) continue;
      if (!weaponsOwned.has(weaponId)) continue;

      plannedWeapons.set(weaponId, {
        weaponId,
        characterId: source.characterId,
        buildName: source.buildName,
      });
    }
  }

  const sources: DemandSource[] = [
    ...byCharacter.values(),
    ...[...plannedWeapons.values()].flatMap((planned): DemandSource[] => {
      const definition = catalog.weapons.get(planned.weaponId);
      if (!definition) return [];

      return [{
        characterId: planned.characterId,
        buildName: planned.buildName,
        current: { level: 1, ascension: 0, talents: { auto: 1, skill: 1, burst: 1 } },
        target: { level: 1, ascension: 0, talents: { auto: 1, skill: 1, burst: 1 } },
        ascensionCosts: {},
        talentCosts: {},
        weapon: {
          weaponId: definition.id,
          costs: definition.costs,
          ascension: weaponsOwned.get(definition.id) ?? 0,
          target: 6,
        },
      }];
    }),
  ];

  const metadata = new Map(
    [...catalog.materials.values()].map((material) => [
      material.id,
      { domain: material.domain, days: material.days, domainName: material.domainName },
    ]),
  );

  return {
    schedule: scheduleNeeds(computeDemand(sources, stock), metadata),
    sources: sources.length,
    resin: await resinEstimateFor(catalog, sources, stock, db),
    roster: [...roster.values()].map((entry) => ({
      characterId: entry.characterId,
      hasTarget: entry.target.level !== null || entry.target.talents !== null,
      dismissed: entry.dismissedAt !== null,
      // No days needed for this half of the reading: whether a book is short
      // does not depend on which domain is open.
      talentsShort: cardProgress(entry, new Set(), 'Sunday').talentsShort,
    })),
    dismissed: [...roster.values()].filter((entry) => entry.dismissedAt !== null).length,
  };
}

