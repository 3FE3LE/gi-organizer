import 'server-only';

import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { get, list, put } from '@vercel/blob';

import { getDb } from '@/lib/db/client';
import { transaction } from '@/lib/db/tx';
import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import { getEnkaStore, getGoodCrosswalk, getMeta } from '@/lib/data/registry';
import { fetchShowcase } from '@/lib/enka/fetch';
import { normalizeEnka } from '@/lib/enka/normalize';
import { createKeyResolver } from '@/lib/good/keys';
import { parseGood } from '@/lib/good/parse';
import { LIMITS } from '@/lib/good/schema';
import {
  applyImport,
  AssignmentViolation,
  type Repair,
  type Resolution,
} from '@/lib/inventory/apply';
import type { WeaponTypeLookup } from '@/lib/inventory/assignment';
import type { NormalizedImport } from '@/lib/inventory/model';
import { type ImportPlan, planImport, summarizePlan } from '@/lib/inventory/plan';

import { upsertCharacter } from './characters';
import { exportNative } from './export';
import {
  getProfileId,
  persistInventory,
  persistMaterialStock,
  readInventory,
} from './db';

/**
 * Import orchestration: stage, preview, apply.
 *
 * The upload is staged instead of being held in memory between the two
 * requests. That keeps the preview cheap to re-render, survives a restart, and
 * leaves the user with the file that produced a given state — which is the only
 * way to explain an import after the fact.
 *
 * Blob and not the filesystem, because there is no writable disk under a
 * function and the two requests an import takes are not guaranteed to reach the
 * same instance: a file written to `/tmp` by the preview would not be there for
 * the apply. Private, because an inventory export is personal data.
 */

const STAGING = 'imports/';

export type StagedUpload = { token: string; file: string; bytes: number };

export async function stageUpload(bytes: ArrayBuffer, filename: string): Promise<StagedUpload> {
  if (bytes.byteLength > LIMITS.bytes) {
    throw new Error(`upload is ${bytes.byteLength} bytes, over the ${LIMITS.bytes} cap`);
  }

  const token = randomUUID();
  // The name is only a label; the token is what addresses the file.
  const safe = path.basename(filename).replace(/[^\w.-]/g, '_').slice(-80);

  const staged = await put(`${STAGING}${token}__${safe}`, Buffer.from(bytes), {
    access: 'private',
    // The token is already unique, and a suffix would put the pathname out of
    // reach of the prefix `stagedPath` looks it up by.
    addRandomSuffix: false,
    contentType: 'application/json',
  });

  return { token, file: staged.pathname, bytes: bytes.byteLength };
}

async function stagedPath(token: string) {
  if (!/^[0-9a-f-]{36}$/.test(token)) throw new Error('bad staging token');

  const { blobs } = await list({ prefix: `${STAGING}${token}__`, limit: 1 });
  const match = blobs[0];
  if (!match) throw new Error('staged upload not found');

  return match.pathname;
}

export async function parseStaged(token: string): Promise<NormalizedImport> {
  const staged = await get(await stagedPath(token), { access: 'private' });
  // A read of a pathname that `list` just returned; a 304 needs an etag we did
  // not send, so anything other than the body is a staged file that went away.
  if (staged?.statusCode !== 200 || !staged.stream) {
    throw new Error('staged upload not found');
  }

  const raw = await new Response(staged.stream).text();

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('the staged file is not valid JSON');
  }

  const result = parseGood(json, { resolver: createKeyResolver(await getGoodCrosswalk()) });
  if (!result.ok) {
    const reason = result.value.issues[0]?.message ?? 'unreadable';
    throw new Error(`not a usable GOOD file: ${reason}`);
  }

  return result.value;
}

export type PreviewResult = {
  plan: ImportPlan;
  summary: ReturnType<typeof summarizePlan>;
};

export async function previewStaged(token: string): Promise<PreviewResult> {
  const db = getDb();
  const profileId = await getProfileId(db);
  const normalized = await parseStaged(token);
  // Preview never prunes: the destructive option is a choice made at apply.
  const plan = planImport(await readInventory(db, profileId), normalized, { onAbsent: 'keep' });

  return { plan, summary: summarizePlan(plan) };
}

