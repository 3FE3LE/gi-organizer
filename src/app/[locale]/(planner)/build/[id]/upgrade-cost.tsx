import { getTranslations } from 'next-intl/server';

import { GameIcon } from '@/components/game-icon';
import { Fold, FoldGroup } from '@/components/fold';
import { ResinSummary } from '@/components/resin-summary';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';

import type { CostRow, CostTier, UpgradeCost } from './cost-view';

/**
 * What is left to farm for this character, in seven-odd rows.
 *
 * The character sheet answers "what does level 80 cost", phase by phase, for
 * anyone reading about a character they may not even own. This answers the
 * other question — what do *I* still owe — and it is a different shape: the
 * phases behind you are gone, the tiers of one material are one row, and the
 * bag has already been subtracted. Mora is last because it is the only line
 * nobody farms on purpose.
 *
 * A family that spans tiers opens as a `Fold`, one at a time.
 */
export async function UpgradeCostPanel({
  cost,
  catalog,
  locale,
}: {
  cost: UpgradeCost;
  catalog: Catalog;
  locale: Locale;
}) {
  const t = await getTranslations('build');
  const number = new Intl.NumberFormat(locale);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('costHeading')}
        </h2>
        <p className="tabular font-mono text-xs text-muted">
          {t('costRange', {
            level: cost.from.level,
            targetLevel: cost.to.level,
            phase: cost.from.ascension,
            targetPhase: cost.to.ascension,
          })}
          {' · '}
          {t('costTalentRange', {
            talents: talentLine(cost.from.talents),
            targetTalents: talentLine(cost.to.talents),
          })}
        </p>
      </div>

      {cost.covered ? (
        <p className="max-w-prose text-sm text-muted">{t('costCovered')}</p>
      ) : (
        // One family open at a time, as on the plan.
        <FoldGroup>
          <ul className="space-y-1">
            {cost.rows.map((row) => (
              <li key={row.key}>
                {row.tiers.length > 0 ? (
                  <Fold summary={<Line row={row} t={t} number={number} expandable />}>
                    <ul className="px-3 py-1">
                      {row.tiers.map((tier) => (
                        <li
                          key={tier.id}
                          className="flex items-center gap-3 py-1 pl-6 font-mono text-2xs"
                        >
                          <GameIcon
                            filename={tier.icon}
                            kind="material"
                            className="h-5 w-5 shrink-0"
                            sizes="20px"
                          />
                          <span className="min-w-0 flex-1 truncate text-muted">{tier.name}</span>
                          <Counts tier={tier} t={t} number={number} />
                        </li>
                      ))}
                    </ul>
                  </Fold>
                ) : (
                  <div className="card flex items-center gap-3 px-3 py-2">
                    <Line row={row} t={t} number={number} />
                  </div>
                )}
              </li>
            ))}

            {cost.mora.short > 0 && (
              <li className="flex items-center gap-3 border-t border-edge px-3 pt-3">
                <span className="flex-1 font-mono text-xs uppercase tracking-wide text-muted">
                  {t('costMora')}
                </span>
                <Counts tier={cost.mora} t={t} number={number} />
              </li>
            )}
          </ul>
        </FoldGroup>
      )}

      {!cost.covered && (
        <ResinSummary estimate={cost.resin} catalog={catalog} locale={locale} />
      )}
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<'build'>>>;

function Line({
  row, t, number, expandable,
}: {
  row: CostRow; t: T; number: Intl.NumberFormat; expandable?: boolean;
}) {
  return (
    <>
      <GameIcon
        filename={row.icon}
        kind="material"
        className="h-7 w-7 shrink-0"
        sizes="28px"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs">
          {row.name}
          {/* The marker the tier list is behind, since `list-none` took the
              browser's own away. */}
          {expandable && (
            <span className="ml-1 text-muted group-data-panel-open/trigger:hidden">
              {t('costTiers', { count: row.tiers.length })}
            </span>
          )}
        </span>
        <span className="font-mono text-2xs uppercase tracking-wide text-muted">
          {row.reasons.map((reason) => t(`costReason.${reason}`)).join(' · ')}
        </span>
      </span>
      <Counts tier={row} t={t} number={number} />
    </>
  );
}

/**
 * `pide 46 · tienes 12 · 34`, with the number that matters last.
 *
 * The subtraction only shows when there was one. With an empty bag the two
 * numbers are the same number, and printing `pide 138 · 138` asks the player to
 * compare a value against itself.
 */
function Counts({
  tier, t, number,
}: {
  tier: Pick<CostTier, 'needed' | 'owned' | 'short'>; t: T; number: Intl.NumberFormat;
}) {
  return (
    <span className="tabular shrink-0 space-x-2 font-mono text-2xs">
      {tier.owned > 0 && (
        <>
          <span className="text-muted">
            {t('costNeeded', { count: number.format(tier.needed) })}
          </span>
          <span className="text-muted">
            {t('costOwned', { count: number.format(tier.owned) })}
          </span>
        </>
      )}
      <span className="text-sm text-accent">{number.format(tier.short)}</span>
    </span>
  );
}

function talentLine(talents: { auto: number; skill: number; burst: number }) {
  return `${talents.auto}/${talents.skill}/${talents.burst}`;
}
