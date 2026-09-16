import 'server-only';

import type { EnkaResponse } from './schema';

/**
 * Fetches a showcase from Enka.
 *
 * Enka asks consumers to send a descriptive user-agent and to respect the
 * `ttl` in the body rather than re-requesting a UID inside that window. The TTL
 * only exists in the payload — there is no `Cache-Control` header — so it
 * cannot be handed to `next: { revalidate }`, which needs the number up front.
 * Hence a cache of our own.
 */

const ENDPOINT = 'https://enka.network/api/uid';

/** Enka's rule 2: a custom agent so they can reach whoever is calling. */
const USER_AGENT = 'gi-organizer/0.1 (showcase import)';

/** Enka's rule 1 asks consumers not to enumerate UIDs. */
const UID = /^[1-9]\d{8,9}$/;

const MIN_TTL = 60;
const MAX_TTL = 600;

/** At most two upstream requests in flight, whoever is asking. */
const MAX_CONCURRENCY = 2;

export type EnkaFetchResult =
  | { ok: true; payload: EnkaResponse; cached: boolean; ttlRemaining: number }
  | { ok: false; status: number; code: EnkaErrorCode; message: string };

export type EnkaErrorCode =
  | 'invalid-uid'
  | 'not-found'
  | 'maintenance'
  | 'rate-limited'
  | 'upstream'
  | 'malformed';

type Entry = { expiresAt: number; payload: Promise<EnkaResponse> };

declare global {
  var __giEnkaCache: Map<string, Entry> | undefined;
}

// Module scope would be reset by hot reload, which would drop the TTL window
// and start re-requesting a UID on every edit.
function cache() {
  globalThis.__giEnkaCache ??= new Map();
  return globalThis.__giEnkaCache;
}

let inFlight = 0;

export async function fetchShowcase(uid: string): Promise<EnkaFetchResult> {
  if (!UID.test(uid)) {
    return { ok: false, status: 400, code: 'invalid-uid', message: 'not a Genshin UID' };
  }

  const hit = cache().get(uid);
  if (hit && hit.expiresAt > Date.now()) {
    return {
      ok: true,
      payload: await hit.payload,
      cached: true,
      ttlRemaining: Math.ceil((hit.expiresAt - Date.now()) / 1000),
    };
  }

  if (inFlight >= MAX_CONCURRENCY) {
    return {
      ok: false, status: 429, code: 'rate-limited',
      message: 'too many showcase requests in flight; try again shortly',
    };
  }

  inFlight += 1;
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${uid}`, {
      headers: { 'user-agent': USER_AGENT },
      // The TTL cache above is ours; a second layer would only obscure it.
      cache: 'no-store',
    });
  } catch {
    inFlight -= 1;
    return { ok: false, status: 502, code: 'upstream', message: 'could not reach Enka' };
  } finally {
    inFlight = Math.max(0, inFlight - 1);
  }

  if (!response.ok) return mapStatus(response.status);

  let payload: EnkaResponse;
  try {
    payload = (await response.json()) as EnkaResponse;
  } catch {
    return { ok: false, status: 502, code: 'malformed', message: 'Enka returned invalid JSON' };
  }

  if (typeof payload?.uid !== 'string' || typeof payload.playerInfo !== 'object') {
    return { ok: false, status: 502, code: 'malformed', message: 'unexpected showcase shape' };
  }

  const ttl = clamp(payload.ttl ?? MIN_TTL, MIN_TTL, MAX_TTL);
  cache().set(uid, { expiresAt: Date.now() + ttl * 1000, payload: Promise.resolve(payload) });

  return { ok: true, payload, cached: false, ttlRemaining: ttl };
}

/** Every upstream status Enka documents gets its own message, not one "failed". */
function mapStatus(status: number): EnkaFetchResult {
  switch (status) {
    case 400:
      return { ok: false, status: 400, code: 'invalid-uid', message: 'Enka rejected the UID' };
    case 404:
      return { ok: false, status: 404, code: 'not-found', message: 'no player with that UID' };
    case 424:
      return {
        ok: false, status: 503, code: 'maintenance',
        message: 'the game is in maintenance; showcase data is unavailable until it settles',
      };
    case 429:
      return { ok: false, status: 429, code: 'rate-limited', message: 'Enka rate limit reached' };
    default:
      return { ok: false, status: 502, code: 'upstream', message: `Enka returned ${status}` };
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
