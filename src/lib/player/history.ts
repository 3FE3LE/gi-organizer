import 'server-only';

import type { DatabaseSync } from 'node:sqlite';

import { getDb } from '@/lib/db/client';
import { transaction } from '@/lib/db/tx';

import { getProfileId } from './db';
import { type Move, applyMove } from './move';
import { performMove } from './mutations';

/**
 * Undo and redo over the change log.
 *
 * Not branches. Copy-on-write plan trees and three-way merges are weeks of work
 * for one player, and the case that actually matters — "what if Venti goes to
 * team 3" — is already free: a team is four cheap rows, so twelve teams side by
 * side *is* the branching model.
 *
 * The log is not the source of truth either. Current state lives in the tables;
 * this exists to reverse a step and to show the player what they changed.
 */

export type ChangeEntry = {
  seq: number;
  at: string;
  op: string;
  /** Ids only — the page resolves them through the catalog when it renders. */
  summary: { move: Move; label: string | null };
  undone: boolean;
};

export function readHistory(
  db: DatabaseSync = getDb(),
  limit = 50,
): ChangeEntry[] {
  const profileId = getProfileId(db);

  const rows = db
    .prepare(`SELECT seq, at, op, summary_json, undone_at FROM change_log
              WHERE profile_id = ? ORDER BY seq DESC LIMIT ?`)
    .all(profileId, limit) as unknown as {
      seq: number; at: string; op: string; summary_json: string; undone_at: string | null;
    }[];

  return rows.map((row) => ({
    seq: row.seq,
    at: row.at,
    op: row.op,
    summary: JSON.parse(row.summary_json) as ChangeEntry['summary'],
    undone: row.undone_at !== null,
  }));
}

export type UndoResult =
  | { ok: true; seq: number; op: string }
  | { ok: false; reason: 'nothing-to-undo' | 'failed'; message?: string };

export function undo(db: DatabaseSync = getDb()): UndoResult {
  const profileId = getProfileId(db);

  const row = db
    .prepare(`SELECT seq, op, inverse_json FROM change_log
              WHERE profile_id = ? AND undone_at IS NULL ORDER BY seq DESC LIMIT 1`)
    .get(profileId) as { seq: number; op: string; inverse_json: string } | undefined;

  if (!row) return { ok: false, reason: 'nothing-to-undo' };

  const inverse = JSON.parse(row.inverse_json) as Move[];

  return transaction(db, () => {
    for (const move of inverse) {
      // Replayed through the same function that performs a move, so there is
      // one definition of what a move does — but without logging, because a
      // replay is not a new change and clearing the redo stack here would erase
      // the very entries undo is walking back through.
      const result = performMove(move, { log: false }, db);
      if (!result.ok) {
        return { ok: false, reason: 'failed', message: result.reason } as const;
      }
    }

    db.prepare('UPDATE change_log SET undone_at = ? WHERE profile_id = ? AND seq = ?')
      .run(new Date().toISOString(), profileId, row.seq);

    return { ok: true, seq: row.seq, op: row.op } as const;
  });
}

export type RedoResult = UndoResult | { ok: false; reason: 'nothing-to-redo' };

export function redo(db: DatabaseSync = getDb()): RedoResult {
  const profileId = getProfileId(db);

  const row = db
    .prepare(`SELECT seq, op, summary_json FROM change_log
              WHERE profile_id = ? AND undone_at IS NOT NULL ORDER BY seq ASC LIMIT 1`)
    .get(profileId) as { seq: number; op: string; summary_json: string } | undefined;

  if (!row) return { ok: false, reason: 'nothing-to-redo' };

  const { move } = JSON.parse(row.summary_json) as { move: Move };

  return transaction(db, () => {
    const result = performMove(move, { log: false }, db);
    if (!result.ok) return { ok: false, reason: 'failed', message: result.reason } as const;

    db.prepare('UPDATE change_log SET undone_at = NULL WHERE profile_id = ? AND seq = ?')
      .run(profileId, row.seq);

    return { ok: true, seq: row.seq, op: row.op } as const;
  });
}

export { applyMove };
