import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { Need } from '@/lib/rules/materials';

import { REASON_LABEL } from './filters';

/**
 * One material's shortfall, and who is waiting on it.
 *
 * Two lines rather than one flex-wrapped row: the header — icon, name, how
 * much is short — reads at a glance, and who is waiting is its own wrapped
 * list, one pill per character, instead of a single string joined with `·`.
 * A joined string has nowhere clean to break when several people are waiting
 * on the same material, so it reads as one dense line instead of several
 * short ones.
 */
export function MaterialRow({
  need, catalog, locale,
}: {
  need: Need; catalog: Catalog; locale: Locale;
}) {
  const material = catalog.materials.get(need.materialId);

  return (
    <li className="border-b border-edge/40 px-3 py-2 text-xs last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <GameIcon
          filename={material?.icon}
          kind="material"
          alt={material?.name ?? ''}
          className="h-6 w-6"
          sizes="24px"
        />
        <span className="min-w-0 flex-1 truncate">
          {material?.name ?? `#${need.materialId}`}
        </span>
        <span className="font-mono">
          faltan <span className="text-accent">{need.short.toLocaleString(locale)}</span>
        </span>
        <span className="font-mono text-muted">
          tienes {need.owned.toLocaleString(locale)} de {need.needed.toLocaleString(locale)}
        </span>
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-9">
        {need.by.map((entry) => (
          <li
            key={`${entry.characterId}-${entry.reason}`}
            className="rounded border border-edge/60 bg-surface-2/60 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted"
          >
            {catalog.characters.get(entry.characterId)?.name ?? entry.characterId}
            {' '}{REASON_LABEL[entry.reason]} ×{entry.count}
            {entry.assumed ? '?' : ''}
          </li>
        ))}
      </ul>
    </li>
  );
}
