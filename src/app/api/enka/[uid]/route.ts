import { fetchShowcase } from '@/lib/enka/fetch';
import { normalizeEnka } from '@/lib/enka/normalize';
import { getEnkaStore } from '@/lib/data/registry';
import { summarizeIssues } from '@/lib/inventory/model';

/**
 * Reads a player's showcase and returns it in the normalized shape.
 *
 * A Route Handler rather than a Server Action because this is a cacheable read
 * of third-party data, not a mutation — actions are POST-only, never cached,
 * and dispatched one at a time per client. Applying the result is the action.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: RouteContext<'/api/enka/[uid]'>) {
  const { uid } = await params;

  const result = await fetchShowcase(uid);
  if (!result.ok) {
    return Response.json(
      { error: result.code, message: result.message },
      {
        status: result.status,
        headers: result.code === 'rate-limited' ? { 'retry-after': '60' } : undefined,
      },
    );
  }

  const normalized = normalizeEnka(result.payload, { store: await getEnkaStore() });

  return Response.json(
    {
      uid: result.payload.uid,
      nickname: result.payload.playerInfo.nickname ?? null,
      import: normalized,
      issues: summarizeIssues(normalized.issues),
    },
    {
      headers: {
        'x-enka-cached': result.cached ? '1' : '0',
        'x-enka-ttl': String(result.ttlRemaining),
      },
    },
  );
}
