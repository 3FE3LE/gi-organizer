import 'server-only';

import type { Catalog } from '@/lib/data/catalog';
import { elementDamageProp } from '@/lib/data/elements';
import {
  getBossDrops,
  getCharacterDetailStrings,
  getInvestConfig,
  getLevellingData,
  getResinRates,
} from '@/lib/data/registry';
import { statsAtLevel } from '@/lib/data/stats';
import { getDb, type Db } from '@/lib/db/client';
import { readBuildsFor } from '@/lib/player/builds';
import { readRoster } from '@/lib/player/characters';
import { getProfileId, readMaterialStock } from '@/lib/player/db';
import { readInvestStrategy } from '@/lib/player/invest-strategy';
import { readLoadout } from '@/lib/player/loadout';
import { readTeams, type Team } from '@/lib/player/teams';
import { readWorldLevel } from '@/lib/player/world-level';

import { phaseForTalent } from './affordable';
import { getAnnotations, getBuildPriorities } from './assemble';
import {
  compound,
  kitScaler,
  proxy,
  proxyStats,
  rankSteps,
  relativeGain,
  roleWeight,
  talentMultipliers,
  talentShare,
  type InvestStep,
  type RankedStep,
  type Strategy,
  type TalentKey,
} from './invest';
import { ASSUMED_TARGET, tallyDemand, type CostsByPhase, type DemandSource, type Progress } from './materials';
import { estimateResin } from './resin';
import { computeStats } from './stats';
import type { TeamRole } from './types';
import { SCALER_PROPS } from './worth';

const MORA = 202;

/** A substat priority's scaler, as the total it grows. */
const SCALER_TOTALS: Record<string, string> = {
  [SCALER_PROPS.atk]: 'FIGHT_PROP_ATTACK',
  [SCALER_PROPS.hp]: 'FIGHT_PROP_HP',
  [SCALER_PROPS.def]: 'FIGHT_PROP_DEFENSE',
  [SCALER_PROPS.em]: 'FIGHT_PROP_ELEMENT_MASTERY',
};

export type InvestPackage = {
  characterId: number;
  /** Everything to the target, compounded. */
  gain: number;
  weightedGain: number;
  resin: number;
  mora: number;
  needsCrown: boolean;
};

export type InvestPlan = {
  strategy: Strategy;
  /** The mora in the bag, which a step with nothing to farm still has to be paid in. */
  mora: number;
  steps: RankedStep[];
  packages: InvestPackage[];
  /** For the strategy picker. */
  teams: { id: string; name: string }[];
  characters: number[];
  /**
   * Each character's weight in their team. Under a half they are there for
   * what they do for others, and a gain of theirs reads as potency — a buff
   * or a heal growing — rather than as damage.
   */
  weights: Record<number, number>;
  /** The weapon each character holds, for naming a weapon step. */
  weaponIds: Record<number, number>;
};

/**
 * The next level a character or weapon reaches: the next cap, ascending first
 * when at one. The target is a level *and* an ascension, so a character at 80
 * aimed at 80+ still has a step — the ascension — rather than reading as done.
 */
function nextMilestone(level: number, ascension: number, caps: number[], target: { level: number; ascension: number }) {
  if (level >= target.level && ascension >= target.ascension) return null;
  const cap = caps[ascension] ?? target.level;
  if (level < cap && level < target.level) return { level: Math.min(cap, target.level), ascension };
  if (ascension + 1 >= caps.length) return null;
  return { level: Math.min(caps[ascension + 1], Math.max(target.level, level)), ascension: ascension + 1 };
}

