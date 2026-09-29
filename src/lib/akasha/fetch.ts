import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import { getProfileId } from '@/lib/player/db';

/**
 * Where a UID's characters stand on Akasha's leaderboards.
 *
 * Akasha (akasha.cv) has no public API; this reads the endpoint its own site
 * uses, `/api/getCalculationsForUser/<uid>`, which open-source clients read the
 * same way. It changes without notice and sits behind Cloudflare, which can
 * refuse a server outright — so every failure is "no ranking", never an error,
 * and an answer (even an empty one) is kept for hours rather than asked for on
 * every page. It only knows characters from the showcase of a UID someone has
 * loaded on the site.
 */
export type AkashaStanding = {
  ranking: number;
  outOf: number;
  calculationId: string;
  variant: string | null;
};

export type AkashaRead = {
  /** Best standing per character id. Empty when Akasha had nothing or refused. */
  standings: Record<number, AkashaStanding>;
  fetchedAt: string;
  ok: boolean;
};

const ENDPOINT = 'https://akasha.cv/api/getCalculationsForUser';
const USER_AGENT = 'gi-organizer/0.1 (character rating; +https://gi-organizer.vercel.app)';
const KEEP = 6 * 60 * 60 * 1000;
const TIMEOUT = 4000;

type RawCalculation = {
  calculationId?: string | number;
  ranking?: string | number;
  outOf?: string | number;
  variant?: { name?: string } | null;
};
type RawEntry = { characterId?: number; calculations?: Record<string, RawCalculation> };

/** Akasha sends `ranking` as a number or as text like "~1,234". */
const toNumber = (value: unknown) => {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : NaN;
};

export function parseCalculations(body: unknown): Record<number, AkashaStanding> {
  const entries = (body as { data?: RawEntry[] } | null)?.data;
  if (!Array.isArray(entries)) return {};

  const standings: Record<number, AkashaStanding> = {};
  for (const entry of entries) {
    if (typeof entry?.characterId !== 'number' || !entry.calculations) continue;
    for (const calc of Object.values(entry.calculations)) {
      const ranking = toNumber(calc?.ranking);
      const outOf = toNumber(calc?.outOf);
      if (!(ranking > 0) || !(outOf > 0)) continue;
      const best = standings[entry.characterId];
      // The board the character stands best on is theirs to be rated by.
      if (!best || ranking / outOf < best.ranking / best.outOf) {
        standings[entry.characterId] = {
          ranking,
          outOf,
          calculationId: String(calc.calculationId ?? ''),
          variant: calc.variant?.name ?? null,
        };
      }
    }
  }
  return standings;
}

async function fetchFresh(uid: string): Promise<AkashaRead> {
  const fetchedAt = new Date().toISOString();
  try {
    const response = await fetch(`${ENDPOINT}/${uid}`, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) return { standings: {}, fetchedAt, ok: false };
    return { standings: parseCalculations(await response.json()), fetchedAt, ok: true };
  } catch {
    return { standings: {}, fetchedAt, ok: false };
  }
}

/** The stored read when it is recent, a fresh one otherwise. */
export async function readAkasha(uid: string | null, db: Db = getDb()): Promise<AkashaRead | null> {
  if (!uid) return null;
  const profileId = await getProfileId(db);
  const row = (await db
    .prepare('SELECT akasha_json FROM profile WHERE id = ?')
    .get(profileId)) as { akasha_json: string | null } | undefined;

  if (row?.akasha_json) {
    try {
      const stored = JSON.parse(row.akasha_json) as AkashaRead & { uid?: string };
      if (stored.uid === uid && Date.now() - Date.parse(stored.fetchedAt) < KEEP) return stored;
    } catch {
      // Unreadable is as good as absent.
    }
  }

  const fresh = await fetchFresh(uid);
  await db.prepare('UPDATE profile SET akasha_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...fresh, uid }), profileId);
  return fresh;
}

export function akashaBoardUrl(standing: AkashaStanding) {
  const variant = standing.variant ? `/${encodeURIComponent(standing.variant)}` : '';
  return `https://akasha.cv/leaderboards/${standing.calculationId}${variant}`;
}
