import { getTranslations } from 'next-intl/server';

import { GameIcon } from '@/components/game-icon';
import { ListRow } from '@/components/list-row';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { Need } from '@/lib/rules/materials';

/**
 * One material's shortfall, and who is waiting on it.
 *
 * Two parts rather than one flex-wrapped row: the header — icon, name, how
 * much is short — is a `ListRow` and reads at a glance, and who is waiting is its own wrapped
 * list, one pill per character, instead of a single string joined with `·`.
 * A joined string has nowhere clean to break when several people are waiting
 * on the same material, so it reads as one dense line instead of several
 * short ones.
 */
export async function MaterialRow({
  need, catalog, locale,
}: {
  need: Need; catalog: Catalog; locale: Locale;
}) {
  const t = await getTranslations('plan');
  const reasonLabel = await getTranslations('common.reason');
  const material = catalog.materials.get(need.materialId);

  return (
    <li className="border-b border-edge/40 px-3 py-2 text-xs last:border-b-0">
      <ListRow
        as="div"
        lead={(
          <GameIcon
            filename={material?.icon}
            kind="material"
            alt={material?.name ?? ''}
            className="h-6 w-6"
            sizes="24px"
          />
        )}
        title={material?.name ?? `#${need.materialId}`}
        value={<>{t('missingLabel')} <span className="text-accent">{need.short.toLocaleString(locale)}</span></>}
        detailValue={(
          <span className="text-2xs text-muted">
            {t('haveOf', {
              owned: need.owned.toLocaleString(locale),
              needed: need.needed.toLocaleString(locale),
            })}
          </span>
        )}
      />

      <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-9">
        {need.by.map((entry) => (
          <li
            key={`${entry.characterId}-${entry.reason}`}
            className="rounded border border-edge/60 bg-surface-2/60 px-1.5 py-0.5 font-mono text-2xs text-muted"
          >
            {catalog.characters.get(entry.characterId)?.name ?? entry.characterId}
            {' '}{reasonLabel(entry.reason)} ×{entry.count}
            {entry.assumed ? '?' : ''}
          </li>
        ))}
      </ul>
    </li>
  );
}
