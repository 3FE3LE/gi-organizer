/**
 * What is left to farm, and on which days.
 *
 * Demand is a gap: what a build says a character should reach, minus where
 * they are. A planner with no target has nothing to plan, which is why the
 * levelling target lives on the build.
 *
 * Only 168 of 919 materials are day-gated — talent books and weapon ascension
 * materials, behind 48 domains on a weekly rotation. Everything else is a boss,
 * a local specialty or a mob drop: a question of quantity, never of schedule.
 */

export type CostsByPhase = Record<string, { id: number; count: number }[]>;

export type Progress = {
  level: number;
  ascension: number;
  talents: { auto: number; skill: number; burst: number };
};

/**
 * Where a character with nothing written down is taken to be going.
 *
 * Read by two things that have to agree: the planner, which counts what it
 * would cost, and the goal form, which opens on it so the player can change
 * it. When they disagreed the plan asked for sixty-six talent books and the
 * form showed a target of "stay where you are", and there was no way to tell
 * from either screen which one was lying.
 *
 * Talents stop at nine because ten costs a Crown of Insight, about one a
 * patch: a demand no amount of farming moves. The normal attack is left
 * where it starts: most characters are played for their skill and burst, and
 * assuming it went to nine as well asked for a third of the talent books in
 * the plan for a talent few players level — and drew every card on the roster
 * as unfinished over it. A character whose attack matters gets a written
 * target, and that target is what counts.
 */
export const ASSUMED_TARGET: Progress = {
  level: 90,
  ascension: 6,
  talents: { auto: 1, skill: 9, burst: 9 },
};

export type DemandSource = {
  characterId: number;
  buildName: string;
  current: Progress;
  target: Progress;
  /**
   * True when nobody stated this target and the planner assumed the cap. What
   * it costs to max a character is a real answer; it is just not one the player
   * asked for, so it has to be marked as such rather than shown as a plan.
   */
  assumed?: boolean;
  ascensionCosts: CostsByPhase;
  talentCosts: CostsByPhase;
  /** The planned weapon, when the build names one that is owned. */
  weapon: { weaponId: number; costs: CostsByPhase; ascension: number; target: number } | null;
};

export type Need = {
  materialId: number;
  needed: number;
  owned: number;
  /** What is still missing. Zero once the bag covers it. */
  short: number;
  /**
   * Who needs it and how much, one entry per character and reason. Aggregated
   * rather than one row per cost line: nine talent levels across three talents
   * is nine identical rows saying the same thing.
   */
  by: {
    characterId: number;
    buildName: string;
    count: number;
    reason: Reason;
    /** Carried from the source: this row comes from an assumed target. */
    assumed?: boolean;
  }[];
};

export type Reason = 'ascension' | 'talent' | 'weapon';

/** Ascension phases are cumulative: reaching 4 costs 1 through 4. */
function phasesBetween(prefix: string, from: number, to: number) {
  const phases: string[] = [];
  for (let phase = from + 1; phase <= to; phase += 1) phases.push(`${prefix}${phase}`);
  return phases;
}

/** Talent levels likewise: going 6 to 9 costs lvl7, lvl8 and lvl9. */
function talentLevels(from: number, to: number) {
  const levels: string[] = [];
  for (let level = from + 1; level <= to; level += 1) levels.push(`lvl${level}`);
  return levels;
}

export function computeDemand(
  sources: DemandSource[],
  stock: Map<number, number>,
): Need[] {
  const totals = new Map<number, Need>();

  const add = (
    materialId: number,
    count: number,
    source: DemandSource,
    reason: Reason,
  ) => {
    const entry = totals.get(materialId) ?? {
      materialId, needed: 0, owned: stock.get(materialId) ?? 0, short: 0, by: [],
    };
    entry.needed += count;

    const existing = entry.by.find(
      (row) => row.characterId === source.characterId && row.reason === reason,
    );
    if (existing) existing.count += count;
    else {
      entry.by.push({
        characterId: source.characterId, buildName: source.buildName, count, reason,
        assumed: source.assumed,
      });
    }

    totals.set(materialId, entry);
  };

  for (const source of sources) {
    for (const phase of phasesBetween(
      'ascend', source.current.ascension, source.target.ascension,
    )) {
      for (const item of source.ascensionCosts[phase] ?? []) {
        add(item.id, item.count, source, 'ascension');
      }
    }

    for (const [talent, from] of Object.entries(source.current.talents) as [
      keyof Progress['talents'], number,
    ][]) {
      for (const level of talentLevels(from, source.target.talents[talent])) {
        for (const item of source.talentCosts[level] ?? []) {
          add(item.id, item.count, source, 'talent');
        }
      }
    }

    if (source.weapon) {
      for (const phase of phasesBetween(
        'ascend', source.weapon.ascension, source.weapon.target,
      )) {
        for (const item of source.weapon.costs[phase] ?? []) {
          add(item.id, item.count, source, 'weapon');
        }
      }
    }
  }

  return [...totals.values()]
    .map((need) => ({ ...need, short: Math.max(0, need.needed - need.owned) }))
    .filter((need) => need.short > 0)
    .sort((a, b) => b.short - a.short);
}

