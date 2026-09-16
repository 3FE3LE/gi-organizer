import 'server-only';

import type { DatabaseSync } from 'node:sqlite';

import { getDb } from '@/lib/db/client';
import { GOOD_STAT_BY_PROP } from '@/lib/good/stats';
import type { GoodCrosswalk } from '@/lib/good/keys';
import type { ArtifactSlot } from '@/lib/data/types';

import { transaction } from '@/lib/db/tx';

import { readRoster, upsertCharacter, type CharacterBuild } from './characters';
import { getProfileId, persistInventory, readInventory } from './db';
import type { Inventory } from '@/lib/inventory/plan';
import { readTargets, setTarget, type BuildTarget } from './targets';
import { readDeployments, readTeams, type Deployment, type Team } from './teams';

/**
 * Getting the data back out.
 *
 * Two formats, for two different fears. The native one is a backup: everything,
 * by id, restorable. The GOOD one is the exit: it hands the inventory to
 * Genshin Optimizer or anything else that speaks the format, so nothing here is
 * a one-way door.
 *
 * The native serializer is also what a snapshot stores — one definition of
 * "the whole state", used twice.
 */

export const NATIVE_SCHEMA = 1;

export type NativeExport = {
  schema: typeof NATIVE_SCHEMA;
  exportedAt: string;
  /** The catalog version the ids were written against. */
  gameVersion: string;
  inventory: Inventory;
  roster: CharacterBuild[];
  teams: Team[];
  deployments: Deployment[];
  targets: BuildTarget[];
  rules: { id: string; kind: string; enabled: boolean; severity: string; params: unknown; label: string }[];
};

export function exportNative(gameVersion: string, db: DatabaseSync = getDb()): NativeExport {
  const profileId = getProfileId(db);

  const rules = db
    .prepare('SELECT id, kind, enabled, severity, params_json, label FROM rule WHERE profile_id = ?')
    .all(profileId) as unknown as {
      id: string; kind: string; enabled: number; severity: string;
      params_json: string; label: string;
    }[];

  return {
    schema: NATIVE_SCHEMA,
    exportedAt: new Date().toISOString(),
    gameVersion,
    inventory: readInventory(db, profileId),
    roster: readRoster(db, profileId),
    teams: readTeams(db),
    deployments: readDeployments(db),
    targets: [...readTargets(db).values()],
    rules: rules.map((row) => ({
      id: row.id,
      kind: row.kind,
      enabled: row.enabled === 1,
      severity: row.severity,
      params: JSON.parse(row.params_json) as unknown,
      label: row.label,
    })),
  };
}

/* ----------------------------------------------------------- GOOD out --- */

export type GoodExport = {
  format: 'GOOD';
  version: 3;
  source: string;
  characters: unknown[];
  weapons: unknown[];
  artifacts: unknown[];
};

/** id → key, the inverse of what the importer uses. */
function reverse(table: Record<string, number>) {
  return new Map(Object.entries(table).map(([key, id]) => [id, key]));
}

export function exportGood(
  crosswalk: GoodCrosswalk,
  db: DatabaseSync = getDb(),
): { good: GoodExport; skipped: string[] } {
  const profileId = getProfileId(db);
  const inventory = readInventory(db, profileId);
  const roster = readRoster(db, profileId);

  const characterKey = reverse(crosswalk.characters);
  const weaponKey = reverse(crosswalk.weapons);
  const setKey = reverse(crosswalk.artifactSets);

  const travelerBodies = new Set(Object.values(crosswalk.traveler.bodies));
  const skipped: string[] = [];

  /** GOOD writes the holder as a character key; the Traveler has its own. */
  const location = (characterId: number | null) => {
    if (characterId === null) return '';
    if (travelerBodies.has(characterId)) return 'Traveler';
    const key = characterKey.get(characterId);
    if (!key) {
      skipped.push(`location:${characterId}`);
      return '';
    }
    return key;
  };

  const artifacts = inventory.artifacts.flatMap((piece) => {
    const key = setKey.get(piece.setId);
    if (!key) { skipped.push(`set:${piece.setId}`); return []; }

    const mainStatKey = GOOD_STAT_BY_PROP[piece.mainProp];
    if (!mainStatKey) { skipped.push(`mainStat:${piece.mainProp}`); return []; }

    const substats = piece.substats.flatMap((stat) => {
      const statKey = GOOD_STAT_BY_PROP[stat.prop];
      if (!statKey) { skipped.push(`substat:${stat.prop}`); return []; }
      return [{ key: statKey, value: stat.value }];
    });

    // GOOD v3 carries the not-yet-activated fourth substat, and so do we, so
    // the export stays lossless rather than merely adequate.
    const unactivatedSubstats = piece.unactivatedSubstats.flatMap((stat) => {
      const statKey = GOOD_STAT_BY_PROP[stat.prop];
      return statKey ? [{ key: statKey, value: stat.value }] : [];
    });

    return [{
      setKey: key,
      slotKey: piece.slot satisfies ArtifactSlot,
      level: piece.level,
      rarity: piece.rarity,
      mainStatKey,
      substats,
      unactivatedSubstats,
      location: location(piece.equippedTo),
      // GOOD has no notion of "unknown", so an unobserved lock exports as false.
      lock: piece.lock ?? false,
    }];
  });

  const weapons = inventory.weapons.flatMap((weapon) => {
    const key = weaponKey.get(weapon.weaponId);
    if (!key) { skipped.push(`weapon:${weapon.weaponId}`); return []; }

    return [{
      key,
      level: weapon.level,
      ascension: weapon.ascension,
      refinement: weapon.refinement,
      location: location(weapon.equippedTo),
      lock: weapon.lock ?? false,
    }];
  });

  const characters = roster.flatMap((entry) => {
    const key = travelerBodies.has(entry.characterId)
      ? 'Traveler'
      : characterKey.get(entry.characterId);
    if (!key) { skipped.push(`character:${entry.characterId}`); return []; }

    return [{
      key,
      level: entry.level,
      constellation: entry.constellation,
      ascension: entry.ascension,
      // Base levels only. The constellation bonus is not expressible in GOOD,
      // so exporting it would inflate every C3 and C5 talent by three.
      talent: entry.talent,
    }];
  });

  return {
    good: { format: 'GOOD', version: 3, source: 'gi-organizer', characters, weapons, artifacts },
    skipped: [...new Set(skipped)],
  };
}

