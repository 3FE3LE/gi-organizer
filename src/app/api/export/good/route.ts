import { getGoodCrosswalk } from '@/lib/data/registry';
import { exportGood } from '@/lib/player/export';

/**
 * The exit. Anything that speaks GOOD — Genshin Optimizer among them — can read
 * this, so nothing here is a one-way door.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const { good, skipped } = await exportGood(await getGoodCrosswalk());
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(good), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="gi-organizer-GOOD-${stamp}.json"`,
      // Anything the format cannot express is named rather than swallowed.
      'x-skipped': String(skipped.length),
    },
  });
}