/* ---------------------------------------------------------- schedule --- */

export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/**
 * What a domain is farmed for.
 *
 * Read off the demand rather than the domain's name: the 24 Domains of Mastery
 * only ever drop talent books and the 24 Domains of Forgery only weapon
 * ascension materials, so the reason a material is wanted already says which
 * kind of domain drops it — and it says so without parsing an English string
 * that the catalog translates.
 */
export type DomainKind = 'talent' | 'weapon' | 'mixed';

export type DomainPlan = {
  /** The English name from the catalog. Stable across locales, so it is the key. */
  domain: string;
  /** The name to show, in the catalog's locale. */
  label: string;
  kind: DomainKind;
  days: Weekday[];
  needs: Need[];
  /** Total pieces still missing from this domain. */
  short: number;
};

export type Schedule = {
  /** Day-gated needs, grouped by the domain that drops them. */
  domains: DomainPlan[];
  /** What is missing and not on a schedule: bosses, specialties, mora. */
  anytime: Need[];
};

export type MaterialSchedule = {
  domain: string | null;
  days: string[];
  /** The localized domain name, when the catalog carries one. */
  domainName?: string | null;
};

function kindOf(needs: Need[]): DomainKind {
  let weapon = false;
  let other = false;

  for (const need of needs) {
    for (const entry of need.by) {
      if (entry.reason === 'weapon') weapon = true;
      else other = true;
    }
  }

  if (weapon && other) return 'mixed';
  return weapon ? 'weapon' : 'talent';
}

export function scheduleNeeds(
  needs: Need[],
  metadata: Map<number, MaterialSchedule>,
): Schedule {
  const domains = new Map<string, DomainPlan>();
  const anytime: Need[] = [];

  for (const need of needs) {
    const meta = metadata.get(need.materialId);
    if (!meta?.domain || meta.days.length === 0) {
      anytime.push(need);
      continue;
    }

    const plan = domains.get(meta.domain) ?? {
      domain: meta.domain,
      label: meta.domainName || meta.domain,
      kind: 'talent' as DomainKind,
      days: meta.days as Weekday[],
      needs: [],
      short: 0,
    };
    plan.needs.push(need);
    plan.short += need.short;
    domains.set(meta.domain, plan);
  }

  for (const plan of domains.values()) plan.kind = kindOf(plan.needs);

  return {
    domains: [...domains.values()].sort((a, b) => b.short - a.short),
    anytime,
  };
}

/**
 * What is worth doing today.
 *
 * Sunday is not listed as a day here even though every domain rotates on it —
 * the catalog already says so, and a planner that reports "everything" on a
 * Sunday is not telling anyone anything.
 */
export function domainsOn(schedule: Schedule, day: Weekday) {
  return schedule.domains.filter((plan) => plan.days.includes(day));
}

/**
 * The day, split the way the game splits it: books on one side, weapon
 * materials on the other. They are two separate runs with two separate resin
 * budgets, so one list mixing them is a list you have to re-sort by eye.
 *
 * A domain of mixed kind — which the catalog does not currently contain —
 * appears under both rather than under neither.
 */
export function domainsByKind(schedule: Schedule, day: Weekday) {
  const today = domainsOn(schedule, day);

  return {
    talent: today.filter((plan) => plan.kind !== 'weapon'),
    weapon: today.filter((plan) => plan.kind !== 'talent'),
  };
}

/** Who a set of domains is farmed for, deduped, in the order they first appear. */
export function charactersIn(domains: DomainPlan[]) {
  const seen = new Map<number, number>();

  for (const plan of domains) {
    for (const need of plan.needs) {
      for (const entry of need.by) {
        seen.set(entry.characterId, (seen.get(entry.characterId) ?? 0) + entry.count);
      }
    }
  }

  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([characterId, count]) => ({ characterId, count }));
}
