import type { ArtifactSlot } from '@/lib/data/types';

import {
  type Diagnostic,
  type EndgameMode,
  type EvaluationResult,
  type Facet,
  type Provider,
  type Rule,
  type Severity,
  type Target,
  type TeamRole,
  diagnosticId,
  targetKey,
} from './types';

/**
 * Evaluates a plan and returns diagnostics.
 *
 * Pure, and nothing is persisted: findings are derived from state, so a stored
 * diagnostic could only ever be stale. It recomputes on render.
 *
 * The output is diagnostics rather than booleans because a boolean cannot be
 * painted on a slot. Every finding names the places the UI should mark, and
 * carries ids rather than sentences so the engine stays free of language.
 */

export type EvaluationInput = {
  teams: TeamView[];
  deployments: DeploymentView[];
  /** Gear per character, as currently assigned. */
  gear: Map<number, CharacterGear>;
  /** Owned copies per weapon id and refinement. */
  stock: Map<string, { weaponId: number; refinement: number; count: number }>;
  /**
   * The weapon each build is aiming for. A character with no target is counted
   * on what they hold, so an untouched roster still reports honestly.
   */
  targets?: Map<number, { weaponId: number | null; refinement: number | null }>;
  characters: Map<number, { elementType: string }>;
  /** Which tags a set, weapon or character carries. Curated, not derived. */
  tags: {
    ofCharacter: (characterId: number) => string[];
    ofArtifactSet: (setId: number) => string[];
    ofWeapon: (weaponId: number) => string[];
  };
  rules: Rule[];
};

export type TeamView = {
  id: string;
  name: string;
  mode: EndgameMode;
  slots: {
    characterId: number;
    roles: TeamRole[];
    /** Facts the engine cannot derive, e.g. which element this VV wearer swirls. */
    declarations: Record<string, string>;
  }[];
};

export type DeploymentView = {
  id: string;
  mode: EndgameMode;
  teamIds: string[];
  theater?: { allowedElements: string[] };
};

export type CharacterGear = {
  /** Set id per equipped slot. */
  sets: Map<ArtifactSlot, number>;
  weapon: { instanceId: string; weaponId: number; refinement: number } | null;
};

const ALL_SLOTS: ArtifactSlot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

export function evaluate(input: EvaluationInput): EvaluationResult {
  const diagnostics: Diagnostic[] = [
    ...checkWeaponStock(input),
    ...checkGearCompleteness(input),
    ...checkDeployments(input),
    ...checkRules(input),
  ];

  const byTarget = new Map<string, Diagnostic[]>();
  const counts: Record<Severity, number> = { info: 0, warning: 0, error: 0 };

  for (const diagnostic of diagnostics) {
    counts[diagnostic.severity] += 1;
    for (const target of diagnostic.targets) {
      const key = targetKey(target);
      byTarget.set(key, [...(byTarget.get(key) ?? []), diagnostic]);
    }
  }

  return { diagnostics, byTarget, counts };
}

function make(
  ruleId: string | null,
  code: Diagnostic['code'],
  severity: Severity,
  targets: Target[],
  data: Diagnostic['data'],
): Diagnostic {
  return { id: diagnosticId(ruleId, code, targets), ruleId, code, severity, targets, data };
}

/* ------------------------------------------------------ built-in checks --- */

/**
 * Scarcity. This is the four-Favonius-Lances report: a weapon planned onto more
 * characters than there are copies of it.
 *
 * Not an authorable rule, because it is a fact about the inventory rather than
 * an opinion about the game.
 */
function checkWeaponStock(input: EvaluationInput): Diagnostic[] {
  const claims = new Map<string, { weaponId: number; refinement: number; holders: number[] }>();

  // Everyone in a team plus everyone already holding something: a build with a
  // target claims the target, and one without claims what it holds.
  const subjects = new Set<number>([
    ...input.teams.flatMap((team) => team.slots.map((slot) => slot.characterId)),
    ...input.gear.keys(),
  ]);

  for (const characterId of subjects) {
    const target = input.targets?.get(characterId);
    const held = input.gear.get(characterId)?.weapon ?? null;

    const weaponId = target?.weaponId ?? held?.weaponId ?? null;
    if (weaponId === null) continue;
    const refinement = target?.weaponId ? (target.refinement ?? 1) : held?.refinement ?? 1;

    const key = `${weaponId}|${refinement}`;
    const entry = claims.get(key) ?? { weaponId, refinement, holders: [] };
    entry.holders.push(characterId);
    claims.set(key, entry);
  }

  const diagnostics: Diagnostic[] = [];

  for (const [key, claim] of claims) {
    const owned = input.stock.get(key)?.count ?? 0;

    if (owned === 0) {
      diagnostics.push(make(null, 'weapon.not-owned', 'info',
        [
          { kind: 'weapon-stock', weaponId: claim.weaponId, refinement: claim.refinement },
          ...claim.holders.map((characterId): Target => ({ kind: 'weapon-slot', characterId })),
        ],
        { weaponId: claim.weaponId, refinement: claim.refinement, holders: claim.holders }));
      continue;
    }

    if (claim.holders.length > owned) {
      diagnostics.push(make(null, 'weapon.overallocated', 'error',
        [
          { kind: 'weapon-stock', weaponId: claim.weaponId, refinement: claim.refinement },
          ...claim.holders.map((characterId): Target => ({ kind: 'weapon-slot', characterId })),
        ],
        {
          weaponId: claim.weaponId,
          refinement: claim.refinement,
          owned,
          demanded: claim.holders.length,
          holders: claim.holders,
        }));
    }
  }

  return diagnostics;
}

