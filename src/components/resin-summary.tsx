import { getTranslations } from 'next-intl/server';

import { Fold } from '@/components/fold';
import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import { spanOf, type ResinEstimate } from '@/lib/rules/resin';

/** Original Resin's own icon. */
const RESIN_ICON = 'UI_ItemIcon_106';

/** How many families a source lists before the rest fold into a count. */
const SHOWN_FAMILIES = 4;

/**
 * The least resin a plan costs, folded to one line.
 *
 * The line is the total and how long it takes to regenerate. The fold holds
 * where it goes, a few of the most expensive families under each source, and
 * mora, kept apart. Mora is never part of the total: playing earns it anyway,
 * and pricing it in Blossoms would make the number the player has to spend
 * look bigger than it is. It is still shown, because "how much would it cost
 * to buy my way out" is a fair question.
 *
 * The same component on the plan and on a build, so both word the estimate the
 * same way and both say it is a minimum.
 */
export async function ResinSummary({
  estimate,
  catalog,
  locale,
}: {
  estimate: ResinEstimate;
  catalog: Catalog;
  locale: Locale;
}) {
  if (estimate.total === 0 && estimate.mora.short === 0) return null;

  const t = await getTranslations('resin');
  const number = new Intl.NumberFormat(locale);
  const span = spanOf(estimate.days);

  return (
    <Fold
      summary={(
        <>
          <GameIcon filename={RESIN_ICON} kind="material" className="h-7 w-7 shrink-0" sizes="28px" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs">{t('heading')}</span>
            <span className="font-mono text-2xs uppercase tracking-wide text-muted">
              {estimate.total > 0 ? t(`span.${span.unit}`, { count: span.count }) : t('none')}
            </span>
          </span>
          <span className="tabular shrink-0 font-mono text-sm text-accent">
            {t('total', { amount: number.format(estimate.total) })}
          </span>
        </>
      )}
      panelClassName="space-y-3 px-3 py-3"
    >
      {estimate.bySource.map((entry) => (
        <div key={entry.source} className="space-y-1">
          <div className="flex items-baseline gap-3 font-mono text-2xs uppercase tracking-wide">
            <span className="flex-1 text-muted">{t(`source.${entry.source}`)}</span>
            <span className="tabular text-muted">
              {t('runs', { count: entry.runs })}
              {entry.source === 'weekly-boss' && ` · ${t('weeks', { count: estimate.weeklyWeeks })}`}
            </span>
            <span className="tabular text-text">{number.format(entry.resin)}</span>
          </div>
          <ul className="space-y-0.5">
            {entry.families.slice(0, SHOWN_FAMILIES).map((family) => {
              const material = catalog.materials.get(family.materialId);
              return (
                <li key={family.materialId} className="flex items-center gap-3 pl-1 font-mono text-2xs">
                  <GameIcon
                    filename={material?.icon ?? null}
                    kind="material"
                    className="h-5 w-5 shrink-0"
                    sizes="20px"
                  />
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {material?.name ?? `#${family.materialId}`}
                  </span>
                  <span className="tabular shrink-0 text-muted">
                    {t('runs', { count: family.runs })}
                  </span>
                  <span className="tabular w-12 shrink-0 text-right">
                    {number.format(family.resin)}
                  </span>
                </li>
              );
            })}
            {entry.families.length > SHOWN_FAMILIES && (
              <li className="pl-9 font-mono text-2xs text-muted">
                {t('more', { count: entry.families.length - SHOWN_FAMILIES })}
              </li>
            )}
          </ul>
        </div>
      ))}

      {estimate.mora.short > 0 && (
        <p className="border-t border-edge/60 pt-2 text-xs text-muted">
          {t('mora', {
            short: number.format(estimate.mora.short),
            resin: number.format(estimate.mora.resinIfFarmed),
          })}
        </p>
      )}

      <p className="max-w-prose text-2xs text-muted">{t('method')}</p>
    </Fold>
  );
}
