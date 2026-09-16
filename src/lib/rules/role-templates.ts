import { elementDamageProp } from '@/lib/data/elements';
import type { ArtifactSlot } from '@/lib/data/types';

import type { StatGoal } from '@/lib/player/builds';
import type { BuildPriority } from './suggest';
import type { TeamRole } from './types';

/**
 * A starting point for a goal, by role.
 *
 * These are thresholds, not truths. A support that cannot fire its burst every
 * rotation is not supporting, so 200% recharge is a real line to clear; whether
 * a particular character wants 180 or 240 depends on their kit, their team and
 * their constellation, and only the player knows that. The template exists so
 * the form is not blank, and every number in it stays editable.
 *
 * Character-specific knowledge comes from the community priorities instead:
 * they know that this Anemo support wants swirl mastery and that one wants
 * attack. Where the two disagree, the specific wins — see `templateFor`.
 */

export type RoleTemplate = {
  goals: StatGoal[];
  /** Main stats worth having per choosable slot, best first. */
  mainStats: Partial<Record<ArtifactSlot, string[]>>;
  substats: string[];
};

const CRIT = 'FIGHT_PROP_CRITICAL';
const CRIT_DMG = 'FIGHT_PROP_CRITICAL_HURT';
const ATK = 'FIGHT_PROP_ATTACK_PERCENT';
const HP = 'FIGHT_PROP_HP_PERCENT';
const DEF = 'FIGHT_PROP_DEFENSE_PERCENT';
const EM = 'FIGHT_PROP_ELEMENT_MASTERY';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const HEAL = 'FIGHT_PROP_HEAL_ADD';

/** The damage goblet is the character's own element, filled in per character. */
const ELEMENTAL = 'ELEMENTAL_DMG';

export const ROLE_TEMPLATES: Record<TeamRole, RoleTemplate> = {
  'main-dps': {
    goals: [{ prop: CRIT, min: 70 }, { prop: CRIT_DMG, min: 140 }, { prop: ER, min: 120 }],
    mainStats: { sands: [ATK, EM], goblet: [ELEMENTAL], circlet: [CRIT, CRIT_DMG] },
    substats: [CRIT, CRIT_DMG, ATK, EM],
  },
  'sub-dps': {
    goals: [{ prop: CRIT, min: 60 }, { prop: CRIT_DMG, min: 130 }, { prop: ER, min: 160 }],
    mainStats: { sands: [ATK, ER, EM], goblet: [ELEMENTAL], circlet: [CRIT, CRIT_DMG] },
    substats: [CRIT, CRIT_DMG, ER, ATK],
  },
  healer: {
    // Healing scales off the healer's own stat, and recharge is what makes the
    // heal arrive when it is needed rather than when it is ready.
    goals: [{ prop: ER, min: 180 }],
    mainStats: { sands: [HP, ER], goblet: [HP], circlet: [HEAL, HP] },
    substats: [ER, HP, EM, CRIT],
  },
  shielder: {
    goals: [{ prop: ER, min: 180 }],
    mainStats: { sands: [HP, DEF, ER], goblet: [HP, DEF], circlet: [HP, DEF] },
    substats: [ER, HP, DEF, EM],
  },
  buffer: {
    // A buff that is not up is not a buff: recharge first, everything after.
    goals: [{ prop: ER, min: 200 }],
    mainStats: { sands: [ER, ATK, EM], goblet: [ATK, HP], circlet: [CRIT, ATK] },
    substats: [ER, EM, CRIT, ATK],
  },
  debuffer: {
    goals: [{ prop: ER, min: 180 }, { prop: EM, min: 200 }],
    mainStats: { sands: [EM, ER], goblet: [EM, ATK], circlet: [EM, CRIT] },
    substats: [ER, EM, CRIT, ATK],
  },
  battery: {
    // Its whole job is other people's energy.
    goals: [{ prop: ER, min: 250 }],
    mainStats: { sands: [ER], goblet: [ATK, EM], circlet: [CRIT, ATK] },
    substats: [ER, EM, CRIT, ATK],
  },
  driver: {
    goals: [{ prop: CRIT, min: 60 }, { prop: CRIT_DMG, min: 120 }, { prop: ER, min: 160 }],
    mainStats: { sands: [ATK, ER], goblet: [ELEMENTAL, ATK], circlet: [CRIT, CRIT_DMG] },
    substats: [CRIT, CRIT_DMG, ER, ATK],
  },
  enabler: {
    // Reaction enablers are paid in mastery, and only get to react if they fire.
    goals: [{ prop: EM, min: 600 }, { prop: ER, min: 180 }],
    mainStats: { sands: [EM, ER], goblet: [EM], circlet: [EM, CRIT] },
    substats: [EM, ER, CRIT, ATK],
  },
};

export type TemplateResult = {
  goals: StatGoal[];
  mainStats: Partial<Record<ArtifactSlot, string>>;
  substats: string[];
};

/**
 * Which of our roles an external list is talking about.
 *
 * The community vocabulary is coarser than ours — one "Support" covers buffing,
 * healing, shielding and batteries — so the mapping is deliberately loose. It
 * only has to answer one question: is that list describing this goal, or a
 * different job for the same character?
 */
const EXTERNAL_ROLES: Record<string, TeamRole[]> = {
  'main dps': ['main-dps', 'driver'],
  dps: ['main-dps', 'driver'],
  'sub dps': ['sub-dps', 'driver'],
  support: ['buffer', 'healer', 'shielder', 'debuffer', 'battery', 'enabler'],
};

function describesRole(externalRole: string | null, role: TeamRole | null) {
  // A goal with no role has nothing to contradict, so the list applies.
  if (role === null) return true;
  if (!externalRole) return false;

  return (EXTERNAL_ROLES[externalRole.trim().toLowerCase()] ?? []).includes(role);
}

/**
 * The template for a role, resolved for one character.
 *
 * Two adjustments. The damage goblet becomes this character's element. And the
 * community list — which knows the kit, not just the role — replaces the
 * generic guess, but only when it is describing *this* job: Venti's sub-dps
 * page wants an attack sands, and reading that into a buffer goal would quietly
 * plan the wrong character.
 */
export function templateFor(
  role: TeamRole | null,
  elementType: string,
  priority: BuildPriority | undefined,
  slots: ArtifactSlot[],
): TemplateResult {
  const template = role ? ROLE_TEMPLATES[role] : null;
  const element = elementDamageProp(elementType);
  const listApplies = describesRole(priority?.role ?? null, role);

  const mainStats: Partial<Record<ArtifactSlot, string>> = {};

  slots.forEach((slot, index) => {
    // The community list is positional over the same three slots.
    const specific = listApplies ? priority?.mainStats[index]?.[0] : undefined;
    const generic = template?.mainStats[slot]?.[0];
    const chosen = specific ?? generic;
    if (!chosen) return;

    mainStats[slot] = chosen === ELEMENTAL ? element ?? 'FIGHT_PROP_ATTACK_PERCENT' : chosen;
  });

  const substats = listApplies && priority?.substats.length
    ? priority.substats.slice(0, 4)
    : template?.substats.slice(0, 4) ?? [];

  return { goals: template?.goals ?? [], mainStats, substats };
}
