import type { ArtifactSlot } from '@/lib/data/types';

/**
 * The rule language.
 *
 * A closed union, not an expression language. Every rule the tool needs is one
 * of three shapes with parameters, and a DSL would mean an editor, a validator,
 * an evaluator and a migration story for one player.
 *
 * Nothing here holds a localized string except `label` and `note`, which are
 * the user's own words. Everything else is a game id — set id, weapon id,
 * character id, `FIGHT_PROP_*`, element enum — so a rule survives a locale
 * change and a patch that renames something.
 */

export type Severity = 'info' | 'warning' | 'error';
export type RuleScope = 'team' | 'deployment' | 'global';

export type TeamRole =
  | 'main-dps' | 'sub-dps' | 'healer' | 'shielder'
  | 'buffer' | 'debuffer' | 'battery' | 'driver' | 'enabler';

export const TEAM_ROLES: TeamRole[] = [
  'main-dps', 'sub-dps', 'healer', 'shielder',
  'buffer', 'debuffer', 'battery', 'driver', 'enabler',
];

/**
 * What partitions a uniqueness check.
 *
 * A closed enum rather than a path expression, and the reason it exists at all
 * is Viridescent Venerer: two wearers cannot shred the *same* element, but can
 * shred different ones. Flat uniqueness would be wrong in both directions.
 */
export type Facet =
  | { by: 'none' }
  | { by: 'character-element' }
  /** A fact only the player knows, declared on the team slot. */
  | { by: 'declaration'; field: string };

export type Provider =
  | { type: 'artifact-set'; setId: number; pieces: 2 | 4 }
  | { type: 'weapon'; weaponId: number; minRefinement?: number }
  | { type: 'character'; characterId: number };

export type Rule =
  /**
   * Covers flat non-stacking auras, conditional ones, and cross-source
   * duplicates — all three are the same shape with a different partition.
   */
  | {
      kind: 'non-stacking';
      id: string;
      enabled: boolean;
      source: 'seed' | 'user';
      /** The buff's identity. Two providers sharing it collide. */
      auraId: string;
      providers: Provider[];
      partition: Facet;
      maxProviders: number;
      scope: RuleScope;
      severity: Severity;
      /** Used when the partition value is undeclared, so nothing can be proven. */
      unprovableSeverity?: Severity;
      label: string;
      note?: string;
    }
  | {
      kind: 'role-coverage';
      id: string;
      enabled: boolean;
      source: 'seed' | 'user';
      roles: TeamRole[];
      min: number;
      max?: number;
      appliesToModes?: EndgameMode[];
      scope: 'team';
      severity: Severity;
      label: string;
      note?: string;
    }
  /** The extensibility point: tags come from the curated layer. */
  | {
      kind: 'tag-limit';
      id: string;
      enabled: boolean;
      source: 'seed' | 'user';
      tag: string;
      subject: 'character' | 'artifact-set' | 'weapon';
      min?: number;
      max?: number;
      scope: RuleScope;
      severity: Severity;
      label: string;
      note?: string;
    };

export type EndgameMode = 'abyss' | 'theater' | 'stygian' | 'other';

/* ------------------------------------------------------------ output --- */

export type Target =
  | { kind: 'team'; teamId: string }
  | { kind: 'team-slot'; teamId: string; characterId: number }
  | { kind: 'character'; characterId: number }
  | { kind: 'artifact-slot'; characterId: number; slot: ArtifactSlot }
  | { kind: 'weapon-slot'; characterId: number }
  | { kind: 'inventory-item'; instanceId: string }
  | { kind: 'weapon-stock'; weaponId: number; refinement: number }
  | { kind: 'deployment'; deploymentId: string };

export type DiagnosticCode =
  | 'weapon.overallocated'
  | 'weapon.not-owned'
  | 'gear.incomplete'
  | 'deployment.character-reused'
  | 'deployment.element-not-allowed'
  | 'aura.duplicated'
  | 'aura.unprovable'
  | 'role.missing'
  | 'role.excess'
  | 'role.unset'
  | 'tag.over-limit'
  | 'tag.under-limit';

export type Diagnostic = {
  /** Stable across renders, so a dismissal can stick to one finding. */
  id: string;
  ruleId: string | null;
  code: DiagnosticCode;
  severity: Severity;
  /** Every place the UI should paint this. */
  targets: Target[];
  /** Ids and numbers only; the message layer turns them into words. */
  data: Record<string, string | number | (string | number)[]>;
};

export type EvaluationResult = {
  diagnostics: Diagnostic[];
  /** Pre-bucketed so a slot component looks up its own key in O(1). */
  byTarget: Map<string, Diagnostic[]>;
  counts: Record<Severity, number>;
};

export function targetKey(target: Target): string {
  switch (target.kind) {
    case 'team': return `team:${target.teamId}`;
    case 'team-slot': return `team-slot:${target.teamId}:${target.characterId}`;
    case 'character': return `character:${target.characterId}`;
    case 'artifact-slot': return `artifact-slot:${target.characterId}:${target.slot}`;
    case 'weapon-slot': return `weapon-slot:${target.characterId}`;
    case 'inventory-item': return `inventory-item:${target.instanceId}`;
    case 'weapon-stock': return `weapon-stock:${target.weaponId}:R${target.refinement}`;
    case 'deployment': return `deployment:${target.deploymentId}`;
  }
}

/** Deterministic, so the same finding keeps its id between renders. */
export function diagnosticId(
  ruleId: string | null,
  code: DiagnosticCode,
  targets: Target[],
) {
  return [ruleId ?? '-', code, ...targets.map(targetKey).sort()].join('|');
}