/* ----------------------------------------------------------- restore --- */

export type RestoreResult = {
  artifacts: number;
  weapons: number;
  roster: number;
  teams: number;
  deployments: number;
  targets: number;
  rules: number;
};

export class RestoreRejected extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(`cannot restore this file: ${detail}`);
    this.name = 'RestoreRejected';
    this.detail = detail;
  }
}

/**
 * Replaces everything with the contents of a native export.
 *
 * A backup nobody can restore is not a backup, so this is the other half of the
 * export. It is destructive by definition — the whole point is to go back to a
 * previous state — so it runs in one transaction and the caller is expected to
 * have asked first.
 */
export function restoreNative(
  payload: unknown,
  db: DatabaseSync = getDb(),
): RestoreResult {
  const file = payload as Partial<NativeExport>;

  if (file?.schema !== NATIVE_SCHEMA) {
    throw new RestoreRejected(`expected schema ${NATIVE_SCHEMA}, got ${String(file?.schema)}`);
  }
  if (!file.inventory || !Array.isArray(file.inventory.artifacts)) {
    throw new RestoreRejected('no inventory in the file');
  }

  const profileId = getProfileId(db);

  return transaction(db, () => {
    // Order matters only for readability; the child tables cascade anyway.
    for (const table of [
      'artifact_instance', 'weapon_instance', 'character_build',
      'build_target', 'deployment', 'team',
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE profile_id = ?`).run(profileId);
    }
    db.prepare('DELETE FROM rule WHERE profile_id = ?').run(profileId);

    persistInventory(db, profileId, { artifacts: [], weapons: [] }, file.inventory!);

    const now = new Date().toISOString();

    for (const entry of file.roster ?? []) {
      upsertCharacter(db, profileId, {
        characterId: entry.characterId,
        travelerElement: null,
        level: entry.level,
        ascension: entry.ascension,
        constellation: entry.constellation,
        talent: entry.talent,
        talentBonus: entry.talentBonus,
      }, { source: entry.seenFrom ?? 'restore', observedAt: entry.seenAt ?? now });
    }

    for (const team of file.teams ?? []) {
      db.prepare(`INSERT INTO team (id, profile_id, name, mode, position, notes, objective)
                  VALUES (?,?,?,?,?,?,?)`)
        .run(
          team.id, profileId, team.name, team.mode, team.position,
          team.notes, team.objective ?? null,
        );

      for (const slot of team.slots) {
        db.prepare(`INSERT INTO team_slot
            (team_id, character_id, position, roles_json, declarations_json)
            VALUES (?,?,?,?,?)`)
          .run(
            team.id, slot.characterId, slot.position,
            JSON.stringify(slot.roles), JSON.stringify(slot.declarations),
          );
      }
    }

    for (const deployment of file.deployments ?? []) {
      db.prepare(`INSERT INTO deployment (id, profile_id, name, mode, team_ids_json, theater_json)
                  VALUES (?,?,?,?,?,?)`)
        .run(
          deployment.id, profileId, deployment.name, deployment.mode,
          JSON.stringify(deployment.teamIds),
          deployment.theater ? JSON.stringify(deployment.theater) : null,
        );
    }

    for (const target of file.targets ?? []) {
      setTarget(target, db);
    }

    for (const rule of file.rules ?? []) {
      db.prepare(`INSERT INTO rule (id, profile_id, kind, enabled, severity, params_json, label)
                  VALUES (?,?,?,?,?,?,?)`)
        .run(
          rule.id, profileId, rule.kind, Number(rule.enabled),
          rule.severity, JSON.stringify(rule.params), rule.label,
        );
    }

    return {
      artifacts: file.inventory!.artifacts.length,
      weapons: file.inventory!.weapons.length,
      roster: (file.roster ?? []).length,
      teams: (file.teams ?? []).length,
      deployments: (file.deployments ?? []).length,
      targets: (file.targets ?? []).length,
      rules: (file.rules ?? []).length,
    };
  });
}
