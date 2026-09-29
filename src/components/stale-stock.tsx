import { TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { getProfileId } from '@/lib/player/db';
import { readEnkaAccount } from '@/lib/player/enka-profile';

/**
 * The bag is behind the characters.
 *
 * The showcase moves levels and talents forward on its own, but it cannot see
 * the bag — so after it has, whatever reads the bag (what the bag pays for,
 * the resin still to farm, where to invest) is counting materials that were
 * spent. Nothing is subtracted: the showcase knows what was spent at least,
 * not what was farmed meanwhile. It is said, with the date and who moved,
 * until the next import that brings materials.
 */
export async function StaleStock({ catalog, locale }: { catalog: Catalog; locale: Locale }) {
  const db = getDb();
  const { profile } = await readEnkaAccount(db);
  const advanced = profile?.advanced ?? [];
  if (advanced.length === 0) return null;

  const row = (await db
    .prepare('SELECT MAX(seen_at) AS at FROM material_stock WHERE profile_id = ?')
    .get(await getProfileId(db))) as { at: string | null } | undefined;
  if (!row?.at) return null;

  const t = await getTranslations('enka');
  const names = new Intl.ListFormat(locale, { type: 'conjunction' }).format(
    advanced.map((entry) => catalog.characters.get(entry.characterId)?.name ?? `#${entry.characterId}`),
  );
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(row.at));

  return (
    <p className="flex max-w-prose items-start gap-2 rounded-lg border border-warn/40 px-3 py-2 text-xs text-warn">
      <TriangleAlert size={14} aria-hidden className="mt-px shrink-0" />
      <span>{t('staleStock', { date, names })}</span>
    </p>
  );
}