/** A character in a team missing artifact slots is a plan, not a build. */
function checkGearCompleteness(input: EvaluationInput): Diagnostic[] {
  const inATeam = new Set(input.teams.flatMap((team) => team.slots.map((slot) => slot.characterId)));
  const diagnostics: Diagnostic[] = [];

  for (const characterId of inATeam) {
    const gear = input.gear.get(characterId);
    const missing = ALL_SLOTS.filter((slot) => !gear?.sets.has(slot));
    if (missing.length === 0) continue;

    diagnostics.push(make(null, 'gear.incomplete', 'warning',
      [
        { kind: 'character', characterId },
        ...missing.map((slot): Target => ({ kind: 'artifact-slot', characterId, slot })),
      ],
      { characterId, missing }));
  }

  return diagnostics;
}

/**
 * A deployment is the set of teams fielded at once. The Abyss fields two, so a
 * character in both halves is impossible rather than merely unwise.
 */
function checkDeployments(input: EvaluationInput): Diagnostic[] {
  const byId = new Map(input.teams.map((team) => [team.id, team]));
  const diagnostics: Diagnostic[] = [];

  for (const deployment of input.deployments) {
    const seen = new Map<number, string[]>();

    for (const teamId of deployment.teamIds) {
      const team = byId.get(teamId);
      if (!team) continue;

      for (const slot of team.slots) {
        seen.set(slot.characterId, [...(seen.get(slot.characterId) ?? []), teamId]);

        const allowed = deployment.theater?.allowedElements;
        const element = input.characters.get(slot.characterId)?.elementType;
        if (allowed && element && !allowed.includes(element)) {
          diagnostics.push(make(null, 'deployment.element-not-allowed', 'error',
            [
              { kind: 'deployment', deploymentId: deployment.id },
              { kind: 'team-slot', teamId, characterId: slot.characterId },
            ],
            { characterId: slot.characterId, element, allowed }));
        }
      }
    }

    for (const [characterId, teamIds] of seen) {
      if (teamIds.length < 2) continue;
      diagnostics.push(make(null, 'deployment.character-reused', 'error',
        [
          { kind: 'deployment', deploymentId: deployment.id },
          ...teamIds.map((teamId): Target => ({ kind: 'team-slot', teamId, characterId })),
        ],
        { characterId, teamIds }));
    }
  }

  return diagnostics;
}

/* ------------------------------------------------------- authored rules --- */

function checkRules(input: EvaluationInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const rule of input.rules) {
    if (!rule.enabled) continue;

    switch (rule.kind) {
      case 'non-stacking':
        diagnostics.push(...checkNonStacking(input, rule));
        break;
      case 'role-coverage':
        diagnostics.push(...checkRoleCoverage(input, rule));
        break;
      case 'tag-limit':
        diagnostics.push(...checkTagLimit(input, rule));
        break;
    }
  }

  return diagnostics;
}

/** Does this character's gear supply the provider the rule watches? */
function supplies(input: EvaluationInput, characterId: number, provider: Provider) {
  const gear = input.gear.get(characterId);

  switch (provider.type) {
    case 'artifact-set': {
      if (!gear) return false;
      let count = 0;
      for (const setId of gear.sets.values()) if (setId === provider.setId) count += 1;
      return count >= provider.pieces;
    }
    case 'weapon':
      return Boolean(
        gear?.weapon &&
        gear.weapon.weaponId === provider.weaponId &&
        gear.weapon.refinement >= (provider.minRefinement ?? 1),
      );
    case 'character':
      return characterId === provider.characterId;
  }
}

function partitionValue(
  input: EvaluationInput,
  slot: TeamView['slots'][number],
  facet: Facet,
): string | null {
  switch (facet.by) {
    case 'none':
      return '';
    case 'character-element':
      return input.characters.get(slot.characterId)?.elementType ?? null;
    case 'declaration':
      return slot.declarations[facet.field] ?? null;
  }
}

/**
 * Two providers of the same buff on one team, where the game only counts one.
 *
 * The partition is what makes Viridescent Venerer expressible: the shred does
 * not stack for the same element, but two wearers absorbing different elements
 * are both doing work. Same element declared, error; different, clean; either
 * undeclared, a warning that says so rather than a verdict it cannot support.
 */