export async function investPlan(
  catalog: Catalog,
  db: Db = getDb(),
  options: { characterIds?: ReadonlySet<number>; strategy?: Strategy } = {},
): Promise<InvestPlan> {
  const profileId = await getProfileId(db);
  const [roster, teams, stock, levelling, config, rates, bosses, worldLevel, priorities, annotations, saved] =
    await Promise.all([
      readRoster(db, profileId),
      readTeams(db),
      readMaterialStock(db, profileId),
      getLevellingData(),
      getInvestConfig(),
      getResinRates(),
      getBossDrops(),
      readWorldLevel(db),
      getBuildPriorities(),
      getAnnotations(catalog),
      readInvestStrategy(db),
    ]);
  const strategy = options.strategy ?? saved;

  const planned = roster.filter((entry) =>
    options.characterIds ? options.characterIds.has(entry.characterId) : entry.dismissedAt === null);

  // What one step still costs in resin, after the bag: the same estimate the
  // plan's resin card makes, on a demand of one step.
  const priceOf = (source: DemandSource) => {
    const demand = tallyDemand([source], stock);
    const estimate = estimateResin({
      demand, stock, materials: catalog.materials, bosses, rates, worldLevel,
    });
    const mora = demand.find((need) => need.materialId === MORA);
    return { resin: estimate.total, mora: mora?.short ?? 0, moraCost: mora?.needed ?? 0 };
  };

  // EXP the books in the bag do not cover, as Blossoms of Revelation.
  const bookExp = levelling.characterExpItems.reduce((sum, item) => sum + (stock.get(item.id) ?? 0) * item.exp, 0);
  const expResin = (exp: number) => {
    const short = Math.max(0, exp - bookExp);
    const perBlossom = config.revelationExp[worldLevel] ?? config.revelationExp.at(-1)!;
    return Math.ceil(short / perBlossom) * rates.cost.blossom;
  };

  const rolesOf = (characterId: number): TeamRole[][] => teams
    .flatMap((team) => team.slots.filter((slot) => slot.characterId === characterId).map((slot) => slot.roles));

  const steps: InvestStep[] = [];
  const weaponIds: Record<number, number> = {};
  const packages: Omit<InvestPackage, 'weightedGain'>[] = [];

  for (const entry of planned) {
    const character = catalog.characters.get(entry.characterId);
    if (!character) continue;

    const loadout = await readLoadout(entry.characterId, catalog, db);
    if (!loadout) continue;
    const weaponDef = loadout.weapon ? catalog.weapons.get(loadout.weapon.weaponId) : undefined;

    const [builds, detail] = await Promise.all([
      readBuildsFor(entry.characterId, db),
      getCharacterDetailStrings('en', entry.characterId, catalog.characters.get(entry.characterId)?.elementType),
    ]);
    const combat = detail.talents?.combat ?? [];
    // The kit first; a substat priority only when the kit says nothing, and
    // never Elemental Mastery, which is a reaction's scaler and zero on a bare
    // character — the proxy's base cannot start from nothing.
    const substats = builds[0]?.substats.length ? builds[0].substats : priorities.get(entry.characterId)?.substats ?? [];
    const fromPriority = SCALER_TOTALS[substats.find((prop) => prop in SCALER_TOTALS && prop !== SCALER_PROPS.em) ?? ''];
    const scalerProp = kitScaler(combat.map((talent) => talent.attributes)) ?? fromPriority ?? 'FIGHT_PROP_ATTACK';
    const damageProp = elementDamageProp(character.elementType);

    const setCounts = new Map(loadout.setCounts);
    const setBonuses = [...setCounts]
      .filter(([, count]) => count >= 2)
      .flatMap(([setId]) => annotations.sets.get(setId)?.bonus2pc ?? []);

    const outputAt = (
      level: number, ascension: number,
      weaponLevel: number | null, weaponAscension: number | null,
    ) => {
      const stats = statsAtLevel(character.stats, level, ascension);
      const weaponStats = weaponDef && weaponLevel !== null && weaponAscension !== null
        ? statsAtLevel(weaponDef.stats, weaponLevel, weaponAscension)
        : null;
      const totals = computeStats({
        character: { hp: stats.hp ?? 0, attack: stats.attack ?? 0, defense: stats.defense ?? 0 },
        ascension: { prop: character.substatType, value: stats.specialized ?? 0 },
        weapon: weaponDef && weaponStats
          ? { baseAttack: weaponStats.attack ?? 0, prop: weaponDef.mainStatType || null, value: weaponStats.specialized ?? 0 }
          : null,
        pieces: loadout.pieces,
        setBonuses,
      }).totals;
      return proxy(proxyStats(totals, scalerProp, damageProp), level, config.enemyLevel);
    };

    const weaponNow = loadout.weapon ? { level: loadout.weapon.level, ascension: loadout.weapon.ascension } : null;
    const now = outputAt(entry.level, entry.ascension, weaponNow?.level ?? null, weaponNow?.ascension ?? null);

    const talentTarget = entry.target.talents ?? {
      auto: Math.max(entry.talent.auto, ASSUMED_TARGET.talents.auto),
      skill: Math.max(entry.talent.skill, ASSUMED_TARGET.talents.skill),
      burst: Math.max(entry.talent.burst, ASSUMED_TARGET.talents.burst),
    };
    // The talents' own floor, so the whole climb prices the ascension they need.
    const talentPhase = phaseForTalent(
      Math.max(talentTarget.auto, talentTarget.skill, talentTarget.burst), levelling.talentCaps);
    const target = {
      level: Math.max(entry.target.level ?? ASSUMED_TARGET.level, talentPhase > 0 ? levelling.levelCaps[talentPhase - 1] : 1),
      ascension: Math.max(entry.target.ascension ?? ASSUMED_TARGET.ascension, talentPhase),
    };

    const source = (current: Progress, next: Progress, weapon: DemandSource['weapon'] = null): DemandSource => ({
      characterId: entry.characterId,
      buildName: character.name,
      current,
      target: next,
      ascensionCosts: character.costs,
      talentCosts: character.talentCosts,
      talentCostsBy: character.talentCostsBy,
      weapon,
    });
    const here: Progress = { level: entry.level, ascension: entry.ascension, talents: entry.talent };

    // The character: to the next cap, ascending first if at one.
    const milestone = nextMilestone(entry.level, entry.ascension, levelling.levelCaps, target);
    if (milestone) {
      const exp = levelling.characterExp[milestone.level - 1] - levelling.characterExp[entry.level - 1];
      const price = priceOf(source(here, { ...here, ...milestone }));
      steps.push({
        characterId: entry.characterId,
        kind: 'character',
        from: entry.level,
        to: milestone.level,
        fromPhase: entry.ascension,
        toPhase: milestone.ascension,
        gain: relativeGain(now, outputAt(milestone.level, milestone.ascension, weaponNow?.level ?? null, weaponNow?.ascension ?? null)),
        resin: price.resin + expResin(exp),
        mora: price.mora + Math.ceil(exp * levelling.moraPerExp.character),
        moraCost: price.moraCost + Math.ceil(exp * levelling.moraPerExp.character),
        needsCrown: false,
        belowAcceptable: entry.level < config.acceptable.level,
      });
    }

    // Each talent, one level: its multiplier's growth, times its share.
    const tables: Record<TalentKey, number[]> = {
      auto: talentMultipliers(combat[0]?.attributes),
      skill: talentMultipliers(combat[1]?.attributes),
      burst: talentMultipliers(combat.length >= 3 ? combat.at(-1)?.attributes : undefined),
    };
    const bonus = loadout.talentBonus ?? { auto: 0, skill: 0, burst: 0 };
    const talentGain = (key: TalentKey, from: number, to: number) => {
      const table = tables[key];
      const at = (level: number) => table[Math.min(level + bonus[key], table.length) - 1];
      if (!table.length || at(from) === undefined || at(to) === undefined) return 0;
      return talentShare(talentTarget, key) * relativeGain(at(from), at(to));
    };

    for (const key of ['auto', 'skill', 'burst'] as const) {
      const from = entry.talent[key];
      if (from >= talentTarget[key]) continue;
      // A level past what the phase allows is only bought with the ascension
      // first: its materials, and the EXP up to the cap it starts from. The
      // step costs all of it, so a character short of the ascension is not
      // offered a talent the bag cannot actually buy.
      const phase = phaseForTalent(from + 1, levelling.talentCaps);
      const ascendFirst = phase > entry.ascension
        ? { level: Math.max(entry.level, levelling.levelCaps[phase - 1]), ascension: phase }
        : undefined;
      const exp = ascendFirst
        ? levelling.characterExp[ascendFirst.level - 1] - levelling.characterExp[entry.level - 1]
        : 0;
      const price = priceOf(source(here, { ...here, ...ascendFirst, talents: { ...here.talents, [key]: from + 1 } }));
      steps.push({
        characterId: entry.characterId,
        kind: 'talent',
        talent: key,
        from,
        to: from + 1,
        ascendFirst,
        gain: talentGain(key, from, from + 1),
        resin: price.resin + expResin(exp),
        mora: price.mora + Math.ceil(exp * levelling.moraPerExp.character),
        moraCost: price.moraCost + Math.ceil(exp * levelling.moraPerExp.character),
        needsCrown: from + 1 === 10,
        belowAcceptable: from < config.acceptable.talent,
      });
    }

    // The weapon: to its next cap. Ores are mined, not farmed, so its EXP
    // costs mora and no resin.
    let weaponTargetStep: { level: number; ascension: number } | null = null;
    if (loadout.weapon && weaponDef && weaponNow) {
      weaponIds[entry.characterId] = weaponDef.id;
      const table = levelling.weaponExp[String(weaponDef.rarity)] ?? levelling.weaponExp['5'];
      const top = table.length;
      weaponTargetStep = { level: top, ascension: levelling.levelCaps.indexOf(top) };
      const next = nextMilestone(weaponNow.level, weaponNow.ascension, levelling.levelCaps, weaponTargetStep);
      if (next) {
        const exp = table[next.level - 1] - table[weaponNow.level - 1];
        const weaponSource = { weaponId: weaponDef.id, costs: weaponDef.costs as CostsByPhase, ascension: weaponNow.ascension, target: next.ascension };
        const price = priceOf(source(here, here, weaponSource));
        steps.push({
          characterId: entry.characterId,
          kind: 'weapon',
          from: weaponNow.level,
          to: next.level,
          fromPhase: weaponNow.ascension,
          toPhase: next.ascension,
          gain: relativeGain(now, outputAt(entry.level, entry.ascension, next.level, next.ascension)),
          resin: price.resin,
          mora: price.mora + Math.ceil(exp * levelling.moraPerExp.weapon),
          moraCost: price.moraCost + Math.ceil(exp * levelling.moraPerExp.weapon),
          needsCrown: false,
          belowAcceptable: weaponNow.level < config.acceptable.weaponLevel,
        });
      }
    }

    // Everything to the target, at once: the level and weapon as one climb,
    // each talent's own growth on top, and one price for the lot.
    const full = outputAt(target.level, target.ascension, weaponTargetStep?.level ?? null, weaponTargetStep?.ascension ?? null);
    const gains = [
      relativeGain(now, full),
      ...(['auto', 'skill', 'burst'] as const).map((key) => talentGain(key, entry.talent[key], talentTarget[key])),
    ];
    const whole = priceOf(source(here, { ...target, talents: talentTarget }, loadout.weapon && weaponDef && weaponTargetStep
      ? { weaponId: weaponDef.id, costs: weaponDef.costs as CostsByPhase, ascension: loadout.weapon.ascension, target: weaponTargetStep.ascension }
      : null));
    const levelExp = levelling.characterExp[Math.max(target.level, entry.level) - 1] - levelling.characterExp[entry.level - 1];
    const packageGain = compound(gains);
    if (packageGain > 0) {
      packages.push({
        characterId: entry.characterId,
        gain: packageGain,
        resin: whole.resin + expResin(levelExp),
        mora: whole.mora,
        needsCrown: (['auto', 'skill', 'burst'] as const).some((key) => talentTarget[key] >= 10 && entry.talent[key] < 10),
      });
    }
  }

  const weightOf = (characterId: number) => roleWeight(rolesOf(characterId), config);
  const membersOf = (teamId: string) => new Set(teams.find((team) => team.id === teamId)?.slots.map((slot) => slot.characterId) ?? []);

  const mora = stock.get(MORA) ?? 0;
  const ranked = rankSteps(steps, { strategy, weightOf, membersOf, config, mora });
  const inScope = new Set(ranked.map((step) => step.characterId));

  return {
    strategy,
    mora,
    steps: ranked,
    packages: packages
      .filter((entry) => strategy.mode === 'balance' || inScope.has(entry.characterId))
      .map((entry) => ({ ...entry, weightedGain: entry.gain * weightOf(entry.characterId) }))
      .sort((a, b) => b.weightedGain / Math.max(b.resin, 1) - a.weightedGain / Math.max(a.resin, 1)),
    teams: teams.filter((team: Team) => team.slots.length > 0).map((team) => ({ id: team.id, name: team.name })),
    characters: planned.map((entry) => entry.characterId),
    weaponIds,
    weights: Object.fromEntries(planned.map((entry) => [entry.characterId, weightOf(entry.characterId)])),
  };
}