export type ApplyOptions = {
  onAbsent?: 'keep' | 'remove';
  resolutions?: Map<number, Resolution>;
};

export type ApplyResult = {
  summary: ReturnType<typeof summarizePlan>;
  persisted: Awaited<ReturnType<typeof persistInventory>>;
  /** Assignments the game cannot hold, dropped rather than obeyed. */
  repairs: Repair[];
  charactersUpserted: number;
  materialsUpserted: number;
  snapshotId: string;
};

export async function applyStaged(
  token: string,
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  return applyNormalized(await parseStaged(token), options);
}

/** Seeds from a showcase. Partial by construction, so it can never prune. */
export async function applyShowcase(uid: string): Promise<ApplyResult> {
  const result = await fetchShowcase(uid);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);

  const normalized = normalizeEnka(result.payload, { store: await getEnkaStore() });
  return applyNormalized(normalized, { onAbsent: 'keep' });
}

async function applyNormalized(
  normalized: NormalizedImport,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const db = getDb();
  const profileId = await getProfileId(db);
  const [meta, types] = await Promise.all([getMeta(), weaponTypes()]);

  const before = await readInventory(db, profileId);
  const onAbsent = options.onAbsent ?? 'keep';
  const plan = planImport(before, normalized, { onAbsent });

  // The guard is in the planner, but honoring it is the caller's job: a scan
  // that failed halfway must not be allowed to prune on the user's behalf.
  const effectiveOnAbsent = plan.suspect ? 'keep' : onAbsent;

  const { inventory: after, repairs } = applyImport(before, plan, {
    onAbsent: effectiveOnAbsent,
    resolutions: options.resolutions,
    types,
  });

  const snapshotId = randomUUID();

  return transaction(db, async () => {
    // Taken before the write, so the state that produced the plan is
    // recoverable even if the plan turns out to have been wrong. It is the
    // native export verbatim — one serializer, two uses, so a snapshot can be
    // restored by the same code path a backup is.
    await db.prepare('INSERT INTO snapshot (id, profile_id, at, label, data_json) VALUES (?,?,?,?,?)')
      .run(
        snapshotId, profileId, new Date().toISOString(),
        `before ${normalized.source} import`,
        JSON.stringify(await exportNative(meta.gameVersion, db)),
      );

    const persisted = await persistInventory(db, profileId, before, after);
    const materials = await persistMaterialStock(
      db, profileId, normalized.materials, normalized.observedAt,
    );

    for (const character of normalized.characters) {
      await upsertCharacter(db, profileId, character, {
        source: normalized.source,
        observedAt: normalized.observedAt,
      });
    }

    await db.prepare(`INSERT INTO import_run
        (id, profile_id, at, source, origin, game_version, counts_json)
        VALUES (?,?,?,?,?,?,?)`)
      .run(
        randomUUID(), profileId, new Date().toISOString(), normalized.source,
        normalized.origin, meta.gameVersion,
        JSON.stringify({
          ...summarizePlan(plan), persisted, repairs, onAbsent: effectiveOnAbsent,
        }),
      );

    await db.prepare('UPDATE profile SET last_seen_game_version = ? WHERE id = ?')
      .run(meta.gameVersion, profileId);

    return {
      summary: summarizePlan(plan),
      persisted,
      repairs,
      charactersUpserted: normalized.characters.length,
      materialsUpserted: materials,
      snapshotId,
    };
  });
}

/**
 * The weapon-type check needs the catalog, which is not in the database — so it
 * is supplied to the pure layer rather than encoded in the schema.
 */
async function weaponTypes(): Promise<WeaponTypeLookup> {
  const catalog = await getCatalog(DEFAULT_LOCALE);
  return {
    ofWeapon: (weaponId) => catalog.weapons.get(weaponId)?.weaponType,
    ofCharacter: (characterId) => catalog.characters.get(characterId)?.weaponType,
  };
}

export { AssignmentViolation };
