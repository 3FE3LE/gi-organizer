import { getMeta } from '@/lib/data/registry';
import { exportNative } from '@/lib/player/export';

/**
 * The full backup: everything, by id, restorable through
 * `POST /api/import/native`.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const meta = await getMeta();
  const payload = await exportNative(meta.gameVersion);
  const stamp = payload.exportedAt.slice(0, 10);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="gi-organizer-${stamp}.json"`,
    },
  });
}