function checkNonStacking(
  input: EvaluationInput,
  rule: Extract<Rule, { kind: 'non-stacking' }>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const team of input.teams) {
    const providers = team.slots.filter((slot) =>
      rule.providers.some((provider) => supplies(input, slot.characterId, provider)));

    if (providers.length <= rule.maxProviders) continue;

    const groups = new Map<string, typeof providers>();
    const unprovable: typeof providers = [];

    for (const slot of providers) {
      const value = partitionValue(input, slot, rule.partition);
      if (value === null) unprovable.push(slot);
      else groups.set(value, [...(groups.get(value) ?? []), slot]);
    }

    for (const [value, group] of groups) {
      if (group.length <= rule.maxProviders) continue;
      diagnostics.push(make(rule.id, 'aura.duplicated', rule.severity,
        [
          { kind: 'team', teamId: team.id },
          ...group.map((slot): Target => ({
            kind: 'team-slot', teamId: team.id, characterId: slot.characterId,
          })),
        ],
        {
          auraId: rule.auraId,
          partition: value,
          characters: group.map((slot) => slot.characterId),
          allowed: rule.maxProviders,
        }));
    }

    // Undeclared providers cannot be cleared or condemned, only flagged — and
    // only when there is something they could collide with.
    if (unprovable.length > 0 && providers.length > rule.maxProviders) {
      diagnostics.push(make(rule.id, 'aura.unprovable', rule.unprovableSeverity ?? 'warning',
        [
          { kind: 'team', teamId: team.id },
          ...unprovable.map((slot): Target => ({
            kind: 'team-slot', teamId: team.id, characterId: slot.characterId,
          })),
        ],
        {
          auraId: rule.auraId,
          field: rule.partition.by === 'declaration' ? rule.partition.field : rule.partition.by,
          characters: unprovable.map((slot) => slot.characterId),
        }));
    }
  }

  return diagnostics;
}

function checkRoleCoverage(
  input: EvaluationInput,
  rule: Extract<Rule, { kind: 'role-coverage' }>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const team of input.teams) {
    if (rule.appliesToModes && !rule.appliesToModes.includes(team.mode)) continue;

    const matching = team.slots.filter((slot) =>
      slot.roles.some((role) => rule.roles.includes(role)));

    if (matching.length < rule.min) {
      diagnostics.push(make(rule.id, 'role.missing', rule.severity,
        [{ kind: 'team', teamId: team.id }],
        { roles: rule.roles, need: rule.min, have: matching.length }));
    } else if (rule.max !== undefined && matching.length > rule.max) {
      diagnostics.push(make(rule.id, 'role.excess', rule.severity,
        [
          { kind: 'team', teamId: team.id },
          ...matching.map((slot): Target => ({
            kind: 'team-slot', teamId: team.id, characterId: slot.characterId,
          })),
        ],
        { roles: rule.roles, allowed: rule.max, have: matching.length }));
    }

    // A slot with no declared role is invisible to every coverage rule, which
    // is worth saying out loud rather than silently passing.
    for (const slot of team.slots) {
      if (slot.roles.length > 0) continue;
      diagnostics.push(make(null, 'role.unset', 'info',
        [{ kind: 'team-slot', teamId: team.id, characterId: slot.characterId }],
        { characterId: slot.characterId }));
    }
  }

  return diagnostics;
}

function checkTagLimit(
  input: EvaluationInput,
  rule: Extract<Rule, { kind: 'tag-limit' }>,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const team of input.teams) {
    const carriers = team.slots.filter((slot) => carriesTag(input, slot.characterId, rule));

    const targets: Target[] = [
      { kind: 'team', teamId: team.id },
      ...carriers.map((slot): Target => ({
        kind: 'team-slot', teamId: team.id, characterId: slot.characterId,
      })),
    ];

    if (rule.max !== undefined && carriers.length > rule.max) {
      diagnostics.push(make(rule.id, 'tag.over-limit', rule.severity, targets,
        { tag: rule.tag, allowed: rule.max, have: carriers.length }));
    }
    if (rule.min !== undefined && carriers.length < rule.min) {
      diagnostics.push(make(rule.id, 'tag.under-limit', rule.severity,
        [{ kind: 'team', teamId: team.id }],
        { tag: rule.tag, need: rule.min, have: carriers.length }));
    }
  }

  return diagnostics;
}

function carriesTag(
  input: EvaluationInput,
  characterId: number,
  rule: Extract<Rule, { kind: 'tag-limit' }>,
) {
  switch (rule.subject) {
    case 'character':
      return input.tags.ofCharacter(characterId).includes(rule.tag);
    case 'artifact-set': {
      const gear = input.gear.get(characterId);
      if (!gear) return false;
      for (const setId of new Set(gear.sets.values())) {
        if (input.tags.ofArtifactSet(setId).includes(rule.tag)) return true;
      }
      return false;
    }
    case 'weapon': {
      const weapon = input.gear.get(characterId)?.weapon;
      return weapon ? input.tags.ofWeapon(weapon.weaponId).includes(rule.tag) : false;
    }
  }
}
